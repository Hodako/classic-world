// Server action wrapper replaced by API proxy.

import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { hashPassword, comparePassword, signToken, verifyToken } from "@/lib/auth-helpers";
import { requireSession } from "@/lib/session";
import { requestStore } from "@/lib/request-store";
import type { PermissionSet } from "@/lib/permissions";
import { DEFAULT_EMPLOYEE_PERMISSIONS, OWNER_PERMISSIONS } from "@/lib/permissions";
import { appendRowToGoogleSheet, bulkExportToGoogleSheets } from "@/lib/google-sheets";
import {
  sendSingleSms,
  sendBroadcastSms,
  sendDynamicSms,
  checkSmsBalance,
  lookupDlrStatus,
  calculateSmsParts,
  sanitizeBdPhoneNumber,
  type MiMSMSResponse
} from "@/lib/mimsms";
import {
  getWhatsAppStatus,
  startWhatsAppSession,
  disconnectWhatsAppSession,
  sendWhatsAppMessage,
  sendWhatsAppCampaign,
} from "@/lib/whatsapp-baileys";

type CashboxKind = "deposit" | "withdraw" | "sale" | "expense";

async function checkCashboxBalanceEffect(
  db: any,
  ownerId: string,
  deltaEffect: number,
  excludeEntryIds?: string | string[]
) {
  const query: any = { owner_id: ownerId };
  if (excludeEntryIds) {
    const ids = Array.isArray(excludeEntryIds) ? excludeEntryIds : [excludeEntryIds];
    query._id = { $nin: ids.map(id => id as any) };
  }
  const items = await db.collection("cashbox_entries").find(query).toArray();
  const normalized = items.map((e: any) => ({
    kind: e.kind,
    amount: Number(e.amount) || 0
  }));
  const currentBalance = normalized.reduce((sum: number, e: any) => {
    const isPositive = e.kind === "deposit" || e.kind === "sale";
    const delta = isPositive ? e.amount : -e.amount;
    return sum + delta;
  }, 0);
  
  if (Math.round((currentBalance + deltaEffect) * 100) / 100 < 0) {
    throw new Error(`Insufficient cashbox balance! This transaction would drop the cashbox balance to ${Math.round((currentBalance + deltaEffect) * 100) / 100}, which is below 0.`);
  }
}

async function insertCashboxEntry(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: string,
  entry: { kind: CashboxKind; amount: number; note?: string | null; ref_id?: string | null; created_at?: string },
  bypassValidation = false
) {
  const delta = (entry.kind === "deposit" || entry.kind === "sale") ? entry.amount : -entry.amount;
  if (delta < 0 && !bypassValidation) {
    await checkCashboxBalanceEffect(db, ownerId, delta);
  }

  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: ownerId,
    kind: entry.kind,
    amount: entry.amount,
    note: entry.note ?? null,
    ref_id: entry.ref_id ?? null,
    created_at: entry.created_at || new Date().toISOString(),
  };
  await db.collection("cashbox_entries").insertOne(doc as any);

  // Sheets Sync
  appendRowToGoogleSheet(ownerId, "Cashbox",
    ["ID", "Kind", "Amount", "Note", "Ref ID", "Created At"],
    [id, entry.kind, entry.amount, entry.note ?? "", entry.ref_id ?? "", doc.created_at]
  );

  return { ...doc, id };
}

function saleCashboxAmount(data: { type: string; sell_price: number; qty: number; paid_amount: number }) {
  if (data.type === "credit") return Number(data.paid_amount) || 0;
  // Cash, bKash, Bank, Nagad, Card, POS payments all deposit into Cashbox
  if (data.type === "cash" || data.type === "bkash" || data.type === "bank" || data.type === "nagad" || data.type === "card" || data.type === "pos") {
    return Number(data.paid_amount) || (Number(data.sell_price) * (Number(data.qty) || 1));
  }
  // Online deliveries (courier pending): only if paid_amount > 0
  if (data.type === "online") return Number(data.paid_amount) || 0;
  return Number(data.paid_amount) || (Number(data.sell_price) * (Number(data.qty) || 1));
}

