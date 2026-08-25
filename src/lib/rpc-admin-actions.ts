// Server action wrapper replaced by API proxy.

import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { hashPassword, comparePassword, signToken, verifyToken } from "@/lib/auth-helpers";
import { requireSession, generateLicenseKey } from "@/lib/session";
import { DEFAULT_EMPLOYEE_PERMISSIONS, OWNER_PERMISSIONS, type PermissionSet } from "@/lib/permissions";

const DEFAULT_COMPANY = "Classic World";

async function ensureSuperAdmin() {
  const db = await getDb();
  const exists = await db.collection("super_admins").findOne({ username: "superadmin" });
  if (!exists) {
    await db.collection("super_admins").insertOne({
      _id: "superadmin" as any,
      username: "superadmin",
      password: await hashPassword("superadmin123"),
      created_at: new Date().toISOString(),
    });
  }
}

async function requireSuperAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("super_token")?.value;
  if (!token) throw new Error("Unauthorized");
  const payload = await verifyToken(token);
  if (!payload || payload.userId !== "superadmin") throw new Error("Unauthorized");
  return payload;
}

// ─── Super Admin Auth ────────────────────────────────────────────────────────

export async function superAdminLoginFn(input: { data: { username: string; password: string } }) {
  const { data } = input;
  await ensureSuperAdmin();
  const db = await getDb();
  const admin = await db.collection("super_admins").findOne({ username: data.username });
  if (!admin || !(await comparePassword(data.password, admin.password as string, admin.plain_password as string))) {
    throw new Error("Invalid credentials");
  }
  const token = await signToken({ userId: "superadmin", email: "superadmin@classicworld.local" });
  const cookieStore = await cookies();
  cookieStore.set("super_token", token, { maxAge: 8 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  return { success: true };
}

export async function superAdminLogoutFn() {
  const cookieStore = await cookies();
  cookieStore.delete("super_token");
  return { success: true };
}

export async function superAdminCheckFn() {
  try {
    await requireSuperAdminSession();
    return { authenticated: true };
  } catch {
    return { authenticated: false };
  }
}

export async function generatePlatformLicenseFn(input: { data: { employeeLimit?: number; note?: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  const key = generateLicenseKey("HZ");
  const doc = {
    _id: key,
    type: "platform",
    employee_limit: data.employeeLimit ?? 5,
    note: data.note || null,
    used: false,
    used_by: null,
    created_at: new Date().toISOString(),
  };
  await db.collection("licenses").insertOne(doc as any);
  return { key, employee_limit: doc.employee_limit };
}

export async function listPlatformLicensesFn(): Promise<any[]> {
  await requireSuperAdminSession();
  const db = await getDb();
  const items = await db.collection("licenses").find({ type: "platform" }).sort({ created_at: -1 }).limit(100).toArray();
  return items.map(l => ({ ...l, id: l._id as any as string }));
}

export async function listBusinessesFn(): Promise<any[]> {
  await requireSuperAdminSession();
  const db = await getDb();
  const items = await db.collection("businesses").find({}).sort({ created_at: -1 }).limit(200).toArray();
  
  const ownerIds = items.map(b => b.owner_id);
  const owners = await db.collection("users").find({ _id: { $in: ownerIds } }).toArray();
  const ownerMap = new Map(owners.map(u => [u._id, u.email]));

  const results = [];
  for (const b of items) {
    const ownerId = b.owner_id;
    const productCount = await db.collection("products").countDocuments({ owner_id: ownerId });
    const saleCount = await db.collection("sales").countDocuments({ owner_id: ownerId });
    const invoiceCount = await db.collection("invoices").countDocuments({ owner_id: ownerId });
    const smsCount = await db.collection("sms_logs").countDocuments({ owner_id: ownerId });

    results.push({
      ...b,
      id: b._id as any as string,
      owner_email: ownerMap.get(ownerId) || "No owner email",
      product_count: productCount,
      sale_count: saleCount,
      invoice_count: invoiceCount || saleCount,
      sms_sent_count: smsCount,
      sms_credits: Number(b.sms_credits ?? 0),
      status: (b.status as string) || "active",
      frozen_reason: (b.frozen_reason as string) || "",
      subscription_expires_at: (b.subscription_expires_at as string) || null,
      max_products: Number(b.max_products || 500),
      max_invoices: Number(b.max_invoices || 10000),
    });
  }
  return results;
}

export async function listAllUsersFn(): Promise<any[]> {
  await requireSuperAdminSession();
  const db = await getDb();
  const users = await db.collection("users")
    .find({})
    .sort({ created_at: -1 })
    .limit(200)
    .toArray();
  
  const businesses = await db.collection("businesses").find({}).toArray();
  const bizMap = new Map(businesses.map(b => [b._id as any as string, b.name as string]));

  return users.map(u => ({
    id: u._id as any as string,
    email: (u.email as string) || "",
    full_name: (u.full_name as string) || "",
    role: (u.role as string) || "user",
    activated: true,
    status: (u.status as string) || "active",
    business_id: (u.business_id as string) || null,
    business_name: u.business_id ? (bizMap.get(u.business_id as string) || "Unknown Business") : "Active Shop",
    created_at: (u.created_at as string) || (u.activated_at as string) || "",
    plain_password: (u.plain_password as string) || "(Hashed in DB)",
    password_updated_at: (u.password_updated_at as string) || (u.updated_at as string) || null,
  }));
}

export async function getPlatformStatsFn(): Promise<any> {
  await requireSuperAdminSession();
  const db = await getDb();
  
  const totalBusinesses = await db.collection("businesses").countDocuments({});
  const activeBusinesses = await db.collection("businesses").countDocuments({ status: { $ne: "frozen" } });
  const frozenBusinesses = await db.collection("businesses").countDocuments({ status: "frozen" });
  const totalUsers = await db.collection("users").countDocuments({});
  const totalProducts = await db.collection("products").countDocuments({});
  const totalSmsSent = await db.collection("sms_logs").countDocuments({});
  
  const salesSum = await db.collection("sales").aggregate([
    {
      $group: {
        _id: null,
        totalSales: { $sum: { $multiply: ["$sell_price", "$qty"] } },
        totalProfit: { $sum: "$profit" }
      }
    }
  ]).toArray();
  
  const expenseSum = await db.collection("expenses").aggregate([
    {
      $group: {
        _id: null,
        totalExpense: { $sum: "$amount" }
      }
    }
  ]).toArray();
  
  const totalSalesVolume = salesSum[0]?.totalSales || 0;
  const totalSalesProfit = salesSum[0]?.totalProfit || 0;
  const totalExpenseVolume = expenseSum[0]?.totalExpense || 0;
  const totalPlatformNetProfit = totalSalesProfit - totalExpenseVolume;

  return {
    totalBusinesses,
    activeBusinesses,
    frozenBusinesses,
    totalUsers,
    totalProducts,
    totalSmsSent,
    totalSalesVolume,
    totalExpenseVolume,
    totalPlatformNetProfit,
  };
}

export async function getPlatformActivitiesFn(): Promise<any[]> {
  await requireSuperAdminSession();
  const db = await getDb();

  const allBiz = await db.collection("businesses").find({}).toArray();
  const ownerToBiz: Record<string, string> = {};
  const idToBiz: Record<string, string> = {};
  for (const b of allBiz) {
    ownerToBiz[b.owner_id as string] = (b.name as string) || "Unknown Business";
    idToBiz[b._id as any as string] = (b.name as string) || "Unknown Business";
  }

  const recentSales = await db.collection("sales").find({}).sort({ created_at: -1 }).limit(30).toArray();
  const recentProducts = await db.collection("products").find({}).sort({ created_at: -1 }).limit(30).toArray();
  const recentExpenses = await db.collection("expenses").find({}).sort({ created_at: -1 }).limit(30).toArray();
  const recentBusinesses = await db.collection("businesses").find({}).sort({ created_at: -1 }).limit(30).toArray();
  const recentUsers = await db.collection("users").find({}).sort({ created_at: -1 }).limit(30).toArray();

  const events: any[] = [];

  for (const s of recentSales) {
    events.push({
      id: s._id,
      type: "sale",
      title: "Sale Logged",
      detail: `${s.product_name} (${s.qty} pcs) - ৳${(s.sell_price * s.qty).toLocaleString()}`,
      time: s.created_at,
      businessName: ownerToBiz[s.owner_id as string] || "Unknown Business",
    });
  }

  for (const p of recentProducts) {
    events.push({
      id: p._id,
      type: "product",
      title: "Product Added",
      detail: `${p.name} (Selling Price: ৳${(p.sell_price || 0).toLocaleString()})`,
      time: p.created_at,
      businessName: ownerToBiz[p.owner_id as string] || "Unknown Business",
    });
  }

  for (const e of recentExpenses) {
    events.push({
      id: e._id,
      type: "expense",
      title: "Expense Logged",
      detail: `${e.title} - ৳${(e.amount || 0).toLocaleString()}`,
      time: e.created_at,
      businessName: ownerToBiz[e.owner_id as string] || "Unknown Business",
    });
  }

  for (const b of recentBusinesses) {
    events.push({
      id: b._id,
      type: "business",
      title: "Business Registered",
      detail: `${b.name} (${b.business_type || "retail"})`,
      time: b.created_at,
      businessName: b.name || "Unknown Business",
    });
  }

  for (const u of recentUsers) {
    if ((u._id as any) === "superadmin") continue;
    events.push({
      id: u._id,
      type: "user",
      title: u.role === "owner" ? "Owner Registered" : "Employee Registered",
      detail: `${u.full_name || u.email} (${u.email})`,
      time: u.created_at || u.activated_at || new Date().toISOString(),
      businessName: idToBiz[u.business_id as string] || "Pending Activation",
    });
  }

  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return events.slice(0, 50);
}

export async function suspendBusinessFn(input: { data: { businessId: string; suspend: boolean } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  await db.collection("businesses").updateOne(
    { _id: data.businessId as any },
    { $set: { status: data.suspend ? "suspended" : "active" } }
  );
  return { success: true };
}

export async function deleteBusinessFn(input: { data: { businessId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");

  const ownerId = biz.owner_id;

  await db.collection("users").deleteMany({ business_id: data.businessId });
  await db.collection("products").deleteMany({ owner_id: ownerId });
  await db.collection("sales").deleteMany({ owner_id: ownerId });
  await db.collection("purchases").deleteMany({ owner_id: ownerId });
  await db.collection("cashbox_entries").deleteMany({ owner_id: ownerId });
  await db.collection("expenses").deleteMany({ owner_id: ownerId });
  await db.collection("somiti_entries").deleteMany({ owner_id: ownerId });
  await db.collection("owner_withdrawals").deleteMany({ owner_id: ownerId });
  await db.collection("parties").deleteMany({ owner_id: ownerId });
  await db.collection("reminders").deleteMany({ owner_id: ownerId });
  await db.collection("licenses").deleteMany({ business_id: data.businessId });
  await db.collection("businesses").deleteOne({ _id: data.businessId as any });

  return { success: true };
}

// ─── User activation & licenses ──────────────────────────────────────────────

export async function activateLicenseFn(input: { data: { licenseKey: string } }) {
  const { data } = input;
  const session = await requireSession(false);
  if (session.activated) throw new Error("Already activated");

  const db = await getDb();
  const license = await db.collection("licenses").findOne({ _id: data.licenseKey.trim().toUpperCase() as any });
  if (!license) throw new Error("Invalid license key");
  if (license.used) throw new Error("License already used");

  const now = new Date().toISOString();

  if (license.type === "platform") {
    const businessId = crypto.randomUUID();
    await db.collection("businesses").insertOne({
      _id: businessId as any,
      owner_id: session.userId,
      name: DEFAULT_COMPANY,
      logo_url: "/logo.png",
      business_type: "retail",
      theme: "green",
      employee_limit: license.employee_limit ?? 5,
      created_at: now,
    });
    await db.collection("users").updateOne(
      { _id: session.userId as any },
      {
        $set: {
          activated: true,
          role: "owner",
          business_id: businessId,
          owner_id: session.userId,
          permissions: OWNER_PERMISSIONS,
          license_key: data.licenseKey,
          activated_at: now,
        },
      },
    );
  } else if (license.type === "employee") {
    const business = await db.collection("businesses").findOne({ _id: license.business_id });
    if (!business) throw new Error("Business not found");
    const employeeCount = await db.collection("users").countDocuments({
      business_id: license.business_id,
      role: "employee",
      activated: true,
    });
    if (employeeCount >= (business.employee_limit as number)) {
      throw new Error("Employee limit reached for this business");
    }
    await db.collection("users").updateOne(
      { _id: session.userId as any },
      {
        $set: {
          activated: true,
          role: "employee",
          business_id: license.business_id,
          owner_id: license.owner_id,
          permissions: license.permissions || DEFAULT_EMPLOYEE_PERMISSIONS,
          license_key: data.licenseKey,
          activated_at: now,
        },
      },
    );
  } else {
    throw new Error("Invalid license type");
  }

  await db.collection("licenses").updateOne(
    { _id: license._id },
    { $set: { used: true, used_by: session.userId, used_at: now } },
  );

  return { success: true };
}

// ─── Business settings (owner) ───────────────────────────────────────────────

export async function getBusinessSettingsFn() {
  const session = await requireSession();
  const db = await getDb();
  let business = session.businessId
    ? await db.collection("businesses").findOne({ _id: session.businessId as any })
    : await db.collection("businesses").findOne({ owner_id: session.ownerId });

  if (!business && session.role === "owner") {
    const id = crypto.randomUUID();
    business = {
      _id: id as any,
      owner_id: session.ownerId,
      name: DEFAULT_COMPANY,
      logo_url: "/logo.png",
      business_type: "retail",
      theme: "green",
      employee_limit: 5,
      created_at: new Date().toISOString(),
    };
    await db.collection("businesses").insertOne(business as any);
    await db.collection("users").updateOne({ _id: session.userId as any }, { $set: { business_id: id } });
  }

  const employees = await db.collection("users")
    .find({ business_id: business?._id as any, role: "employee" })
    .project({ password: 0 })
    .toArray();

  const employeeLicenses = await db.collection("licenses")
    .find({ type: "employee", business_id: business?._id as any })
    .sort({ created_at: -1 })
    .limit(50)
    .toArray();

  return {
    business: business ? {
      id: business._id as any as string,
      name: business.name as string,
      tagline: (business.tagline as string) || "",
      address: (business.address as string) || "",
      phone_numbers: (business.phone_numbers as string) || (business.phone as string) || "",
      emails: (business.emails as string) || (business.email as string) || "",
      currency: (business.currency as string) || "৳",
      invoice_page_size: (business.invoice_page_size as string) || "80mm",
      invoice_page_width: (business.invoice_page_width as string) || "",
      invoice_page_height: (business.invoice_page_height as string) || "",
      logo_url: (business.logo_url as string) || "/logo.png",
      business_type: (business.business_type as string) || "retail",
      theme: (business.theme as string) || "green",
      employee_limit: (business.employee_limit as number) || 5,
      invoice_watermark: (business.invoice_watermark as string) || "",
      invoice_watermark_enabled: Boolean(business.invoice_watermark_enabled),
      invoice_terms: (business.invoice_terms as string) || "",
      invoice_color: (business.invoice_color as string) || "black",
      invoice_font_size: (business.invoice_font_size as string) || "22px",
      invoice_scale: (business.invoice_scale as string) || "100%",
      invoice_line_spacing: (business.invoice_line_spacing as string) || "6px",
      google_sheets_spreadsheet_id: (business.google_sheets_spreadsheet_id as string) || "",
      google_sheets_credentials_json: (business.google_sheets_credentials_json as string) || "",
    } : null,
    role: session.role,
    permissions: session.permissions,
    employees: employees.map(e => ({
      id: e._id as any as string,
      email: e.email as string,
      full_name: (e.full_name as string) || "",
      activated: Boolean(e.activated),
      permissions: e.permissions as PermissionSet,
    })),
    employeeLicenses: employeeLicenses.map(l => ({
      id: l._id as any as string,
      used: Boolean(l.used),
      used_by: l.used_by as string | null,
      created_at: l.created_at as string,
    })),
  };
}

export async function updateBusinessSettingsFn(input: {
  data: {
    name?: string;
    tagline?: string;
    address?: string;
    phone_numbers?: any;
    emails?: any;
    invoice_page_size?: string;
    invoice_page_width?: string;
    invoice_page_height?: string;
    logo_url?: string;
    currency?: string;
    business_type?: string;
    theme?: string;
    employee_limit?: number;
    invoice_watermark?: string;
    invoice_watermark_enabled?: boolean;
    invoice_terms?: string;
    invoice_color?: string;
    invoice_font_size?: string;
    invoice_scale?: string;
    invoice_line_spacing?: string;
    google_sheets_spreadsheet_id?: string;
    google_sheets_credentials_json?: string;
    [key: string]: any;
  }
}) {
  const { data } = input;
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only business owner can change settings");
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  if (!business) throw new Error("Business not found");
  await db.collection("businesses").updateOne({ _id: business._id as any }, { $set: data });
  if (data.name) {
    await db.collection("users").updateOne(
      { _id: session.ownerId as any },
      { $set: { business_name: data.name } }
    );
  }
  return { success: true };
}

export async function createEmployeeLicenseFn(input: { data: { permissions?: PermissionSet } }) {
  const { data } = input;
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can create employee licenses");
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  if (!business) throw new Error("Business not found");

  const usedCount = await db.collection("licenses").countDocuments({
    type: "employee",
    business_id: business._id as any,
  });
  if (usedCount >= (business.employee_limit as number)) {
    throw new Error("Employee license limit reached. Increase limit in settings.");
  }

  const key = generateLicenseKey("EMP");
  await db.collection("licenses").insertOne({
    _id: key as any,
    type: "employee",
    business_id: business._id as any,
    owner_id: session.ownerId,
    permissions: data.permissions || DEFAULT_EMPLOYEE_PERMISSIONS,
    used: false,
    used_by: null,
    created_at: new Date().toISOString(),
  });
  return { key };
}

export async function updateEmployeePermissionsFn(input: { data: { employeeId: string; permissions: PermissionSet } }) {
  const { data } = input;
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can update permissions");
  const db = await getDb();
  await db.collection("users").updateOne(
    { _id: data.employeeId as any, owner_id: session.ownerId, role: "employee" },
    { $set: { permissions: data.permissions } },
  );
  return { success: true };
}

export async function deleteLicenseFn(input: { data: { licenseKey: string } }) {
  const { data } = input;
  const db = await getDb();
  const key = data.licenseKey.trim().toUpperCase();
  const license = await db.collection("licenses").findOne({ _id: key as any });
  if (!license) {
    // License already deleted or never existed - consider deletion successful
    // This handles race conditions where license appears in UI list but
    // has been deleted by another process, or replication lag in distributed systems
    return { success: true };
  }
  if (license.used) throw new Error("Cannot delete a license that is already used");

  if (license.type === "platform") {
    await requireSuperAdminSession();
  } else if (license.type === "employee") {
    const session = await requireSession();
    if (session.role !== "owner") throw new Error("Only owner can delete employee licenses");
    if (license.owner_id !== session.ownerId) throw new Error("Not your license");
  } else {
    throw new Error("Invalid license type");
  }

  await db.collection("licenses").deleteOne({ _id: key as any });
  return { success: true };
}

export async function impersonateUserFn(input: { data: { userId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: data.userId as any });
  if (!user) throw new Error("User not found");

  const token = await signToken({ userId: user._id as any as string, email: user.email as string });
  const cookieStore = await cookies();
  cookieStore.set("token", token, { maxAge: 8 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  
  return { success: true };
}

export async function deleteUserFn(input: { data: { userId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const user = await db.collection("users").findOne({ _id: data.userId as any });
  if (!user) throw new Error("User not found");

  // Delete the user account
  await db.collection("users").deleteOne({ _id: data.userId as any });

  // If user was an owner, also clean up their associated employee licenses
  if (user.role === "owner" && user.business_id) {
    await db.collection("licenses").deleteMany({
      type: "employee",
      business_id: user.business_id,
      used: false,
    });
  }

  return { success: true };
}

export async function changeUserPasswordFn(input: { data: { userId: string; newPassword: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const cleanPass = data.newPassword.trim();
  if (!cleanPass || cleanPass.length < 6) {
    throw new Error("Password must be at least 6 characters long");
  }
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: data.userId as any });
  if (!user) throw new Error("User not found");

  const hashedPassword = await hashPassword(cleanPass);
  const now = new Date().toISOString();
  await db.collection("users").updateOne(
    { _id: data.userId as any },
    { $set: { password: hashedPassword, plain_password: cleanPass, password_updated_at: now, updated_at: now } }
  );

  return { success: true };
}

export async function changeSuperAdminPasswordFn(input: { data: { currentPassword?: string; newPassword: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const cleanPass = data.newPassword.trim();
  if (!cleanPass || cleanPass.length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }
  const db = await getDb();
  const admin = await db.collection("super_admins").findOne({ username: "superadmin" });
  if (!admin) throw new Error("Super admin account not found");

  if (data.currentPassword) {
    const ok = await comparePassword(data.currentPassword, admin.password as string, admin.plain_password as string);
    if (!ok) throw new Error("Current password is incorrect");
  }

  const hashedPassword = await hashPassword(cleanPass);
  const now = new Date().toISOString();
  await db.collection("super_admins").updateOne(
    { username: "superadmin" },
    { $set: { password: hashedPassword, plain_password: cleanPass, updated_at: now } }
  );

  return { success: true };
}

export async function resetSalesFn(input: { data: { businessId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");
  const ownerId = biz.owner_id;

  await db.collection("sales").deleteMany({ owner_id: ownerId });
  await db.collection("returns").deleteMany({ owner_id: ownerId });
  await db.collection("cashbox_entries").deleteMany({ owner_id: ownerId, kind: "sale" });

  return { success: true };
}

export async function resetSomitiFn(input: { data: { businessId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");
  const ownerId = biz.owner_id;

  await db.collection("somiti_entries").deleteMany({ owner_id: ownerId });

  return { success: true };
}

export async function resetExpensesFn(input: { data: { businessId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");
  const ownerId = biz.owner_id;

  await db.collection("expenses").deleteMany({ owner_id: ownerId });
  await db.collection("cashbox_entries").deleteMany({ owner_id: ownerId, kind: "expense" });

  return { success: true };
}

// ─── Superadmin SMS Refill & Management ──────────────────────────────────────

export async function refillBusinessSmsFn(input: {
  data: {
    businessId: string;
    amount: number;
    type?: "add" | "set" | "deduct";
    note?: string;
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");

  const currentCredits = Number(biz.sms_credits ?? 0);
  const amount = Number(data.amount) || 0;
  let newCredits = currentCredits;

  if (data.type === "set") {
    newCredits = Math.max(0, amount);
  } else if (data.type === "deduct") {
    newCredits = Math.max(0, currentCredits - amount);
  } else {
    // Default "add"
    newCredits = currentCredits + amount;
  }

  const now = new Date().toISOString();
  await db.collection("businesses").updateOne(
    { _id: data.businessId as any },
    { $set: { sms_credits: newCredits, updated_at: now } }
  );

  // Log SMS refill
  await db.collection("sms_refill_logs").insertOne({
    _id: crypto.randomUUID() as any,
    business_id: data.businessId,
    business_name: biz.name,
    owner_id: biz.owner_id,
    previous_credits: currentCredits,
    amount_changed: amount,
    type: data.type || "add",
    new_credits: newCredits,
    note: data.note || "Refilled by Superadmin",
    created_at: now,
  });

  return { success: true, sms_credits: newCredits };
}

// ─── Superadmin Account Freeze / Unfreeze / Ban ─────────────────────────────

export async function freezeBusinessFn(input: {
  data: {
    businessId: string;
    freeze: boolean;
    reason?: string;
    subscription_expires_at?: string;
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");

  const now = new Date().toISOString();
  const status = data.freeze ? "frozen" : "active";
  const updates: Record<string, any> = {
    status,
    frozen_reason: data.freeze ? (data.reason || "Subscription payment pending") : null,
    updated_at: now,
  };

  if (data.subscription_expires_at) {
    updates.subscription_expires_at = data.subscription_expires_at;
  }

  await db.collection("businesses").updateOne(
    { _id: data.businessId as any },
    { $set: updates }
  );

  // Also sync user status
  await db.collection("users").updateMany(
    { business_id: data.businessId },
    { $set: { status, frozen_reason: updates.frozen_reason, updated_at: now } }
  );

  return { success: true, status };
}

// ─── Superadmin Set Custom Limits & Subscriptions ───────────────────────────

export async function setBusinessLimitsFn(input: {
  data: {
    businessId: string;
    max_products?: number;
    max_invoices?: number;
    employee_limit?: number;
    subscription_expires_at?: string;
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const biz = await db.collection("businesses").findOne({ _id: data.businessId as any });
  if (!biz) throw new Error("Business not found");

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (data.max_products !== undefined) updates.max_products = Number(data.max_products) || 500;
  if (data.max_invoices !== undefined) updates.max_invoices = Number(data.max_invoices) || 10000;
  if (data.employee_limit !== undefined) updates.employee_limit = Number(data.employee_limit) || 5;
  if (data.subscription_expires_at !== undefined) updates.subscription_expires_at = data.subscription_expires_at;

  await db.collection("businesses").updateOne(
    { _id: data.businessId as any },
    { $set: updates }
  );

  return { success: true };
}

// ─── Superadmin Popups & Broadcast Alerts ────────────────────────────────────

export async function createAdminPopupFn(input: {
  data: {
    target_type: "all" | "business" | "user";
    target_id?: string;
    title: string;
    message: string;
    popup_type?: "info" | "warning" | "urgent" | "promo";
    expires_at?: string;
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  if (!data.title || !data.message) {
    throw new Error("Popup Title and Message are required");
  }

  const id = crypto.randomUUID();
  const doc = {
    _id: id as any,
    target_type: data.target_type || "all",
    target_id: data.target_id || null,
    title: data.title.trim(),
    message: data.message.trim(),
    popup_type: data.popup_type || "info",
    expires_at: data.expires_at || null,
    active: true,
    created_at: new Date().toISOString(),
  };

  await db.collection("admin_popups").insertOne(doc as any);

  return { success: true, id };
}

export async function listAdminPopupsFn(): Promise<any[]> {
  await requireSuperAdminSession();
  const db = await getDb();
  const popups = await db.collection("admin_popups").find({}).sort({ created_at: -1 }).limit(50).toArray();
  return popups.map(p => ({ ...p, id: p._id as any as string }));
}

export async function deleteAdminPopupFn(input: { data: { popupId: string } }) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();
  await db.collection("admin_popups").deleteOne({ _id: data.popupId as any });
  return { success: true };
}

// ─── Superadmin Master SMS Gateway Settings ─────────────────────────────────

export async function getMasterSmsSettingsFn() {
  await requireSuperAdminSession();
  const db = await getDb();
  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });

  return {
    apiKey: (platform?.master_sms_api_key as string) || "",
    userName: (platform?.master_sms_user_name as string) || "",
    senderName: (platform?.master_sms_sender_name as string) || "DreamFashion",
    adminWhatsapp: (platform?.admin_whatsapp as string) || "8801700000000",
  };
}

export async function updateMasterSmsSettingsFn(input: {
  data: {
    apiKey: string;
    userName: string;
    senderName: string;
    adminWhatsapp?: string;
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  await db.collection("platform_settings").updateOne(
    { _id: "global" as any },
    {
      $set: {
        master_sms_api_key: (data.apiKey || "").trim(),
        master_sms_user_name: (data.userName || "").trim(),
        master_sms_sender_name: (data.senderName || "").trim(),
        admin_whatsapp: (data.adminWhatsapp || "").trim(),
        updated_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  return { success: true };
}

export async function directSendSmsAsAdminFn(input: {
  data: {
    mobileNumber: string;
    message: string;
    routeType?: "T" | "P";
  };
}) {
  const { data } = input;
  await requireSuperAdminSession();
  const db = await getDb();

  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });
  const apiKey = (platform?.master_sms_api_key as string) || "";
  const userName = (platform?.master_sms_user_name as string) || "";
  const senderName = (platform?.master_sms_sender_name as string) || "DreamFashion";

  if (!apiKey || !userName) {
    throw new Error("Master MiMSMS credentials are not configured. Please save API Key & Username first.");
  }

  const { sendSingleSms } = await import("@/lib/mimsms");
  const res = await sendSingleSms({
    apiKey,
    userName,
    senderName,
    mobileNumber: data.mobileNumber,
    message: data.message,
    transactionType: data.routeType || "T",
  });

  return res;
}
