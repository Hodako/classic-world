// Server action wrapper replaced by API proxy.

import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { hashPassword, comparePassword, signToken, verifyToken } from "@/lib/auth-helpers";
import { requireSession } from "@/lib/session";
import { requestStore } from "@/lib/request-store";
import type { PermissionSet } from "@/lib/permissions";
import { DEFAULT_EMPLOYEE_PERMISSIONS, OWNER_PERMISSIONS } from "@/lib/permissions";
import { appendRowToGoogleSheet, bulkExportToGoogleSheets } from "@/lib/google-sheets";

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
  if (data.type === "cash") return Number(data.paid_amount) || (Number(data.sell_price) * (Number(data.qty) || 1));
  // Online sales: admin does not receive money immediately, so not added to cashbox
  return 0;
}

async function mapUser(db: Awaited<ReturnType<typeof getDb>>, userId: string) {
  const user = await db.collection("users").findOne({ _id: userId as any });
  if (!user) return null;
  const business = user.business_id
    ? await db.collection("businesses").findOne({ _id: user.business_id as any })
    : null;
  const cookieStore = await cookies();
  const store = requestStore.getStore();
  const activeProfile = store?.activeProfile || cookieStore.get("active_profile")?.value || "default";
  
  const ownerId = user.role === "employee" ? (user.owner_id as string) : (user._id as any as string);
  const ownerUser = ownerId === (user._id as any as string) ? user : await db.collection("users").findOne({ _id: ownerId as any });
  const profiles = ownerUser?.profiles || [
    { id: "default", name: "Default Profile", created_at: new Date().toISOString() }
  ];

  return {
    id: user._id as any as string,
    email: user.email as string,
    full_name: (user.full_name as string) || "",
    activated: user.activated === false ? false : Boolean(user.activated ?? true),
    role: (user.role as string) || "owner",
    business_id: (user.business_id as string) || null,
    business_name: (business?.name as string) || "Classic World",
    business_address: (business?.address as string) || "",
    business_phone_numbers: (business?.phone_numbers as string) || (business?.phone as string) || "",
    business_emails: (business?.emails as string) || (business?.email as string) || "",
    invoice_page_size: (business?.invoice_page_size as string) || "80mm",
    invoice_page_width: (business?.invoice_page_width as string) || "",
    invoice_page_height: (business?.invoice_page_height as string) || "",
    logo_url: (business?.logo_url as string) || "/logo.svg",
    avatar_url: (user.avatar_url as string) || "",
    permissions: (user.role === "owner" ? OWNER_PERMISSIONS : (user.permissions as PermissionSet)) || DEFAULT_EMPLOYEE_PERMISSIONS,
    profiles,
    activeProfile,
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

export async function loginFn(input: { data: { email: string; password: string } }) {
  const { data } = input;
  const db = await getDb();
  const cleanEmail = (data.email || "").trim().toLowerCase();
  const user = await db.collection("users").findOne({ email: cleanEmail });
  if (!user || !(await comparePassword(data.password, user.password as string, user.plain_password as string))) {
    const err = new Error("Invalid email or password");
    (err as any).statusCode = 401;
    throw err;
  }
  const token = await signToken({ userId: user._id as any as string, email: user.email as string });
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

export async function registerFn(input: { data: { email: string; password: string; fullName?: string } }) {
  const { data } = input;
  validateEmail(data.email);
  const db = await getDb();
  const existing = await db.collection("users").findOne({ email: data.email.toLowerCase().trim() });
  if (existing) throw new Error("User already exists");
  const userId = crypto.randomUUID();
  await db.collection("users").insertOne({
    _id: userId as any,
    email: data.email.toLowerCase().trim(),
    password: await hashPassword(data.password),
    plain_password: data.password,
    full_name: sanitizeInput(data.fullName || ""),
    role: "owner",
    activated: false,
    created_at: new Date().toISOString(),
  });
  const token = await signToken({ userId, email: data.email.toLowerCase().trim() });
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
  await db.collection("products").updateOne({ _id: id as any, owner_id: session.ownerId }, { $set: sanitizedUpdates });
  const updated = await db.collection("products").findOne({ _id: id as any });
  return { ...updated, id };
}

export async function deleteProductFn(input: { data: { id: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
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
  const items = await db.collection("sales").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(200).toArray();

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

export async function createSaleFn(input: { data: { product_id?: string | null; product_name: string; qty: number; buy_price: number; sell_price: number; profit: number; type: string; party_id?: string | null; paid_amount: number; due_amount: number; note?: string | null; cart_id?: string | null; created_at?: string } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, party_id: data.party_id || null, created_at: data.created_at || new Date().toISOString() };
  await db.collection("sales").insertOne(doc as any);
  if (data.product_id) {
    const product = await db.collection("products").findOne({ _id: data.product_id as any });
    if (product) await db.collection("products").updateOne({ _id: data.product_id as any }, { $set: { stock: Math.max(((product.stock as number) ?? 0) - data.qty, 0) } });
  }
  const cashAmt = saleCashboxAmount(data);
  if (cashAmt > 0) {
    await insertCashboxEntry(db, session.ownerId, {
      kind: "sale",
      amount: cashAmt,
      note: `Sale: ${data.product_name}`,
      ref_id: id,
      created_at: doc.created_at,
    });
  }

  // Sheets Sync
  appendRowToGoogleSheet(session.ownerId, "Sales",
    ["ID", "Product Name", "Qty", "Buy Price", "Sell Price", "Profit", "Type", "Party ID", "Paid Amount", "Due Amount", "Created At"],
    [id, data.product_name, data.qty, data.buy_price, data.sell_price, data.profit, data.type, data.party_id || "", data.paid_amount, data.due_amount, doc.created_at]
  );

  return { ...doc, id };
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
  const items = await db.collection("returns").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(200).toArray();
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

// ─── Purchases ───────────────────────────────────────────────────────────────

export async function getPurchasesFn() {
  const session = await requireSession();
  const db = await getDb();
  const items = await db.collection("purchases").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(200).toArray();
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
  const items = await db.collection("expenses").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(200).toArray();
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
  
  // Calculate total cashbox delta impact of deleting this payment (which is a deposit)
  const relatedEntries = await db.collection("cashbox_entries").find({ owner_id: session.ownerId, ref_id: data.id } as any).toArray();
  const relatedIds = relatedEntries.map(e => e._id.toString());
  let paymentDeltaEffect = 0;
  for (const entry of relatedEntries) {
    const isPos = entry.kind === "sale" || entry.kind === "deposit";
    const val = isPos ? Number(entry.amount) : -Number(entry.amount);
    paymentDeltaEffect += val;
  }
  // Deleting it means the balance changes by -paymentDeltaEffect
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
  const items = await db.collection("somiti_entries").find({ owner_id: session.ownerId }).sort({ created_at: -1 }).limit(200).toArray();
  return items.map((s) => ({ ...s, id: s._id as any as string }));
}

export async function createSomitiFn(input: { data: { kind: string; amount: number; note?: string | null } }) {
  const { data } = input;
  const session = await requireSession();
  const db = await getDb();
  const id = crypto.randomUUID();
  const doc = { _id: id, owner_id: session.ownerId, ...data, created_at: new Date().toISOString() };
  await db.collection("somiti_entries").insertOne(doc as any);

  // Sync to cashbox — ALL somiti entries take money out of the business cashbox
  // (samity contributions always leave the business, regardless of deposit/withdraw kind)
  await insertCashboxEntry(db, session.ownerId, {
    kind: "withdraw",
    amount: Number(data.amount),
    note: data.note || "Samity payment",
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

  // Keep cashbox entry in sync — always withdraw since samity always takes money out
  await db.collection("cashbox_entries").updateOne(
    { owner_id: session.ownerId, ref_id: id },
    { $set: {
        kind: "withdraw",
        amount: Number(data.amount),
        note: data.note || "Samity payment",
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

export async function uploadImageFn(input: { data: { base64: string; fileName?: string } }) {
  const { data } = input;
  await requireSession();
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error("IMGBB_API_KEY is not configured");
  const form = new FormData();
  form.append("image", data.base64);
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
  
  // Automatically migrate existing parties to customers if customers collection is empty
  const count = await db.collection("customers").countDocuments({ owner_id: session.ownerId });
  if (count === 0) {
    const allParties = await db.collection("parties").find({ owner_id: session.ownerId }).toArray();
    if (allParties.length > 0) {
      await db.collection("customers").insertMany(allParties.map(p => ({
        ...p,
        _id: p._id,
      })) as any[]);
    }
  }

  const items = await db.collection("customers").find({ owner_id: session.ownerId }).sort({ name: 1 }).toArray();
  return items.map((c) => ({ ...c, id: c._id as any as string }));
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