async function mapUser(db: Awaited<ReturnType<typeof getDb>>, userId: string) {
  const user = await db.collection("users").findOne({ _id: userId as any });
  if (!user) return null;
  let business = user.business_id
    ? await db.collection("businesses").findOne({ _id: user.business_id as any })
    : await db.collection("businesses").findOne({ owner_id: user.owner_id || user._id });

  // If owner has no business record yet, initialize one automatically
  if (!business && user.role === "owner") {
    const newBizId = crypto.randomUUID();
    business = {
      _id: newBizId as any,
      owner_id: user._id,
      name: user.full_name || "My Fashion Store",
      logo_url: "/logo.png",
      business_type: "retail",
      theme: "green",
      status: "active",
      sms_credits: 0,
      max_products: 500,
      max_invoices: 10000,
      employee_limit: 5,
      created_at: new Date().toISOString(),
    };
    await db.collection("businesses").insertOne(business as any);
    await db.collection("users").updateOne({ _id: user._id as any }, { $set: { business_id: newBizId } });
  }

  const cookieStore = await cookies();
  const store = requestStore.getStore();
  const activeProfile = store?.activeProfile || cookieStore.get("active_profile")?.value || "default";
  
  const ownerId = user.role === "employee" ? (user.owner_id as string) : (user._id as any as string);
  const ownerUser = ownerId === (user._id as any as string) ? user : await db.collection("users").findOne({ _id: ownerId as any });
  const profiles = ownerUser?.profiles || [
    { id: "default", name: "Default Profile", created_at: new Date().toISOString() }
  ];

  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });
  const adminWhatsapp = (platform?.admin_whatsapp as string) || "8801700000000";

  return {
    id: user._id as any as string,
    email: user.email as string,
    full_name: (user.full_name as string) || "",
    activated: true,
    role: (user.role as string) || "owner",
    business_id: (business?._id as any as string) || (user.business_id as string) || null,
    business_name: (business?.name as string) || "Dream Fashion",
    business_address: (business?.address as string) || "",
    business_phone_numbers: (business?.phone_numbers as string) || (business?.phone as string) || "",
    business_emails: (business?.emails as string) || (business?.email as string) || "",
    invoice_page_size: (business?.invoice_page_size as string) || "80mm",
    invoice_page_width: (business?.invoice_page_width as string) || "",
    invoice_page_height: (business?.invoice_page_height as string) || "",
    logo_url: (business?.logo_url as string) || "/logo.png",
    avatar_url: (user.avatar_url as string) || "",
    permissions: (user.role === "owner" ? OWNER_PERMISSIONS : (user.permissions as PermissionSet)) || DEFAULT_EMPLOYEE_PERMISSIONS,
    profiles,
    activeProfile,
    status: (business?.status as string) || (user?.status as string) || "active",
    frozen_reason: (business?.frozen_reason as string) || (user?.frozen_reason as string) || "",
    subscription_expires_at: (business?.subscription_expires_at as string) || "",
    sms_credits: Number(business?.sms_credits ?? 0),
    admin_whatsapp: adminWhatsapp,
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function getMeFn() {
  try {
    const store = requestStore.getStore();
    let token = store?.token;

    if (!token) {
      const cookieStore = await cookies();
      token = cookieStore.get("token")?.value;
    }

    if (!token) {
      const headersList = await headers();
      const authHeader = headersList.get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }
    if (!token) return { user: null };
    const session = await verifyToken(token);
    if (!session) return { user: null };
    const db = await getDb();
    const user = await mapUser(db, session.userId);
    return { user };
  } catch {
    return { user: null };
  }
}

export async function loginFn(input: { data: { email?: string; phone?: string; identifier?: string; password: string } }) {
  const { data } = input;
  const rawId = (data.identifier || data.email || data.phone || "").trim();
  if (!rawId || !data.password) {
    const err = new Error("Email/Phone number and password are required");
    (err as any).statusCode = 400;
    throw err;
  }

  const db = await getDb();
  const cleanId = rawId.toLowerCase();
  const cleanPhone = rawId.replace(/[^0-9]/g, "");

  // Search by email, username, phone, or normalized phone numbers
  const user = await db.collection("users").findOne({
    $or: [
      { email: cleanId },
      { username: cleanId },
      ...(cleanPhone.length >= 10
        ? [
            { phone: cleanId },
            { phone: cleanPhone },
            { phone: cleanPhone.startsWith("88") ? cleanPhone : `88${cleanPhone}` },
            { phone: cleanPhone.startsWith("880") ? cleanPhone.slice(2) : cleanPhone },
            { phone: cleanPhone.startsWith("88") ? cleanPhone.slice(2) : cleanPhone },
          ]
        : [{ phone: cleanId }]),
    ],
  });

  if (!user || !(await comparePassword(data.password, user.password as string, user.plain_password as string))) {
    const err = new Error("Invalid email/phone number or password");
    (err as any).statusCode = 401;
    throw err;
  }

  const token = await signToken({ userId: user._id as any as string, email: (user.email as string) || cleanId, role: (user.role as string) || "owner" });
  const cookieStore = await cookies();
  cookieStore.set("token", token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  const mapped = await mapUser(db, user._id as any as string);
  return { user: mapped, token };
}

export async function employeeLoginFn(input: { data: { username: string; password: string } }) {
  const { data } = input;
  const db = await getDb();
  const identifier = (data.username || "").trim().toLowerCase();
  if (!identifier || !data.password) {
    const err = new Error("Employee username/phone/email and password are required");
    (err as any).statusCode = 400;
    throw err;
  }

  const cleanPhone = identifier.replace(/[^0-9]/g, "");

  // Support login via username, phone, or email
  const user = await db.collection("users").findOne({
    role: "employee",
    $or: [
      { username: identifier },
      { phone: identifier },
      { email: identifier },
      ...(cleanPhone.length >= 10
        ? [
            { phone: cleanPhone },
            { phone: cleanPhone.startsWith("88") ? cleanPhone : `88${cleanPhone}` },
            { phone: cleanPhone.startsWith("880") ? cleanPhone.slice(2) : cleanPhone },
          ]
        : []),
    ],
  });

  if (!user || !(await comparePassword(data.password, user.password as string, user.plain_password as string))) {
    const err = new Error("Invalid employee username, phone or password");
    (err as any).statusCode = 401;
    throw err;
  }

  if (user.is_active === false || user.status === "frozen" || user.status === "suspended") {
    const err = new Error("Employee account is currently inactive. Please contact your shop owner.");
    (err as any).statusCode = 403;
    throw err;
  }

  // Update last login timestamp
  await db.collection("users").updateOne(
    { _id: user._id as any },
    { $set: { last_login_at: new Date().toISOString() } }
  );

  const token = await signToken({ userId: user._id as any as string, email: (user.email as string) || identifier, role: "employee" });
  const cookieStore = await cookies();
  cookieStore.set("token", token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  const mapped = await mapUser(db, user._id as any as string);
  return { user: mapped, token };
}

function sanitizeInput(text: string): string {
  if (!text) return "";
  return text
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/g, "")
    .replace(/javascript:/gi, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function validateEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("Email address cannot be blank");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw new Error("Please enter a valid email address");
  }
  
  const fakeDomains = ["tempmail.com", "yopmail.com", "mailinator.com", "dispostable.com", "sharklasers.com", "guerrillamail.com", "10minutemail.com", "getairmail.com", "throwawaymail.com", "temp-mail.org", "fake.com", "fake.org", "test.com"];
  const domain = trimmed.split("@")[1]?.toLowerCase();
  if (fakeDomains.includes(domain)) {
    throw new Error("Disposable or fake email addresses are not allowed. Please register with a real email address.");
  }
}

export async function registerFn(input: { data: { email?: string; phone?: string; identifier?: string; password: string; fullName?: string; role?: "owner" | "employee" } }) {
  const { data } = input;
  const rawId = (data.identifier || data.email || data.phone || "").trim();
  if (!rawId) {
    throw new Error("Email or Phone number is required for registration");
  }
  if (!data.password || data.password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }

  const isEmail = rawId.includes("@");
  let cleanEmail = "";
  let cleanPhone = "";

  if (isEmail) {
    validateEmail(rawId);
    cleanEmail = rawId.toLowerCase();
  } else {
    const digits = rawId.replace(/[^0-9]/g, "");
    if (digits.length < 10) {
      throw new Error("Please enter a valid phone number (at least 10 digits)");
    }
    cleanPhone = rawId;
    cleanEmail = `${digits}@hakimqzz.internal`;
  }

  const db = await getDb();
  
  // Check existing user by email or phone
  const existing = await db.collection("users").findOne({
    $or: [
      ...(cleanEmail ? [{ email: cleanEmail }] : []),
      ...(cleanPhone ? [{ phone: cleanPhone }, { phone: cleanPhone.replace(/[^0-9]/g, "") }] : []),
    ],
  });
  if (existing) {
    throw new Error(isEmail ? "An account with this email already exists" : "An account with this phone number already exists");
  }
  
  const userId = crypto.randomUUID();
  const businessId = crypto.randomUUID();
  const now = new Date().toISOString();
  const shopName = sanitizeInput(data.fullName ? `${data.fullName}'s Shop` : "HakimQzz Store");

  // Create default business for new user with starter 0 SMS credits
  await db.collection("businesses").insertOne({
    _id: businessId as any,
    owner_id: userId,
    name: shopName,
    logo_url: "/logo.png",
    business_type: "retail",
    theme: "green",
    status: "active",
    sms_credits: 0,
    max_products: 500,
    max_invoices: 10000,
    employee_limit: 5,
    created_at: now,
    updated_at: now,
  });

  await db.collection("users").insertOne({
    _id: userId as any,
    email: cleanEmail,
    phone: cleanPhone || null,
    password: await hashPassword(data.password),
    plain_password: data.password,
    full_name: sanitizeInput(data.fullName || ""),
    role: data.role || "owner",
    business_id: businessId,
    owner_id: userId,
    activated: true,
    status: "active",
    created_at: now,
    updated_at: now,
  });

  const token = await signToken({ userId, email: cleanEmail, role: data.role || "owner" });
  const cookieStore = await cookies();
  cookieStore.set("token", token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  const mapped = await mapUser(db, userId);
  return { user: mapped, token };
}

export async function firebaseAuthSyncFn(input: { data: { email: string; fullName?: string; firebaseUid?: string; photoUrl?: string } }) {
  const { data } = input;
  if (!data.email) throw new Error("Email is required for authentication");
  validateEmail(data.email);
  const cleanEmail = data.email.toLowerCase().trim();
  const db = await getDb();

  let user = await db.collection("users").findOne({ email: cleanEmail });
  let userId: string;

  if (user) {
    userId = user._id as any as string;
    const updates: Record<string, any> = {};
    if (data.photoUrl && !user.avatar_url) updates.avatar_url = data.photoUrl;
    if (data.fullName && !user.full_name) updates.full_name = data.fullName;
    if (data.firebaseUid && !user.firebase_uid) updates.firebase_uid = data.firebaseUid;
    if (Object.keys(updates).length > 0) {
      await db.collection("users").updateOne({ _id: user._id }, { $set: updates });
    }
  } else {
    // Register new Google / Firebase user automatically with 0 starter credits
    userId = crypto.randomUUID();
    const businessId = crypto.randomUUID();
    const now = new Date().toISOString();
    const shopName = sanitizeInput(data.fullName ? `${data.fullName}'s Shop` : "HakimQzz Store");

    await db.collection("businesses").insertOne({
      _id: businessId as any,
      owner_id: userId,
      name: shopName,
      logo_url: data.photoUrl || "/logo.png",
      business_type: "retail",
      theme: "green",
      status: "active",
      sms_credits: 0,
      max_products: 500,
      max_invoices: 10000,
      created_at: now,
      updated_at: now,
    } as any);

    await db.collection("users").insertOne({
      _id: userId as any,
      email: cleanEmail,
      full_name: sanitizeInput(data.fullName || cleanEmail.split("@")[0]),
      avatar_url: data.photoUrl || null,
      firebase_uid: data.firebaseUid || null,
      role: "owner",
      business_id: businessId,
      status: "active",
      activated: true,
      created_at: now,
      updated_at: now,
    } as any);
  }

  const token = await signToken({ userId, email: cleanEmail });
  const cookieStore = await cookies();
  cookieStore.set("token", token, { maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/" });
  const mapped = await mapUser(db, userId);
  return { user: mapped, token };
}

export async function logoutFn() {
  const cookieStore = await cookies();
  cookieStore.delete("token");
  return { success: true };
}

// ─── Products ────────────────────────────────────────────────────────────────

export async function getProductsFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("products").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function createProductFn(input: { data: { name: string; image_url?: string | null; buy_price?: number; sell_price?: number; stock?: number; attributes?: Record<string, string>; min_stock?: number; category?: string; barcode?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const name = sanitizeInput(data.name);
  if (!name) throw new Error("Product name cannot be blank");
  const barcode = data.barcode ? sanitizeInput(data.barcode) : null;
  const doc = { _id: id, owner_id: session.ownerId, name, image_url: data.image_url ? sanitizeInput(data.image_url) : null, buy_price: data.buy_price || 0, sell_price: data.sell_price || 0, stock: data.stock || 0, barcode, attributes: data.attributes || {}, min_stock: data.min_stock ?? 5, category: data.category ? sanitizeInput(data.category) : "", archived: false, created_at: new Date().toISOString() };
  await db.collection("products").insertOne(doc as any);

  // Sheets Sync
  appendRowToGoogleSheet(session.ownerId, "Products",
    ["ID", "Name", "Buy Price", "Sell Price", "Stock", "Min Stock", "Category", "Barcode", "Created At"],
    [id, name, data.buy_price || 0, data.sell_price || 0, data.stock || 0, data.min_stock ?? 5, data.category || "", barcode || "", doc.created_at]
  );

  return { ...doc, id };
}

/**
 * Auto-delete old image from ImgBB when updating image or deleting product
 */
export async function deleteImgbbImage(imageUrl?: string | null) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  if (!imageUrl.includes("ibb.co") && !imageUrl.includes("imgbb.com")) return;

  try {
    const db = await getDb();
    const record = await db.collection("uploaded_images").findOne({ url: imageUrl });
    if (record?.delete_url) {
      await fetch(record.delete_url, { method: "GET" }).catch(() => {});
      await db.collection("uploaded_images").deleteOne({ _id: record._id });
    }
  } catch (err) {
    console.warn("Could not auto-remove image from ImgBB:", err);
  }
}

export async function updateProductFn(input: { data: { id: string; name?: string; image_url?: string | null; buy_price?: number; sell_price?: number; stock?: number; attributes?: Record<string, string>; min_stock?: number; category?: string; barcode?: string | null; archived?: boolean } }) {
  const { data } = input;
  const session = await requireSession();
  const { id, ...updates } = data;
  
  const sanitizedUpdates: any = { ...updates };
  if (sanitizedUpdates.name !== undefined) sanitizedUpdates.name = sanitizeInput(sanitizedUpdates.name);
  if (sanitizedUpdates.image_url !== undefined && sanitizedUpdates.image_url !== null) sanitizedUpdates.image_url = sanitizeInput(sanitizedUpdates.image_url);
  if (sanitizedUpdates.category !== undefined) sanitizedUpdates.category = sanitizeInput(sanitizedUpdates.category);
  if (sanitizedUpdates.barcode !== undefined) sanitizedUpdates.barcode = sanitizedUpdates.barcode ? sanitizeInput(sanitizedUpdates.barcode) : null;
  
  const db = await getDb();

  // If image_url changed or cleared, clean up old image from ImgBB
  if (sanitizedUpdates.image_url !== undefined) {
    const oldProd = await db.collection("products").findOne({ _id: id as any, owner_id: session.ownerId });
    if (oldProd?.image_url && oldProd.image_url !== sanitizedUpdates.image_url) {
      void deleteImgbbImage(oldProd.image_url);
    }
  }

  await db.collection("products").updateOne({ _id: id as any, owner_id: session.ownerId }, { $set: sanitizedUpdates });
  const updated = await db.collection("products").findOne({ _id: id as any });
  return { ...updated, id };
}

export async function deleteProductFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  // Auto-remove product image from ImgBB
  const prod = await db.collection("products").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (prod?.image_url) {
    void deleteImgbbImage(prod.image_url);
  }

  await db.collection("products").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function archiveProductFn(input: { data: { id: string; archived: boolean } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("products").updateOne({ _id: data.id as any, owner_id: session.ownerId }, { $set: { archived: data.archived } });
  return { success: true };
}

// ─── Parties ─────────────────────────────────────────────────────────────────

export async function getPartiesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("parties").find({ owner_id: session.ownerId }).sort({ name: 1 }).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function createPartyFn(input: { data: { name: string; phone?: string | null; address?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, name: data.name, phone: data.phone || null, address: data.address || null, created_at: new Date().toISOString() };
  await db.collection("parties").insertOne(doc as any);
  return { ...doc, id };
}

export async function updatePartyFn(input: { data: { id: string; name?: string; phone?: string | null; address?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const { id, ...updates } = data;
  const db = await getDb();
  await db.collection("parties").updateOne({ _id: id as any, owner_id: session.ownerId }, { $set: updates });
  const updated = await db.collection("parties").findOne({ _id: id as any });
  return { ...updated, id };
}

export async function deletePartyFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("parties").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function archivePartyFn(input: { data: { id: string; archived: boolean } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("parties").updateOne({ _id: data.id as any, owner_id: session.ownerId }, { $set: { archived: data.archived } });
  return { success: true };
}

export async function getPartyFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const p = await db.collection("parties").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!p) return null;
  return { ...p, id: p._id as any as string };
}

export async function createPartyReceivableFn(input: { data: { party_id: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, party_id: data.party_id, amount: data.amount, note: data.note || null, created_at: new Date().toISOString() };
  await db.collection("party_receivables").insertOne(doc as any);
  return { ...doc, id };
}

export async function createPartyPayableFn(input: { data: { party_id: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, party_id: data.party_id, amount: data.amount, note: data.note || null, created_at: new Date().toISOString() };
  await db.collection("party_payables").insertOne(doc as any);
  return { ...doc, id };
}

export async function getAllPartyReceivablesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_receivables").find({ owner_id: session.ownerId }).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

export async function getAllPartyPayablesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_payables").find({ owner_id: session.ownerId }).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function getAllPayableSettlementsFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_payable_settlements").find({ owner_id: session.ownerId }).toArray();
  return items.map((s) => ({ ...s, id: s._id as any as string }));
}

export async function getPartyReceivablesFn(input: { data: { partyId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_receivables").find({ owner_id: session.ownerId, party_id: data.partyId }).sort({ created_at: -1 }).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

export async function getPartyPayablesFn(input: { data: { partyId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_payables").find({ owner_id: session.ownerId, party_id: data.partyId }).sort({ created_at: -1 }).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

export async function deletePartyReceivableFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("party_receivables").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function deletePartyPayableFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("party_payables").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function createPayableSettlementFn(input: { data: { party_id: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, party_id: data.party_id, amount: data.amount, note: data.note || null, created_at: new Date().toISOString() };
  await db.collection("party_payable_settlements").insertOne(doc as any);

  // Also insert cashbox entry when paying a party
  const party = await db.collection("parties").findOne({ _id: data.party_id as any, owner_id: session.ownerId });
  const partyName = party ? (party.name || "Party") : "Party";
  await insertCashboxEntry(db, session.ownerId, {
    kind: "withdraw",
    amount: data.amount,
    note: data.note || `Paid to ${partyName} (Payable Settlement)`,
    ref_id: id,
  });

  return { ...doc, id };
}

export async function getPayableSettlementsFn(input: { data: { partyId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("party_payable_settlements").find({ owner_id: session.ownerId, party_id: data.partyId }).sort({ created_at: -1 }).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

// ─── Sales ───────────────────────────────────────────────────────────────────

export async function getSalesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("sales").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(10000).toArray();

  const partyIds = items.map(s => s.party_id).filter(Boolean);
  const customers = await db.collection("customers").find({ _id: { $in: partyIds } }).toArray();
  const parties = await db.collection("parties").find({ _id: { $in: partyIds } }).toArray();

  const partyMap = new Map();
  customers.forEach(c => partyMap.set(c._id.toString(), c));
  parties.forEach(p => partyMap.set(p._id.toString(), p));

  return items.map((s) => {
    const p = s.party_id ? partyMap.get(s.party_id.toString()) : null;
    return {
      ...s,
      id: s._id as any as string,
      parties: p ? { name: p.name } : null
    };
  });
}

export async function getSalesForPartyFn(input: { data: { partyId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("sales").find({ owner_id: session.ownerId, party_id: data.partyId }).sort({ created_at: -1 }).toArray();
  return items.map((s) => ({ ...s, id: s._id as any as string }));
}

export async function createSaleFn(input: { data: { product_id?: string | null; product_name: string; qty: number; buy_price: number; sell_price: number; profit: number; type: string; party_id?: string | null; paid_amount: number; due_amount: number; note?: string | null; cart_id?: string | null; courier_name?: string | null; tracking_code?: string | null; courier_status?: string | null; created_at?: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const isOnline = data.type === "online";
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    ...data,
    courier_status: isOnline ? (data.courier_status || "pending") : undefined,
    courier_name: data.courier_name || (isOnline ? "Courier Delivery" : undefined),
    tracking_code: data.tracking_code || undefined,
    paid_amount: isOnline ? (data.courier_status === "collected" ? data.paid_amount : 0) : data.paid_amount,
    due_amount: isOnline ? (data.courier_status === "collected" ? 0 : Number(data.sell_price) * (Number(data.qty) || 1)) : data.due_amount,
    party_id: data.party_id || null,
    created_at: data.created_at || new Date().toISOString()
  };
  await db.collection("sales").insertOne(doc as any);
  if (data.product_id) {
    const product = await db.collection("products").findOne({ _id: data.product_id as any });
    if (product) await db.collection("products").updateOne({ _id: data.product_id as any }, { $set: { stock: Math.max(((product.stock as number) ?? 0) - data.qty, 0) } });
  }
  const cashAmt = isOnline ? (doc.courier_status === "collected" ? Number(doc.paid_amount) : 0) : saleCashboxAmount(data);
  if (cashAmt > 0) {
    const methodTag = data.type === "online" ? " [Paid by COURIER]" : data.type ? ` [Paid by ${data.type.toUpperCase()}]` : "";
    await insertCashboxEntry(db, session.ownerId, {
      kind: "sale",
      amount: cashAmt,
      note: `Sale${methodTag}: ${data.product_name}${data.note ? ` - ${data.note}` : ""}`,
      ref_id: id,
      created_at: doc.created_at,
    });
  }

  // Sheets Sync
  appendRowToGoogleSheet(session.ownerId, "Sales",
    ["ID", "Product Name", "Qty", "Buy Price", "Sell Price", "Profit", "Type", "Party ID", "Paid Amount", "Due Amount", "Courier Status", "Created At"],
    [id, data.product_name, data.qty, data.buy_price, data.sell_price, data.profit, data.type, data.party_id || "", doc.paid_amount, doc.due_amount, doc.courier_status || "", doc.created_at]
  );

  // Trigger Automatic SMS if enabled
  if (data.party_id) {
    triggerAutoPurchaseSms(db, session.ownerId, {
      id,
      product_name: data.product_name,
      qty: data.qty,
      sell_price: data.sell_price,
      paid_amount: doc.paid_amount,
      due_amount: doc.due_amount,
      party_id: data.party_id,
    }).catch(err => console.error("Auto purchase SMS error:", err));
  }

  return { ...doc, id };
}

export async function approveCourierPaymentFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const sale = await db.collection("sales").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!sale) throw new Error("Sale not found");
  if (sale.courier_status === "collected") return { success: true, message: "Already collected" };

  const cartId = sale.cart_id;
  const salesToApprove = cartId
    ? await db.collection("sales").find({ cart_id: cartId, owner_id: session.ownerId }).toArray()
    : [sale];

  const nowStr = new Date().toISOString();
  for (const s of salesToApprove) {
    const totalAmount = Number(s.sell_price) || (Number(s.qty) * Number(s.buy_price) + Number(s.profit));
    await db.collection("sales").updateOne(
      { _id: s._id as any, owner_id: session.ownerId },
      {
        $set: {
          courier_status: "collected",
          paid_amount: totalAmount,
          due_amount: 0,
          collected_at: nowStr,
          updated_at: nowStr,
        }
      }
    );

    // Deposit remittance into Cashbox
    await insertCashboxEntry(db, session.ownerId, {
      kind: "sale",
      amount: totalAmount,
      note: `Online Courier Payment Collected: ${s.product_name} [${s.courier_name || "Courier"}] (INV-${String(s._id).slice(-6).toUpperCase()})`,
      ref_id: String(s._id),
      created_at: nowStr,
    });
  }

  return { success: true };
}

export async function cancelCourierOrderFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const sale = await db.collection("sales").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!sale) throw new Error("Sale not found");

  const cartId = sale.cart_id;
  const salesToCancel = cartId
    ? await db.collection("sales").find({ cart_id: cartId, owner_id: session.ownerId }).toArray()
    : [sale];

  const nowStr = new Date().toISOString();
  for (const s of salesToCancel) {
    if (s.courier_status === "collected") {
      await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: s._id as any });
    }

    if (s.product_id && !s.returned) {
      const qtyToRestore = Number(s.qty) || 0;
      if (qtyToRestore > 0) {
        await db.collection("products").updateOne(
          { _id: s.product_id as any, owner_id: session.ownerId },
          { $inc: { stock: qtyToRestore } }
        );
      }
    }

    await db.collection("sales").updateOne(
      { _id: s._id as any, owner_id: session.ownerId },
      {
        $set: {
          courier_status: "cancelled",
          returned: true,
          profit: 0,
          cancelled_at: nowStr,
          updated_at: nowStr,
        }
      }
    );
  }

  return { success: true };
}

export async function deleteSaleFn(input: { data: { id: string } }) {
  try {
    const { data } = input;
    const session = await requireSession();
    const db = await getDb();
    const sale = await db.collection("sales").findOne({ _id: data.id as any, owner_id: session.ownerId });
    if (!sale) throw new Error("Sale not found");
 
    // If this sale belongs to a grouped cart, delete all items in the cart
    const cartId = sale.cart_id;
    let salesToDelete = [sale];
    if (cartId) {
      salesToDelete = await db.collection("sales").find({ cart_id: cartId, owner_id: session.ownerId }).toArray();
    }

    // Calculate total cashbox delta impact of deleting these sales
    let totalSaleDeltaEffect = 0;
    const allSaleIds = salesToDelete.map(s => s._id);
    const relatedEntries = await db.collection("cashbox_entries").find({ owner_id: session.ownerId, ref_id: { $in: allSaleIds } }).toArray();
    const relatedIds = relatedEntries.map(e => e._id.toString());
    for (const entry of relatedEntries) {
      const isPos = entry.kind === "sale" || entry.kind === "deposit";
      const val = isPos ? Number(entry.amount) : -Number(entry.amount);
      totalSaleDeltaEffect += val;
    }
    // Deleting them means the balance changes by -totalSaleDeltaEffect
    if (-totalSaleDeltaEffect < 0) {
      await checkCashboxBalanceEffect(db, session.ownerId, -totalSaleDeltaEffect, relatedIds);
    }

    for (const s of salesToDelete) {
      if (s.product_id) {
        const qtyToRestore = s.returned ? 0 : (Number(s.qty) || 0);
        if (qtyToRestore > 0) {
          await db.collection("products").updateOne(
            { _id: s.product_id as any, owner_id: session.ownerId },
            { $inc: { stock: qtyToRestore } }
          );
        }
      }
 
      // Clean up associated returns for this sale
      await db.collection("returns").deleteMany({ sale_id: s._id as any, owner_id: session.ownerId });
 
      // Clean up cashbox entries for this sale and its returns
      await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: s._id as any });
      
      await db.collection("sales").deleteOne({ _id: s._id as any, owner_id: session.ownerId });
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error in deleteSaleFn:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function editSaleFn(input: {
  data: {
    id: string;
    product_id?: string | null;
    product_name: string;
    qty: number;
    buy_price: number;
    sell_price: number;
    profit: number;
    type: string;
    party_id?: string | null;
    paid_amount: number;
    due_amount: number;
    note?: string | null;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const oldSale = await db.collection("sales").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!oldSale) throw new Error("Sale not found");

  const oldCashAmt = saleCashboxAmount(oldSale as any);
  const newCashAmt = saleCashboxAmount(data);
  const netEffect = newCashAmt - oldCashAmt;
  if (netEffect < 0) {
    const oldEntries = await db.collection("cashbox_entries").find({ owner_id: session.ownerId, ref_id: data.id, kind: "sale" }).toArray();
    const oldEntryIds = oldEntries.map(e => e._id.toString());
    await checkCashboxBalanceEffect(db, session.ownerId, netEffect, oldEntryIds);
  }

  if (oldSale.product_id && !oldSale.returned) {
    const oldQty = Number(oldSale.qty) || 0;
    if (oldQty > 0) {
      await db.collection("products").updateOne(
        { _id: oldSale.product_id as any, owner_id: session.ownerId },
        { $inc: { stock: oldQty } }
      );
    }
  }

  await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id, kind: "sale" });

  const updatedDoc = {
    ...oldSale,
    product_id: data.product_id || null,
    product_name: data.product_name,
    qty: data.qty,
    buy_price: data.buy_price,
    sell_price: data.sell_price,
    profit: data.profit,
    type: data.type,
    party_id: data.party_id || null,
    paid_amount: data.paid_amount,
    due_amount: data.due_amount,
    note: data.note || null,
    updated_at: new Date().toISOString(),
  };

  await db.collection("sales").updateOne({ _id: data.id as any, owner_id: session.ownerId }, { $set: updatedDoc });

  if (data.product_id) {
    const product = await db.collection("products").findOne({ _id: data.product_id as any, owner_id: session.ownerId });
    if (product) {
      await db.collection("products").updateOne(
        { _id: data.product_id as any, owner_id: session.ownerId },
        { $set: { stock: Math.max(((product.stock as number) ?? 0) - data.qty, 0) } }
      );
    }
  }

  const cashAmt = saleCashboxAmount(data);
  if (cashAmt > 0) {
    await insertCashboxEntry(db, session.ownerId, {
      kind: "sale",
      amount: cashAmt,
      note: `Sale (Updated): ${data.product_name}`,
      ref_id: data.id,
    });
  }

  return { success: true };
}
 
export async function updateUserAvatarFn(input: { data: { avatar_url: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const oldUser = await db.collection("users").findOne({ _id: session.userId as any });
  if (oldUser?.avatar_url && oldUser.avatar_url !== data.avatar_url) {
    void deleteImgbbImage(oldUser.avatar_url);
  }

  await db.collection("users").updateOne(
    { _id: session.userId as any },
    { $set: { avatar_url: data.avatar_url } }
  );
  const user = await mapUser(db, session.userId);
  return { user };
}
 
export async function createReturnFn(input: { data: { sale_id: string; qty: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const sale = await db.collection("sales").findOne({ _id: data.sale_id as any, owner_id: session.ownerId });
  if (!sale) throw new Error("Sale not found");
  if (!sale.product_id) throw new Error("Cannot return non-product sale");
  if (sale.returned) throw new Error("Already returned");
  const returnQty = Math.min(data.qty, sale.qty as number);
  if (returnQty <= 0) throw new Error("Invalid quantity");
 
  const id = crypto.randomUUID();
  const profitPerUnit = (sale.profit as number) / (sale.qty as number);
  const doc = {
    _id: id, owner_id: session.ownerId, sale_id: data.sale_id,
    product_id: sale.product_id, product_name: sale.product_name,
    qty: returnQty, note: data.note || null, created_at: new Date().toISOString(),
  };
  await db.collection("returns").insertOne(doc as any);
 
  const product = await db.collection("products").findOne({ _id: sale.product_id as any });
  if (product) {
    await db.collection("products").updateOne(
      { _id: sale.product_id as any },
      { $set: { stock: ((product.stock as number) ?? 0) + returnQty } },
    );
  }
 
  if (returnQty >= (sale.qty as number)) {
    await db.collection("sales").updateOne({ _id: data.sale_id as any }, { $set: { returned: true, return_qty: returnQty } });
  } else {
    const remaining = (sale.qty as number) - returnQty;
    await db.collection("sales").updateOne(
      { _id: data.sale_id as any },
      { $set: { qty: remaining, profit: profitPerUnit * remaining, return_qty: returnQty } },
    );
  }

  // Cash sales added money to the cashbox — returning them must withdraw it back.
  // Credit sales only created cashbox entries for the paid_amount portion (not the full amount),
  // so we refund proportionally based on what was actually collected.
  // Online sales: admin does not receive money immediately, so no cashbox impact on return either.
  const saleType: string = (sale.type as string) || "cash";
  let refundAmt = 0;
  if (saleType === "cash") {
    refundAmt = Number(sale.sell_price) * returnQty;
  } else if (saleType === "credit") {
    // Proportional refund of what was already paid in cash
    const paidPerUnit = Number(sale.qty) > 0 ? Number(sale.paid_amount) / Number(sale.qty) : 0;
    refundAmt = paidPerUnit * returnQty;
  }

  if (refundAmt > 0) {
    await insertCashboxEntry(db, session.ownerId, {
      kind: "withdraw",
      amount: refundAmt,
      note: data.note
        ? `Return: ${sale.product_name as string} (${returnQty} pcs) — ${data.note}`
        : `Return: ${sale.product_name as string} (${returnQty} pcs)`,
      ref_id: id,
      created_at: doc.created_at,
    });
  }

  return { ...doc, id };
}


export async function createDirectProductReturnFn(input: { data: { product_id: string; qty: number; return_price: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const product = await db.collection("products").findOne({ _id: data.product_id as any, owner_id: session.ownerId });
  if (!product) throw new Error("Product not found");
  
  const returnQty = Number(data.qty);
  if (returnQty <= 0) throw new Error("Invalid quantity");

  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    sale_id: null,
    product_id: data.product_id,
    product_name: product.name,
    qty: returnQty,
    return_price: Number(data.return_price) || 0,
    note: data.note || null,
    created_at: new Date().toISOString(),
  };
  await db.collection("returns").insertOne(doc as any);

  await db.collection("products").updateOne(
    { _id: data.product_id as any, owner_id: session.ownerId },
    { $set: { stock: ((product.stock as number) ?? 0) + returnQty } }
  );

  const refundAmt = returnQty * (Number(data.return_price) || 0);
  if (refundAmt > 0) {
    await insertCashboxEntry(db, session.ownerId, {
      kind: "withdraw",
      amount: refundAmt,
      note: `Direct Return: ${product.name} (Qty: ${returnQty})`,
      ref_id: id,
    });
  }

  return { ...doc, id };
}

export async function createPartyReturnFn(input: { data: { party_id: string; product_id: string; qty: number; refund_amount: number; deduct_type: "receivable" | "payable" | "cash"; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  
  const product = await db.collection("products").findOne({ _id: data.product_id as any, owner_id: session.ownerId });
  if (!product) throw new Error("Product not found");

  const returnQty = Number(data.qty);
  if (returnQty <= 0) throw new Error("Invalid quantity");

  const refundAmt = Number(data.refund_amount) || 0;

  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    party_id: data.party_id,
    sale_id: null,
    product_id: data.product_id,
    product_name: product.name,
    qty: returnQty,
    return_price: refundAmt / returnQty,
    amount: refundAmt,
    note: data.note || null,
    created_at: new Date().toISOString(),
  };
  await db.collection("returns").insertOne(doc as any);

  // 1. Update product stock
  await db.collection("products").updateOne(
    { _id: data.product_id as any, owner_id: session.ownerId },
    { $set: { stock: ((product.stock as number) ?? 0) + returnQty } }
  );

  // 2. Deduct from party's dues/bokeya by inserting a negative party_receivable or party_payable, or withdraw from cashbox if cash refund
  if (refundAmt > 0) {
    const formattedNote = data.note 
      ? `${product.name} (Qty: ${returnQty}) - ${data.note}` 
      : `${product.name} (Qty: ${returnQty})`;

    if (data.deduct_type === "payable") {
      const payableId = crypto.randomUUID();
      await db.collection("party_payables").insertOne({
        _id: payableId as any,
        owner_id: session.ownerId,
        party_id: data.party_id,
        amount: -refundAmt,
        note: `Returned to Supplier: ${formattedNote}`,
        created_at: doc.created_at,
        ref_id: id,
      });
    } else if (data.deduct_type === "receivable") {
      const receivableId = crypto.randomUUID();
      await db.collection("party_receivables").insertOne({
        _id: receivableId as any,
        owner_id: session.ownerId,
        party_id: data.party_id,
        amount: -refundAmt,
        note: `Product Return: ${formattedNote}`,
        created_at: doc.created_at,
        ref_id: id,
      });
    } else if (data.deduct_type === "cash") {
      await insertCashboxEntry(db, session.ownerId, {
        kind: "withdraw",
        amount: refundAmt,
        note: `Product Return Refund: ${formattedNote}`,
        ref_id: id,
        created_at: doc.created_at,
      });
    }
  }

  return { ...doc, id };
}

export async function getReturnsFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("returns").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(5000).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

export async function deleteReturnFn(input: { data: { id: string } }) {
  try {
    const { data } = input;
    const session = await requireSession();
    const db = await getDb();

    const ret = await db.collection("returns").findOne({ _id: data.id as any, owner_id: session.ownerId });
    if (!ret) throw new Error("Return record not found");

    if (ret.product_id) {
      const product = await db.collection("products").findOne({ _id: ret.product_id });
      if (product) {
        await db.collection("products").updateOne(
          { _id: ret.product_id },
          { $set: { stock: Math.max(((product.stock as number) ?? 0) - (ret.qty as number), 0) } }
        );
      }
    }

    if (ret.sale_id) {
      const sale = await db.collection("sales").findOne({ _id: ret.sale_id as any, owner_id: session.ownerId });
      if (sale) {
        const originalQty = (sale.qty as number) + (ret.qty as number);
        const buyPrice = Number(sale.buy_price) || 0;
        const sellPrice = Number(sale.sell_price) || 0;
        const updatedProfit = (sellPrice - buyPrice) * originalQty;

        await db.collection("sales").updateOne(
          { _id: ret.sale_id as any },
          {
            $set: {
              returned: false,
              qty: originalQty,
              profit: updatedProfit,
            },
            $unset: {
              return_qty: "",
            }
          }
        );
      }
    }

    await db.collection("party_receivables").deleteMany({ owner_id: session.ownerId, ref_id: data.id as any });
    await db.collection("party_payables").deleteMany({ owner_id: session.ownerId, ref_id: data.id as any });
    await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id });
    await db.collection("returns").deleteOne({ _id: data.id as any, owner_id: session.ownerId });

    return { success: true };
  } catch (err: any) {
    console.error("Error in deleteReturnFn:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function exchangeProductsFn(input: {
  data: {
    returned_product_id: string;
    returned_qty: number;
    returned_price: number;
    new_product_id: string;
    new_qty: number;
    new_sell_price: number;
    party_id?: string | null;
    customer_name?: string | null;
    note?: string | null;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const returnedProduct = await db.collection("products").findOne({ _id: data.returned_product_id as any, owner_id: session.ownerId });
  if (!returnedProduct) throw new Error("Returned product not found");

  const newProduct = await db.collection("products").findOne({ _id: data.new_product_id as any, owner_id: session.ownerId });
  if (!newProduct) throw new Error("New product chosen for exchange not found");

  const retQty = Number(data.returned_qty) || 1;
  const newQty = Number(data.new_qty) || 1;
  const retPrice = Number(data.returned_price) || Number(returnedProduct.sell_price) || 0;
  const newPrice = Number(data.new_sell_price) || Number(newProduct.sell_price) || 0;

  // Check if new product has sufficient stock
  const currentNewStock = (newProduct.stock as number) ?? 0;
  if (currentNewStock < newQty) {
    throw new Error(`Insufficient stock for ${newProduct.name}. Available: ${currentNewStock}`);
  }

  // 1. Restock the returned product
  await db.collection("products").updateOne(
    { _id: returnedProduct._id },
    { $inc: { stock: retQty } }
  );

  // 2. Reduce stock of the newly taken product
  await db.collection("products").updateOne(
    { _id: newProduct._id },
    { $inc: { stock: -newQty } }
  );

  const totalReturnedValue = retPrice * retQty;
  const totalNewValue = newPrice * newQty;
  const cashDifference = totalNewValue - totalReturnedValue;

  const now = new Date().toISOString();
  const exchangeId = crypto.randomUUID();

  // 3. Record the exchange transaction in "returns" and "sales"
  const returnRecord = {
    _id: `ex_ret_${exchangeId}` as any,
    owner_id: session.ownerId,
    exchange_id: exchangeId,
    product_id: returnedProduct._id,
    product_name: returnedProduct.name,
    qty: retQty,
    return_price: retPrice,
    amount: totalReturnedValue,
    note: `Exchange for ${newProduct.name}${data.note ? ` (${data.note})` : ""}`,
    created_at: now,
  };
  await db.collection("returns").insertOne(returnRecord as any);

  // Profit calculation for the newly taken item:
  const newBuyPrice = Number(newProduct.buy_price) || 0;
  const newProfit = (newPrice - newBuyPrice) * newQty;

  const saleRecord = {
    _id: `ex_sale_${exchangeId}` as any,
    owner_id: session.ownerId,
    exchange_id: exchangeId,
    product_id: newProduct._id,
    product_name: `${newProduct.name} [Exchanged with ${returnedProduct.name}]`,
    qty: newQty,
    buy_price: newBuyPrice,
    sell_price: newPrice,
    profit: newProfit,
    type: "exchange",
    party_id: data.party_id || null,
    paid_amount: totalNewValue,
    due_amount: 0,
    note: `Exchange adjustment: Returned ${returnedProduct.name} (Value: ৳${totalReturnedValue}). Cash diff: ৳${cashDifference >= 0 ? `+${cashDifference}` : cashDifference}`,
    created_at: now,
  };
  await db.collection("sales").insertOne(saleRecord as any);

  // 4. Adjust Cashbox
  if (cashDifference > 0) {
    // Customer pays the difference -> Inflow
    await insertCashboxEntry(db, session.ownerId, {
      kind: "deposit",
      amount: cashDifference,
      note: `Product Exchange Cash Inflow: Returned ${returnedProduct.name}, Took ${newProduct.name} (INV-${exchangeId.slice(-6).toUpperCase()})`,
      ref_id: exchangeId,
      created_at: now,
    });
  } else if (cashDifference < 0) {
    // Shop refunds difference to customer -> Outflow
    const refundAmt = Math.abs(cashDifference);
    await insertCashboxEntry(db, session.ownerId, {
      kind: "withdraw",
      amount: refundAmt,
      note: `Product Exchange Refund Outflow: Returned ${returnedProduct.name}, Took ${newProduct.name} (INV-${exchangeId.slice(-6).toUpperCase()})`,
      ref_id: exchangeId,
      created_at: now,
    });
  }

  return {
    success: true,
    exchangeId,
    returnedProduct: returnedProduct.name,
    newProduct: newProduct.name,
    cashDifference,
    totalReturnedValue,
    totalNewValue,
  };
}

// ─── Purchases ───────────────────────────────────────────────────────────────

export async function getPurchasesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("purchases").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(10000).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function createPurchaseFn(input: { data: { product_id?: string | null; product_name: string; qty: number; unit_cost: number; sell_price?: number; total: number; note?: string | null; created_at?: string; party_id?: string | null; payment_type?: "cash" | "credit" | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, created_at: data.created_at || new Date().toISOString() };
  await db.collection("purchases").insertOne(doc as any);
  if (data.product_id) {
    const product = await db.collection("products").findOne({ _id: data.product_id as any });
    if (product) {
      const updates: Record<string, number> = {
        stock: ((product.stock as number) ?? 0) + data.qty,
        buy_price: data.unit_cost,
      };
      if (data.sell_price != null && data.sell_price > 0) {
        updates.sell_price = data.sell_price;
      }
      await db.collection("products").updateOne({ _id: data.product_id as any }, { $set: updates });
    }
  }

  // Deduct from cashbox ONLY if payment_type is NOT credit
  if (data.payment_type !== "credit") {
    // Add product purchase to expenses collection
    const expenseId = crypto.randomUUID();
    const expenseDoc = {
      _id: expenseId,
      owner_id: session.ownerId,
      title: `Product Purchase: ${data.product_name}`,
      amount: data.total,
      note: `Purchased ${data.qty} units of ${data.product_name} at unit cost ${data.unit_cost}. Purchase ID: ${id}`,
      created_at: doc.created_at,
    };
    await db.collection("expenses").insertOne(expenseDoc as any);

    // Deduct from cashbox using expense entry — ref_id points to purchase ID for reliable delete
    await insertCashboxEntry(db, session.ownerId, {
      kind: "expense",
      amount: data.total,
      note: `Product Purchase: ${data.product_name}`,
      ref_id: id, // Use purchase ID so deletePurchaseFn can find this directly
      created_at: doc.created_at,
    });

    // Sheets Sync for Expense
    appendRowToGoogleSheet(session.ownerId, "Expenses",
      ["ID", "Title", "Amount", "Note", "Created At"],
      [expenseId, expenseDoc.title, expenseDoc.amount, expenseDoc.note, expenseDoc.created_at]
    );
  } else if (data.party_id) {
    // Record it as a debt/payable to the party
    const payableId = crypto.randomUUID();
    const payableDoc = {
      _id: payableId,
      owner_id: session.ownerId,
      party_id: data.party_id,
      amount: data.total,
      note: `Credit Purchase: ${data.qty}x ${data.product_name}. Purchase ID: ${id}`,
      created_at: doc.created_at,
    };
    await db.collection("party_payables").insertOne(payableDoc as any);
  }

  // Sheets Sync for Purchase
  appendRowToGoogleSheet(session.ownerId, "Purchases",
    ["ID", "Product Name", "Qty", "Unit Cost", "Total", "Note", "Created At"],
    [id, data.product_name, data.qty, data.unit_cost, data.total, data.note || "", doc.created_at]
  );

  return { ...doc, id };
}

export async function deletePurchaseFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const purchase = await db.collection("purchases").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.product_id) {
    const product = await db.collection("products").findOne({ _id: purchase.product_id as any });
    if (product) {
      await db.collection("products").updateOne(
        { _id: purchase.product_id as any },
        { $set: { stock: Math.max(((product.stock as number) ?? 0) - (purchase.qty as number), 0) } },
      );
    }
  }
  await db.collection("purchases").deleteOne({ _id: data.id as any, owner_id: session.ownerId });

  // Delete cashbox entry directly by purchase ID (new approach — ref_id = purchase ID)
  const cashboxDelResult = await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id });

  // Fallback: legacy entries used expenseId as ref_id — find via expense title+note containing purchase ID
  if (cashboxDelResult.deletedCount === 0) {
    const expense = await db.collection("expenses").findOne({
      owner_id: session.ownerId,
      note: { $regex: `Purchase ID: ${data.id}` },
    });
    if (expense) {
      await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: expense._id as any });
      await db.collection("expenses").deleteOne({ _id: expense._id });
    }
  } else {
    // Also clean up the auto-created expense record for this purchase
    await db.collection("expenses").deleteMany({
      owner_id: session.ownerId,
      note: { $regex: `Purchase ID: ${data.id}` },
    });
  }

  return { success: true };
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function getExpensesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("expenses").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(10000).toArray();
  return items.map((e) => ({ ...e, id: e._id as any as string }));
}

export async function createExpenseFn(input: { data: { title: string; amount: number; category?: string | null; note?: string | null; created_at?: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    title: data.title,
    amount: data.amount,
    category: data.category || "other",
    note: data.note || null,
    created_at: data.created_at || new Date().toISOString()
  };
  await db.collection("expenses").insertOne(doc as any);
  await insertCashboxEntry(db, session.ownerId, {
    kind: "expense",
    amount: data.amount,
    note: data.title,
    ref_id: id,
    created_at: doc.created_at,
  });

  // Sheets Sync
  appendRowToGoogleSheet(session.ownerId, "Expenses",
    ["ID", "Title", "Category", "Amount", "Note", "Created At"],
    [id, data.title, data.category || "other", data.amount, data.note || "", doc.created_at]
  );

  return { ...doc, id };
}

export async function deleteExpenseFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("cashbox_entries").deleteOne({ owner_id: session.ownerId, ref_id: data.id, kind: "expense" });
  await db.collection("expenses").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getPaymentsForPartyFn(input: { data: { partyId: string } }): Promise<any[]> {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("payments").find({ owner_id: session.ownerId, party_id: data.partyId }).sort({ created_at: -1 }).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function getAllPaymentsFn(): Promise<any[]> {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("payments").find({ owner_id: session.ownerId }).toArray();
  return items.map((p) => ({ ...p, id: p._id as any as string }));
}

export async function createPaymentFn(input: { data: { party_id: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, created_at: new Date().toISOString() };
  await db.collection("payments").insertOne(doc as any);

  // Also insert cashbox entry when party pays
  let party = await db.collection("customers").findOne({ _id: data.party_id, owner_id: session.ownerId } as any);
  if (!party) {
    party = await db.collection("parties").findOne({ _id: data.party_id, owner_id: session.ownerId } as any);
  }
  const partyName = party ? (party.name || "Party") : "Party";
  await insertCashboxEntry(db, session.ownerId, {
    kind: "deposit",
    amount: data.amount,
    note: data.note || `Collected dues from ${partyName}`,
    ref_id: id,
  });

  return { ...doc, id };
}

export async function deletePaymentFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  
  const relatedEntries = await db.collection("cashbox_entries").find({ owner_id: session.ownerId, ref_id: data.id } as any).toArray();
  const relatedIds = relatedEntries.map(e => e._id.toString());
  let paymentDeltaEffect = 0;
  for (const entry of relatedEntries) {
    const isPos = entry.kind === "sale" || entry.kind === "deposit";
    const val = isPos ? Number(entry.amount) : -Number(entry.amount);
    paymentDeltaEffect += val;
  }
  if (-paymentDeltaEffect < 0) {
    await checkCashboxBalanceEffect(db, session.ownerId, -paymentDeltaEffect, relatedIds);
  }

  await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id } as any);
  await db.collection("payments").deleteOne({ _id: data.id, owner_id: session.ownerId } as any);
  return { success: true };
}

// ─── Somiti ───────────────────────────────────────────────────────────────────

export async function getSomitiFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("somiti_entries").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(10000).toArray();
  return items.map((s) => ({ ...s, id: s._id as any as string }));
}

export async function createSomitiFn(input: { data: { kind: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, created_at: new Date().toISOString() };
  await db.collection("somiti_entries").insertOne(doc as any);

  // Sync to cashbox — Samity is a savings asset, not an operational expense (does NOT cut from net profit)
  // Depositing into Samity reduces cash in cashbox (withdraw); withdrawing from Samity returns cash to cashbox (deposit)
  const cashboxKind = data.kind === "withdraw" ? "deposit" : "withdraw";
  await insertCashboxEntry(db, session.ownerId, {
    kind: cashboxKind,
    amount: Number(data.amount),
    note: data.note ? `Samity (${data.kind}): ${data.note}` : `Samity ${data.kind}`,
    ref_id: id,
  });

  return { ...doc, id };
}

export async function updateSomitiFn(input: { data: { id: string; kind: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const { id, ...updates } = data;
  await db.collection("somiti_entries").updateOne(
    { _id: id as any, owner_id: session.ownerId },
    { $set: updates }
  );

  const cashboxKind = data.kind === "withdraw" ? "deposit" : "withdraw";
  await db.collection("cashbox_entries").updateOne(
    { owner_id: session.ownerId, ref_id: id },
    { $set: {
        kind: cashboxKind,
        amount: Number(data.amount),
        note: data.note ? `Samity (${data.kind}): ${data.note}` : `Samity ${data.kind}`,
      }
    }
  );

  const updated = await db.collection("somiti_entries").findOne({ _id: id as any });
  return { ...updated, id };
}

export async function deleteSomitiFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  // Clean up linked cashbox entry before deleting the somiti record
  await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id });
  await db.collection("somiti_entries").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function renameSomitiFn(input: { data: { oldName: string; newName: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const entries = await db.collection("somiti_entries").find({ owner_id: session.ownerId }).toArray();
  for (const entry of entries) {
    const note = entry.note || "";
    const match = note.match(/^\[(.*?)\](?:\s*(.*))?$/);
    if (match) {
      const parsedName = match[1].trim();
      if (parsedName.toLowerCase() === data.oldName.trim().toLowerCase()) {
        const actualNote = match[2]?.trim() || "";
        const newNote = actualNote 
          ? `[${data.newName.trim()}] ${actualNote}` 
          : `[${data.newName.trim()}]`;
        await db.collection("somiti_entries").updateOne(
          { _id: entry._id },
          { $set: { note: newNote } }
        );
      }
    }
  }
  return { success: true };
}

export async function deleteSomitiFnByName(input: { data: { name: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const entries = await db.collection("somiti_entries").find({ owner_id: session.ownerId }).toArray();
  for (const entry of entries) {
    const note = entry.note || "";
    const match = note.match(/^\[(.*?)\](?:\s*(.*))?$/);
    if (match) {
      const parsedName = match[1].trim();
      if (parsedName.toLowerCase() === data.name.trim().toLowerCase()) {
        // Clean up linked cashbox entry before deleting
        await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: entry._id as any });
        await db.collection("somiti_entries").deleteOne({ _id: entry._id });
      }
    }
  }
  return { success: true };
}


// ─── Withdrawals ──────────────────────────────────────────────────────────────

export async function getWithdrawalsFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("owner_withdrawals").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(5000).toArray();
  return items.map((w) => ({ ...w, id: w._id as any as string }));
}

export async function createWithdrawalFn(input: { data: { amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, created_at: new Date().toISOString() };
  await db.collection("owner_withdrawals").insertOne(doc as any);

  // Deduct from cashbox — owner withdrawal always takes money out of the cashbox
  await insertCashboxEntry(db, session.ownerId, {
    kind: "withdraw",
    amount: Number(data.amount) || 0,
    note: data.note || "Owner Withdrawal",
    ref_id: id,
    created_at: doc.created_at,
  });

  return { ...doc, id };
}

// ─── Cashbox ──────────────────────────────────────────────────────────────────

export async function getCashboxFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("cashbox_entries").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(5000).toArray();
  // Explicitly cast amount to Number — MongoDB BSON types (Long, Decimal128) can break JS arithmetic
  return items.map((e) => ({
    id: e._id as any as string,
    kind: e.kind as string,
    amount: Number(e.amount) || 0,
    note: e.note ?? null,
    ref_id: e.ref_id ?? null,
    created_at: e.created_at as string,
  }));
}

export async function createCashboxFn(input: { data: { kind: "deposit" | "withdraw"; amount: number; note?: string | null; created_at?: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const saved = await insertCashboxEntry(db, session.ownerId, {
    kind: data.kind,
    amount: data.amount,
    note: data.note ?? null,
    created_at: data.created_at,
  });
  return saved;
}

export async function updateCashboxFn(input: { data: { id: string; kind: string; amount: number; note?: string | null; created_at?: string } }) {
  const { data } = input;
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "superadmin") {
    throw new Error("Only owners can edit cashbox entries.");
  }
  const db = await getDb();

  // Calculate delta effect
  const oldEntry = await db.collection("cashbox_entries").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!oldEntry) throw new Error("Cashbox entry not found.");

  const oldIsPositive = oldEntry.kind === "deposit" || oldEntry.kind === "sale";
  const oldDelta = oldIsPositive ? Number(oldEntry.amount) : -Number(oldEntry.amount);

  const newIsPositive = data.kind === "deposit" || data.kind === "sale";
  const newDelta = newIsPositive ? Number(data.amount) : -Number(data.amount);

  const deltaEffect = newDelta - oldDelta;
  if (deltaEffect < 0) {
    await checkCashboxBalanceEffect(db, session.ownerId, deltaEffect, data.id);
  }

  const result = await db.collection("cashbox_entries").findOneAndUpdate(
    { _id: data.id as any, owner_id: session.ownerId },
    { $set: {
        kind: data.kind,
        amount: Number(data.amount),
        note: data.note ?? null,
        ...(data.created_at ? { created_at: data.created_at } : {}),
      }
    },
    { returnDocument: "after" }
  );
  if (!result) throw new Error("Cashbox entry not found.");
  return { ...result, id: result._id as any as string };
}

export async function deleteCashboxFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "superadmin") {
    throw new Error("Only owners can delete cashbox entries.");
  }
  const db = await getDb();

  const oldEntry = await db.collection("cashbox_entries").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!oldEntry) throw new Error("Cashbox entry not found.");

  const oldIsPositive = oldEntry.kind === "deposit" || oldEntry.kind === "sale";
  const oldDelta = oldIsPositive ? Number(oldEntry.amount) : -Number(oldEntry.amount);

  const deltaEffect = -oldDelta;
  if (deltaEffect < 0) {
    await checkCashboxBalanceEffect(db, session.ownerId, deltaEffect, data.id);
  }

  const result = await db.collection("cashbox_entries").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  if (result.deletedCount === 0) throw new Error("Cashbox entry not found.");
  return { success: true };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function uploadImageFn(input: any) {
  await requireSession();
  const apiKey = process.env.IMGBB_API_KEY || "64c6abc7d312e08242671d2ebb7d9f2f";

  let raw = "";
  if (typeof input === "string") {
    raw = input;
  } else if (input?.data?.base64) {
    raw = input.data.base64;
  } else if (input?.data?.image) {
    raw = input.data.image;
  } else if (input?.data?.image_url) {
    raw = input.data.image_url;
  } else if (typeof input?.data === "string") {
    raw = input.data;
  } else if (input?.base64) {
    raw = input.base64;
  } else if (input?.image) {
    raw = input.image;
  }

  if (raw && raw.includes(";base64,")) {
    raw = raw.split(";base64,")[1];
  } else if (raw && raw.startsWith("data:")) {
    const commaIdx = raw.indexOf(",");
    if (commaIdx !== -1) raw = raw.slice(commaIdx + 1);
  }

  if (!raw || !raw.trim()) {
    throw new Error("No image data provided for upload");
  }

  const form = new FormData();
  form.append("image", raw.trim());
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Image upload failed");
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Upload failed");
  return { url: json.data.url as string };
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export async function getRemindersFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("reminders").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).toArray();
  return items.map((r) => ({ ...r, id: r._id as any as string }));
}

export async function createReminderFn(input: { data: { title: string; due_date: string; logic_type?: string; logic_config?: any } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    title: data.title,
    due_date: data.due_date,
    logic_type: data.logic_type || "none",
    logic_config: data.logic_config || null,
    completed: false,
    created_at: new Date().toISOString(),
  };
  await db.collection("reminders").insertOne(doc as any);
  return { ...doc, id };
}

export async function toggleReminderFn(input: { data: { id: string; completed: boolean } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("reminders").updateOne({ _id: data.id as any, owner_id: session.ownerId }, { $set: { completed: data.completed } });
  return { success: true };
}

export async function deleteReminderFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("reminders").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function deletePayableSettlementFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("party_payable_settlements").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  await db.collection("cashbox_entries").deleteMany({ ref_id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function verifyOwnerPasswordFn(input: { data: { password: string } }) {
  const session = await requireSession();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: session.userId as any });
  if (!user) throw new Error("User not found");
  if (!user.password) throw new Error("No password set for this account");
  const match = await comparePassword(input.data.password, user.password as string, user.plain_password as string);
  if (!match) throw new Error("Incorrect password");
  return { success: true };
}

export async function emptyCashboxFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetProductsFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("products").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetSalesFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("sales").deleteMany({ owner_id: session.ownerId });
  await db.collection("returns").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetPurchasesFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("purchases").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetSomitiFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("somiti_entries").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetExpensesFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  await db.collection("expenses").deleteMany({ owner_id: session.ownerId });
  return { success: true };
}

export async function resetPartiesFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  const ownerId = session.ownerId;
  await db.collection("customers").deleteMany({ owner_id: ownerId });
  await db.collection("parties").deleteMany({ owner_id: ownerId });
  await db.collection("payments").deleteMany({ owner_id: ownerId });
  await db.collection("party_receivables").deleteMany({ owner_id: ownerId });
  await db.collection("party_payables").deleteMany({ owner_id: ownerId });
  await db.collection("party_payable_settlements").deleteMany({ owner_id: ownerId });
  return { success: true };
}


export async function resetAllDataFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can reset data");
  const db = await getDb();
  const ownerId = session.ownerId;
  await db.collection("products").deleteMany({ owner_id: ownerId });
  await db.collection("sales").deleteMany({ owner_id: ownerId });
  await db.collection("returns").deleteMany({ owner_id: ownerId });
  await db.collection("purchases").deleteMany({ owner_id: ownerId });
  await db.collection("cashbox_entries").deleteMany({ owner_id: ownerId });
  await db.collection("expenses").deleteMany({ owner_id: ownerId });
  await db.collection("somiti_entries").deleteMany({ owner_id: ownerId });
  await db.collection("owner_withdrawals").deleteMany({ owner_id: ownerId });
  await db.collection("customers").deleteMany({ owner_id: ownerId });
  await db.collection("parties").deleteMany({ owner_id: ownerId });
  await db.collection("payments").deleteMany({ owner_id: ownerId });
  await db.collection("party_receivables").deleteMany({ owner_id: ownerId });
  await db.collection("party_payables").deleteMany({ owner_id: ownerId });
  await db.collection("party_payable_settlements").deleteMany({ owner_id: ownerId });
  await db.collection("reminders").deleteMany({ owner_id: ownerId });
  return { success: true };
}

export async function bulkExportToGoogleSheetsFn() {
  const session = await requireSession();
  if (session.role !== "owner") throw new Error("Only owner can export data");
  await bulkExportToGoogleSheets(session.ownerId);
  return { success: true };
}

export async function changeMyPasswordFn(input: { data: { currentPassword?: string; newPassword: string } }) {
  const { data } = input;
  const session = await requireSession();
  if (!data.newPassword || data.newPassword.trim().length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: session.userId as any });
  if (!user) throw new Error("User not found");

  if (data.currentPassword) {
    if (!user.password) throw new Error("No current password is set for this account");
    const ok = await comparePassword(data.currentPassword, user.password as string, user.plain_password as string);
    if (!ok) throw new Error("Current password is incorrect");
  }

  const hashedPassword = await hashPassword(data.newPassword.trim());
  await db.collection("users").updateOne(
    { _id: session.userId as any },
    { $set: { password: hashedPassword, plain_password: data.newPassword.trim() } }
  );

  return { success: true };
}

export async function createProfileFn(input: { data: { name: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  
  const profileId = crypto.randomUUID();
  const newProfile = {
    id: profileId,
    name: data.name.trim() || "New Profile",
    created_at: new Date().toISOString()
  };

  const ownerIdBase = session.ownerId.split(":")[0];
  const owner = await db.collection("users").findOne({ _id: ownerIdBase as any });
  let profiles = owner?.profiles || [
    { id: "default", name: "Default Profile", created_at: new Date().toISOString() }
  ];
  profiles.push(newProfile);

  await db.collection("users").updateOne(
    { _id: ownerIdBase as any },
    { $set: { profiles } }
  );

  const cookieStore = await cookies();
  cookieStore.set("active_profile", profileId, { maxAge: 365 * 24 * 60 * 60, path: "/" });

  const mapped = await mapUser(db, session.userId);
  return { user: mapped };
}

export async function switchProfileFn(input: { data: { profileId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const ownerIdBase = session.ownerId.split(":")[0];
  const owner = await db.collection("users").findOne({ _id: ownerIdBase as any });
  const profiles = owner?.profiles || [
    { id: "default", name: "Default Profile", created_at: new Date().toISOString() }
  ];

  const exists = profiles.some((p: any) => p.id === data.profileId);
  if (!exists && data.profileId !== "default") {
    throw new Error("Profile not found");
  }

  const cookieStore = await cookies();
  cookieStore.set("active_profile", data.profileId, { maxAge: 365 * 24 * 60 * 60, path: "/" });

  const mapped = await mapUser(db, session.userId);
  return { user: mapped };
}

export async function importProfileModuleFn(input: { data: { fromProfileId: string; module: "products" | "somiti" | "party" | "customer" | "sales" | "purchases" | "expenses" | "cashbox" } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const ownerIdBase = session.ownerId.split(":")[0];
  const destOwnerId = session.ownerId;
  const sourceProfileId = data.fromProfileId;
  const sourceOwnerId = sourceProfileId === "default" ? ownerIdBase : `${ownerIdBase}:${sourceProfileId}`;

  if (sourceOwnerId === destOwnerId) {
    throw new Error("Cannot import from the same profile");
  }

  let importedCount = 0;

  if (data.module === "products") {
    const srcProducts = await db.collection("products").find({ owner_id: sourceOwnerId }).toArray();
    for (const p of srcProducts) {
      const { _id, ...rest } = p;
      const newId = crypto.randomUUID();
      const doc = {
        ...rest,
        _id: newId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("products").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "somiti") {
    const srcSomiti = await db.collection("somiti_entries").find({ owner_id: sourceOwnerId }).toArray();
    for (const s of srcSomiti) {
      const { _id, ...rest } = s;
      const newId = crypto.randomUUID();
      const doc = {
        ...rest,
        _id: newId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("somiti_entries").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "sales") {
    const srcSales = await db.collection("sales").find({ owner_id: sourceOwnerId }).toArray();
    for (const s of srcSales) {
      const { _id, ...rest } = s;
      const newId = crypto.randomUUID();
      const doc = {
        ...rest,
        _id: newId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("sales").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "purchases") {
    const srcPurchases = await db.collection("purchases").find({ owner_id: sourceOwnerId }).toArray();
    for (const p of srcPurchases) {
      const { _id, ...rest } = p;
      const newId = crypto.randomUUID();
      const doc = {
        ...rest,
        _id: newId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("purchases").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "expenses") {
    const srcExpenses = await db.collection("expenses").find({ owner_id: sourceOwnerId }).toArray();
    for (const e of srcExpenses) {
      const { _id, ...rest } = e;
      const newId = crypto.randomUUID();
      const doc = {
        ...rest,
        _id: newId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("expenses").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "cashbox") {
    const srcCashbox = await db.collection("cashbox_entries").find({ owner_id: sourceOwnerId }).toArray();
    for (const c of srcCashbox) {
      const { _id, ...rest } = c;
      const doc = {
        ...rest,
        _id: crypto.randomUUID(),
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("cashbox_entries").insertOne(doc as any);
      importedCount++;
    }
    const srcWithdrawals = await db.collection("owner_withdrawals").find({ owner_id: sourceOwnerId }).toArray();
    for (const w of srcWithdrawals) {
      const { _id, ...rest } = w;
      const doc = {
        ...rest,
        _id: crypto.randomUUID(),
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("owner_withdrawals").insertOne(doc as any);
      importedCount++;
    }
  } else if (data.module === "customer") {
    const srcCustomers = await db.collection("customers").find({ owner_id: sourceOwnerId }).toArray();
    for (const c of srcCustomers) {
      const newCustomerId = crypto.randomUUID();
      const oldCustomerId = c._id as any as string;
      const { _id, ...rest } = c;

      const docCustomer = {
        ...rest,
        _id: newCustomerId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("customers").insertOne(docCustomer as any);
      importedCount++;

      const srcReceivables = await db.collection("party_receivables").find({ owner_id: sourceOwnerId, party_id: oldCustomerId }).toArray();
      for (const r of srcReceivables) {
        const { _id: rId, ...rRest } = r;
        await db.collection("party_receivables").insertOne({
          ...rRest,
          _id: crypto.randomUUID(),
          owner_id: destOwnerId,
          party_id: newCustomerId,
          created_at: new Date().toISOString()
        } as any);
      }

      const srcPayments = await db.collection("payments").find({ owner_id: sourceOwnerId, party_id: oldCustomerId }).toArray();
      for (const pay of srcPayments) {
        const { _id: payId, ...payRest } = pay;
        await db.collection("payments").insertOne({
          ...payRest,
          _id: crypto.randomUUID(),
          owner_id: destOwnerId,
          party_id: newCustomerId,
          created_at: new Date().toISOString()
        } as any);
      }
    }
  } else if (data.module === "party") {
    const srcParties = await db.collection("parties").find({ owner_id: sourceOwnerId }).toArray();
    for (const p of srcParties) {
      const newPartyId = crypto.randomUUID();
      const oldPartyId = p._id as any as string;
      const { _id, ...rest } = p;

      const docParty = {
        ...rest,
        _id: newPartyId,
        owner_id: destOwnerId,
        created_at: new Date().toISOString()
      };
      await db.collection("parties").insertOne(docParty as any);
      importedCount++;

      const srcPayables = await db.collection("party_payables").find({ owner_id: sourceOwnerId, party_id: oldPartyId }).toArray();
      for (const pb of srcPayables) {
        const { _id: pbId, ...pbRest } = pb;
        await db.collection("party_payables").insertOne({
          ...pbRest,
          _id: crypto.randomUUID(),
          owner_id: destOwnerId,
          party_id: newPartyId,
          created_at: new Date().toISOString()
        } as any);
      }

      const srcPayments = await db.collection("payments").find({ owner_id: sourceOwnerId, party_id: oldPartyId }).toArray();
      for (const pay of srcPayments) {
        const { _id: payId, ...payRest } = pay;
        await db.collection("payments").insertOne({
          ...payRest,
          _id: crypto.randomUUID(),
          owner_id: destOwnerId,
          party_id: newPartyId,
          created_at: new Date().toISOString()
        } as any);
      }

      const srcSettlements = await db.collection("party_payable_settlements").find({ owner_id: sourceOwnerId, party_id: oldPartyId }).toArray();
      for (const st of srcSettlements) {
        const { _id: stId, ...stRest } = st;
        await db.collection("party_payable_settlements").insertOne({
          ...stRest,
          _id: crypto.randomUUID(),
          owner_id: destOwnerId,
          party_id: newPartyId,
          created_at: new Date().toISOString()
        } as any);
      }
    }
  }

  return { success: true, importedCount };
}

export async function getCustomersFn() {
  const session = await requireSession();
  const db = await getDb();
  
  const [customerDocs, partyDocs, saleDocs] = await Promise.all([
    db.collection("customers").find({ owner_id: session.ownerId }).toArray(),
    db.collection("parties").find({ owner_id: session.ownerId }).toArray(),
    db.collection("sales").find({ owner_id: session.ownerId }).project({ customer_name: 1, customer_phone: 1, party_id: 1, party_name: 1, party_phone: 1, created_at: 1 }).toArray(),
  ]);

  const map = new Map<string, any>();

  // 1. Add all from customers collection
  for (const c of customerDocs) {
    const id = c._id.toString();
    const phone = (c.phone || "").trim();
    const key = phone ? phone.replace(/[^0-9]/g, "") : `id_${id}`;
    map.set(key, { ...c, id });
  }

  // 2. Add all customer parties from parties collection
  for (const p of partyDocs) {
    if (p.type === "supplier") continue;
    const id = p._id.toString();
    const phone = (p.phone || "").trim();
    const key = phone ? phone.replace(/[^0-9]/g, "") : `id_${id}`;
    if (!map.has(key)) {
      map.set(key, {
        _id: p._id,
        id,
        owner_id: p.owner_id,
        name: p.name,
        phone: p.phone || null,
        address: p.address || null,
        created_at: p.created_at || new Date().toISOString(),
      });
    }
  }

  // 3. Add all buyers from historical sales
  for (const s of saleDocs) {
    const phone = (s.customer_phone || s.party_phone || "").trim();
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length >= 10 && !map.has(cleanPhone)) {
      const name = (s.customer_name || s.party_name || "Customer").trim();
      const fakeId = s.party_id || crypto.randomUUID();
      map.set(cleanPhone, {
        _id: fakeId,
        id: fakeId,
        owner_id: session.ownerId,
        name,
        phone,
        address: null,
        created_at: s.created_at || new Date().toISOString(),
      });
    }
  }

  const result = Array.from(map.values());
  result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return result;
}

export async function getCustomerFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const doc = await db.collection("customers").findOne({ _id: data.id as any, owner_id: session.ownerId });
  if (!doc) return null;
  return { ...doc, id: doc._id as any as string };
}

export async function createCustomerFn(input: { data: { name: string; phone?: string | null; address?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = {
    _id: id as any,
    owner_id: session.ownerId,
    name: data.name,
    phone: data.phone || null,
    address: data.address || null,
    archived: false,
    created_at: new Date().toISOString(),
  };
  await db.collection("customers").insertOne(doc as any);
  return { success: true, id };
}

export async function updateCustomerFn(input: { data: { id: string; name: string; phone?: string | null; address?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const updates = {
    name: data.name,
    phone: data.phone || null,
    address: data.address || null,
  };
  await db.collection("customers").updateOne({ _id: data.id as any, owner_id: session.ownerId }, { $set: updates });
  const updated = await db.collection("customers").findOne({ _id: data.id as any });
  return { success: true, customer: updated ? { ...updated, id: updated._id as any as string } : null };
}

export async function repairCashboxDbFn() {
  const session = await requireSession();
  if (session.role !== "owner" && session.role !== "superadmin") {
    throw new Error("Only owners or superadmins can repair the cashbox.");
  }
  const db = await getDb();

  const sales = await db.collection("sales").find({ owner_id: session.ownerId }).toArray();
  const returns = await db.collection("returns").find({ owner_id: session.ownerId }).toArray();
  const expenses = await db.collection("expenses").find({ owner_id: session.ownerId }).toArray();
  const purchases = await db.collection("purchases").find({ owner_id: session.ownerId }).toArray();
  const somitiEntries = await db.collection("somiti_entries").find({ owner_id: session.ownerId }).toArray();
  const ownerWithdrawals = await db.collection("owner_withdrawals").find({ owner_id: session.ownerId }).toArray();
  const payments = await db.collection("payments").find({ owner_id: session.ownerId }).toArray();
  const payableSettlements = await db.collection("party_payable_settlements").find({ owner_id: session.ownerId }).toArray();
  const cashboxEntries = await db.collection("cashbox_entries").find({ owner_id: session.ownerId }).toArray();

  let repairedCount = 0;

  // 1. Repair Sales
  for (const sale of sales) {
    const saleId = sale._id.toString();
    const expectedAmount = saleCashboxAmount(sale as any);
    const match = cashboxEntries.find(e => e.ref_id === saleId);
    if (expectedAmount > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "sale",
          amount: expectedAmount,
          note: `Sale: ${sale.product_name}`,
          ref_id: saleId,
          created_at: sale.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "sale" || Number(match.amount) !== expectedAmount || match.created_at !== sale.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "sale", amount: expectedAmount, created_at: sale.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 2. Repair Returns
  for (const ret of returns) {
    const retId = ret._id.toString();
    let expectedAmount = 0;
    if (ret.sale_id) {
      const sale = sales.find(s => s._id.toString() === ret.sale_id.toString());
      if (sale) {
        const saleType: string = (sale.type as string) || "cash";
        const returnQty = Number(ret.qty) || 0;
        if (saleType === "cash") {
          expectedAmount = Number(sale.sell_price) * returnQty;
        } else if (saleType === "credit") {
          const paidPerUnit = Number(sale.qty) > 0 ? Number(sale.paid_amount) / Number(sale.qty) : 0;
          expectedAmount = paidPerUnit * returnQty;
        }
      }
    } else if (ret.return_price) {
      expectedAmount = Number(ret.qty) * (Number(ret.return_price) || 0);
    } else if (ret.amount && ret.deduct_type === "cash") {
      expectedAmount = Number(ret.amount) || 0;
    }

    const match = cashboxEntries.find(e => e.ref_id === retId);
    if (expectedAmount > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "withdraw",
          amount: expectedAmount,
          note: ret.note ? `Return refund: ${ret.note}` : `Return: ${ret.product_name || "Product"}`,
          ref_id: retId,
          created_at: ret.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "withdraw" || Number(match.amount) !== expectedAmount || match.created_at !== ret.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "withdraw", amount: expectedAmount, created_at: ret.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 3. Track Purchase Linked Expenses
  const purchaseLinkedExpenseIds = new Set<string>();
  for (const p of purchases) {
    const linkedExp = expenses.find(e => e.note && e.note.includes(`Purchase ID: ${p._id}`));
    if (linkedExp) {
      purchaseLinkedExpenseIds.add(linkedExp._id.toString());
    } else {
      const fallbackExp = expenses.find(e => 
        e.title === `Product Purchase: ${p.product_name}` && 
        Number(e.amount) === Number(p.total) && 
        !purchaseLinkedExpenseIds.has(e._id.toString())
      );
      if (fallbackExp) {
        purchaseLinkedExpenseIds.add(fallbackExp._id.toString());
      }
    }
  }

  // 4. Standalone Expenses
  for (const exp of expenses) {
    const expId = exp._id.toString();
    if (purchaseLinkedExpenseIds.has(expId)) continue;

    const match = cashboxEntries.find(e => e.ref_id === expId);
    const expAmt = Number(exp.amount) || 0;
    if (expAmt > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "expense",
          amount: expAmt,
          note: exp.title,
          ref_id: expId,
          created_at: exp.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "expense" || Number(match.amount) !== expAmt || match.created_at !== exp.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "expense", amount: expAmt, created_at: exp.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 5. Purchases
  for (const p of purchases) {
    const pId = p._id.toString();
    const linkedExp = expenses.find(e => e.note && e.note.includes(`Purchase ID: ${p._id}`));
    const fallbackExp = expenses.find(e => 
      e.title === `Product Purchase: ${p.product_name}` && 
      Number(e.amount) === Number(p.total)
    );
    const expId = linkedExp ? linkedExp._id.toString() : (fallbackExp ? fallbackExp._id.toString() : null);

    const match = cashboxEntries.find(e => e.ref_id === pId || (expId && e.ref_id === expId));
    const pTotal = Number(p.total) || 0;
    if (pTotal > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "expense",
          amount: pTotal,
          note: `Product Purchase: ${p.product_name}`,
          ref_id: pId,
          created_at: p.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "expense" || Number(match.amount) !== pTotal || match.created_at !== p.created_at || match.ref_id !== pId) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "expense", amount: pTotal, ref_id: pId, created_at: p.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 6. Somiti Entries
  for (const som of somitiEntries) {
    const somId = som._id.toString();
    const match = cashboxEntries.find(e => e.ref_id === somId);
    const somAmt = Number(som.amount) || 0;
    if (somAmt > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "withdraw",
          amount: somAmt,
          note: som.note || "Samity payment",
          ref_id: somId,
          created_at: som.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "withdraw" || Number(match.amount) !== somAmt || match.created_at !== som.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "withdraw", amount: somAmt, created_at: som.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 7. Withdrawals
  for (const w of ownerWithdrawals) {
    const wId = w._id.toString();
    const match = cashboxEntries.find(e => e.ref_id === wId);
    const wAmt = Number(w.amount) || 0;
    if (wAmt > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "withdraw",
          amount: wAmt,
          note: w.note || "Owner Withdrawal",
          ref_id: wId,
          created_at: w.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "withdraw" || Number(match.amount) !== wAmt || match.created_at !== w.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "withdraw", amount: wAmt, created_at: w.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 8. Payments
  for (const pay of payments) {
    const payId = pay._id.toString();
    const match = cashboxEntries.find(e => e.ref_id === payId);
    const payAmt = Number(pay.amount) || 0;
    if (payAmt > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "deposit",
          amount: payAmt,
          note: pay.note || "Collected dues",
          ref_id: payId,
          created_at: pay.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "deposit" || Number(match.amount) !== payAmt || match.created_at !== pay.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "deposit", amount: payAmt, created_at: pay.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 9. Payable Settlements
  for (const set of payableSettlements) {
    const setId = set._id.toString();
    const match = cashboxEntries.find(e => e.ref_id === setId);
    const setAmt = Number(set.amount) || 0;
    if (setAmt > 0) {
      if (!match) {
        await insertCashboxEntry(db, session.ownerId, {
          kind: "withdraw",
          amount: setAmt,
          note: set.note || "Paid to Supplier",
          ref_id: setId,
          created_at: set.created_at,
        }, true);
        repairedCount++;
      } else if (match.kind !== "withdraw" || Number(match.amount) !== setAmt || match.created_at !== set.created_at) {
        await db.collection("cashbox_entries").updateOne(
          { _id: match._id },
          { $set: { kind: "withdraw", amount: setAmt, created_at: set.created_at } }
        );
        repairedCount++;
      }
    } else if (match) {
      await db.collection("cashbox_entries").deleteOne({ _id: match._id });
      repairedCount++;
    }
  }

  // 10. Orphan Cleanup
  const validRefIds = new Set<string>();
  sales.filter(s => saleCashboxAmount(s as any) > 0).forEach(s => validRefIds.add(s._id.toString()));
  returns.forEach(r => validRefIds.add(r._id.toString()));
  expenses.filter(e => (Number(e.amount) || 0) > 0).forEach(e => validRefIds.add(e._id.toString()));
  purchases.filter(p => (Number(p.total) || 0) > 0).forEach(p => validRefIds.add(p._id.toString()));
  somitiEntries.filter(s => (Number(s.amount) || 0) > 0).forEach(s => validRefIds.add(s._id.toString()));
  ownerWithdrawals.filter(w => (Number(w.amount) || 0) > 0).forEach(w => validRefIds.add(w._id.toString()));
  payments.filter(p => (Number(p.amount) || 0) > 0).forEach(p => validRefIds.add(p._id.toString()));
  payableSettlements.filter(s => (Number(s.amount) || 0) > 0).forEach(s => validRefIds.add(s._id.toString()));

  const toDelete = cashboxEntries.filter(e => e.ref_id && !validRefIds.has(e.ref_id.toString()));
  if (toDelete.length > 0) {
    const toDeleteIds = toDelete.map(e => e._id);
    await db.collection("cashbox_entries").deleteMany({ _id: { $in: toDeleteIds } });
    repairedCount += toDelete.length;
  }

  return { success: true, repairedCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank Accounts & Loan Management Engine
// ─────────────────────────────────────────────────────────────────────────────
export async function getBankAccountsFn() {
  const session = await requireSession();
  const db = await getDb();
  const accounts = await db.collection("bank_accounts").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).toArray();
  return accounts.map(a => ({ ...a, id: a._id.toString() }));
}

export async function createBankAccountFn(input: { data: { bank_name: string; account_name: string; account_number: string; branch?: string | null; balance?: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    owner_id: session.ownerId,
    bank_name: data.bank_name,
    account_name: data.account_name,
    account_number: data.account_number,
    branch: data.branch || null,
    balance: Number(data.balance) || 0,
    note: data.note || null,
    created_at: new Date().toISOString(),
  };
  await db.collection("bank_accounts").insertOne(doc as any);
  return { ...doc, id };
}

export async function updateBankAccountFn(input: { data: { id: string; bank_name?: string; account_name?: string; account_number?: string; branch?: string | null; balance?: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const { id, ...updates } = data;
  await db.collection("bank_accounts").updateOne(
    { _id: id as any, owner_id: session.ownerId },
    { $set: updates }
  );
  const updated = await db.collection("bank_accounts").findOne({ _id: id as any });
  return { ...updated, id };
}

export async function deleteBankAccountFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("bank_accounts").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

export async function createBankTransactionFn(input: { data: { account_id: string; type: "deposit" | "withdraw"; amount: number; note?: string | null; sync_cashbox?: boolean } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const amount = Number(data.amount) || 0;
  const txId = crypto.randomUUID();

  const balanceDelta = data.type === "deposit" ? amount : -amount;
  await db.collection("bank_accounts").updateOne(
    { _id: data.account_id as any, owner_id: session.ownerId },
    { $inc: { balance: balanceDelta } }
  );

  const txDoc = {
    _id: txId,
    owner_id: session.ownerId,
    account_id: data.account_id,
    type: data.type,
    amount,
    note: data.note || null,
    created_at: new Date().toISOString(),
  };
  await db.collection("bank_transactions").insertOne(txDoc as any);

  if (data.sync_cashbox !== false) {
    const cashboxKind = data.type === "deposit" ? "withdraw" : "deposit";
    const noteText = data.type === "deposit" 
      ? `Bank Deposit: ${data.note || "Transfer to bank"}`
      : `Bank Withdrawal: ${data.note || "Cash from bank"}`;
    await insertCashboxEntry(db, session.ownerId, {
      kind: cashboxKind,
      amount,
      note: noteText,
      ref_id: txId,
    });
  }

  return { success: true, id: txId };
}

export async function getBankLoansFn() {
  const session = await requireSession();
  const db = await getDb();
  const loans = await db.collection("bank_loans").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).toArray();
  return loans.map(l => ({ ...l, id: l._id.toString() }));
}

export async function createBankLoanFn(input: { data: { bank_name: string; loan_title: string; principal_amount: number; total_repayable: number; total_installments: number; installment_amount: number; receive_to_cashbox?: boolean; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const loanId = crypto.randomUUID();

  const doc = {
    _id: loanId,
    owner_id: session.ownerId,
    bank_name: data.bank_name,
    loan_title: data.loan_title,
    principal_amount: Number(data.principal_amount) || 0,
    total_repayable: Number(data.total_repayable) || Number(data.principal_amount) || 0,
    total_installments: Number(data.total_installments) || 1,
    installment_amount: Number(data.installment_amount) || 0,
    paid_amount: 0,
    paid_installments: 0,
    status: "active",
    note: data.note || null,
    created_at: new Date().toISOString(),
  };

  await db.collection("bank_loans").insertOne(doc as any);

  if (data.receive_to_cashbox) {
    await insertCashboxEntry(db, session.ownerId, {
      kind: "deposit",
      amount: Number(data.principal_amount),
      note: `Bank Loan Disbursement: ${data.bank_name} (${data.loan_title})`,
      ref_id: loanId,
    });
  }

  return { ...doc, id: loanId };
}

export async function payBankLoanInstallmentFn(input: { data: { loan_id: string; amount: number; payment_method?: string; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const amount = Number(data.amount) || 0;
  const pmtId = crypto.randomUUID();

  const loan = await db.collection("bank_loans").findOne({ _id: data.loan_id as any, owner_id: session.ownerId });
  if (!loan) throw new Error("Loan not found");

  const newPaidAmount = (Number(loan.paid_amount) || 0) + amount;
  const newPaidInstallments = (Number(loan.paid_installments) || 0) + 1;
  const isFullyPaid = newPaidAmount >= Number(loan.total_repayable);

  await db.collection("bank_loans").updateOne(
    { _id: data.loan_id as any, owner_id: session.ownerId },
    {
      $set: {
        paid_amount: newPaidAmount,
        paid_installments: newPaidInstallments,
        status: isFullyPaid ? "completed" : "active",
      }
    }
  );

  const pmtDoc = {
    _id: pmtId,
    owner_id: session.ownerId,
    loan_id: data.loan_id,
    amount,
    payment_method: data.payment_method || "cashbox",
    note: data.note || null,
    created_at: new Date().toISOString(),
  };
  await db.collection("bank_loan_payments").insertOne(pmtDoc as any);

  // ALWAYS cut installment money from CASHBOX
  await insertCashboxEntry(db, session.ownerId, {
    kind: "withdraw",
    amount,
    note: `Bank Loan Installment: ${loan.bank_name} (${loan.loan_title}) - ${data.note || `Installment #${newPaidInstallments}`}`,
    ref_id: pmtId,
  });

  return { success: true, id: pmtId, isFullyPaid, remaining: Math.max(Number(loan.total_repayable) - newPaidAmount, 0) };
}

export async function deleteBankLoanFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("cashbox_entries").deleteMany({ owner_id: session.ownerId, ref_id: data.id });
  await db.collection("bank_loan_payments").deleteMany({ owner_id: session.ownerId, loan_id: data.id });
  await db.collection("bank_loans").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

// ─── SMS Gateway & Management (MiMSMS v2) ───────────────────────────────────

async function triggerAutoPurchaseSms(
  db: Awaited<ReturnType<typeof getDb>>,
  ownerId: string,
  sale: {
    id: string;
    product_name: string;
    qty: number;
    sell_price: number;
    paid_amount: number;
    due_amount: number;
    party_id?: string | null;
  }
) {
  try {
    if (!sale.party_id) return;
    const smsSettings = await db.collection("sms_settings").findOne({ owner_id: ownerId });
    const business = await db.collection("businesses").findOne({ owner_id: ownerId });
    
    const isAutoSmsEnabled = Boolean(smsSettings?.customer_sms_after_purchase ?? business?.customer_sms_after_purchase);
    if (!isAutoSmsEnabled) {
      return;
    }

    // Find customer details
    let party = await db.collection("customers").findOne({ _id: sale.party_id as any, owner_id: ownerId });
    if (!party) {
      party = await db.collection("parties").findOne({ _id: sale.party_id as any, owner_id: ownerId });
    }
    if (!party || !party.phone) return;

    const shopName = business?.name || "Dream Fashion";

    const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });
    const apiKey = (platform?.master_sms_api_key as string) || (smsSettings?.apiKey as string) || "";
    const userName = (platform?.master_sms_user_name as string) || (smsSettings?.userName as string) || "";
    const senderName = (platform?.master_sms_sender_name as string) || (smsSettings?.senderName as string) || "DreamFashion";

    const currentCredits = Number(business?.sms_credits ?? 0);
    if (currentCredits < 1) {
      console.warn("Skipping auto-purchase SMS: Insufficient SMS credits for business", business?._id);
      return;
    }

    const customerName = party.name || "Customer";
    const totalAmount = (Number(sale.sell_price) || 0) * (Number(sale.qty) || 1);
    const paidAmount = Number(sale.paid_amount) || 0;
    const dueAmount = Number(sale.due_amount) || 0;
    const invoiceId = sale.id.slice(0, 8).toUpperCase();

    const template =
      smsSettings?.purchase_sms_template ||
      business?.purchase_sms_template ||
      "Dear {customer_name}, thanks for shopping with {shop_name}! Items: {product_name} x{qty}, Total: Tk {total_amount}, Paid: Tk {paid_amount}, Due: Tk {due_amount}. Inv #{invoice_id}.";

    const message = template
      .replace(/{customer_name}/g, customerName)
      .replace(/{shop_name}/g, shopName)
      .replace(/{product_name}/g, sale.product_name || "Product")
      .replace(/{qty}/g, String(sale.qty || 1))
      .replace(/{total_amount}/g, String(totalAmount))
      .replace(/{paid_amount}/g, String(paidAmount))
      .replace(/{due_amount}/g, String(dueAmount))
      .replace(/{invoice_id}/g, invoiceId);

    let result: MiMSMSResponse = {
      statusCode: "400",
      status: "Failed",
      responseResult: "Master SMS Gateway credentials are not configured.",
      isSuccess: false,
    };

    if (apiKey && userName) {
      result = await sendSingleSms({
        apiKey,
        userName,
        senderName,
        mobileNumber: party.phone,
        message,
        transactionType: "T",
        campaignName: "auto-purchase",
      });
    }

    const isDelivered = Boolean(result.isSuccess && (result.status === "Success" || result.statusCode === "200"));

    if (isDelivered) {
      await db.collection("businesses").updateOne(
        { owner_id: ownerId },
        { $inc: { sms_credits: -1 } }
      );
    }

    const logId = crypto.randomUUID();
    await db.collection("sms_logs").insertOne({
      _id: logId as any,
      owner_id: ownerId,
      recipient_type: "auto_purchase",
      recipient_count: 1,
      credits_deducted: isDelivered ? 1 : 0,
      remaining_credits: isDelivered ? Math.max(0, currentCredits - 1) : currentCredits,
      recipients_summary: `${customerName} (${party.phone})`,
      message,
      trxn_ids: result.trxnId ? [result.trxnId] : [],
      status: isDelivered ? "Success" : "Failed",
      response_summary: result.responseResult || result.status,
      created_at: new Date().toISOString(),
    } as any);
  } catch (err) {
    console.error("Failed to execute auto purchase SMS:", err);
  }
}

// ─── Centrally Managed SMS Gateway & User SMS Actions ─────────────────────────

export async function getSmsSettingsFn() {
  const session = await requireSession();
  const db = await getDb();
  const settings = await db.collection("sms_settings").findOne({ owner_id: session.ownerId });
  const business = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });

  return {
    sms_credits: Number(business?.sms_credits ?? 0),
    admin_whatsapp: (platform?.admin_whatsapp as string) || "8801700000000",
    customer_sms_after_purchase: Boolean(settings?.customer_sms_after_purchase ?? business?.customer_sms_after_purchase),
    purchase_sms_template:
      (settings?.purchase_sms_template as string) ||
      (business?.purchase_sms_template as string) ||
      "Dear {customer_name}, thanks for shopping with {shop_name}! Items: {product_name} x{qty}, Total: Tk {total_amount}, Paid: Tk {paid_amount}, Due: Tk {due_amount}. Inv #{invoice_id}.",
    offer_sms_template:
      (settings?.offer_sms_template as string) ||
      (business?.offer_sms_template as string) ||
      "Special offer from {shop_name}! Visit our store or order online to get exciting discounts on latest collections.",
  };
}

export async function updateSmsSettingsFn(input: {
  data: {
    customer_sms_after_purchase?: boolean;
    purchase_sms_template?: string;
    offer_sms_template?: string;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  await db.collection("sms_settings").updateOne(
    { owner_id: session.ownerId },
    {
      $set: {
        owner_id: session.ownerId,
        customer_sms_after_purchase: Boolean(data.customer_sms_after_purchase),
        purchase_sms_template: data.purchase_sms_template,
        offer_sms_template: data.offer_sms_template,
        updated_at: new Date().toISOString(),
      },
    },
    { upsert: true }
  );

  await db.collection("businesses").updateOne(
    { owner_id: session.ownerId },
    {
      $set: {
        customer_sms_after_purchase: Boolean(data.customer_sms_after_purchase),
        purchase_sms_template: data.purchase_sms_template,
        offer_sms_template: data.offer_sms_template,
        updated_at: new Date().toISOString(),
      },
    }
  );

  return { success: true };
}

export async function checkSmsBalanceFn() {
  const session = await requireSession();
  const db = await getDb();
  const business = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });

  const credits = Number(business?.sms_credits ?? 0);

  return {
    status: "Success",
    statusCode: "200",
    balance: String(credits),
    admin_whatsapp: (platform?.admin_whatsapp as string) || "8801700000000",
  };
}

export async function sendSmsCampaignFn(input: {
  data: {
    recipientType: "all_suppliers" | "selected_suppliers" | "all_customers" | "selected_customers" | "direct_numbers";
    selectedIds?: string[];
    directNumbers?: string;
    message: string;
    transactionType?: "T" | "P";
    campaignTitle?: string;
    isPersonalized?: boolean;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const business = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  const shopName = business?.name || "Dream Fashion";
  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });
  const userSettings = await db.collection("sms_settings").findOne({ owner_id: session.ownerId });

  // Prioritize Master MiMSMS credentials configured by Superadmin
  const apiKey = (platform?.master_sms_api_key as string) || (userSettings?.apiKey as string) || "";
  const userName = (platform?.master_sms_user_name as string) || (userSettings?.userName as string) || "";
  const senderName = (platform?.master_sms_sender_name as string) || (userSettings?.senderName as string) || "DreamFashion";

  interface TargetRecipient {
    id?: string;
    name: string;
    phone: string;
  }

  let recipients: TargetRecipient[] = [];

  if (data.recipientType === "all_suppliers" || data.recipientType === "selected_suppliers") {
    const query: any = { owner_id: session.ownerId, phone: { $nin: [null, ""] } };
    if (data.recipientType === "selected_suppliers" && data.selectedIds && data.selectedIds.length > 0) {
      query._id = { $in: data.selectedIds as any };
    }
    const parties = await db.collection("parties").find(query).toArray();
    recipients = parties
      .filter((p) => p.phone && p.phone.trim())
      .map((p) => ({
        id: p._id as any as string,
        name: p.name || "Supplier",
        phone: p.phone as string,
      }));
  } else if (data.recipientType === "all_customers" || data.recipientType === "selected_customers") {
    const query: any = { owner_id: session.ownerId, phone: { $nin: [null, ""] } };
    if (data.recipientType === "selected_customers" && data.selectedIds && data.selectedIds.length > 0) {
      query._id = { $in: data.selectedIds as any };
    }
    const customers = await db.collection("customers").find(query).toArray();
    if (customers.length > 0) {
      recipients = customers
        .filter((c) => c.phone && c.phone.trim())
        .map((c) => ({
          id: c._id as any as string,
          name: c.name || "Customer",
          phone: c.phone as string,
        }));
    } else {
      const parties = await db.collection("parties").find(query).toArray();
      recipients = parties
        .filter((p) => p.phone && p.phone.trim())
        .map((p) => ({
          id: p._id as any as string,
          name: p.name || "Customer",
          phone: p.phone as string,
        }));
    }
  } else if (data.recipientType === "direct_numbers") {
    const rawNumbers = (data.directNumbers || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    recipients = rawNumbers.map((num, idx) => ({
      name: `Recipient ${idx + 1}`,
      phone: num,
    }));
  }

  if (recipients.length === 0) {
    throw new Error("No recipients with valid phone numbers were found for this campaign.");
  }

  // Calculate required SMS credits
  const { parts } = calculateSmsParts(data.message);
  const requiredCredits = Math.max(1, recipients.length * Math.max(1, parts));
  const currentCredits = Number(business?.sms_credits ?? 0);

  if (currentCredits < requiredCredits) {
    const adminWhatsapp = (platform?.admin_whatsapp as string) || "8801700000000";
    throw new Error(
      `আপনার একাউন্টে পর্যাপ্ত এসএমএস ব্যালেন্স নেই (প্রয়োজন: ${requiredCredits} টি, বর্তমান ব্যালেন্স: ${currentCredits} টি)। ব্যালেন্স রিচার্জ করতে অ্যাডমিনের সাথে হোয়াটসঅ্যাপে যোগাযোগ করুন (WhatsApp: ${adminWhatsapp})।`
    );
  }

  const transactionType = data.transactionType || "T";

  if (!apiKey || !userName) {
    throw new Error(
      "SMS Gateway is not configured. Please configure your MiMSMS API Key and Username in Master Gateway settings."
    );
  }

  let results: MiMSMSResponse[] = [];
  const trxnIds: string[] = [];

  if (data.isPersonalized) {
    const dynamicData = recipients.map((r) => {
      const personalMsg = data.message
        .replace(/{name}/g, r.name)
        .replace(/{customer_name}/g, r.name)
        .replace(/{supplier_name}/g, r.name)
        .replace(/{shop_name}/g, shopName);
      return {
        mobileNumber: r.phone,
        message: personalMsg,
      };
    });

    results = await sendDynamicSms({
      apiKey,
      userName,
      senderName,
      smsData: dynamicData,
      transactionType,
    });
  } else {
    const numbers = recipients.map((r) => r.phone);
    const finalMsg = data.message.replace(/{shop_name}/g, shopName);

    results = await sendBroadcastSms({
      apiKey,
      userName,
      senderName,
      numbers,
      message: finalMsg,
      transactionType,
      campaignId: data.campaignTitle || "campaign",
    });
  }

  let successCount = 0;
  let failCount = 0;
  let summary = "";

  for (const res of results) {
    if (res.isSuccess && (res.status === "Success" || res.status === "Scheduled" || res.statusCode === "200")) {
      successCount++;
      if (res.trxnId) trxnIds.push(res.trxnId);
    } else {
      failCount++;
    }
    if (res.responseResult) {
      summary = res.responseResult;
    }
  }

  const finalStatus = failCount === 0 ? "Success" : successCount > 0 ? "Partial" : "Failed";

  // Only deduct credits if SMS was actually accepted by MiMSMS
  let remainingCredits = currentCredits;
  if (finalStatus !== "Failed") {
    const actualDeducted = Math.min(requiredCredits, successCount * Math.max(1, parts));
    remainingCredits = Math.max(0, currentCredits - actualDeducted);
    await db.collection("businesses").updateOne(
      { owner_id: session.ownerId },
      { $set: { sms_credits: remainingCredits } }
    );
  }

  const logId = crypto.randomUUID();
  await db.collection("sms_logs").insertOne({
    _id: logId as any,
    owner_id: session.ownerId,
    recipient_type: data.recipientType,
    recipient_count: recipients.length,
    credits_deducted: finalStatus !== "Failed" ? requiredCredits : 0,
    remaining_credits: remainingCredits,
    recipients_summary:
      recipients.length <= 3
        ? recipients.map((r) => `${r.name} (${r.phone})`).join(", ")
        : `${recipients.slice(0, 2).map((r) => r.name).join(", ")} + ${recipients.length - 2} more`,
    message: data.message,
    transaction_type: transactionType,
    campaign_title: data.campaignTitle || null,
    trxn_ids: trxnIds,
    status: finalStatus,
    response_summary: summary || (finalStatus === "Success" ? "SMS Sent Successfully" : "Failed to deliver SMS"),
    created_at: new Date().toISOString(),
  } as any);

  if (finalStatus === "Failed") {
    throw new Error(summary || "MiMSMS rejected the request. Please check recipient number or gateway settings.");
  }

  return {
    success: true,
    status: finalStatus,
    recipientCount: recipients.length,
    creditsDeducted: requiredCredits,
    remainingCredits,
    trxnIds,
    summary,
    logId,
  };
}

export async function getSmsLogsFn() {
  const session = await requireSession();
  const db = await getDb();
  const logs = await db
    .collection("sms_logs")
    .find({ owner_id: session.ownerId })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  return logs.map((l) => ({ ...l, id: l._id as any as string }));
}

export async function checkSmsDeliveryStatusFn(input: { data: { trackingId: string; logId?: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const platform = await db.collection("platform_settings").findOne({ _id: "global" as any });
  const settings = await db.collection("sms_settings").findOne({ owner_id: session.ownerId });
  const apiKey = (platform?.master_sms_api_key as string) || (settings?.apiKey as string) || "";
  const userName = (platform?.master_sms_user_name as string) || (settings?.userName as string) || "";

  if (!apiKey || !userName) {
    throw new Error("Missing API credentials in Master SMS Gateway");
  }
  const result = await lookupDlrStatus({
    apiKey,
    userName,
    trackingId: data.trackingId,
  });

  if (data.logId && result.deliveryStatus) {
    await db.collection("sms_logs").updateOne(
      { _id: data.logId as any, owner_id: session.ownerId },
      { $set: { delivery_status: result.deliveryStatus } }
    );
  }

  return result;
}

export async function deleteSmsLogFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  await db.collection("sms_logs").deleteOne({ _id: data.id as any, owner_id: session.ownerId });
  return { success: true };
}

// ─── Active Admin Popups & Announcements ────────────────────────────────────

export async function getActiveAdminPopupsFn() {
  const session = await requireSession();
  const db = await getDb();

  const now = new Date().toISOString();
  const query: any = {
    active: true,
    $or: [
      { target_type: "all" },
      { target_type: "business", target_id: session.businessId },
      { target_type: "user", target_id: session.userId },
      { target_id: session.ownerId },
    ],
  };

  const popups = await db.collection("admin_popups").find(query).sort({ created_at: -1 }).limit(10).toArray();

  return popups
    .filter(p => !p.expires_at || p.expires_at > now)
    .map(p => ({ ...p, id: p._id as any as string }));
}

export async function dismissAdminPopupFn(input: { data: { popupId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  await db.collection("popup_dismissals").insertOne({
    _id: crypto.randomUUID() as any,
    popup_id: data.popupId,
    user_id: session.userId,
    owner_id: session.ownerId,
    dismissed_at: new Date().toISOString(),
  });

  return { success: true };
}

// ─── Shop-Level Employee Management ──────────────────────────────────────────

export async function listShopEmployeesFn() {
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Employees cannot manage employee accounts");
  }
  const db = await getDb();
  const employees = await db
    .collection("users")
    .find({ owner_id: session.ownerId, role: "employee" })
    .sort({ created_at: -1 })
    .toArray();

  return employees.map((emp) => ({
    id: emp._id as any as string,
    full_name: (emp.full_name as string) || "",
    username: (emp.username as string) || "",
    phone: (emp.phone as string) || "",
    email: (emp.email as string) || "",
    designation: (emp.designation as string) || "Sales Staff",
    permissions: (emp.permissions as PermissionSet) || DEFAULT_EMPLOYEE_PERMISSIONS,
    is_active: emp.is_active !== false,
    created_at: (emp.created_at as string) || "",
    last_login_at: (emp.last_login_at as string) || "",
  }));
}

export async function createShopEmployeeFn(input: {
  data: {
    fullName: string;
    username: string;
    phone?: string;
    email?: string;
    password: string;
    designation?: string;
    permissions?: PermissionSet;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Only shop owners can create employee accounts");
  }
  const db = await getDb();

  const fullName = (data.fullName || "").trim();
  const username = (data.username || "").trim().toLowerCase().replace(/\s+/g, "");
  const phone = (data.phone || data.username || "").trim();
  const password = (data.password || "").trim();
  const designation = (data.designation || "").trim() || "Sales Staff";

  if (!fullName) {
    throw new Error("Employee full name is required");
  }
  if (!username || username.length < 3) {
    throw new Error("Username/phone must be at least 3 characters");
  }
  if (!password || password.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }

  // Check unique username or phone within this shop (or globally)
  const existing = await db.collection("users").findOne({
    $or: [
      { username: username },
      { email: `${username}@employee.local` },
      ...(data.email ? [{ email: data.email.trim().toLowerCase() }] : []),
    ],
  });

  if (existing) {
    throw new Error(`An account with username '${username}' already exists. Please choose a different username.`);
  }

  const passwordHash = await hashPassword(password);
  const employeeId = crypto.randomUUID();

  const ownerUser = await db.collection("users").findOne({ _id: session.userId as any });
  const biz = await db.collection("businesses").findOne({ owner_id: session.ownerId });

  const employeeDoc = {
    _id: employeeId as any,
    owner_id: session.ownerId,
    business_id: (biz?._id as any as string) || session.businessId,
    business_name: biz?.name || ownerUser?.business_name || "Dream Fashion",
    role: "employee",
    full_name: fullName,
    username: username,
    phone: phone,
    email: data.email?.trim().toLowerCase() || `${username}@employee.local`,
    designation: designation,
    password_hash: passwordHash,
    password: passwordHash,
    permissions: data.permissions || DEFAULT_EMPLOYEE_PERMISSIONS,
    is_active: true,
    activated: true,
    status: "active",
    created_at: new Date().toISOString(),
  };

  await db.collection("users").insertOne(employeeDoc as any);

  return {
    success: true,
    employee: {
      id: employeeId,
      full_name: fullName,
      username: username,
      phone: phone,
      email: employeeDoc.email,
      designation: designation,
      permissions: employeeDoc.permissions,
      is_active: true,
      created_at: employeeDoc.created_at,
    },
  };
}

export async function updateShopEmployeeFn(input: {
  data: {
    employeeId: string;
    fullName?: string;
    phone?: string;
    designation?: string;
    password?: string;
    permissions?: PermissionSet;
    isActive?: boolean;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Only shop owners can update employee accounts");
  }
  const db = await getDb();

  const employee = await db.collection("users").findOne({
    _id: data.employeeId as any,
    owner_id: session.ownerId,
    role: "employee",
  });

  if (!employee) {
    throw new Error("Employee not found in your business");
  }

  const updateFields: any = {
    updated_at: new Date().toISOString(),
  };

  if (data.fullName !== undefined) updateFields.full_name = data.fullName.trim();
  if (data.phone !== undefined) updateFields.phone = data.phone.trim();
  if (data.designation !== undefined) updateFields.designation = data.designation.trim();
  if (data.permissions !== undefined) updateFields.permissions = data.permissions;
  if (data.isActive !== undefined) {
    updateFields.is_active = Boolean(data.isActive);
    updateFields.status = data.isActive ? "active" : "frozen";
  }

  if (data.password && data.password.trim().length >= 4) {
    const newHash = await hashPassword(data.password.trim());
    updateFields.password_hash = newHash;
    updateFields.password = newHash;
  }

  await db.collection("users").updateOne(
    { _id: data.employeeId as any },
    { $set: updateFields }
  );

  return { success: true };
}

export async function deleteShopEmployeeFn(input: { data: { employeeId: string } }) {
  const { data } = input;
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Only shop owners can delete employee accounts");
  }
  const db = await getDb();

  const res = await db.collection("users").deleteOne({
    _id: data.employeeId as any,
    owner_id: session.ownerId,
    role: "employee",
  });

  if (res.deletedCount === 0) {
    throw new Error("Employee not found or already removed");
  }

  return { success: true };
}

// ─── Employee Email Invitations & Joining System ──────────────────────────────

export async function inviteEmployeeByEmailFn(input: {
  data: {
    email: string;
    fullName?: string;
    designation?: string;
    permissions?: PermissionSet;
    phone?: string;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Only business owners can invite employees");
  }
  const db = await getDb();

  const cleanEmail = (data.email || "").trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Employee email or username is required");
  }

  const sessionEmail = (session.email || "").toLowerCase().trim();
  if (sessionEmail && cleanEmail === sessionEmail) {
    throw new Error("You cannot invite yourself as an employee");
  }

  const ownerUser = await db.collection("users").findOne({ _id: session.userId as any });
  const biz = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  const businessName = biz?.name || ownerUser?.business_name || "Dream Fashion";
  const businessId = (biz?._id as any as string) || session.businessId || session.ownerId;

  // Check if this email is already an active employee in this business
  const existingEmployee = await db.collection("users").findOne({
    $or: [
      { email: cleanEmail },
      { username: cleanEmail },
      ...(data.phone ? [{ phone: data.phone.trim() }] : [])
    ],
    business_id: businessId,
    role: "employee",
  });

  if (existingEmployee) {
    throw new Error(`User '${cleanEmail}' is already an employee of ${businessName}`);
  }

  // Cancel any existing pending invitation for this email and business
  await db.collection("employee_invitations").deleteMany({
    $or: [
      { employee_email: cleanEmail },
      ...(data.phone ? [{ phone: data.phone.trim() }] : [])
    ],
    business_id: businessId,
    status: "pending",
  });

  const invitationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const invitationDoc = {
    _id: invitationId as any,
    business_id: businessId,
    business_name: businessName,
    owner_id: session.ownerId,
    owner_name: ownerUser?.full_name || ownerUser?.username || "Shop Owner",
    owner_email: ownerUser?.email || session.email || "",
    employee_email: cleanEmail,
    employee_name: data.fullName?.trim() || "",
    phone: data.phone?.trim() || "",
    designation: data.designation?.trim() || "Sales Staff",
    permissions: data.permissions || DEFAULT_EMPLOYEE_PERMISSIONS,
    status: "pending",
    created_at: now,
    updated_at: now,
  };

  await db.collection("employee_invitations").insertOne(invitationDoc as any);

  // If user already exists in the system, link a pending notification
  const existingUser = await db.collection("users").findOne({
    $or: [
      { email: cleanEmail },
      { username: cleanEmail },
      ...(data.phone ? [{ phone: data.phone.trim() }] : [])
    ]
  });

  if (existingUser) {
    await db.collection("users").updateOne(
      { _id: existingUser._id },
      {
        $set: {
          has_pending_invitation: true,
          last_invitation_at: now,
        },
      }
    );
  }

  return {
    success: true,
    invitation: {
      id: invitationId,
      business_name: businessName,
      employee_email: cleanEmail,
      employee_name: invitationDoc.employee_name,
      designation: invitationDoc.designation,
      permissions: invitationDoc.permissions,
      status: "pending",
      created_at: now,
    },
  };
}

export const sendEmployeeInvitationFn = inviteEmployeeByEmailFn;

export async function listEmployeeInvitationsFn() {
  const session = await requireSession();
  const db = await getDb();

  const invites = await db
    .collection("employee_invitations")
    .find({ owner_id: session.ownerId })
    .sort({ created_at: -1 })
    .toArray();

  return invites.map((inv) => ({
    id: inv._id as any as string,
    business_id: (inv.business_id as string) || "",
    business_name: (inv.business_name as string) || "",
    employee_email: (inv.employee_email as string) || "",
    employee_name: (inv.employee_name as string) || "",
    designation: (inv.designation as string) || "Sales Staff",
    permissions: (inv.permissions as PermissionSet) || DEFAULT_EMPLOYEE_PERMISSIONS,
    status: (inv.status as "pending" | "accepted" | "rejected" | "cancelled") || "pending",
    created_at: (inv.created_at as string) || "",
    accepted_at: (inv.accepted_at as string) || "",
    rejected_at: (inv.rejected_at as string) || "",
  }));
}

export async function cancelEmployeeInvitationFn(input: { data: { invitationId: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();

  const res = await db.collection("employee_invitations").deleteOne({
    _id: data.invitationId as any,
    owner_id: session.ownerId,
  });

  if (res.deletedCount === 0) {
    throw new Error("Invitation not found or already removed");
  }

  return { success: true };
}

export async function getMyPendingEmployeeInvitationsFn() {
  const session = await requireSession().catch(() => null);
  if (!session) {
    return [];
  }
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: session.userId as any });
  const cleanEmail = (session.email || user?.email || user?.username || "").toLowerCase().trim();
  const cleanPhone = (user?.phone || "").trim();

  const orConditions: any[] = [];
  if (cleanEmail) {
    orConditions.push({ employee_email: cleanEmail });
  }
  if (cleanPhone) {
    orConditions.push({ phone: cleanPhone });
    orConditions.push({ employee_email: cleanPhone });
  }
  if (user?.username) {
    orConditions.push({ employee_email: user.username.toLowerCase().trim() });
  }

  if (orConditions.length === 0) return [];

  const pendingInvites = await db
    .collection("employee_invitations")
    .find({
      $or: orConditions,
      status: "pending",
    })
    .sort({ created_at: -1 })
    .toArray();

  return pendingInvites.map((inv) => ({
    id: inv._id as any as string,
    business_id: (inv.business_id as string) || "",
    business_name: (inv.business_name as string) || "",
    owner_name: (inv.owner_name as string) || "Shop Owner",
    owner_email: (inv.owner_email as string) || "",
    designation: (inv.designation as string) || "Sales Staff",
    permissions: (inv.permissions as PermissionSet) || DEFAULT_EMPLOYEE_PERMISSIONS,
    created_at: (inv.created_at as string) || "",
  }));
}

export async function respondToEmployeeInvitationFn(input: {
  data: {
    invitationId: string;
    action: "accept" | "reject";
  };
}) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: session.userId as any });
  const cleanEmail = (session.email || user?.email || user?.username || "").toLowerCase().trim();
  const cleanPhone = (user?.phone || "").trim();

  const orConditions: any[] = [];
  if (cleanEmail) orConditions.push({ employee_email: cleanEmail });
  if (cleanPhone) {
    orConditions.push({ phone: cleanPhone });
    orConditions.push({ employee_email: cleanPhone });
  }
  if (user?.username) orConditions.push({ employee_email: user.username.toLowerCase().trim() });

  const invitation = await db.collection("employee_invitations").findOne({
    _id: data.invitationId as any,
    status: "pending",
    ...(orConditions.length > 0 ? { $or: orConditions } : {}),
  });

  if (!invitation) {
    throw new Error("Invitation not found or has already been processed");
  }

  const now = new Date().toISOString();

  if (data.action === "accept") {
    // Mark invitation as accepted
    await db.collection("employee_invitations").updateOne(
      { _id: invitation._id },
      {
        $set: {
          status: "accepted",
          accepted_at: now,
          updated_at: now,
        },
      }
    );

    // Update the current user account to be employee of this business
    await db.collection("users").updateOne(
      { _id: session.userId as any },
      {
        $set: {
          role: "employee",
          business_id: invitation.business_id,
          owner_id: invitation.owner_id,
          business_name: invitation.business_name,
          designation: invitation.designation || "Sales Staff",
          permissions: invitation.permissions || DEFAULT_EMPLOYEE_PERMISSIONS,
          is_active: true,
          status: "active",
          has_pending_invitation: false,
          joined_company_at: now,
          updated_at: now,
        },
      }
    );

    const mappedUser = await mapUser(db, session.userId);

    return {
      success: true,
      action: "accepted",
      businessName: invitation.business_name,
      user: mappedUser,
    };
  } else {
    // Mark invitation as rejected
    await db.collection("employee_invitations").updateOne(
      { _id: invitation._id },
      {
        $set: {
          status: "rejected",
          rejected_at: now,
          updated_at: now,
        },
      }
    );

    await db.collection("users").updateOne(
      { _id: session.userId as any },
      {
        $set: {
          has_pending_invitation: false,
        },
      }
    );

    return {
      success: true,
      action: "rejected",
    };
  }
}

// ── WhatsApp Web Integration Server Actions ─────────────────────────

export async function getWhatsAppStatusFn() {
  const session = await requireSession();
  return await getWhatsAppStatus(session.ownerId);
}

export async function startWhatsAppSessionFn() {
  const session = await requireSession();
  return await startWhatsAppSession(session.ownerId);
}

export async function disconnectWhatsAppSessionFn() {
  const session = await requireSession();
  return await disconnectWhatsAppSession(session.ownerId);
}

export async function sendWhatsAppMessageFn(input: {
  data: {
    phone: string;
    message: string;
    recipientName?: string;
  };
}) {
  const session = await requireSession();
  const { data } = input;
  if (!data.phone || !data.message) {
    throw new Error("Recipient phone and message text are required");
  }

  const res = await sendWhatsAppMessage(
    session.ownerId,
    data.phone,
    data.message,
    {
      recipientName: data.recipientName,
      userId: session.userId,
    }
  );

  if (!res.isSuccess) {
    throw new Error(res.error || "Failed to send WhatsApp message");
  }

  return res;
}

export async function sendWhatsAppCampaignFn(input: {
  data: {
    recipientType: "all_suppliers" | "selected_suppliers" | "all_customers" | "selected_customers" | "direct_numbers";
    selectedIds?: string[];
    directNumbers?: string;
    message: string;
    campaignTitle?: string;
    isPersonalized?: boolean;
  };
}) {
  const session = await requireSession();
  const { data } = input;
  const db = await getDb();

  interface TargetRecipient {
    id?: string;
    name: string;
    phone: string;
  }

  let recipients: TargetRecipient[] = [];

  if (data.recipientType === "all_suppliers" || data.recipientType === "selected_suppliers") {
    const query: any = { owner_id: session.ownerId, phone: { $nin: [null, ""] } };
    if (data.recipientType === "selected_suppliers" && data.selectedIds && data.selectedIds.length > 0) {
      query._id = { $in: data.selectedIds as any };
    }
    const parties = await db.collection("parties").find(query).toArray();
    recipients = parties
      .filter((p) => p.phone && p.phone.trim())
      .map((p) => ({
        id: p._id as any as string,
        name: p.name || "Supplier",
        phone: p.phone as string,
      }));
  } else if (data.recipientType === "all_customers" || data.recipientType === "selected_customers") {
    const query: any = { owner_id: session.ownerId, phone: { $nin: [null, ""] } };
    if (data.recipientType === "selected_customers" && data.selectedIds && data.selectedIds.length > 0) {
      query._id = { $in: data.selectedIds as any };
    }
    const customers = await db.collection("customers").find(query).toArray();
    if (customers.length > 0) {
      recipients = customers
        .filter((c) => c.phone && c.phone.trim())
        .map((c) => ({
          id: c._id as any as string,
          name: c.name || "Customer",
          phone: c.phone as string,
        }));
    } else {
      const parties = await db.collection("parties").find(query).toArray();
      recipients = parties
        .filter((p) => p.phone && p.phone.trim())
        .map((p) => ({
          id: p._id as any as string,
          name: p.name || "Customer",
          phone: p.phone as string,
        }));
    }
  } else if (data.recipientType === "direct_numbers") {
    const rawNumbers = (data.directNumbers || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    recipients = rawNumbers.map((num, idx) => ({
      name: `Recipient ${idx + 1}`,
      phone: num,
    }));
  }

  if (recipients.length === 0) {
    throw new Error("No recipients with valid phone numbers were found for this WhatsApp campaign.");
  }

  return await sendWhatsAppCampaign(
    session.ownerId,
    recipients,
    data.message,
    session.userId
  );
}

// ── Google Sheets OAuth Integration Server Actions ─────────────────────────

export async function connectGoogleSheetsOAuthFn(input: {
  data: {
    accessToken: string;
    googleEmail?: string;
    spreadsheetId?: string;
  };
}) {
  const { data } = input;
  const session = await requireSession();
  if (session.role === "employee") {
    throw new Error("Access denied: Only owners can configure Google Sheets integration");
  }
  const db = await getDb();
  const biz = await db.collection("businesses").findOne({ owner_id: session.ownerId });
  if (!biz) throw new Error("Business not found");

  let spreadsheetId = data.spreadsheetId?.trim() || (biz.google_sheets_spreadsheet_id as string | undefined);

  // If no spreadsheet ID exists, auto-create one via Google Sheets API
  if (!spreadsheetId) {
    const shopName = biz.name || "HakimQzz Shop";
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: `HakimQzz - ${shopName} Live Database`,
        },
        sheets: [
          { properties: { title: "Products" } },
          { properties: { title: "Sales" } },
          { properties: { title: "Purchases" } },
          { properties: { title: "Expenses" } },
          { properties: { title: "Cashbox" } },
        ],
      }),
    });

    if (createRes.ok) {
      const createdData = await createRes.json();
      spreadsheetId = createdData.spreadsheetId;
    } else {
      const errText = await createRes.text();
      console.warn("Could not auto-create spreadsheet via Google Sheets API:", errText);
    }
  }

  const updateFields: Record<string, any> = {
    google_sheets_access_token: data.accessToken,
    google_sheets_connected_email: data.googleEmail || null,
    google_sheets_sync_enabled: true,
    updated_at: new Date().toISOString(),
  };

  if (spreadsheetId) {
    updateFields.google_sheets_spreadsheet_id = spreadsheetId;
  }

  await db.collection("businesses").updateOne(
    { _id: biz._id as any },
    { $set: updateFields }
  );

  // Automatically trigger bulk export if spreadsheetId is ready
  if (spreadsheetId) {
    try {
      await bulkExportToGoogleSheets(session.ownerId);
    } catch (e) {
      console.warn("Initial bulk export notice:", e);
    }
  }

  return {
    success: true,
    spreadsheetId,
    spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null,
  };
}

export async function disconnectGoogleSheetsFn() {
  const session = await requireSession();
  const db = await getDb();
  await db.collection("businesses").updateOne(
    { owner_id: session.ownerId },
    {
      $unset: {
        google_sheets_access_token: "",
        google_sheets_connected_email: "",
      },
      $set: {
        google_sheets_sync_enabled: false,
        updated_at: new Date().toISOString(),
      },
    }
  );
  return { success: true };
}

