import {
  collection,
  doc,
  getDocs as fbGetDocs,
  getDoc,
  setDoc as fbSetDoc,
  addDoc as fbAddDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  increment,
  Timestamp,
  limit,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { clearAuthProfile } from "./local-cache";
import { clearQueryCache } from "./query-cache";
import * as jose from "jose";

// ── Multi-Tenant & Multi-Profile Isolation Layer ──────────────────────────────
const TENANT_COLLECTIONS = new Set([
  "products",
  "sales",
  "purchases",
  "expenses",
  "cashbox_logs",
  "cashbox_entries",
  "withdrawals",
  "owner_wallet",
  "somiti",
  "somiti_entries",
  "parties",
  "customers",
  "payments",
  "party_receivables",
  "party_payables",
  "payable_settlements",
  "party_payable_settlements",
  "returns",
  "reminders",
  "bank_accounts",
  "bank_transactions",
  "bank_loans",
  "bank_loan_payments",
  "employee_invitations",
  "employees",
  "employee_salaries",
  "employee_expenses",
  "employee_shoppings",
  "sms_logs",
  "recycle_bin",
  "categories",
  "brands",
  "labels",
  "label_designs",
  "invoice_designs",
  "invoice_settings",
  "assets",
]);

export function getTenantScope() {
  const user = fsGetCurrentUser();
  if (!user) {
    return {
      user: null as any,
      rootOwnerId: null as string | null,
      activeProfile: "default",
      isIsolatedTenant: true,
      effectiveOwnerId: null as string | null,
    };
  }
  const activeProfile =
    (typeof window !== "undefined" ? localStorage.getItem("active_profile") : null) ||
    user.activeProfile ||
    "default";
  const rawOwner = String(user.owner_id || user.owner_uid || user.id || "");
  const rootOwnerId = rawOwner ? rawOwner.split(":")[0] : user.id;

  const isLegacyRoot =
    Boolean(user.email && user.email.toLowerCase() === "classicworld@gmail.com") ||
    user.id === "classic-world-default" ||
    user.is_legacy_root === true;

  // EVERY business account is strictly isolated! Only legacy classicworld@gmail.com has legacy data.
  const isIsolatedTenant = !isLegacyRoot;

  const effectiveOwnerId =
    activeProfile !== "default"
      ? `${rootOwnerId}:${activeProfile}`
      : rootOwnerId;

  return {
    user,
    rootOwnerId,
    activeProfile,
    isIsolatedTenant,
    effectiveOwnerId,
  };
}

export function getBusinessDocIdForScope(
  rootOwnerId?: string | null,
  activeProfile: string = "default",
  isIsolatedTenant: boolean = true,
  userBusinessId?: string | null
): string {
  const cleanRoot = (rootOwnerId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  if (activeProfile && activeProfile !== "default") {
    const cleanProf = activeProfile.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `biz_${cleanRoot}_${cleanProf}`;
  }
  if (isIsolatedTenant) {
    if (
      userBusinessId &&
      userBusinessId !== "classic-world-default" &&
      userBusinessId !== "classic-world-settings"
    ) {
      return userBusinessId;
    }
    return `biz_${cleanRoot}`;
  }
  return "classic-world-settings";
}

export function belongsToCurrentTenant(docData: any, _colName?: string): boolean {
  const scope = getTenantScope();
  // NEVER show private tenant data if not logged in or scope is missing!
  if (!scope.user || !scope.rootOwnerId) return false;

  const docOwner = docData?.owner_id || docData?.owner_uid || null;
  const docBusiness = docData?.business_id || null;
  const docProfile = docData?.profile_id || "default";

  // 1. Branch / secondary profile isolation (e.g. "Branch 2" or "prof_xxx"):
  if (scope.activeProfile !== "default") {
    return (
      docOwner === scope.effectiveOwnerId ||
      (docProfile === scope.activeProfile && (docOwner === scope.rootOwnerId || !docOwner))
    );
  }

  // 2. Default profile check
  if (docProfile !== "default") return false;

  // 3. Isolated Tenant Account (ANY standard business account):
  // Strictly show ONLY documents that belong to this business or this owner
  if (scope.isIsolatedTenant) {
    const isOwnerMatch =
      docOwner === scope.rootOwnerId ||
      docOwner === scope.effectiveOwnerId ||
      docOwner === scope.user.id;

    const isBusinessMatch = Boolean(
      scope.user.business_id &&
      scope.user.business_id !== "classic-world-default" &&
      docBusiness === scope.user.business_id
    );

    return isOwnerMatch || isBusinessMatch;
  }

  // 4. Legacy root admin account fallback (classicworld@gmail.com only)
  if (docData?.is_isolated_tenant === true && docOwner !== scope.rootOwnerId) return false;
  if (docBusiness && docBusiness.startsWith("biz_") && docBusiness !== scope.user.business_id) return false;
  if (
    docOwner &&
    docOwner !== scope.rootOwnerId &&
    docOwner !== scope.user.id &&
    docOwner !== "classic-world-default"
  ) {
    return false;
  }
  return true;
}

function withTenantScope<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const scope = getTenantScope();
  if (!scope.user || !scope.rootOwnerId) return data;
  const businessId =
    data.business_id ||
    scope.user.business_id ||
    (scope.isIsolatedTenant ? `biz_${scope.rootOwnerId}` : "classic-world-default");

  const enriched: Record<string, any> = {
    ...data,
    owner_id: data.owner_id || scope.effectiveOwnerId || scope.rootOwnerId,
    business_id: businessId,
    profile_id: data.profile_id || scope.activeProfile || "default",
    is_isolated_tenant: scope.isIsolatedTenant,
  };
  return enriched as T;
}

async function getDocs(
  q: any
): Promise<{ docs: any[]; empty: boolean; size: number; forEach: (cb: (doc: any) => void) => void }> {
  const snap = await fbGetDocs(q);
  const qSegments = q?._query?.path?.segments || q?._path?.segments || [];
  const colName =
    q?.id ||
    (qSegments.length > 0 ? qSegments[qSegments.length - 1] : null) ||
    snap.docs?.[0]?.ref?.parent?.id ||
    "";
  if (!colName || !TENANT_COLLECTIONS.has(colName)) {
    return snap as any;
  }
  const filteredDocs: any[] = snap.docs.filter((d: any) => belongsToCurrentTenant(d.data(), colName));
  return {
    ...snap,
    docs: filteredDocs,
    empty: filteredDocs.length === 0,
    size: filteredDocs.length,
    forEach: (cb: (doc: any) => void) => filteredDocs.forEach(cb),
  };
}

async function addDoc(colRef: any, data: any): Promise<any> {
  const colName = colRef?.id || "";
  const payload = TENANT_COLLECTIONS.has(colName) ? withTenantScope(data) : data;
  return await fbAddDoc(colRef, payload);
}

async function setDoc(docRef: any, data: any, options?: any): Promise<any> {
  const colName = docRef?.parent?.id || "";
  const payload = TENANT_COLLECTIONS.has(colName) ? withTenantScope(data) : data;
  return options !== undefined ? await fbSetDoc(docRef, payload, options) : await fbSetDoc(docRef, payload);
}

// Helper to convert Firestore documents into clean JSON objects
function docToData<T = any>(docSnap: any): T {
  const data = docSnap.data() || {};
  let createdAtStr = new Date().toISOString();

  if (data?.created_at?.toDate && typeof data.created_at.toDate === "function") {
    createdAtStr = data.created_at.toDate().toISOString();
  } else if (data?.created_at instanceof Date) {
    createdAtStr = data.created_at.toISOString();
  } else if (typeof data?.created_at?.seconds === "number") {
    createdAtStr = new Date(data.created_at.seconds * 1000).toISOString();
  } else if (typeof data?.created_at?._seconds === "number") {
    createdAtStr = new Date(data.created_at._seconds * 1000).toISOString();
  } else if (typeof data?.created_at === "string") {
    createdAtStr = data.created_at;
  }

  return {
    id: docSnap.id,
    _id: docSnap.id,
    ...data,
    created_at: createdAtStr,
  } as T;
}

/** Helper to convert any Date, ISO string, or Timestamp representation into a Firestore Timestamp */
export function toFirestoreTimestamp(val: any): Timestamp {
  if (!val) return Timestamp.now();
  if (val instanceof Timestamp) return val;
  if (val instanceof Date) return isNaN(val.getTime()) ? Timestamp.now() : Timestamp.fromDate(val);
  if (typeof val?.toDate === "function") return Timestamp.fromDate(val.toDate());
  if (typeof val?.seconds === "number") return new Timestamp(val.seconds, val.nanoseconds || 0);
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
  }
  return Timestamp.now();
}

// Helper to recursively strip undefined values and reserved id fields from Firestore payloads
export function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const result: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (key === "id" || key === "_id") continue;
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Timestamp) &&
      !(value instanceof Date)
    ) {
      result[key] = cleanFirestoreData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── 7-Day Recycle Bin System ──────────────────────────────────────────────────
export async function fsMoveToRecycleBin(collectionName: string, id: string, label?: string) {
  try {
    const docRef = doc(db, collectionName, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = docToData(snap);
      const user = fsGetCurrentUser();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days retention
      
      const recycleDocRef = doc(db, "recycle_bin", `${collectionName}_${id}`);
      await setDoc(recycleDocRef, {
        original_id: id,
        collection_name: collectionName,
        data: data,
        label: label || data.name || data.invoice_no || data.title || data.full_name || id,
        deleted_by: user?.email || user?.username || "user",
        deleted_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });
    }
  } catch (err) {
    console.warn("fsMoveToRecycleBin error:", err);
  }
}

export async function fsGetRecycleBin() {
  try {
    const snap = await getDocs(collection(db, "recycle_bin"));
    const now = new Date().toISOString();
    return snap.docs
      .map(docToData)
      .filter((item: any) => !item.expires_at || item.expires_at >= now)
      .sort((a: any, b: any) => (b.deleted_at || "").localeCompare(a.deleted_at || ""));
  } catch (err) {
    return [];
  }
}

export async function fsRestoreFromRecycleBin(recycleDocId: string) {
  try {
    const recycleRef = doc(db, "recycle_bin", recycleDocId);
    const snap = await getDoc(recycleRef);
    if (!snap.exists()) {
      throw new Error("Item not found in recycle bin or expired.");
    }
    const item = snap.data();
    const originalId = item.original_id;
    const collectionName = item.collection_name;
    const data = item.data;

    // Restore back to original collection
    const originalDocRef = doc(db, collectionName, originalId);
    await setDoc(originalDocRef, data);

    // Delete from recycle_bin
    await deleteDoc(recycleRef);

    return { success: true, restored: true, originalId, collectionName };
  } catch (err: any) {
    throw new Error(err.message || "Failed to restore item.");
  }
}

export async function fsPermanentDeleteRecycleBin(recycleDocId: string) {
  try {
    await deleteDoc(doc(db, "recycle_bin", recycleDocId));
    return { success: true, id: recycleDocId };
  } catch (err: any) {
    throw new Error(err.message || "Failed to permanently delete item.");
  }
}

// ── Products ─────────────────────────────────────────────────────────────────
export async function fsGetProducts() {
  try {
    const colRef = collection(db, "products");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "products"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateProduct(data: any) {
  const colRef = collection(db, "products");
  const docRef = await addDoc(colRef, {
    name: data.name || "",
    image_url: data.image_url || null,
    buy_price: Number(data.buy_price) || 0,
    sell_price: Number(data.sell_price) || 0,
    stock: Number(data.stock) || 0,
    min_stock: Number(data.min_stock) || 5,
    category: data.category || "",
    barcode: data.barcode || null,
    code: data.code || null,
    sku: data.sku || null,
    attributes: data.attributes || {},
    archived: false,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsUpdateProduct(id: string, data: any) {
  const docRef = doc(db, "products", id);
  const cleanData = { ...data };
  if (cleanData.buy_price !== undefined) cleanData.buy_price = Number(cleanData.buy_price) || 0;
  if (cleanData.sell_price !== undefined) cleanData.sell_price = Number(cleanData.sell_price) || 0;
  if (cleanData.stock !== undefined) cleanData.stock = Number(cleanData.stock) || 0;
  if (cleanData.min_stock !== undefined) cleanData.min_stock = Number(cleanData.min_stock) || 0;
  await updateDoc(docRef, cleanData);
  return { success: true, id };
}

export async function fsDeleteProduct(id: string) {
  await fsMoveToRecycleBin("products", id, "Product #" + id);
  const docRef = doc(db, "products", id);
  await deleteDoc(docRef);
  return { success: true, id };
}

// ── Sales ────────────────────────────────────────────────────────────────────
export async function fsGetSales() {
  try {
    let sales: any[] = [];
    try {
      const colRef = collection(db, "sales");
      const q = query(colRef, orderBy("created_at", "desc"));
      const snap = await getDocs(q);
      sales = snap.docs.map(docToData);
    } catch {
      const snap = await getDocs(collection(db, "sales"));
      sales = snap.docs.map(docToData);
      sales.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    try {
      const custSnap = await getDocs(collection(db, "customers"));
      const custMap = new Map();
      custSnap.docs.forEach(d => {
        const c = docToData(d);
        custMap.set(c.id, c);
      });
      return sales.map(s => {
        const cust = s.party_id ? custMap.get(s.party_id) : null;
        return {
          ...s,
          parties: cust ? { name: cust.name } : s.parties || null,
          customer: cust ? { id: cust.id, name: cust.name, phone: cust.phone, address: cust.address } : null,
        };
      });
    } catch {
      return sales;
    }
  } catch (err) {
    return [];
  }
}

// Safe stock modifier that checks document existence before updating to prevent No Document To Update errors
async function fsSafeAdjustProductStock(productId: string | null | undefined, delta: number) {
  if (!productId || delta === 0) return;
  try {
    const prodRef = doc(db, "products", productId);
    await updateDoc(prodRef, { stock: increment(delta) });
  } catch (err) {
    console.warn("Product stock adjustment skipped:", err);
  }
}

export async function fsCreateSale(data: any) {
  const colRef = collection(db, "sales");
  const qty = Number(data.qty) || 1;
  const buyPrice = Number(data.buy_price) || 0;
  const sellPrice = Number(data.sell_price) || 0;
  const discount = Number(data.discount) || 0;
  const paidAmount = Number(data.paid_amount) || 0;
  const dueAmount = Number(data.due_amount) || 0;
  const calculatedProfit = (sellPrice - buyPrice) * qty - discount;

  const createdTimestamp = toFirestoreTimestamp(data.created_at);

  const isDirectPayment = data.type === "cash" || data.type === "nagad" || data.type === "card" || data.type === "pos";
  const hasDigitalSplit = data.type === "split" && ((Number(data.split_bkash) || 0) > 0 || (Number(data.split_bank) || 0) > 0);
  const isDigitalPending = data.type === "bkash" || data.type === "bank" || hasDigitalSplit;
  const isOnline = data.type === "online";
  const cashReceived = isOnline
    ? 0
    : data.type === "split"
    ? Number(data.split_cash) || 0
    : isDigitalPending
    ? 0
    : isDirectPayment || data.type === "credit"
    ? paidAmount
    : paidAmount;

  const rawDoc: Record<string, any> = {
    product_id: data.product_id || null,
    product_name: data.product_name || "Custom Item",
    qty,
    buy_price: buyPrice,
    sell_price: sellPrice,
    profit: data.profit !== undefined && !isNaN(Number(data.profit)) ? Number(data.profit) : calculatedProfit,
    type: data.type || "cash",
    party_id: data.party_id || null,
    paid_amount: paidAmount,
    due_amount: dueAmount,
    discount,
    returned: false,
    return_qty: 0,
    note: data.note || null,
    cart_id: data.cart_id || null,
    payment_status: isDigitalPending ? "pending" : "accepted",
    payment_accepted: !isDigitalPending,
    created_at: createdTimestamp,
  };

  if (data.split_cash !== undefined && data.split_cash !== null) rawDoc.split_cash = Number(data.split_cash) || 0;
  if (data.split_bkash !== undefined && data.split_bkash !== null) rawDoc.split_bkash = Number(data.split_bkash) || 0;
  if (data.split_bank !== undefined && data.split_bank !== null) rawDoc.split_bank = Number(data.split_bank) || 0;
  if (data.courier_name) rawDoc.courier_name = data.courier_name;
  if (data.courier_status) rawDoc.courier_status = data.courier_status;
  if (data.tracking_code) rawDoc.tracking_code = data.tracking_code;
  if (data.employee_id) rawDoc.employee_id = data.employee_id;
  if (data.employee_name) rawDoc.employee_name = data.employee_name;

  const saleDoc = cleanFirestoreData(rawDoc);
  let saleId: string;
  if (data?.id) {
    saleId = String(data.id);
    await setDoc(doc(db, "sales", saleId), saleDoc, { merge: true });
  } else {
    const docRef = await addDoc(colRef, saleDoc);
    saleId = docRef.id;
  }

  const postTasks: Promise<any>[] = [];
  if (data.product_id) {
    postTasks.push(fsSafeAdjustProductStock(data.product_id, -qty));
  }
  if (cashReceived > 0) {
    let methodTag = rawDoc.type ? ` [Paid by ${rawDoc.type.toUpperCase()}]` : "";
    if (rawDoc.type === "split") {
      methodTag = ` [Split Cash: ৳${Number(rawDoc.split_cash) || 0}, bKash: ৳${Number(rawDoc.split_bkash) || 0}]`;
    }
    postTasks.push(
      addDoc(collection(db, "cashbox_logs"), {
        kind: "sale",
        amount: cashReceived,
        note: `Sale${methodTag}: ${rawDoc.product_name || "Item"} (x${qty})${rawDoc.note ? ` - ${rawDoc.note}` : ""}`,
        ref_id: saleId,
        created_at: createdTimestamp,
      }).catch(err => console.warn("Cashbox sale log skipped:", err))
    );
  }
  if (postTasks.length > 0) {
    await Promise.all(postTasks);
  }

  return {
    success: true,
    id: saleId,
    _id: saleId,
    ...saleDoc,
    created_at: createdTimestamp.toDate().toISOString(),
  };
}

export async function fsAcceptDigitalPayment(id: string) {
  if (!id) return { success: false, error: "No sale ID provided" };
  const docRef = doc(db, "sales", id);
  let snap = await getDoc(docRef);
  let targetRef = docRef;
  let targetData = snap.exists() ? snap.data() : null;

  if (!snap.exists()) {
    try {
      const q = query(collection(db, "sales"), where("cart_id", "==", id));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        targetRef = qSnap.docs[0].ref;
        targetData = qSnap.docs[0].data();
      } else {
        return { success: true, skipped: true, message: "Sale not found in Firestore mirror (skipped)" };
      }
    } catch (_) {
      return { success: true, skipped: true, message: "Sale not found in Firestore mirror (skipped)" };
    }
  }

  const s = targetData;
  if (!s) return { success: true, id };
  if (!s.cart_id && (s.payment_status === "accepted" || s.payment_accepted)) return { success: true, id };

  const cartId = s.cart_id;
  const targetId = targetRef.id;
  const docsToUpdate: Array<{ ref: any; data: any; id: string }> = [{ ref: targetRef, data: s, id: targetId }];

  if (cartId) {
    try {
      const q = query(collection(db, "sales"), where("cart_id", "==", cartId));
      const qSnap = await getDocs(q);
      qSnap.forEach(d => {
        if (d.id !== targetId) {
          docsToUpdate.push({ ref: d.ref, data: d.data(), id: d.id });
        }
      });
    } catch (e) {
      console.warn("Could not query cart items in fsAcceptDigitalPayment:", e);
    }
  }

  let totalStuck = 0;
  for (const item of docsToUpdate) {
    const it = item.data;
    if (it.payment_status === "accepted" || it.payment_accepted) continue;

    let stuckAmount = 0;
    if (it.type === "split") {
      const digitalSplit = (Number(it.split_bkash) || 0) + (Number(it.split_bank) || 0);
      if (digitalSplit > 0) {
        stuckAmount = digitalSplit;
      } else {
        stuckAmount = Math.max(0, (Number(it.paid_amount) || Number(it.sell_price) || 0) - (Number(it.split_cash) || 0));
      }
    } else {
      stuckAmount = it.paid_amount != null && Number.isFinite(Number(it.paid_amount))
        ? Math.max(0, Number(it.paid_amount))
        : Math.max(0, Number(it.sell_price || 0) * Number(it.qty || 1) - Number(it.discount || 0));
    }
    totalStuck += stuckAmount;

    await updateDoc(item.ref, {
      payment_status: "accepted",
      payment_accepted: true,
      accepted_at: Timestamp.now(),
    });
  }

  // Credit Cashbox only with the stuck amount
  if (totalStuck > 0) {
    try {
      const digitalMethod = s.type === "split"
        ? (Number(s.split_bkash) > 0 && Number(s.split_bank) > 0 ? "BKASH+BANK" : Number(s.split_bkash) > 0 ? "BKASH" : Number(s.split_bank) > 0 ? "BANK" : "DIGITAL")
        : (s.type || "bkash").toUpperCase();

      await addDoc(collection(db, "cashbox_logs"), {
        kind: "sale",
        amount: totalStuck,
        note: `Digital Payment Received [${digitalMethod}]: ${s.product_name || "Item"} (INV-${id.slice(-6).toUpperCase()})`,
        ref_id: id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox digital payment log skipped:", err);
    }
  }

  return { success: true, id };
}

export async function fsApproveCourierPayment(id: string) {
  if (!id) return { success: false, error: "No sale ID provided" };
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    return { success: true, skipped: true, message: "Sale not found in Firestore mirror (skipped)" };
  }
  const s = snap.data();
  if (s.courier_status === "collected") return { success: true, id };
  if (s.courier_status === "cancelled" || s.returned) throw new Error("Cannot collect a cancelled or returned order");
  const total = Math.max(0, Number(s.sell_price || 0) * Number(s.qty || 1) - Number(s.discount || 0));

  await updateDoc(docRef, {
    courier_status: "collected",
    paid_amount: total,
    due_amount: 0,
    collected_at: Timestamp.now(),
  });

  // Credit Cashbox
  try {
    await addDoc(collection(db, "cashbox_logs"), {
      kind: "sale",
      amount: total,
      note: `Online Courier Collected [${s.courier_name || "Courier"}]: ${s.product_name || "Item"} (INV-${id.slice(-6).toUpperCase()})`,
      ref_id: id,
      created_at: Timestamp.now(),
    });
  } catch (err) {
    console.warn("Cashbox courier log skipped:", err);
  }

  return { success: true, id };
}

export async function fsCancelCourierOrder(id: string) {
  if (!id) return { success: false, error: "No sale ID provided" };
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    return { success: true, skipped: true, message: "Sale not found in Firestore mirror (skipped)" };
  }
  const s = snap.data();

  // Restore inventory stock safely
  if (s.product_id && !s.returned) {
    await fsSafeAdjustProductStock(s.product_id, Number(s.qty) || 1);
  }

  await updateDoc(docRef, {
    courier_status: "cancelled",
    returned: true,
    cancelled_at: Timestamp.now(),
  });

  return { success: true, id };
}

export async function fsDeleteSale(id: string) {
  if (!id) throw new Error("Sale ID is required for delete");
  await fsMoveToRecycleBin("sales", id, "Sale #" + id);
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    const sale = snap.data();
    // 1. Restore product stock if not already returned
    if (sale.product_id && !sale.returned) {
      const qty = Number(sale.qty) || 0;
      if (qty > 0) {
        await fsSafeAdjustProductStock(sale.product_id, qty);
      }
    }
  }
  await deleteDoc(docRef);
  return { success: true, id };
}

export async function fsEditSale(id: string, data: any) {
  if (!id) throw new Error("Sale ID is required for edit");
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error("Sale not found");
  }
  const oldSale = snap.data();

  const newQty = Number(data.qty) || Number(oldSale.qty) || 1;
  const oldQty = Number(oldSale.qty) || 0;
  const newProductId = data.product_id !== undefined ? (data.product_id || null) : (oldSale.product_id || null);
  const oldProductId = oldSale.product_id || null;

  // 1. Revert old stock and apply new stock safely
  if (!oldSale.returned) {
    if (oldProductId && oldProductId === newProductId) {
      const diff = oldQty - newQty;
      if (diff !== 0) {
        await fsSafeAdjustProductStock(oldProductId, diff);
      }
    } else {
      if (oldProductId && oldQty > 0) {
        await fsSafeAdjustProductStock(oldProductId, oldQty);
      }
      if (newProductId && newQty > 0) {
        await fsSafeAdjustProductStock(newProductId, -newQty);
      }
    }
  }

  const buyPrice = data.buy_price != null && Number.isFinite(Number(data.buy_price)) ? Number(data.buy_price) : (Number(oldSale.buy_price) || 0);
  const sellPrice = data.sell_price != null && Number.isFinite(Number(data.sell_price)) ? Number(data.sell_price) : (Number(oldSale.sell_price) || 0);
  const discount = data.discount != null && Number.isFinite(Number(data.discount)) ? Number(data.discount) : (Number(oldSale.discount) || 0);
  const calculatedProfit = (sellPrice - buyPrice) * newQty - discount;
  const profit = data.profit !== undefined && !isNaN(Number(data.profit)) ? Number(data.profit) : (oldSale.profit !== undefined ? Number(oldSale.profit) : calculatedProfit);

  const rawUpdate: Record<string, any> = {
    product_id: newProductId,
    product_name: data.product_name || oldSale.product_name || "Custom Item",
    qty: newQty,
    buy_price: buyPrice,
    sell_price: sellPrice,
    profit,
    type: data.type || oldSale.type || "cash",
    party_id: data.party_id !== undefined ? (data.party_id || null) : (oldSale.party_id || null),
    paid_amount: data.paid_amount != null && Number.isFinite(Number(data.paid_amount)) ? Number(data.paid_amount) : (Number(oldSale.paid_amount) || 0),
    due_amount: data.due_amount != null && Number.isFinite(Number(data.due_amount)) ? Number(data.due_amount) : (Number(oldSale.due_amount) || 0),
    discount,
    note: data.note !== undefined ? (data.note || null) : (oldSale.note || null),
    updated_at: Timestamp.now(),
  };

  if (data.split_cash !== undefined && data.split_cash !== null) rawUpdate.split_cash = Number(data.split_cash) || 0;
  if (data.split_bkash !== undefined && data.split_bkash !== null) rawUpdate.split_bkash = Number(data.split_bkash) || 0;
  if (data.split_bank !== undefined && data.split_bank !== null) rawUpdate.split_bank = Number(data.split_bank) || 0;

  const updateDocData = cleanFirestoreData(rawUpdate);
  await updateDoc(docRef, updateDocData);

  return { success: true, id, ...oldSale, ...updateDocData };
}

// ── Purchases ────────────────────────────────────────────────────────────────
export async function fsGetPurchases() {
  try {
    const colRef = collection(db, "purchases");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "purchases"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreatePurchase(data: any) {
  const qty = Number(data.qty) || 1;
  const unitCost = Number(data.unit_cost) || 0;
  const total = Number(data.total) || (qty * unitCost);
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const paymentType = data.payment_type || "cash";
  const splitCash = Number(data.split_cash) || 0;
  const splitOnline = Number(data.split_online || data.split_bank) || 0;
  const splitCredit = Number(data.split_credit) || 0;

  const purchaseDoc = cleanFirestoreData({
    product_id: data.product_id || null,
    product_name: data.product_name || "Purchased Item",
    qty,
    unit_cost: unitCost,
    total,
    note: data.note || null,
    payment_type: paymentType,
    split_cash: splitCash > 0 ? splitCash : undefined,
    split_online: splitOnline > 0 ? splitOnline : undefined,
    split_credit: splitCredit > 0 ? splitCredit : undefined,
    online_provider: data.online_provider || undefined,
    party_id: data.party_id || null,
    created_at: createdAtTs,
  });

  let purchaseId: string;
  if (data?.id) {
    purchaseId = String(data.id);
    await setDoc(doc(db, "purchases", purchaseId), purchaseDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "purchases"), purchaseDoc);
    purchaseId = docRef.id;
  }

  // 1. Increment product stock
  if (data.product_id) {
    try {
      const productRef = doc(db, "products", data.product_id);
      const updates: any = { stock: increment(qty) };
      if (unitCost > 0) updates.buy_price = unitCost;
      await updateDoc(productRef, updates);
    } catch (err) {
      console.warn("Product stock increment skipped:", err);
    }
  }

  // 2. Cashbox expense & expenses collection log if cash purchase or split cash
  const cashSpent = paymentType === "cash" ? total : (paymentType === "split" ? splitCash : 0);
  if (cashSpent > 0) {
    try {
      await addDoc(collection(db, "expenses"), {
        title: `Product Purchase: ${data.product_name || "Stock"}`,
        amount: cashSpent,
        category: "purchase",
        note: `Purchased ${qty} units. (${paymentType === "split" ? "Split Cash" : "Cash"}). Purchase ID: ${purchaseId}`,
        created_at: createdAtTs,
      });
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "expense",
        amount: cashSpent,
        note: `Product Purchase: ${data.product_name || "Stock"} (x${qty}) [${paymentType.toUpperCase()}]`,
        ref_id: purchaseId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox purchase log skipped:", err);
    }
  }

  // 3. Party payable if credit purchase or split credit
  const creditPayable = paymentType === "credit" ? total : (paymentType === "split" ? splitCredit : 0);
  if (creditPayable > 0 && data.party_id) {
    try {
      await addDoc(collection(db, "party_payables"), {
        party_id: data.party_id,
        amount: creditPayable,
        note: `Credit purchase: ${data.product_name || "Item"}. Purchase ID: ${purchaseId}`,
        ref_id: purchaseId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Party payable log skipped:", err);
    }
  }

  return { success: true, id: purchaseId, ...purchaseDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeletePurchase(id: string) {
  try {
    await fsMoveToRecycleBin("purchases", id, "Purchase #" + id);
    const docRef = doc(db, "purchases", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const p = snap.data();
      // 1. Rollback stock decrement
      if (p.product_id && p.qty) {
        try {
          await updateDoc(doc(db, "products", p.product_id), {
            stock: increment(-Number(p.qty)),
          });
        } catch (err) {
          console.warn("Product stock rollback warning:", err);
        }
      }
      // 2. Delete linked cashbox log
      try {
        const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
        const cSnap = await getDocs(q);
        for (const cDoc of cSnap.docs) {
          await deleteDoc(doc(db, "cashbox_logs", cDoc.id));
        }
      } catch (err) {
        console.warn("Cashbox log rollback warning:", err);
      }
      // 3. Delete linked party payable
      try {
        const q2 = query(collection(db, "party_payables"), where("ref_id", "==", id));
        const ppSnap = await getDocs(q2);
        for (const ppDoc of ppSnap.docs) {
          await deleteDoc(doc(db, "party_payables", ppDoc.id));
        }
      } catch (err) {
        console.warn("Party payable rollback warning:", err);
      }
      // 4. Delete auto-created linked expense
      try {
        const expSnap = await getDocs(collection(db, "expenses"));
        for (const eDoc of expSnap.docs) {
          if (eDoc.data().note?.includes(`Purchase ID: ${id}`)) {
            await deleteDoc(eDoc.ref);
          }
        }
      } catch (err) {
        console.warn("Linked expense rollback warning:", err);
      }
      await deleteDoc(docRef);
    }
  } catch (err) {
    await deleteDoc(doc(db, "purchases", id));
  }
  return { success: true, id };
}

export async function fsEditPurchase(id: string, data: any) {
  const docRef = doc(db, "purchases", id);
  const oldSnap = await getDoc(docRef);
  if (!oldSnap.exists()) throw new Error("Purchase not found");
  const oldPurchase = oldSnap.data();

  const oldQty = Number(oldPurchase.qty) || 0;
  const newQty = data.qty !== undefined ? Number(data.qty) || 0 : oldQty;
  const qtyDiff = newQty - oldQty;

  const oldTotal = Number(oldPurchase.total) || 0;
  const newTotal = data.total !== undefined ? Number(data.total) || 0 : (newQty * (Number(data.unit_cost) || Number(oldPurchase.unit_cost) || 0));
  const totalDiff = newTotal - oldTotal;

  const updatePayload: any = {
    ...data,
    qty: newQty,
    total: newTotal,
    updated_at: Timestamp.now(),
  };
  if (data.unit_cost !== undefined) updatePayload.unit_cost = Number(data.unit_cost) || 0;

  await updateDoc(docRef, updatePayload);

  // 1. Adjust product stock if linked
  const prodId = data.product_id || oldPurchase.product_id;
  if (prodId && qtyDiff !== 0) {
    try {
      await updateDoc(doc(db, "products", prodId), {
        stock: increment(qtyDiff),
        buy_price: (Number(data.unit_cost) || 0) > 0 ? Number(data.unit_cost) : undefined,
      });
    } catch (err) {
      console.warn("Product stock adjustment warning:", err);
    }
  }

  // 2. Adjust cashbox if cash purchase
  const paymentType = data.payment_type || oldPurchase.payment_type;
  if (paymentType !== "credit" && totalDiff !== 0) {
    try {
      const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
      const snap = await getDocs(q);
      if (!snap.empty) {
        for (const logDoc of snap.docs) {
          await updateDoc(doc(db, "cashbox_logs", logDoc.id), {
            amount: newTotal,
            note: `Purchase: ${data.product_name || oldPurchase.product_name} (x${newQty})`,
          });
        }
      }
    } catch (err) {
      console.warn("Cashbox log adjustment warning:", err);
    }
  }

  return { success: true, id };
}

// ── Expenses ─────────────────────────────────────────────────────────────────
export async function fsGetExpenses() {
  try {
    const colRef = collection(db, "expenses");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "expenses"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateExpense(data: any) {
  const amount = Number(data.amount) || 0;
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const expenseDoc = cleanFirestoreData({
    title: data.title || "Expense",
    amount,
    category: data.category || "General",
    note: data.note || null,
    created_at: createdAtTs,
  });

  let expenseId: string;
  if (data?.id) {
    expenseId = String(data.id);
    await setDoc(doc(db, "expenses", expenseId), expenseDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "expenses"), expenseDoc);
    expenseId = docRef.id;
  }

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "expense",
        amount,
        note: `Expense: ${data.title || "General"}`,
        ref_id: expenseId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox expense log skipped:", err);
    }
  }

  return { success: true, id: expenseId, ...expenseDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeleteExpense(id: string) {
  await fsMoveToRecycleBin("expenses", id, "Expense #" + id);
  await deleteDoc(doc(db, "expenses", id));
  return { success: true, id };
}

// ── Cashbox ──────────────────────────────────────────────────────────────────
export async function fsGetCashbox() {
  try {
    const colRef = collection(db, "cashbox_logs");
    let snap;
    try {
      const q = query(colRef, orderBy("created_at", "desc"));
      snap = await getDocs(q);
    } catch (_) {
      snap = await getDocs(colRef);
    }
    const items = snap.docs.map(docToData);
    return items.sort((a, b) => {
      const tb = new Date(b.created_at).getTime() || 0;
      const ta = new Date(a.created_at).getTime() || 0;
      return tb - ta;
    });
  } catch (err) {
    console.warn("fsGetCashbox error:", err);
    return [];
  }
}

export async function fsCreateCashbox(data: any) {
  const createdAtTs = toFirestoreTimestamp(data?.created_at);
  const kindVal = data.kind || (data.type === "cash_out" ? "withdraw" : "deposit");
  const payload = {
    kind: kindVal,
    amount: Number(data.amount) || 0,
    note: data.note || null,
    ref_id: data.ref_id || null,
    created_at: createdAtTs,
  };

  if (data?.id) {
    await setDoc(doc(db, "cashbox_logs", String(data.id)), payload, { merge: true });
    return { success: true, id: String(data.id) };
  } else {
    const docRef = await addDoc(collection(db, "cashbox_logs"), payload);
    return { success: true, id: docRef.id };
  }
}

export async function fsUpdateCashbox(id: string, data: any) {
  const updateData: any = { ...data };
  if (updateData.created_at !== undefined) {
    updateData.created_at = toFirestoreTimestamp(updateData.created_at);
  }
  if (updateData.amount !== undefined) {
    updateData.amount = Number(updateData.amount) || 0;
  }
  await updateDoc(doc(db, "cashbox_logs", String(id)), cleanFirestoreData(updateData));
  return { success: true, id };
}

export async function fsDeleteCashbox(id: string) {
  await deleteDoc(doc(db, "cashbox_logs", String(id)));
  return { success: true, id };
}

// ── Withdrawals ──────────────────────────────────────────────────────────────
export async function fsGetWithdrawals() {
  try {
    const snap = await getDocs(collection(db, "withdrawals"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateWithdrawal(data: any) {
  const amount = Number(data.amount) || 0;
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const withdrawalDoc = cleanFirestoreData({
    amount,
    note: data.note || "Owner Withdrawal",
    created_at: createdAtTs,
  });

  let withdrawalId: string;
  if (data?.id) {
    withdrawalId = String(data.id);
    await setDoc(doc(db, "withdrawals", withdrawalId), withdrawalDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "withdrawals"), withdrawalDoc);
    withdrawalId = docRef.id;
  }

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount,
        note: `Withdrawal: ${data.note || "Owner"}`,
        ref_id: withdrawalId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox withdrawal log skipped:", err);
    }
  }

  return { success: true, id: withdrawalId, ...withdrawalDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeleteWithdrawal(id: string) {
  if (!id) return { success: false };
  await deleteDoc(doc(db, "withdrawals", id));
  return { success: true, id };
}

// ── Owners Wallet (Personal & Family Expenses) ──────────────────────────────
export async function fsGetOwnerWallet() {
  try {
    const snap = await getDocs(collection(db, "owner_wallet"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateOwnerWalletEntry(data: any) {
  const amount = Number(data.amount) || 0;
  const category = data.category || "personal";
  const note = data.note || "";
  const cutFromProfit = data.cut_from_profit !== false;
  const catLabel = category === "family" ? "পরিবার খরচ" : category === "bazar" ? "বাজার খরচ" : category === "home_rent" ? "বাসা ভাড়া" : category === "medical" ? "চিকিৎসা" : "ব্যক্তিগত";
  const title = `[মালিকের খরচ] ${catLabel}: ${note || "ব্যক্তিগত উত্তোলন"}`;

  let createdAtTs: Timestamp;
  if (data.created_at) {
    const d = new Date(data.created_at);
    createdAtTs = isNaN(d.getTime()) ? Timestamp.now() : Timestamp.fromDate(d);
  } else {
    createdAtTs = Timestamp.now();
  }

  const docRef = await addDoc(collection(db, "owner_wallet"), {
    amount,
    category,
    note: note || null,
    cut_from_profit: cutFromProfit,
    created_at: createdAtTs,
  });

  // 1. Log in cashbox as withdrawal to reduce cash balance (Always)
  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount,
        note: title,
        ref_id: docRef.id,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox owner wallet log skipped:", err);
    }

    // 2. Log in expenses under owner_personal category ONLY if cutFromProfit is true!
    if (cutFromProfit) {
      try {
        await addDoc(collection(db, "expenses"), {
          title,
          amount,
          category: "owner_personal",
          note: `Owner Wallet ID: ${docRef.id} - ${note}`,
          created_at: createdAtTs,
        });
      } catch (err) {
        console.warn("Expense owner wallet log skipped:", err);
      }
    }
  }

  return { success: true, id: docRef.id };
}

export async function fsDeleteOwnerWalletEntry(id: string) {
  await fsMoveToRecycleBin("owner_wallet", id, "Owner Wallet #" + id);
  await deleteDoc(doc(db, "owner_wallet", id));
  try {
    const cbSnap = await getDocs(query(collection(db, "cashbox_logs"), where("ref_id", "==", id)));
    for (const d of cbSnap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (_) {}
  try {
    const expSnap = await getDocs(query(collection(db, "expenses"), where("category", "==", "owner_personal")));
    for (const d of expSnap.docs) {
      const data = d.data();
      if (data.note?.includes(id)) {
        await deleteDoc(d.ref);
      }
    }
  } catch (_) {}
  return { success: true };
}

export async function fsUpdateOwnerWalletEntry(id: string, data: any) {
  const amount = Number(data.amount) || 0;
  const category = data.category || "personal";
  const note = data.note || "";
  const cutFromProfit = data.cut_from_profit !== undefined ? data.cut_from_profit !== false : undefined;
  const catLabel = category === "family" ? "পরিবার খরচ" : category === "bazar" ? "বাজার খরচ" : category === "home_rent" ? "বাসা ভাড়া" : category === "medical" ? "চিকিৎসা" : "ব্যক্তিগত";
  const title = `[মালিকের খরচ] ${catLabel}: ${note || "ব্যক্তিগত উত্তোলন"}`;

  const updates: any = {
    amount,
    category,
    note: note || null,
    updated_at: Timestamp.now(),
  };
  if (cutFromProfit !== undefined) {
    updates.cut_from_profit = cutFromProfit;
  }

  await updateDoc(doc(db, "owner_wallet", id), updates);

  try {
    const cbSnap = await getDocs(query(collection(db, "cashbox_logs"), where("ref_id", "==", id)));
    for (const d of cbSnap.docs) {
      await updateDoc(d.ref, { amount, note: title });
    }
  } catch (_) {}

  try {
    const expSnap = await getDocs(query(collection(db, "expenses"), where("category", "==", "owner_personal")));
    let found = false;
    for (const d of expSnap.docs) {
      const dData = d.data();
      if (dData.note?.includes(id)) {
        found = true;
        if (cutFromProfit === false) {
          await deleteDoc(d.ref);
        } else {
          await updateDoc(d.ref, { amount, title, note: `Owner Wallet ID: ${id} - ${note}` });
        }
      }
    }
    if (!found && cutFromProfit === true && amount > 0) {
      await addDoc(collection(db, "expenses"), {
        title,
        amount,
        category: "owner_personal",
        note: `Owner Wallet ID: ${id} - ${note}`,
        created_at: Timestamp.now(),
      });
    }
  } catch (_) {}

  return { success: true };
}

// ── Somiti ───────────────────────────────────────────────────────────────────
export async function fsGetSomiti() {
  try {
    const snap = await getDocs(collection(db, "somiti"));
    const items = snap.docs.map(docToData);
    return items.sort(
      (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  } catch (err) {
    return [];
  }
}

export async function fsCreateSomiti(data: any) {
  const amount = Number(data.amount) || 0;
  const kind = data.kind || "deposit";
  const shouldSkipCashbox = Boolean(data.skipCashbox || data.is_initial);
  const explicitId = data.id || data._id ? String(data.id || data._id) : null;
  const createdAtTs = toFirestoreTimestamp(data.created_at);

  const payload = {
    kind,
    amount,
    note: data.note || null,
    skipCashbox: shouldSkipCashbox,
    is_initial: Boolean(data.is_initial),
    created_at: createdAtTs,
  };

  let finalId: string;
  if (explicitId) {
    await setDoc(doc(db, "somiti", explicitId), payload, { merge: true });
    finalId = explicitId;
  } else {
    const docRef = await addDoc(collection(db, "somiti"), payload);
    finalId = docRef.id;
  }

  if (amount > 0 && !shouldSkipCashbox) {
    try {
      // Depositing into Samity reduces cash from cashbox (withdraw); withdrawing from Samity returns cash to cashbox (deposit)
      // Samity is savings/DPS and is NOT deducted from business net profit
      const cashboxKind = kind === "withdraw" ? "deposit" : "withdraw";
      await addDoc(collection(db, "cashbox_logs"), {
        kind: cashboxKind,
        amount,
        note: `Samity ${kind}: ${data.note || ""}`,
        ref_id: finalId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox samity log skipped:", err);
    }
  }

  return {
    success: true,
    id: finalId,
    kind,
    amount,
    note: data.note || null,
    skipCashbox: shouldSkipCashbox,
    is_initial: Boolean(data.is_initial),
    created_at: createdAtTs.toDate().toISOString(),
  };
}

export async function fsUpdateSomiti(id: string, data: any) {
  if (!id) return { success: false };
  const { id: _ignoreId, _id: _ignoreMongoId, ...rest } = data || {};
  const updates: any = { ...rest };
  if (updates.amount !== undefined) {
    updates.amount = Math.abs(Number(updates.amount) || 0);
  }
  if (updates.created_at) {
    updates.created_at = toFirestoreTimestamp(updates.created_at);
  }
  await setDoc(doc(db, "somiti", id), updates, { merge: true });
  if (
    data.amount !== undefined ||
    data.kind !== undefined ||
    data.note !== undefined ||
    data.created_at !== undefined ||
    data.skipCashbox !== undefined
  ) {
    try {
      const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
      const snap = await getDocs(q);
      const cashboxKind = data.kind === "withdraw" ? "deposit" : "withdraw";
      if (data.skipCashbox === true) {
        for (const logDoc of snap.docs) {
          await deleteDoc(doc(db, "cashbox_logs", logDoc.id));
        }
      } else if (data.skipCashbox === false && snap.empty && (Number(data.amount) || 0) > 0) {
        await addDoc(collection(db, "cashbox_logs"), {
          kind: cashboxKind,
          amount: Math.abs(Number(data.amount) || 0),
          note: `Samity ${data.kind || "deposit"}: ${data.note || ""}`,
          ref_id: id,
          created_at: updates.created_at || Timestamp.now(),
        });
      } else {
        for (const logDoc of snap.docs) {
          const logUpdates: any = {
            kind: cashboxKind,
            amount: Math.abs(Number(data.amount) || 0),
            note: `Samity ${data.kind || "deposit"}: ${data.note || ""}`,
          };
          if (updates.created_at) {
            logUpdates.created_at = updates.created_at;
          }
          await updateDoc(doc(db, "cashbox_logs", logDoc.id), logUpdates);
        }
      }
    } catch (_) {}
  }
  return { success: true, id };
}

export async function fsDeleteSomiti(id: string) {
  if (!id) return { success: false };
  try {
    await fsMoveToRecycleBin("somiti", id, "Somiti #" + id);
    const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
    const snap = await getDocs(q);
    for (const logDoc of snap.docs) {
      await deleteDoc(doc(db, "cashbox_logs", logDoc.id));
    }
  } catch (_) {}
  try {
    await deleteDoc(doc(db, "somiti", id));
  } catch (_) {}
  try {
    await deleteDoc(doc(db, "somiti_entries", id));
  } catch (_) {}
  return { success: true, id };
}

// ── Parties (Suppliers) ──────────────────────────────────────────────────────
export async function fsGetParties() {
  try {
    const snap = await getDocs(collection(db, "parties"));
    return snap.docs
      .map(docToData)
      .filter((p: any) => p.type !== "customer" && !p.is_customer)
      .map((p: any) => ({ ...p, type: "supplier", is_supplier: true }));
  } catch (err) {
    console.warn("fsGetParties error:", err);
    throw err;
  }
}

export async function fsGetParty(id: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, "parties", id));
    if (snap.exists()) {
      return { ...docToData(snap), type: "supplier", is_supplier: true };
    }
    const custSnap = await getDoc(doc(db, "customers", id));
    if (custSnap.exists()) {
      return { ...docToData(custSnap), type: "supplier", is_supplier: true };
    }
    return null;
  } catch (err) {
    console.warn(`fsGetParty error for ${id}:`, err);
    throw err;
  }
}

export async function fsGetPurchasesForParty(partyId: string) {
  if (!partyId) return [];
  const allPurchases = await fsGetPurchases();
  return allPurchases.filter((p: any) => p.party_id === partyId);
}

export async function fsCreateParty(data: any) {
  const docRef = await addDoc(collection(db, "parties"), {
    name: data.name || "",
    phone: data.phone || null,
    address: data.address || null,
    type: "supplier",
    is_supplier: true,
    archived: false,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id, type: "supplier", is_supplier: true };
}

export async function fsUpdateParty(id: string, data: any) {
  await updateDoc(doc(db, "parties", id), { ...data, type: "supplier", is_supplier: true });
  return { success: true, id };
}

export async function fsDeleteParty(id: string) {
  await fsMoveToRecycleBin("parties", id, "Party #" + id);
  await deleteDoc(doc(db, "parties", id));
  return { success: true, id };
}

export async function fsArchiveParty(id: string, archived: boolean = true) {
  return await fsUpdateParty(id, { archived });
}

// ── Customers ────────────────────────────────────────────────────────────────
export async function fsGetCustomers() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    return snap.docs
      .map(docToData)
      .filter((c: any) => c.type !== "supplier" && !c.is_supplier)
      .map((c: any) => ({ ...c, type: "customer", is_customer: true }));
  } catch (err) {
    return [];
  }
}

export async function fsCreateCustomer(data: any) {
  const docRef = await addDoc(collection(db, "customers"), {
    name: data.name || "",
    phone: data.phone || null,
    address: data.address || null,
    type: "customer",
    is_customer: true,
    archived: false,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id, type: "customer", is_customer: true };
}

export async function fsUpdateCustomer(id: string, data: any) {
  await updateDoc(doc(db, "customers", id), data);
  return { success: true, id };
}

export async function fsDeleteCustomer(id: string) {
  await fsMoveToRecycleBin("customers", id, "Customer #" + id);
  await deleteDoc(doc(db, "customers", id));
  return { success: true, id };
}

export async function fsArchiveCustomer(id: string, archived: boolean = true) {
  return await fsUpdateCustomer(id, { archived });
}

// ── Payments & Ledgers ───────────────────────────────────────────────────────
export async function fsGetAllPayments() {
  try {
    const snap = await getDocs(collection(db, "payments"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsGetPaymentsForParty(partyId: string) {
  try {
    const snap = await getDocs(collection(db, "payments"));
    return snap.docs.map(docToData).filter((p: any) => p.party_id === partyId);
  } catch (err) {
    return [];
  }
}

export async function fsCreatePayment(data: any) {
  const amount = Number(data.amount) || 0;
  const isSplit = data.payment_method === "split";
  const cashAmt = isSplit
    ? (Number(data.split_cash) || 0)
    : (data.payment_method === "bkash" || data.payment_method === "bank" ? 0 : amount);
  const createdAtTs = toFirestoreTimestamp(data.created_at);

  const paymentDoc = cleanFirestoreData({
    party_id: data.party_id,
    amount,
    payment_method: data.payment_method || "cash",
    split_cash: data.split_cash || 0,
    split_bkash: data.split_bkash || 0,
    split_bank: data.split_bank || 0,
    note: data.note || "Customer Due Payment",
    created_at: createdAtTs,
  });

  let paymentId: string;
  if (data?.id) {
    paymentId = String(data.id);
    await setDoc(doc(db, "payments", paymentId), paymentDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "payments"), paymentDoc);
    paymentId = docRef.id;
  }

  if (cashAmt > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "deposit",
        amount: cashAmt,
        note: `[বকেয়া আদায়] ${data.note || "Customer Due Payment"}`,
        ref_id: paymentId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox party payment log skipped:", err);
    }
  }

  return { success: true, id: paymentId, ...paymentDoc, created_at: createdAtTs.toDate().toISOString() };
}

export const fsCreatePartyPayment = fsCreatePayment;

export async function fsDeletePayment(id: string) {
  await deleteDoc(doc(db, "payments", id));
  return { success: true, id };
}

export async function fsGetAllPartyReceivables() {
  try {
    const snap = await getDocs(collection(db, "party_receivables"));
    return snap.docs.map(docToData);
  } catch (err) {
    console.warn("fsGetAllPartyReceivables error:", err);
    throw err;
  }
}

export async function fsCreatePartyReceivable(data: any) {
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const receivableDoc = cleanFirestoreData({
    party_id: data.party_id,
    amount: Number(data.amount) || 0,
    note: data.note || null,
    created_at: createdAtTs,
  });

  let recId: string;
  if (data?.id) {
    recId = String(data.id);
    await setDoc(doc(db, "party_receivables", recId), receivableDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "party_receivables"), receivableDoc);
    recId = docRef.id;
  }
  return { success: true, id: recId, ...receivableDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsGetAllPartyPayables() {
  try {
    const snap = await getDocs(collection(db, "party_payables"));
    return snap.docs.map(docToData);
  } catch (err) {
    console.warn("fsGetAllPartyPayables error:", err);
    throw err;
  }
}

export async function fsCreatePartyPayable(data: any) {
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const payableDoc = cleanFirestoreData({
    party_id: data.party_id,
    amount: Number(data.amount) || 0,
    note: data.note || null,
    created_at: createdAtTs,
  });

  let payId: string;
  if (data?.id) {
    payId = String(data.id);
    await setDoc(doc(db, "party_payables", payId), payableDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "party_payables"), payableDoc);
    payId = docRef.id;
  }
  return { success: true, id: payId, ...payableDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsGetAllPayableSettlements() {
  try {
    const snap = await getDocs(collection(db, "payable_settlements"));
    return snap.docs.map(docToData);
  } catch (err) {
    console.warn("fsGetAllPayableSettlements error:", err);
    throw err;
  }
}

export async function fsCreatePayableSettlement(data: any) {
  const amount = Number(data.amount) || 0;
  const createdAtTs = toFirestoreTimestamp(data.created_at);
  const paymentType = data.payment_type || (data.split_cash !== undefined || data.split_online !== undefined ? "split" : (data.method || "cash"));
  const splitCash = Number(data.split_cash) || 0;
  const splitOnline = Number(data.split_online || data.split_bank || data.split_bkash) || 0;
  const splitCredit = Number(data.split_credit || data.split_due) || 0;

  const cashAmount = paymentType === "cash" ? amount : (paymentType === "split" ? splitCash : 0);
  const onlineAmount = paymentType === "online" || paymentType === "bank" || paymentType === "bkash" ? amount : (paymentType === "split" ? splitOnline : 0);

  const settlementDoc = cleanFirestoreData({
    party_id: data.party_id,
    amount,
    payment_type: paymentType,
    split_cash: splitCash > 0 ? splitCash : undefined,
    split_online: splitOnline > 0 ? splitOnline : undefined,
    split_credit: splitCredit > 0 ? splitCredit : undefined,
    online_provider: data.online_provider || undefined,
    note: data.note || "Payable Settlement",
    created_at: createdAtTs,
  });

  let settlementId: string;
  if (data?.id) {
    settlementId = String(data.id);
    await setDoc(doc(db, "payable_settlements", settlementId), settlementDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "payable_settlements"), settlementDoc);
    settlementId = docRef.id;
  }

  // Deduct cash portion from Cashbox
  if (cashAmount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount: cashAmount,
        note: `Payable Settlement (${paymentType === "split" ? "Split Cash" : "Cash"}): ${data.note || ""}`.trim(),
        ref_id: settlementId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox settlement log skipped:", err);
    }
  }

  // Log online payment to bank transactions if bank/online used
  if (onlineAmount > 0) {
    try {
      await addDoc(collection(db, "bank_transactions"), {
        type: "withdraw",
        amount: onlineAmount,
        note: `Supplier Payment (${data.online_provider || "Online/Bank"}): ${data.note || ""}`.trim(),
        ref_id: settlementId,
        created_at: createdAtTs,
      });
    } catch (_) {}
  }

  return { success: true, id: settlementId, ...settlementDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeletePartyReceivable(id: string) {
  await deleteDoc(doc(db, "party_receivables", id));
  return { success: true, id };
}

export async function fsDeletePartyPayable(id: string) {
  await deleteDoc(doc(db, "party_payables", id));
  return { success: true, id };
}

export async function fsDeletePayableSettlement(id: string) {
  await deleteDoc(doc(db, "payable_settlements", id));
  return { success: true, id };
}

// ── Returns ──────────────────────────────────────────────────────────────────
export async function fsGetReturns() {
  try {
    const snap = await getDocs(collection(db, "returns"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateReturn(data: any) {
  const qty = Math.max(1, Number(data.qty) || 1);
  let returnPrice = Number(data.return_price) || 0;
  if (!returnPrice && data.refund_amount) {
    returnPrice = (Number(data.refund_amount) || 0) / qty;
  }
  let profitAdj = Number(data.profit_adjustment) || 0;
  const returnDate = data.return_date || new Date().toISOString().slice(0, 10);
  let deductCashbox = data.deduct_cashbox ?? true;

  // 1. If linked to a sale doc in Firestore, update the sale document
  if (data.sale_id) {
    try {
      const saleRef = doc(db, "sales", data.sale_id);
      const saleSnap = await getDoc(saleRef);
      if (saleSnap.exists()) {
        const s = saleSnap.data();
        const origQty = Number(s.qty) || 1;
        const origSell = Number(s.sell_price) || 0;
        const origBuy = Number(s.buy_price) || 0;
        const origProfit = Number(s.profit);
        const profitPerUnit = !isNaN(origProfit) ? origProfit / origQty : (origSell - origBuy);

        if (!returnPrice) returnPrice = origSell;
        if (!profitAdj) profitAdj = -Math.round(profitPerUnit * qty);

        // Only deduct from cashbox if the sale was cash/split-cash
        const sType = String(s.type || "cash").toLowerCase();
        if (sType !== "cash" && sType !== "pos" && sType !== "split" && sType !== "nagad" && sType !== "card") {
          deductCashbox = false;
        }

        if (qty >= origQty) {
          await updateDoc(saleRef, {
            returned: true,
            return_qty: qty,
            return_date: returnDate,
            updated_at: Timestamp.now(),
          });
        } else {
          const remainingQty = origQty - qty;
          const ratio = qty / origQty;
          const remainingPaid = Math.max(0, Math.round((Number(s.paid_amount) || 0) * (1 - ratio)));
          const remainingDue = Math.max(0, Math.round((Number(s.due_amount) || 0) * (1 - ratio)));
          const remainingProfit = Math.round(profitPerUnit * remainingQty);

          await updateDoc(saleRef, {
            qty: remainingQty,
            profit: remainingProfit,
            paid_amount: remainingPaid,
            due_amount: remainingDue,
            return_qty: qty,
            updated_at: Timestamp.now(),
          });
        }
      }
    } catch (err) {
      console.warn("Could not update sale on return:", err);
    }
  }

  const createdAtTs = toFirestoreTimestamp(data.created_at || data.return_date);

  // 2. Insert return record
  const returnDoc = cleanFirestoreData({
    sale_id: data.sale_id || null,
    product_id: data.product_id || null,
    product_name: data.product_name || "Returned Item",
    qty,
    return_price: returnPrice,
    buy_price: Number(data.buy_price) || 0,
    profit_adjustment: profitAdj,
    return_date: returnDate,
    note: data.note || null,
    created_at: createdAtTs,
  });

  let returnId: string;
  if (data?.id) {
    returnId = String(data.id);
    await setDoc(doc(db, "returns", returnId), returnDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "returns"), returnDoc);
    returnId = docRef.id;
  }

  // 3. Restore product stock safely
  if (data.product_id) {
    try {
      await updateDoc(doc(db, "products", data.product_id), {
        stock: increment(qty),
      });
    } catch (err) {
      console.warn("Stock restore on return skipped:", err);
    }
  }

  // 4. Deduct refund amount from cashbox logs
  const refundTotal = (Number(data.refund_amount) || (returnPrice * qty)) || 0;
  if (deductCashbox && refundTotal > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount: refundTotal,
        note: `[পণ্য ফেরত রিফান্ড] ${data.product_name || "Returned Item"} ×${qty}`,
        ref_id: returnId,
        created_at: createdAtTs,
      });
    } catch (err) {
      console.warn("Cashbox deduction on return skipped:", err);
    }
  }

  return { success: true, id: returnId, ...returnDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeleteReturn(id: string) {
  await deleteDoc(doc(db, "returns", id));
  return { success: true, id };
}

// ── Reminders ────────────────────────────────────────────────────────────────
export async function fsGetReminders() {
  try {
    const colRef = collection(db, "reminders");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "reminders"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateReminder(data: any) {
  const docRef = await addDoc(collection(db, "reminders"), {
    title: data.title || "",
    due_date: data.due_date || new Date().toISOString().slice(0, 10),
    completed: false,
    logic_type: data.logic_type || "none",
    logic_config: data.logic_config || null,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsToggleReminder(id: string, data: any) {
  await updateDoc(doc(db, "reminders", id), {
    completed: Boolean(data?.completed),
  });
  return { success: true, id };
}

export async function fsDeleteReminder(id: string) {
  await deleteDoc(doc(db, "reminders", id));
  return { success: true, id };
}

// ── License Verification & User Management ───────────────────────────────────
export async function fsGenerateOwnerLicenseKey(data: { durationDays?: number; employeeLimit?: number; note?: string; businessName?: string }) {
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
                     Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
                     Math.random().toString(36).substring(2, 6).toUpperCase();
  const key = `CW-${randomPart}`;
  const now = new Date().toISOString();

  await setDoc(doc(db, "licenses", key), {
    key,
    type: "owner",
    status: "unused",
    duration_days: Number(data.durationDays) || 365,
    employee_limit: Number(data.employeeLimit) || 5,
    business_name: data.businessName || "",
    note: data.note || "",
    created_at: now,
  });

  return { success: true, key };
}

export async function fsGenerateEmployeeLicenseKey(data: {
  employeeName: string;
  allowedPages?: string[];
  allowedKpis?: string[];
  permissions?: any;
  note?: string;
}) {
  const user = fsGetCurrentUser();
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
                     Math.random().toString(36).substring(2, 6).toUpperCase() + "-" +
                     Math.random().toString(36).substring(2, 6).toUpperCase();
  const key = `EMP-${randomPart}`;
  const now = new Date().toISOString();

  await setDoc(doc(db, "licenses", key), {
    key,
    type: "employee",
    status: "unused",
    owner_uid: user?.id || user?.email || "owner",
    business_name: user?.business_name || "Classic World",
    employee_name: data.employeeName || "Employee",
    allowed_pages: data.allowedPages || [
      "/dashboard",
      "/sales",
      "/sales/today",
      "/products",
      "/invoices",
      "/labels",
      "/printer-settings",
      "/cash-management",
      "/expenses",
      "/employee-hub",
      "/employees",
    ],
    allowed_kpis: data.allowedKpis || ["sell_kpi", "total_stock", "today_sales"],
    permissions: data.permissions || {
      dashboard: true,
      sales: true,
      products: true,
      parties: false,
      purchases: false,
      expenses: true,
      reports: false,
      settings: false,
      cashbox: true,
    },
    note: data.note || "",
    created_at: now,
  });

  return { success: true, key };
}

export async function fsListLicenses(type?: "owner" | "employee") {
  try {
    const snap = await getDocs(collection(db, "licenses"));
    const all = snap.docs.map(docToData);
    if (type) {
      return all.filter((l: any) => l.type === type);
    }
    return all;
  } catch (err) {
    return [];
  }
}

export async function fsRevokeLicense(key: string) {
  try {
    await updateDoc(doc(db, "licenses", key), {
      status: "revoked",
      revoked_at: new Date().toISOString(),
    });
    return { success: true, key };
  } catch (err: any) {
    throw new Error(err.message || "Failed to revoke license");
  }
}

export async function fsValidateAndActivateLicense(licenseKey: string, userUid?: string, userEmail?: string) {
  const cleanKey = (licenseKey || "").trim().toUpperCase();
  if (!cleanKey) {
    throw new Error("License key cannot be empty.");
  }

  let licenseData: any = null;
  try {
    const licSnap = await getDoc(doc(db, "licenses", cleanKey));
    if (licSnap.exists()) {
      licenseData = licSnap.data();
    }
  } catch (_) {}

  if (licenseData) {
    if (licenseData.status === "revoked") {
      throw new Error("This license key has been revoked.");
    }
    if (licenseData.status === "active" && licenseData.used_by && licenseData.used_by !== (userUid || userEmail)) {
      throw new Error("This license key has already been activated by another account.");
    }
  }

  const isEmployeeKey = cleanKey.startsWith("EMP-") || (licenseData && licenseData.type === "employee");
  const role = isEmployeeKey ? "employee" : "owner";

  const defaultOwnerPerms = {
    dashboard: true,
    sales: true,
    products: true,
    parties: true,
    purchases: true,
    expenses: true,
    reports: true,
    settings: true,
    cashbox: true,
  };

  const defaultEmployeePerms = {
    dashboard: true,
    sales: true,
    products: true,
    parties: false,
    purchases: false,
    expenses: false,
    reports: false,
    settings: false,
    cashbox: false,
  };

  const permissions = isEmployeeKey
    ? (licenseData?.permissions || defaultEmployeePerms)
    : defaultOwnerPerms;

  const allowedPages = licenseData?.allowed_pages || (isEmployeeKey ? [
    "/dashboard",
    "/sales",
    "/sales/today",
    "/products",
    "/invoices",
    "/labels",
    "/printer-settings",
    "/cash-management",
    "/expenses",
    "/employee-hub",
    "/employees",
  ] : undefined);
  const allowedKpis = licenseData?.allowed_kpis || (isEmployeeKey ? ["sell_kpi", "total_stock", "today_sales"] : undefined);

  // Update user document in Firestore
  if (userUid) {
    try {
      const userRef = doc(db, "users", userUid);
      await setDoc(userRef, {
        activated: true,
        license_key: cleanKey,
        role: role,
        permissions: permissions,
        allowedPages: allowedPages,
        allowedKpis: allowedKpis,
        business_name: licenseData?.business_name || "Classic World",
        owner_id: licenseData?.owner_uid || (role === "owner" ? userUid : undefined),
        email: userEmail || "",
        activated_at: Timestamp.now(),
      }, { merge: true });
    } catch (err) {
      console.warn("Firestore user license activation update warning:", err);
    }
  }

  // Mark license as used/active
  try {
    await setDoc(doc(db, "licenses", cleanKey), {
      key: cleanKey,
      status: "active",
      type: role,
      used_by: userUid || userEmail || "user",
      activated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (_) {}

  return {
    success: true,
    activated: true,
    licenseKey: cleanKey,
    role,
    permissions,
    allowedPages,
    allowedKpis,
  };
}

export async function fsGetUserDoc(userUid: string) {
  try {
    const userSnap = await getDoc(doc(db, "users", userUid));
    if (userSnap.exists()) {
      return userSnap.data();
    }
  } catch (err) {
    console.warn("fsGetUserDoc error:", err);
  }
  return null;
}

// ── Bank & Loans ─────────────────────────────────────────────────────────────
export async function fsGetBankAccounts() {
  try {
    const snap = await getDocs(collection(db, "bank_accounts"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateBankAccount(data: any) {
  const docRef = await addDoc(collection(db, "bank_accounts"), {
    bank_name: data.bank_name || "",
    account_name: data.account_name || "",
    account_number: data.account_number || "",
    branch: data.branch || null,
    balance: Number(data.balance) || 0,
    note: data.note || null,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsUpdateBankAccount(id: string, data: any) {
  await updateDoc(doc(db, "bank_accounts", id), data);
  return { success: true, id };
}

export async function fsDeleteBankAccount(id: string) {
  await fsMoveToRecycleBin("bank_accounts", id, "Bank Account #" + id);
  await deleteDoc(doc(db, "bank_accounts", id));
  return { success: true, id };
}

export async function fsCreateBankTransaction(data: any) {
  const amount = Number(data.amount) || 0;
  const type = data.type || "deposit";
  const accRef = doc(db, "bank_accounts", data.account_id);
  const delta = type === "deposit" ? amount : -amount;
  await updateDoc(accRef, { balance: increment(delta) });

  const txRef = await addDoc(collection(db, "bank_transactions"), {
    account_id: data.account_id,
    type,
    amount,
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  if (data.sync_cashbox !== false && amount > 0) {
    const cashboxKind = type === "deposit" ? "withdraw" : "deposit";
    const noteText = type === "deposit"
      ? `Bank Deposit: ${data.note || "Transfer to bank"}`
      : `Bank Withdrawal: ${data.note || "Cash from bank"}`;
    await addDoc(collection(db, "cashbox_logs"), {
      kind: cashboxKind,
      amount,
      note: noteText,
      ref_id: txRef.id,
      created_at: Timestamp.now(),
    });
  }

  return { success: true, id: txRef.id };
}

export async function fsGetBankLoans() {
  try {
    const snap = await getDocs(collection(db, "bank_loans"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateBankLoan(data: any) {
  const principal = Number(data.principal_amount) || 0;
  const repayable = Number(data.total_repayable) || principal;
  const hasInstallments = data.has_installments !== false && Number(data.total_installments) > 0;
  const installments = hasInstallments ? Number(data.total_installments) : 0;
  const installmentAmount = hasInstallments ? (Number(data.installment_amount) || repayable / installments) : 0;
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(repayable) || repayable <= 0 || (hasInstallments && (!Number.isInteger(installments) || installments <= 0 || !Number.isFinite(installmentAmount) || installmentAmount <= 0))) throw new Error("Enter valid loan and installment amounts");

  const docRef = await addDoc(collection(db, "bank_loans"), {
    bank_name: data.bank_name || "",
    loan_title: data.loan_title || "Business Loan",
    principal_amount: principal,
    total_repayable: repayable,
    total_installments: installments,
    has_installments: hasInstallments,
    installment_amount: installmentAmount,
    paid_amount: 0,
    paid_installments: 0,
    status: "active",
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  if (data.receive_to_cashbox && principal > 0) {
    await addDoc(collection(db, "cashbox_logs"), {
      kind: "deposit",
      amount: principal,
      note: `Bank Loan Disbursement: ${data.bank_name} (${data.loan_title})`,
      ref_id: docRef.id,
      created_at: Timestamp.now(),
    });
  }

  return { success: true, id: docRef.id };
}

export async function fsPayBankLoanInstallment(data: any) {
  const amount = Number(data.amount) || 0;
  const loanRef = doc(db, "bank_loans", data.loan_id);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error("Loan not found");
  const loan = loanSnap.data();

  const newPaidAmount = (Number(loan.paid_amount) || 0) + amount;
  const newPaidInstallments = (Number(loan.paid_installments) || 0) + 1;
  const isFullyPaid = newPaidAmount >= Number(loan.total_repayable);

  await updateDoc(loanRef, {
    paid_amount: newPaidAmount,
    paid_installments: newPaidInstallments,
    status: isFullyPaid ? "completed" : "active",
  });

  const pmtRef = await addDoc(collection(db, "bank_loan_payments"), {
    loan_id: data.loan_id,
    amount,
    payment_method: data.payment_method || "cashbox",
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  // Always cut installment money from CASHBOX
  await addDoc(collection(db, "cashbox_logs"), {
    kind: "withdraw",
    amount,
    note: `Bank Loan Installment: ${loan.bank_name} (${loan.loan_title}) - ${data.note || `Installment #${newPaidInstallments}`}`,
    ref_id: pmtRef.id,
    created_at: Timestamp.now(),
  });

  return { success: true, id: pmtRef.id, isFullyPaid, remaining: Math.max(Number(loan.total_repayable) - newPaidAmount, 0) };
}

export async function fsDeleteBankLoan(id: string) {
  try {
    const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      await deleteDoc(doc(db, "cashbox_logs", d.id));
    }
  } catch (_) {}
  await deleteDoc(doc(db, "bank_loans", id));
  return { success: true, id };
}

// ── Data Resets ──────────────────────────────────────────────────────────────
export async function fsEmptyCashbox() {
  const snap = await getDocs(collection(db, "cashbox_logs"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "cashbox_logs", d.id));
  }
  return { success: true };
}

export async function fsResetProducts() {
  const snap = await getDocs(collection(db, "products"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "products", d.id));
  }
  return { success: true };
}

export async function fsResetSales() {
  const snap = await getDocs(collection(db, "sales"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "sales", d.id));
  }
  return { success: true };
}

export async function fsResetPurchases() {
  const snap = await getDocs(collection(db, "purchases"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "purchases", d.id));
  }
  return { success: true };
}

export async function fsResetSomiti() {
  const snap = await getDocs(collection(db, "somiti"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "somiti", d.id));
  }
  return { success: true };
}

export async function fsResetExpenses() {
  const snap = await getDocs(collection(db, "expenses"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "expenses", d.id));
  }
  return { success: true };
}

export async function fsResetParties() {
  const snap = await getDocs(collection(db, "parties"));
  for (const d of snap.docs) {
    await deleteDoc(doc(db, "parties", d.id));
  }
  const custSnap = await getDocs(collection(db, "customers"));
  for (const d of custSnap.docs) {
    await deleteDoc(doc(db, "customers", d.id));
  }
  return { success: true };
}

export async function fsResetAllData() {
  await Promise.all([
    fsEmptyCashbox(),
    fsResetProducts(),
    fsResetSales(),
    fsResetPurchases(),
    fsResetSomiti(),
    fsResetExpenses(),
    fsResetParties(),
  ]);
  return { success: true };
}

export async function fsVerifyOwnerPassword(args?: { password?: string; googleVerifiedEmail?: string }) {
  const user = fsGetCurrentUser();
  if (!user) throw new Error("User not found or not logged in");

  const hasAccess = user.role === "owner" || user.role === "superadmin" || user.permissions?.danger_zone === true;
  if (!hasAccess) {
    throw new Error("Access denied: Danger Zone permissions required.");
  }

  if (args?.googleVerifiedEmail) {
    const emailA = args.googleVerifiedEmail.trim().toLowerCase();
    const emailB = (user.email || auth.currentUser?.email || "").trim().toLowerCase();
    if (emailA === emailB || !emailB || auth.currentUser) {
      return { success: true, method: "google" };
    }
    throw new Error(`Google account mismatch. Please sign in with ${user.email}`);
  }

  if (args?.password) {
    const pwd = args.password.trim();
    if (user.password && user.password === pwd) return { success: true, method: "password" };
    if (user.plain_password && user.plain_password === pwd) return { success: true, method: "password" };

    // Also check Firestore users collection in case password wasn't cached in localStorage
    let fsUser: any = null;
    try {
      if (user.id) {
        const snap = await getDoc(doc(db, "users", user.id));
        if (snap.exists()) fsUser = snap.data();
      }
      if (!fsUser && user.email) {
        const q = query(collection(db, "users"), where("email", "==", user.email.toLowerCase().trim()), limit(1));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) fsUser = qSnap.docs[0].data();
      }
    } catch (_) {}

    if (fsUser) {
      if (fsUser.password === pwd || fsUser.plain_password === pwd) {
        return { success: true, method: "password" };
      }
    }

    // Also try verifying via Firebase Auth if user has an email
    if (user.email && user.email.includes("@")) {
      try {
        const { signInWithEmailAndPassword } = await import("firebase/auth");
        await signInWithEmailAndPassword(auth, user.email.toLowerCase().trim(), pwd);
        return { success: true, method: "password" };
      } catch (_) {}
    }

    if (!user.password && !user.plain_password && !fsUser?.password && !fsUser?.plain_password) {
      throw new Error("No password set for this Google account. Please use 'Continue with Google' to unlock Danger Zone.");
    }
    throw new Error("Incorrect password");
  }

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return { success: true, method: "google" };
  }

  throw new Error("Password or Google re-authentication is required");
}

export async function fsChangeMyPassword(args: { currentPassword?: string; newPassword: string }) {
  const user = fsGetCurrentUser();
  if (!user) throw new Error("Not logged in");

  const cleanNew = (args.newPassword || "").trim();
  if (!cleanNew || cleanNew.length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }

  // Look up Firestore user doc to verify currentPassword if set
  let fsUserDocId = user.id;
  let fsUserData: any = null;
  try {
    if (user.id) {
      const snap = await getDoc(doc(db, "users", user.id));
      if (snap.exists()) {
        fsUserData = snap.data();
        fsUserDocId = snap.id;
      }
    }
    if (!fsUserData && user.email) {
      const q = query(collection(db, "users"), where("email", "==", user.email.toLowerCase().trim()), limit(1));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        fsUserData = qSnap.docs[0].data();
        fsUserDocId = qSnap.docs[0].id;
      }
    }
  } catch (_) {}

  const storedPwd = user.password || user.plain_password || fsUserData?.password || fsUserData?.plain_password;
  if (args.currentPassword && storedPwd) {
    const cleanCurr = args.currentPassword.trim();
    const matches =
      user.password === cleanCurr ||
      user.plain_password === cleanCurr ||
      fsUserData?.password === cleanCurr ||
      fsUserData?.plain_password === cleanCurr;
    if (!matches) throw new Error("Current password is incorrect");
  }

  const updated = {
    ...(fsUserData || {}),
    ...user,
    password: cleanNew,
    plain_password: cleanNew,
  };

  try {
    if (fsUserDocId) {
      await setDoc(doc(db, "users", fsUserDocId), { password: cleanNew, plain_password: cleanNew }, { merge: true });
    }
  } catch (_) {}

  // Also update Firebase Auth password if signed in
  try {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      const { updatePassword } = await import("firebase/auth");
      await updatePassword(auth.currentUser, cleanNew);
    }
  } catch (_) {}

  if (typeof window !== "undefined") {
    localStorage.setItem("user", JSON.stringify(updated));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(updated));
    localStorage.setItem("cw-auth-profile", JSON.stringify(updated));
  }
  return { success: true };
}

export function fsGetCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      localStorage.getItem("cw_active_employee_session") ||
      localStorage.getItem("user") ||
      localStorage.getItem("classicworld_auth_profile") ||
      localStorage.getItem("cw-auth-profile") ||
      localStorage.getItem("auth_profile");
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const authUser = auth.currentUser;
  if (authUser && !authUser.isAnonymous) {
    const isRootDefault = authUser.email?.toLowerCase().trim() === "classicworld@gmail.com";
    return {
      id: authUser.uid,
      owner_id: authUser.uid,
      email: authUser.email || `${authUser.uid}@classicworld.com`,
      full_name: authUser.displayName || "Store Owner",
      role: "owner",
      activated: true,
      is_isolated_tenant: !isRootDefault,
      business_id: isRootDefault ? "classic-world-default" : `biz_${authUser.uid}`,
      business_name: isRootDefault ? "Classic World" : (authUser.displayName ? `${authUser.displayName}'s Shop` : "My Business"),
      logo_url: authUser.photoURL || "",
      avatar_url: authUser.photoURL || undefined,
    };
  }
  return null;
}

export async function fsGetMe() {
  const user = fsGetCurrentUser();
  if (!user) {
    const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) return { user: null };
  }
  return { user };
}

export async function fsGetBusinessSettings(): Promise<any> {
  const scope = getTenantScope();
  const user = scope.user;
  const bizDocId = getBusinessDocIdForScope(
    scope.rootOwnerId,
    scope.activeProfile,
    scope.isIsolatedTenant,
    user?.business_id
  );
  let bizData: any = null;
  try {
    const docSnap = await getDoc(doc(db, "businesses", bizDocId));
    if (docSnap.exists()) {
      bizData = docSnap.data();
    }
  } catch (_) {}

  const isCustomOrIsolated = scope.activeProfile !== "default" || scope.isIsolatedTenant;
  const activeProfObj =
    scope.activeProfile !== "default" && Array.isArray(user?.profiles)
      ? user.profiles.find((p: any) => p.id === scope.activeProfile)
      : null;

  const resolvedName =
    bizData?.name ||
    (scope.activeProfile !== "default" ? activeProfObj?.name : null) ||
    user?.business_name ||
    (isCustomOrIsolated ? "My Business" : "Classic World");

  const resolvedLogo =
    bizData?.logo_url ??
    (scope.activeProfile !== "default" ? "" : user?.logo_url) ??
    (isCustomOrIsolated ? "" : "/logo.png");

  return {
    ...(bizData || {}),
    business: {
      ...(bizData || {}),
      id: bizData?.id || (scope.activeProfile !== "default" ? bizDocId : user?.business_id) || "classic-world-default",
      name: resolvedName,
      shop_name: resolvedName,
      logo_url: resolvedLogo,
      address: bizData?.address || user?.business_address || "Dhaka, Bangladesh",
      phone: bizData?.phone || bizData?.phone_numbers || user?.business_phone_numbers || "01700000000",
      phone_numbers: bizData?.phone_numbers || user?.business_phone_numbers || "01700000000",
      emails: bizData?.emails || user?.business_emails || user?.email || "info@classicworld.com",
      invoice_font_size: bizData?.invoice_font_size || user?.invoice_font_size || "22px",
      invoice_scale: bizData?.invoice_scale || user?.invoice_scale || "100%",
      invoice_line_spacing: bizData?.invoice_line_spacing || user?.invoice_line_spacing || "6px",
      invoice_terms: bizData?.invoice_terms || user?.invoice_terms || "",
      status: bizData?.status || user?.status || "active",
      sms_credits: bizData?.sms_credits ?? user?.sms_credits ?? 100,
      kpi_config: bizData?.kpi_config || null,
      employee_accounts: bizData?.employee_accounts || [],
      owner_pin: bizData?.owner_pin || null,
    },
    role: user?.role || "owner",
    permissions: user?.permissions || {
      dashboard: true,
      products: true,
      sales: true,
      parties: true,
      purchases: true,
      expenses: true,
      cashbox: true,
      settings: true,
      reports: true,
      danger_zone: true,
    },
    employees: [],
    invitations: [],
  };
}

export async function fsUpdateBusinessSettings(data: any) {
  const scope = getTenantScope();
  const user = scope.user;
  const bizDocId = getBusinessDocIdForScope(
    scope.rootOwnerId,
    scope.activeProfile,
    scope.isIsolatedTenant,
    user?.business_id
  );
  try {
    await setDoc(
      doc(db, "businesses", bizDocId),
      {
        ...data,
        owner_id: scope.effectiveOwnerId || scope.rootOwnerId || "classic-world-default",
        profile_id: scope.activeProfile,
      },
      { merge: true }
    );
  } catch (_) {}
  // Cloud persistence sync
  if (typeof window !== "undefined") {
    if (data.kpi_config) localStorage.setItem("hz_kpi_config", JSON.stringify(data.kpi_config));
    if (data.employee_accounts) localStorage.setItem("cw_employee_accounts", JSON.stringify(data.employee_accounts));
    if (data.owner_pin) localStorage.setItem("app_pin_code_val", String(data.owner_pin));
  }
  if (user) {
    const updatedProfiles = Array.isArray(user.profiles)
      ? user.profiles.map((p: any) =>
          p.id === scope.activeProfile && data.name ? { ...p, name: data.name } : p
        )
      : user.profiles;
    const updatedUser = {
      ...user,
      ...data,
      business_name: data.name || user.business_name,
      logo_url: data.logo_url !== undefined ? data.logo_url : user.logo_url,
      profiles: updatedProfiles,
    };
    try {
      if (scope.rootOwnerId) {
        const userUpdates: Record<string, any> = { profiles: updatedProfiles };
        if (scope.activeProfile === "default") {
          if (data.name) userUpdates.business_name = data.name;
          if (data.logo_url !== undefined) userUpdates.logo_url = data.logo_url;
        }
        await setDoc(doc(db, "users", scope.rootOwnerId), userUpdates, { merge: true });
      }
    } catch (_) {}
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(updatedUser));
      localStorage.setItem("auth_profile", JSON.stringify(updatedUser));
      localStorage.setItem("classicworld_auth_profile", JSON.stringify(updatedUser));
      localStorage.setItem("cw-auth-profile", JSON.stringify(updatedUser));
    }
  }
  return { success: true };
}

export async function fsCreateProfile(data: { name: string }) {
  const scope = getTenantScope();
  const user = scope.user;
  if (!user) throw new Error("Not logged in");
  const cleanName = (data?.name || "").trim();
  if (!cleanName) throw new Error("Profile name is required");

  const profileId = "prof_" + Math.random().toString(36).substring(2, 9);
  const newProfile = {
    id: profileId,
    name: cleanName,
    created_at: new Date().toISOString(),
  };

  const existingProfiles =
    Array.isArray(user.profiles) && user.profiles.length > 0
      ? user.profiles
      : [{ id: "default", name: "Default", created_at: new Date().toISOString() }];
  const updatedProfiles = [...existingProfiles, newProfile];
  const rootOwnerId = scope.rootOwnerId || user.id;
  const bizDocId = getBusinessDocIdForScope(rootOwnerId, profileId, scope.isIsolatedTenant, user.business_id);

  try {
    await setDoc(
      doc(db, "businesses", bizDocId),
      {
        id: bizDocId,
        owner_id: `${rootOwnerId}:${profileId}`,
        profile_id: profileId,
        name: cleanName,
        logo_url: "",
        status: "active",
        sms_credits: 100,
        created_at: new Date().toISOString(),
      },
      { merge: true }
    );
    await setDoc(
      doc(db, "users", rootOwnerId),
      {
        profiles: updatedProfiles,
        activeProfile: profileId,
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("fsCreateProfile Firestore sync warning:", e);
  }

  const updatedUser = {
    ...user,
    profiles: updatedProfiles,
    activeProfile: profileId,
    business_id: bizDocId,
    business_name: cleanName,
    logo_url: "",
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("active_profile", profileId);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    localStorage.setItem("auth_profile", JSON.stringify(updatedUser));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(updatedUser));
    localStorage.setItem("cw-auth-profile", JSON.stringify(updatedUser));
  }

  return { success: true, profileId, profiles: updatedProfiles, user: updatedUser };
}

export async function fsSwitchProfile(data: { profileId: string }) {
  const scope = getTenantScope();
  const user = scope.user;
  if (!user) throw new Error("Not logged in");
  const targetId = data?.profileId || "default";
  const rootOwnerId = scope.rootOwnerId || user.id;
  const profiles =
    Array.isArray(user.profiles) && user.profiles.length > 0
      ? user.profiles
      : [{ id: "default", name: "Default", created_at: new Date().toISOString() }];
  const targetProf = profiles.find((p: any) => p.id === targetId);

  const bizDocId = getBusinessDocIdForScope(rootOwnerId, targetId, scope.isIsolatedTenant, user.root_business_id || user.business_id);
  let bizData: any = null;
  try {
    const snap = await getDoc(doc(db, "businesses", bizDocId));
    if (snap.exists()) {
      bizData = snap.data();
    } else if (targetId !== "default") {
      bizData = {
        id: bizDocId,
        owner_id: `${rootOwnerId}:${targetId}`,
        profile_id: targetId,
        name: targetProf?.name || "New Business",
        logo_url: "",
        status: "active",
      };
      await setDoc(doc(db, "businesses", bizDocId), bizData, { merge: true });
    }
  } catch (_) {}

  let rootUserDoc: any = null;
  if (targetId === "default") {
    try {
      const uSnap = await getDoc(doc(db, "users", rootOwnerId));
      if (uSnap.exists()) rootUserDoc = uSnap.data();
    } catch (_) {}
  }

  const isCustomOrIsolated = targetId !== "default" || scope.isIsolatedTenant;
  const resolvedBusinessName =
    targetId !== "default"
      ? bizData?.name || targetProf?.name || "My Business"
      : bizData?.name || rootUserDoc?.business_name || (scope.isIsolatedTenant ? "My Business" : "Classic World");

  const resolvedLogoUrl =
    targetId !== "default"
      ? bizData?.logo_url || ""
      : bizData?.logo_url ?? rootUserDoc?.logo_url ?? (isCustomOrIsolated ? "" : "/logo.png");

  try {
    await setDoc(doc(db, "users", rootOwnerId), { activeProfile: targetId }, { merge: true });
  } catch (_) {}

  const updatedUser = {
    ...user,
    activeProfile: targetId,
    business_id: targetId === "default" ? (rootUserDoc?.business_id || (scope.isIsolatedTenant ? bizDocId : "classic-world-default")) : bizDocId,
    business_name: resolvedBusinessName,
    logo_url: resolvedLogoUrl,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("active_profile", targetId);
    localStorage.setItem("user", JSON.stringify(updatedUser));
    localStorage.setItem("auth_profile", JSON.stringify(updatedUser));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(updatedUser));
    localStorage.setItem("cw-auth-profile", JSON.stringify(updatedUser));
  }

  return { success: true, activeProfile: targetId, user: updatedUser };
}

export async function fsImportProfileModule(data: { sourceProfileId: string; module: string }) {
  const scope = getTenantScope();
  if (!scope.user) throw new Error("Not logged in");
  const rootOwnerId = scope.rootOwnerId || scope.user.id;
  const srcProf = data?.sourceProfileId || "default";
  const dstProf = scope.activeProfile || "default";
  if (srcProf === dstProf) throw new Error("Source and destination profiles are the same");

  const srcOwner = srcProf === "default" ? (scope.isIsolatedTenant ? rootOwnerId : null) : `${rootOwnerId}:${srcProf}`;
  const dstOwner = dstProf === "default" ? (scope.isIsolatedTenant ? rootOwnerId : null) : `${rootOwnerId}:${dstProf}`;

  const moduleCollections: Record<string, string[]> = {
    products: ["products"],
    customers: ["customers"],
    parties: ["parties", "party_receivables", "party_payables"],
    somiti: ["somiti"],
    employees: ["employees"],
    bank: ["bank_accounts", "bank_loans"],
  };
  const cols = moduleCollections[data.module] || [];
  let importedCount = 0;

  for (const colName of cols) {
    const snap = await fbGetDocs(collection(db, colName));
    for (const d of snap.docs) {
      const item = d.data();
      const itemOwner = item.owner_id || item.owner_uid || null;
      const itemProf = item.profile_id || "default";
      const matchesSrc =
        srcProf !== "default"
          ? itemOwner === srcOwner || (itemProf === srcProf && (!itemOwner || itemOwner === rootOwnerId))
          : scope.isIsolatedTenant
          ? itemOwner === rootOwnerId && itemProf === "default"
          : !itemOwner || itemOwner === rootOwnerId || itemOwner === "classic-world-default";
      if (matchesSrc) {
        const cloned: Record<string, any> = {
          ...item,
          owner_id: dstOwner || rootOwnerId,
          profile_id: dstProf,
        };
        if (scope.isIsolatedTenant) cloned.is_isolated_tenant = true;
        await fbAddDoc(collection(db, colName), cloned);
        importedCount++;
      }
    }
  }

  return { success: true, importedCount };
}

export async function fsGetActiveAdminPopups() {
  try {
    const snap = await getDocs(collection(db, "admin_popups"));
    const list = snap.docs.map(docToData);
    return list.filter((p: any) => p.active !== false);
  } catch (_) {
    return [];
  }
}

export async function fsDismissAdminPopup(popupId: string) {
  return { success: true };
}

export async function fsFirebaseAuthSync(data: { email: string; fullName?: string; displayName?: string; photoUrl?: string; firebaseUid?: string; uid?: string }) {
  const cleanEmail = (data.email || "").toLowerCase().trim();
  const resolvedUid = data.firebaseUid || data.uid;
  const resolvedName = data.fullName || data.displayName;
  const userId = resolvedUid || crypto.randomUUID();

  let existingUser: any = null;
  try {
    if (resolvedUid) {
      const userDocRef = doc(db, "users", resolvedUid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        existingUser = { id: userDocSnap.id, ...userDocSnap.data() };
      }
    }
    if (!existingUser && cleanEmail) {
      const q = query(collection(db, "users"), where("email", "==", cleanEmail), limit(1));
      const qSnap = await fbGetDocs(q);
      if (!qSnap.empty) {
        existingUser = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
      }
    }
  } catch (e) {
    console.warn("Error querying Firestore for existing user:", e);
  }

  // Check if email or phone is registered in employees collection (only if not already an owner)
  let matchedEmp: any = null;
  if (!existingUser || existingUser.role === "employee") {
    try {
      const empQ = query(collection(db, "employees"), where("email", "==", cleanEmail), limit(1));
      const empSnap = await fbGetDocs(empQ);
      if (!empSnap.empty) {
        matchedEmp = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
      }
    } catch (_) {}
  }

  const isLegacyRoot = cleanEmail === "classicworld@gmail.com" || existingUser?.id === "classic-world-default";
  const isIsolated = !isLegacyRoot && (!matchedEmp || Boolean(matchedEmp.is_isolated_tenant));
  const isNewOwnerAccount = !existingUser && !matchedEmp;

  const activeProfile = existingUser?.activeProfile || "default";
  const rootOwnerId = existingUser?.id || userId;
  const bizDocId = getBusinessDocIdForScope(rootOwnerId, activeProfile, isIsolated, existingUser?.business_id);

  let bizSettings: any = null;
  try {
    const bizSnap = await getDoc(doc(db, "businesses", bizDocId));
    if (bizSnap.exists()) {
      bizSettings = bizSnap.data();
    }
  } catch (_) {}

  const activeProfObj =
    activeProfile !== "default" && Array.isArray(existingUser?.profiles)
      ? existingUser.profiles.find((p: any) => p.id === activeProfile)
      : null;

  const defaultShopName = resolvedName ? `${resolvedName}'s Shop` : `${cleanEmail.split("@")[0]}'s Shop`;

  const userObj = existingUser
    ? {
        ...existingUser,
        id: existingUser.id || userId,
        owner_id: existingUser.owner_id || existingUser.id || userId,
        is_isolated_tenant: isIsolated,
        email: cleanEmail,
        full_name: existingUser.full_name || existingUser.fullName || resolvedName || cleanEmail.split("@")[0],
        role: existingUser.role || "owner",
        business_id:
          activeProfile !== "default"
            ? bizDocId
            : existingUser.business_id || (isIsolated ? `biz_${rootOwnerId}` : "classic-world-default"),
        business_name:
          activeProfile !== "default"
            ? bizSettings?.name || activeProfObj?.name || "My Business"
            : bizSettings?.name || existingUser.business_name || existingUser.businessName || (isIsolated ? defaultShopName : "Classic World"),
        logo_url:
          activeProfile !== "default"
            ? bizSettings?.logo_url || ""
            : bizSettings?.logo_url ?? existingUser.logo_url ?? (isIsolated ? "" : "/logo.png"),
        avatar_url: data.photoUrl || existingUser.avatar_url || undefined,
        firebase_uid: resolvedUid || existingUser.firebase_uid,
        activated: true,
        status: existingUser.status || "active",
        profiles: existingUser.profiles || [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
        activeProfile,
      }
    : {
        id: userId,
        owner_id: matchedEmp ? (matchedEmp.owner_id || matchedEmp.owner_uid || "classic-world-default") : userId,
        is_isolated_tenant: !matchedEmp ? true : Boolean(matchedEmp.is_isolated_tenant),
        email: cleanEmail,
        full_name: resolvedName || cleanEmail.split("@")[0],
        role: matchedEmp ? "employee" : "owner",
        employee_id: matchedEmp?.id || undefined,
        permissions: matchedEmp?.permissions || undefined,
        activated: true,
        business_id: matchedEmp ? (matchedEmp.business_id || "classic-world-default") : `biz_${userId}`,
        business_name: matchedEmp ? (bizSettings?.name || "Classic World") : defaultShopName,
        logo_url: matchedEmp ? (bizSettings?.logo_url || "/logo.png") : "",
        avatar_url: data.photoUrl || undefined,
        firebase_uid: resolvedUid,
        status: "active",
        sms_credits: 100,
        profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
        activeProfile: "default",
      };

  try {
    await setDoc(doc(db, "users", userObj.id), userObj, { merge: true });
    if (isNewOwnerAccount) {
      await setDoc(
        doc(db, "businesses", `biz_${userObj.id}`),
        {
          id: `biz_${userObj.id}`,
          owner_id: userObj.id,
          profile_id: "default",
          name: userObj.business_name,
          logo_url: "",
          status: "active",
          sms_credits: 100,
          created_at: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn("Error saving user doc:", e);
  }

  let finalToken = `token_${userObj.id}`;
  if (typeof window !== "undefined") {
    const existingToken = localStorage.getItem("auth_token");
    if (existingToken && existingToken.includes(".")) {
      finalToken = existingToken;
    }
    clearAuthProfile();
    clearQueryCache();
    sessionStorage.removeItem("app_pin_unlocked");
    if (userObj.role !== "employee") {
      localStorage.removeItem("cw_active_employee_session");
      localStorage.removeItem("cw_active_session_role");
    }
    localStorage.setItem("user", JSON.stringify(userObj));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userObj));
    localStorage.setItem("cw-auth-profile", JSON.stringify(userObj));
    localStorage.setItem("auth_token", finalToken);
    localStorage.setItem("active_profile", userObj.activeProfile || "default");
  }

  return { user: userObj, token: finalToken };
}

export async function fsLogin(data: { identifier?: string; email?: string; phone?: string; password?: string }) {
  const ident = (data.identifier || data.email || data.phone || "").trim().toLowerCase();
  const pwd = (data.password || "").trim();
  if (!ident || !pwd) {
    throw new Error("Please enter mobile/email and password");
  }

  const cleanDigits = ident.replace(/[^0-9]/g, "");
  let userDoc: any = null;
  try {
    const qEmail = query(collection(db, "users"), where("email", "==", ident), limit(1));
    const snapEmail = await fbGetDocs(qEmail);
    if (!snapEmail.empty) {
      userDoc = { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() };
    } else {
      const qPhone = query(collection(db, "users"), where("phone", "==", ident), limit(1));
      const snapPhone = await fbGetDocs(qPhone);
      if (!snapPhone.empty) {
        userDoc = { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() };
      } else if (cleanDigits.length >= 10) {
        const localPhone = cleanDigits.startsWith("880") ? cleanDigits.slice(2) : cleanDigits;
        const qLocalPhone = query(collection(db, "users"), where("phone", "==", localPhone), limit(1));
        const snapLocalPhone = await fbGetDocs(qLocalPhone);
        if (!snapLocalPhone.empty) {
          userDoc = { id: snapLocalPhone.docs[0].id, ...snapLocalPhone.docs[0].data() };
        } else {
          const synthEmail = `${localPhone}@classicworld.com`;
          const qSynth = query(collection(db, "users"), where("email", "==", synthEmail), limit(1));
          const snapSynth = await fbGetDocs(qSynth);
          if (!snapSynth.empty) {
            userDoc = { id: snapSynth.docs[0].id, ...snapSynth.docs[0].data() };
          }
        }
      }
    }
  } catch (e) {
    console.warn("Login Firestore query error:", e);
  }

  // Check if this is an employee trying to login via main login
  if (!userDoc) {
    try {
      const empRes = await fsEmployeeLogin({ username: ident, password: pwd });
      if (empRes && empRes.user) {
        return empRes;
      }
    } catch (_) {}
  }

  if (!userDoc) {
    const current = fsGetCurrentUser();
    if (current && (current.email === ident || (current as any).phone === ident)) {
      userDoc = current;
    }
  }

  const fbVerified =
    !!auth.currentUser &&
    !auth.currentUser.isAnonymous &&
    auth.currentUser.email?.toLowerCase().trim() === ident;

  if (!userDoc) {
    if (!fbVerified) {
      throw new Error("Invalid email/phone number or password");
    }
    const newId = auth.currentUser?.uid || crypto.randomUUID();
    const displayName = auth.currentUser?.displayName || ident.split("@")[0];
    const shopName = `${displayName}'s Shop`;
    userDoc = {
      id: newId,
      owner_id: newId,
      is_isolated_tenant: true,
      email: ident.includes("@") ? ident : `${ident}@classicworld.com`,
      phone: !ident.includes("@") ? ident : undefined,
      full_name: displayName,
      password: pwd,
      plain_password: pwd,
      role: "owner",
      activated: true,
      business_id: `biz_${newId}`,
      business_name: shopName,
      logo_url: "",
      avatar_url: auth.currentUser?.photoURL || undefined,
      firebase_uid: auth.currentUser?.uid,
      status: "active",
      sms_credits: 100,
      profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
      activeProfile: "default",
    };
    try {
      await setDoc(doc(db, "users", newId), userDoc, { merge: true });
      await setDoc(
        doc(db, "businesses", `biz_${newId}`),
        {
          id: `biz_${newId}`,
          owner_id: newId,
          profile_id: "default",
          name: shopName,
          logo_url: "",
          status: "active",
          sms_credits: 100,
          created_at: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (_) {}
  } else {
    if (fbVerified) {
      // Firebase Auth verified the password (e.g. after password reset); sync to Firestore
      if (userDoc.password !== pwd || userDoc.plain_password !== pwd) {
        userDoc.password = pwd;
        userDoc.plain_password = pwd;
        try {
          await setDoc(doc(db, "users", userDoc.id), { password: pwd, plain_password: pwd }, { merge: true });
        } catch (_) {}
      }
    } else if (userDoc.password && userDoc.password !== pwd && userDoc.plain_password !== pwd) {
      throw new Error("Incorrect password. Please try again.");
    }
  }

  const isLegacyRoot = (userDoc.email || ident).toLowerCase().trim() === "classicworld@gmail.com" || userDoc.id === "classic-world-default";
  const isIsolated = !isLegacyRoot;
  const activeProfile = userDoc.activeProfile || "default";
  const activeProfObj =
    activeProfile !== "default" && Array.isArray(userDoc.profiles)
      ? userDoc.profiles.find((p: any) => p.id === activeProfile)
      : null;

  // Normalize userDoc fields to match AuthUser shape
  userDoc = {
    ...userDoc,
    owner_id: userDoc.owner_id || userDoc.id,
    is_isolated_tenant: isIsolated,
    full_name: userDoc.full_name || userDoc.fullName || userDoc.name || ident.split("@")[0],
    business_name:
      activeProfile !== "default"
        ? activeProfObj?.name || userDoc.business_name || "My Business"
        : userDoc.business_name || userDoc.businessName || (isIsolated ? "My Business" : "Classic World"),
    business_id: userDoc.business_id || (isIsolated ? `biz_${userDoc.id}` : "classic-world-default"),
    logo_url:
      activeProfile !== "default"
        ? ""
        : userDoc.logo_url ?? (isIsolated ? "" : "/logo.png"),
    activated: true,
    role: userDoc.role || "owner",
    status: userDoc.status || "active",
    profiles: userDoc.profiles || [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
    activeProfile,
  };

  let finalToken = `token_${userDoc.id}`;
  if (typeof window !== "undefined") {
    const existingToken = localStorage.getItem("auth_token");
    if (existingToken && existingToken.includes(".")) {
      finalToken = existingToken;
    }
    clearAuthProfile();
    clearQueryCache();
    sessionStorage.removeItem("app_pin_unlocked");
    if (userDoc.role !== "employee") {
      localStorage.removeItem("cw_active_employee_session");
      localStorage.removeItem("cw_active_session_role");
    }
    localStorage.setItem("user", JSON.stringify(userDoc));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userDoc));
    localStorage.setItem("cw-auth-profile", JSON.stringify(userDoc));
    localStorage.setItem("auth_token", finalToken);
    localStorage.setItem("active_profile", userDoc.activeProfile || "default");
  }

  return { user: userDoc, token: finalToken };
}

export async function fsRegister(data: { identifier?: string; email?: string; phone?: string; password?: string; fullName?: string; businessName?: string; role?: string }) {
  const ident = (data.identifier || data.email || data.phone || "").trim().toLowerCase();
  const pwd = (data.password || "").trim();
  const fullName = (data.fullName || "").trim() || ident.split("@")[0];
  const newId = auth.currentUser?.uid || crypto.randomUUID();
  const shopName = (data.businessName || "").trim() || (fullName ? `${fullName}'s Shop` : "My Store");
  const bizId = `biz_${newId}`;

  const userDoc: any = {
    id: newId,
    owner_id: newId,
    is_isolated_tenant: true,
    email: ident.includes("@") ? ident : `${ident}@classicworld.com`,
    phone: !ident.includes("@") ? ident : undefined,
    full_name: fullName,
    password: pwd,
    plain_password: pwd,
    role: data.role || "owner",
    activated: true,
    business_id: bizId,
    business_name: shopName,
    logo_url: "",
    status: "active",
    sms_credits: 100,
    profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
    activeProfile: "default",
  };

  try {
    await setDoc(doc(db, "users", newId), userDoc, { merge: true });
    await setDoc(
      doc(db, "businesses", bizId),
      {
        id: bizId,
        owner_id: newId,
        profile_id: "default",
        name: shopName,
        logo_url: "",
        status: "active",
        sms_credits: 100,
        created_at: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("Register doc write error:", e);
  }

  if (typeof window !== "undefined") {
    clearAuthProfile();
    clearQueryCache();
    sessionStorage.removeItem("app_pin_unlocked");
    localStorage.setItem("user", JSON.stringify(userDoc));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userDoc));
    localStorage.setItem("cw-auth-profile", JSON.stringify(userDoc));
    localStorage.setItem("auth_token", `token_${newId}`);
    localStorage.setItem("active_profile", "default");
  }

  return { user: userDoc, token: `token_${newId}` };
}

// ── Somiti Management ────────────────────────────────────────────────────────
export async function fsRenameSomiti(data: { oldName: string; newName: string }) {
  const oldNameTrim = (data.oldName || "").trim().toLowerCase();
  const newNameTrim = (data.newName || "").trim();
  const isGeneralOld = oldNameTrim === "general samity" || oldNameTrim === "সাধারণ সমিতি";

  for (const colName of ["somiti", "somiti_entries"]) {
    try {
      const snap = await getDocs(collection(db, colName));
      for (const d of snap.docs) {
        const entry = d.data();
        const note = entry.note || "";
        const match = note.match(/^\[(.*?)\](?:\s*([\s\S]*))?$/);
        if (match) {
          const parsedName = match[1].trim().toLowerCase();
          if (parsedName === oldNameTrim) {
            const actualNote = match[2]?.trim() || "";
            const newNote = actualNote ? `[${newNameTrim}] ${actualNote}` : `[${newNameTrim}]`;
            await updateDoc(doc(db, colName, d.id), { note: newNote });
          }
        } else if (isGeneralOld) {
          const actualNote = note.trim();
          const newNote = actualNote ? `[${newNameTrim}] ${actualNote}` : `[${newNameTrim}]`;
          await updateDoc(doc(db, colName, d.id), { note: newNote });
        }
      }
    } catch (_) {}
  }
  return { success: true };
}

export async function fsDeleteSomitiByName(data: { name: string }) {
  const targetName = (data.name || "").trim().toLowerCase();
  const isGeneralTarget = targetName === "general samity" || targetName === "সাধারণ সমিতি";

  for (const colName of ["somiti", "somiti_entries"]) {
    try {
      const snap = await getDocs(collection(db, colName));
      for (const d of snap.docs) {
        const entry = d.data();
        const note = entry.note || "";
        const match = note.match(/^\[(.*?)\](?:\s*([\s\S]*))?$/);
        const isMatch = match
          ? match[1].trim().toLowerCase() === targetName
          : isGeneralTarget;

        if (isMatch) {
          try {
            const cbSnap = await getDocs(query(collection(db, "cashbox_logs"), where("ref_id", "==", d.id)));
            for (const cbDoc of cbSnap.docs) {
              await deleteDoc(doc(db, "cashbox_logs", cbDoc.id));
            }
          } catch (_) {}
          await deleteDoc(doc(db, colName, d.id));
        }
      }
    } catch (_) {}
  }
  return { success: true };
}

// ── Cashbox Database Reconcile & Repair ──────────────────────────────────────
export async function fsRepairCashbox() {
  try {
    const [salesSnap, expensesSnap, purchasesSnap, returnsSnap, somitiSnap, settlementsSnap, paymentsSnap, withdrawalsSnap, ownerWalletSnap, employeeShoppingsSnap, cashboxSnap] = await Promise.all([
      getDocs(collection(db, "sales")),
      getDocs(collection(db, "expenses")),
      getDocs(collection(db, "purchases")),
      getDocs(collection(db, "returns")),
      getDocs(collection(db, "somiti")),
      getDocs(collection(db, "party_payable_settlements")),
      getDocs(collection(db, "payments")),
      getDocs(collection(db, "withdrawals")),
      getDocs(collection(db, "owner_wallet")),
      getDocs(collection(db, "employee_shoppings")),
      getDocs(collection(db, "cashbox_logs")),
    ]);

    const existingDocs = cashboxSnap.docs.map(docToData);
    const manualEntries = existingDocs.filter((e: any) => !e.ref_id);
    const seenRefIds = new Set<string>(manualEntries.map((e: any) => e.ref_id).filter(Boolean));

    // Delete existing auto entries from cashbox_logs
    for (const d of cashboxSnap.docs) {
      if (d.data().ref_id) {
        await deleteDoc(d.ref);
      }
    }

    let repaired = 0;

    // 1. Sales
    for (const s of salesSnap.docs) {
      const sale = s.data();
      if (sale.returned || sale.courier_status === "cancelled") continue;
      const sId = s.id;
      const qty = Number(sale.qty) || 1;
      const sellPrice = Number(sale.sell_price) || 0;
      const paidAmount = Number(sale.paid_amount);
      const lineTotal = sellPrice * qty;

      const type = String(sale.type || "cash").toLowerCase().trim();
      let cashAmount = 0;
      if (type === "cash" || type === "pos" || type === "nagad" || type === "card" || type === "hand_cash" || !sale.type) {
        cashAmount = !isNaN(paidAmount) && paidAmount >= 0 ? paidAmount : lineTotal;
      } else if (type === "credit") {
        cashAmount = !isNaN(paidAmount) && paidAmount > 0 ? paidAmount : 0;
      } else if (type === "bkash" || type === "bank" || type === "rocket") {
        if (sale.payment_status === "rejected" || sale.payment_status === "cancelled") {
          cashAmount = 0;
        } else {
          cashAmount = !isNaN(paidAmount) && paidAmount > 0 ? paidAmount : lineTotal;
        }
      } else if (type === "online") {
        const cStatus = String(sale.courier_status || "").toLowerCase().trim();
        const isCollected = cStatus === "collected" || cStatus === "delivered" || cStatus === "completed" || sale.payment_status === "accepted" || sale.payment_status === "paid";
        if (isCollected || (!isNaN(paidAmount) && paidAmount > 0)) {
          cashAmount = !isNaN(paidAmount) && paidAmount > 0 ? paidAmount : lineTotal;
        }
      } else {
        if (!isNaN(paidAmount) && paidAmount > 0) cashAmount = paidAmount;
      }

      if (cashAmount > 0 && !seenRefIds.has(sId)) {
        seenRefIds.add(sId);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "sale",
          amount: cashAmount,
          note: `Sale: ${sale.product_name || "Product"} (×${qty})`,
          ref_id: sId,
          created_at: toFirestoreTimestamp(sale.created_at),
        });
        repaired++;
      }
    }

    // 2. Returns
    for (const r of returnsSnap.docs) {
      const ret = r.data();
      if (ret.deduct_type === "payable" || ret.deduct_type === "receivable") continue;
      const returnQty = Number(ret.qty) || 1;
      const returnPrice = Number(ret.return_price) || Number(ret.amount) || 0;
      const refundAmt = ret.amount ? Number(ret.amount) : returnQty * returnPrice;

      if (refundAmt > 0 && !seenRefIds.has(r.id)) {
        seenRefIds.add(r.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "withdraw",
          amount: refundAmt,
          note: `Return refund: ${ret.product_name || "Item"}`,
          ref_id: r.id,
          created_at: toFirestoreTimestamp(ret.created_at),
        });
        repaired++;
      }
    }

    // 3. Purchases & Expenses
    const purchaseExpenses = new Set<string>();
    for (const p of purchasesSnap.docs) {
      const pur = p.data();
      const pTotal = Number(pur.total) || 0;
      if (pur.payment_type !== "credit" && pTotal > 0 && !seenRefIds.has(p.id)) {
        seenRefIds.add(p.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "expense",
          amount: pTotal,
          note: `Product Purchase: ${pur.product_name || "Stock"}`,
          ref_id: p.id,
          created_at: toFirestoreTimestamp(pur.created_at),
        });
        repaired++;
      }

      for (const e of expensesSnap.docs) {
        const exp = e.data();
        if ((exp.note && exp.note.includes(`Purchase ID: ${p.id}`)) ||
            (exp.title === `Product Purchase: ${pur.product_name}` && Number(exp.amount) === pTotal)) {
          purchaseExpenses.add(e.id);
        }
      }
    }

    // Expenses
    for (const e of expensesSnap.docs) {
      if (purchaseExpenses.has(e.id)) continue;
      const exp = e.data();
      if (exp.category === "purchase" || exp.title?.startsWith("Product Purchase:")) continue;
      if (exp.category === "owner_personal" || exp.note?.includes("Owner Wallet ID:")) continue;
      const amt = Number(exp.amount) || 0;
      if (amt > 0 && !seenRefIds.has(e.id)) {
        seenRefIds.add(e.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "expense",
          amount: amt,
          note: exp.title || exp.category || "Expense",
          ref_id: e.id,
          created_at: toFirestoreTimestamp(exp.created_at),
        });
        repaired++;
      }
    }

    // 4. Owner Wallet Spends
    for (const w of ownerWalletSnap.docs) {
      const wData = w.data();
      const amt = Number(wData.amount) || 0;
      if (amt > 0 && !seenRefIds.has(w.id)) {
        seenRefIds.add(w.id);
        const cat = wData.category || "personal";
        const catLabel = cat === "family" ? "পরিবার খরচ" : cat === "bazar" ? "বাজার খরচ" : cat === "home_rent" ? "বাসা ভাড়া" : cat === "medical" ? "চিকিৎসা" : "ব্যক্তিগত";
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "withdraw",
          amount: amt,
          note: `[মালিকের খরচ] ${catLabel}: ${wData.note || "ব্যক্তিগত উত্তোলন"}`,
          ref_id: w.id,
          created_at: toFirestoreTimestamp(wData.created_at),
        });
        repaired++;
      }
    }

    // 5. Direct Withdrawals
    for (const w of withdrawalsSnap.docs) {
      const wData = w.data();
      const amt = Number(wData.amount) || 0;
      if (amt > 0 && !seenRefIds.has(w.id)) {
        seenRefIds.add(w.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "withdraw",
          amount: amt,
          note: `উত্তোলন: ${wData.note || "Owner"}`,
          ref_id: w.id,
          created_at: toFirestoreTimestamp(wData.created_at),
        });
        repaired++;
      }
    }

    // 6. Somiti Entries
    for (const som of somitiSnap.docs) {
      const sData = som.data();
      if (sData.is_initial || sData.skipCashbox) continue;
      const amt = Number(sData.amount) || 0;
      if (amt > 0 && !seenRefIds.has(som.id)) {
        seenRefIds.add(som.id);
        const cbKind = sData.kind === "withdraw" ? "deposit" : "withdraw";
        await addDoc(collection(db, "cashbox_logs"), {
          kind: cbKind,
          amount: amt,
          note: sData.note ? `Samity: ${sData.note}` : "Samity transaction",
          ref_id: som.id,
          created_at: toFirestoreTimestamp(sData.created_at),
        });
        repaired++;
      }
    }

    // 7. Customer Payments
    for (const pay of paymentsSnap.docs) {
      const pData = pay.data();
      const amt = Number(pData.amount) || 0;
      if (amt > 0 && !seenRefIds.has(pay.id)) {
        seenRefIds.add(pay.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "deposit",
          amount: amt,
          note: pData.note ? `Customer Due Payment: ${pData.note}` : "Customer Due Payment",
          ref_id: pay.id,
          created_at: toFirestoreTimestamp(pData.created_at),
        });
        repaired++;
      }
    }

    // 8. Employee Shoppings (Cash collections)
    for (const es of employeeShoppingsSnap.docs) {
      const esData = es.data();
      const amt = Number(esData.total_amount) || 0;
      if (esData.payment_status === "paid_cash" && amt > 0 && !seenRefIds.has(es.id)) {
        seenRefIds.add(es.id);
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "deposit",
          amount: amt,
          note: `[কর্মচারী কেনাকাটা নগদ আদায়] ${esData.employee_name || "Employee"}: ${esData.note || "পোশাক বিক্রয়"}`,
          ref_id: es.id,
          created_at: toFirestoreTimestamp(esData.created_at),
        });
        repaired++;
      }
    }

    return { success: true, repaired };
  } catch (err: any) {
    return { success: true, message: err?.message || "Repair completed" };
  }
}

// ── Image Upload Service ─────────────────────────────────────────────────────
export async function fsUploadImage(data: { base64?: string; fileName?: string }) {
  if (!data?.base64) throw new Error("No image data provided");
  try {
    const { getStorage, ref, uploadString, getDownloadURL } = await import("firebase/storage");
    const { app } = await import("./firebase");
    const storage = getStorage(app);
    const fileName = `${Date.now()}_${(data.fileName || "image.png").replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const storageRef = ref(storage, `uploads/${fileName}`);
    await uploadString(storageRef, data.base64, "data_url");
    const url = await getDownloadURL(storageRef);
    return { url, success: true };
  } catch (err) {
    return { url: data.base64, success: true };
  }
}

// ── Google Sheets Sync & Export ──────────────────────────────────────────────
export async function fsToggleGoogleSheetsSync(data: { enabled: boolean; sheetId?: string }) {
  await fsUpdateBusinessSettings({ google_sheets_sync: data.enabled, google_sheet_id: data.sheetId });
  return { success: true };
}

// Helper to sign Service Account JWT and fetch OAuth2 access token
async function getGoogleSheetsAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const pkcs8Key = privateKey.replace(/\\n/g, "\n");
  const alg = "RS256";

  const jwt = await new jose.SignJWT({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg })
    .sign(await jose.importPKCS8(pkcs8Key, alg));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Auth failed: ${errText}`);
  }

  const tokenData = await res.json();
  return tokenData.access_token as string;
}

export async function fsBulkExportToGoogleSheets() {
  const biz: any = await fsGetBusinessSettings();
  let token = biz.google_sheets_access_token;

  if (!token && biz.google_sheets_credentials_json) {
    try {
      const creds = JSON.parse(biz.google_sheets_credentials_json.trim());
      if (creds.client_email && creds.private_key) {
        token = await getGoogleSheetsAccessToken(creds.client_email, creds.private_key);
      }
    } catch (err: any) {
      throw new Error(`Failed to parse Google Sheets Credentials JSON: ${err.message || err}`);
    }
  }

  if (!token) {
    throw new Error("Google Sheets Credentials (Service Account JSON) missing. Please add your credentials in Settings > Google Sheets.");
  }

  let spreadsheetId = biz.google_sheets_spreadsheet_id || biz.google_sheet_id;

  // If no spreadsheet exists yet, create a brand new Google Spreadsheet!
  if (!spreadsheetId) {
    const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title: `${biz.shop_name || "Classic World"} - POS Cloud Records`,
        },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Google Spreadsheet: ${errText}`);
    }

    const newSheetData = await createRes.json();
    spreadsheetId = newSheetData.spreadsheetId;

    // Save newly created spreadsheet ID into business settings
    await fsUpdateBusinessSettings({
      google_sheets_spreadsheet_id: spreadsheetId,
      google_sheet_id: spreadsheetId,
      google_sheets_sync: true,
      google_sheets_sync_enabled: true,
    });
  }

  // Fetch all collections to export
  const [sales, products, expenses, cashbox, purchases, parties] = await Promise.all([
    fsGetSales(),
    fsGetProducts(),
    fsGetExpenses(),
    fsGetCashbox(),
    fsGetPurchases(),
    fsGetParties(),
  ]);

  const partyMap = new Map(parties.map((p: any) => [String(p.id), p.name || p.phone || ""]));

  const dataSets = [
    {
      tab: "Sales",
      headers: ["Sale ID", "Date & Time", "Product Name", "Qty", "Sell Price (৳)", "Total (৳)", "Payment Type", "Customer / Party", "Paid Amount (৳)", "Due Amount (৳)", "Courier Status", "Note"],
      rows: sales.map((s: any) => [
        String(s.id),
        s.created_at ? new Date(s.created_at).toLocaleString("en-GB") : "",
        s.product_name || "",
        s.qty ?? 1,
        s.sell_price ?? 0,
        (Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0),
        (s.type || "cash").toUpperCase(),
        s.parties?.name || partyMap.get(String(s.party_id)) || (s.party_id ? String(s.party_id) : "Walk-in"),
        s.paid_amount ?? 0,
        s.due_amount ?? 0,
        s.courier_status || (s.type === "online" ? "pending" : "completed"),
        s.note || "",
      ]),
    },
    {
      tab: "Products",
      headers: ["Product ID", "Product Name", "Buy Price (৳)", "Sell Price (৳)", "Stock Qty", "Min Alert Stock", "Category", "Created At"],
      rows: products.map((p: any) => [
        String(p.id),
        p.name || "",
        p.buy_price ?? 0,
        p.sell_price ?? 0,
        p.stock ?? 0,
        p.min_stock ?? 5,
        p.category || "",
        p.created_at ? new Date(p.created_at).toLocaleString("en-GB") : "",
      ]),
    },
    {
      tab: "Expenses",
      headers: ["Expense ID", "Expense Title", "Amount (৳)", "Note / Category", "Date & Time"],
      rows: expenses.map((e: any) => [
        String(e.id),
        e.title || "",
        e.amount ?? 0,
        e.note || "",
        e.created_at ? new Date(e.created_at).toLocaleString("en-GB") : "",
      ]),
    },
    {
      tab: "Cashbox",
      headers: ["Entry ID", "Kind / Source", "Amount (৳)", "Description / Note", "Reference ID", "Date & Time"],
      rows: cashbox.map((c: any) => [
        String(c.id),
        (c.kind || "").toUpperCase(),
        c.amount ?? 0,
        c.note || "",
        c.ref_id || "",
        c.created_at ? new Date(c.created_at).toLocaleString("en-GB") : "",
      ]),
    },
    {
      tab: "Purchases",
      headers: ["Purchase ID", "Product Name", "Quantity", "Unit Cost (৳)", "Total Cost (৳)", "Supplier / Note", "Date & Time"],
      rows: purchases.map((p: any) => [
        String(p.id),
        p.product_name || "",
        p.qty ?? 1,
        p.unit_cost ?? 0,
        p.total ?? 0,
        p.note || "",
        p.created_at ? new Date(p.created_at).toLocaleString("en-GB") : "",
      ]),
    },
  ];

  for (const ds of dataSets) {
    try {
      const createTabUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
      await fetch(createTabUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: ds.tab,
                },
              },
            },
          ],
        }),
      });
    } catch (_) {
      // Tab already exists
    }

    // Clear existing sheet values
    try {
      const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${ds.tab}'!A:Z:clear`;
      await fetch(clearUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (_) {}

    // Write headers and rows
    const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${ds.tab}'!A1?valueInputOption=USER_ENTERED`;
    const values = [ds.headers, ...ds.rows];
    await fetch(writeUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values,
      }),
    });
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return {
    success: true,
    count: sales.length,
    spreadsheetId,
    url: sheetUrl,
    message: "Google Sheets created and all records synchronized successfully!",
  };
}

// ── Employee Management & Invitations ────────────────────────────────────────
export async function fsListEmployeeInvitations() {
  try {
    const snap = await getDocs(collection(db, "employee_invitations"));
    return snap.docs.map(docToData);
  } catch (_) {
    return [];
  }
}

export async function fsSendEmployeeInvitation(data: { employee_email: string; role?: string; permissions?: any }) {
  const email = (data.employee_email || "").toLowerCase().trim();
  const docRef = await addDoc(collection(db, "employee_invitations"), {
    employee_email: email,
    role: data.role || "staff",
    permissions: data.permissions || {},
    status: "pending",
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsCancelEmployeeInvitation(id: string) {
  try {
    await deleteDoc(doc(db, "employee_invitations", id));
  } catch (_) {}
  return { success: true };
}

export async function fsRemoveEmployee(employeeId: string) {
  try {
    await deleteDoc(doc(db, "employees", employeeId));
  } catch (_) {}
  return { success: true };
}

export async function fsUpdateEmployeePermissions(data: { employeeId: string; permissions: any }) {
  try {
    await updateDoc(doc(db, "employees", data.employeeId), { permissions: data.permissions });
  } catch (_) {}
  return { success: true };
}

// ── SMS Gateway & Campaigns ──────────────────────────────────────────────────
export async function fsGetSmsSettings() {
  const user = fsGetCurrentUser();
  let smsSettings: any = null;
  try {
    const docSnap = await getDoc(doc(db, "sms_settings", "settings"));
    if (docSnap.exists()) smsSettings = docSnap.data();
  } catch (_) {}

  return {
    sms_credits: smsSettings?.sms_credits ?? user?.sms_credits ?? 100,
    admin_whatsapp: smsSettings?.admin_whatsapp || user?.admin_whatsapp || "8801700000000",
    customer_sms_after_purchase: Boolean(smsSettings?.customer_sms_after_purchase),
    purchase_sms_template:
      smsSettings?.purchase_sms_template ||
      "Dear {customer_name}, thanks for shopping with {shop_name}! Items: {product_name} x{qty}, Total: Tk {total_amount}, Paid: Tk {paid_amount}, Due: Tk {due_amount}. Inv #{invoice_id}.",
    offer_sms_template:
      smsSettings?.offer_sms_template ||
      "Special offer from {shop_name}! Visit our store or order online to get exciting discounts on latest collections.",
  };
}

export async function fsUpdateSmsSettings(data: any) {
  try {
    await setDoc(doc(db, "sms_settings", "settings"), data, { merge: true });
  } catch (_) {}
  return { success: true };
}

export async function fsCheckSmsBalance() {
  const settings = await fsGetSmsSettings();
  return {
    status: "Success",
    statusCode: "200",
    balance: String(settings.sms_credits),
    admin_whatsapp: settings.admin_whatsapp,
  };
}

export async function fsGetSmsLogs() {
  try {
    const snap = await getDocs(collection(db, "sms_logs"));
    return snap.docs.map(docToData);
  } catch (_) {
    return [];
  }
}

export async function fsSendSmsCampaign(data: { numbers: string[]; message: string; campaignName?: string }) {
  const count = (data.numbers || []).length;
  const docRef = await addDoc(collection(db, "sms_logs"), {
    campaign_name: data.campaignName || "General Campaign",
    message: data.message,
    recipient_count: count,
    numbers: data.numbers,
    status: "Sent",
    created_at: Timestamp.now(),
  });
  return { success: true, count, id: docRef.id };
}

export async function fsCheckSmsDeliveryStatus(args: any) {
  return { status: "Delivered", success: true };
}

export async function fsDeleteSmsLog(id: string) {
  try {
    await deleteDoc(doc(db, "sms_logs", id));
  } catch (_) {}
  return { success: true };
}



export async function fsExchangeProducts(data: {
  returned_product_id: string;
  returned_qty: number;
  returned_price: number;
  new_product_id: string;
  new_qty: number;
  new_sell_price: number;
  party_id?: string | null;
  customer_name?: string | null;
  note?: string | null;
}) {
  const retProdDoc = await getDoc(doc(db, "products", data.returned_product_id));
  if (!retProdDoc.exists()) throw new Error("Returned product not found");
  const returnedProduct = docToData<any>(retProdDoc);

  const newProdDoc = await getDoc(doc(db, "products", data.new_product_id));
  if (!newProdDoc.exists()) throw new Error("New product chosen for exchange not found");
  const newProduct = docToData<any>(newProdDoc);

  const retQty = Number(data.returned_qty) || 1;
  const newQty = Number(data.new_qty) || 1;
  const retPrice = Number(data.returned_price) || Number(returnedProduct.sell_price) || 0;
  const newPrice = Number(data.new_sell_price) || Number(newProduct.sell_price) || 0;

  const currentNewStock = (newProduct.stock as number) ?? 0;
  if (currentNewStock < newQty) {
    throw new Error(`Insufficient stock for ${newProduct.name}. Available: ${currentNewStock}`);
  }

  // 1. Restock the returned product
  await updateDoc(doc(db, "products", data.returned_product_id), {
    stock: increment(retQty),
  });

  // 2. Reduce stock of the newly taken product
  await updateDoc(doc(db, "products", data.new_product_id), {
    stock: increment(-newQty),
  });

  const totalReturnedValue = retPrice * retQty;
  const totalNewValue = newPrice * newQty;
  const cashDifference = totalNewValue - totalReturnedValue;

  const exchangeId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 3. Record return entry
  const returnRecord = {
    exchange_id: exchangeId,
    product_id: data.returned_product_id,
    product_name: returnedProduct.name,
    qty: retQty,
    return_price: retPrice,
    amount: totalReturnedValue,
    note: `Exchange for ${newProduct.name}${data.note ? ` (${data.note})` : ""}`,
    created_at: Timestamp.now(),
  };
  await addDoc(collection(db, "returns"), returnRecord);

  // 4. Record sale entry
  const newBuyPrice = Number(newProduct.buy_price) || 0;
  const newProfit = (newPrice - newBuyPrice) * newQty;

  const saleRecord = {
    exchange_id: exchangeId,
    product_id: data.new_product_id,
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
    created_at: Timestamp.now(),
  };
  await addDoc(collection(db, "sales"), saleRecord);

  // 5. Adjust Cashbox
  if (cashDifference > 0) {
    await fsCreateCashbox({
      type: "cash_in",
      source: "sale",
      amount: cashDifference,
      note: `Exchange Cash In: Returned ${returnedProduct.name}, Took ${newProduct.name}`,
    });
  } else if (cashDifference < 0) {
    await fsCreateCashbox({
      type: "cash_out",
      source: "return_refund",
      amount: Math.abs(cashDifference),
      note: `Exchange Refund: Returned ${returnedProduct.name}, Took ${newProduct.name}`,
    });
  }

  return { success: true, exchangeId, cashDifference };
}

// ── Employee Management Suite ──────────────────────────────────────────────────
export async function fsGetEmployees() {
  try {
    await auth.authStateReady();
  } catch (_) {}
  try {
    const q = query(collection(db, "employees"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    const emps = snap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
    })).filter((d: any) => belongsToCurrentTenant(d));
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("cw_employee_accounts", JSON.stringify(emps));
      } catch (_) {}
    }
    return emps;
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "employees"));
      const emps = snap.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      })).filter((d: any) => belongsToCurrentTenant(d));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("cw_employee_accounts", JSON.stringify(emps));
        } catch (_) {}
      }
      return emps;
    } catch (_) {
      return [];
    }
  }
}

export async function fsAddEmployee(data: any) {
  try {
    await auth.authStateReady();
  } catch (_) {}
  const scope = getTenantScope();
  const currentUser = scope.user;
  const authUid = auth.currentUser?.uid;
  const ownerId = scope.effectiveOwnerId || authUid || currentUser?.id || "owner";
  if (currentUser?.role === "employee" && !authUid) {
    throw new Error("Only parent business accounts can add employees.");
  }
  const phone = (data.phone || "").replace(/\s+/g, "").trim();
  const email = (data.email || "").toLowerCase().trim();
  const newEmp = {
    owner_uid: authUid || ownerId,
    owner_id: ownerId,
    profile_id: scope.activeProfile || "default",
    is_isolated_tenant: scope.isIsolatedTenant || false,
    business_id: currentUser?.business_id || ownerId,
    name: (data.name || "Employee").trim(),
    password: data.password || data.pin || "1234",
    pin: data.pin || data.password || "1234",
    plain_password: data.password || data.pin || "1234",
    phone: phone || null,
    email: email || null,
    designation: (data.designation || "Staff").trim(),
    base_salary: Number(data.base_salary || data.monthly_salary) || 0,
    monthly_salary: Number(data.monthly_salary || data.base_salary) || 0,
    advance_limit: Number(data.advance_limit) || (Number(data.base_salary || data.monthly_salary) || 0),
    status: data.status || "active",
    permissions: data.permissions || {
      can_sales: true,
      can_customers: true,
      can_returns: true,
      can_products: false,
      can_expenses: false,
      can_reports: false,
      can_delete: false,
      can_discount: false,
    },
    notes: data.notes || null,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  };
  const docRef = data.id ? doc(db, "employees", String(data.id)) : doc(collection(db, "employees"));
  try {
    await setDoc(docRef, newEmp, { merge: true });
  } catch (fsErr: any) {
    console.warn("Firestore setDoc employee warning, falling back to local sync:", fsErr);
  }
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("cw_employee_accounts");
      const list = raw ? JSON.parse(raw) : [];
      const filtered = list.filter((x: any) => x.id !== docRef.id);
      filtered.unshift({ id: docRef.id, ...newEmp });
      localStorage.setItem("cw_employee_accounts", JSON.stringify(filtered));
    } catch (_) {}
  }
  return { success: true, id: docRef.id };
}

export async function fsUpdateEmployee(id: string, data: any) {
  try {
    const phone = data.phone ? String(data.phone).replace(/\s+/g, "").trim() : undefined;
    const email = data.email ? String(data.email).toLowerCase().trim() : undefined;
    const updatePayload: any = {
      updated_at: Timestamp.now(),
    };
    if (data.name) updatePayload.name = data.name.trim();
    if (data.password) {
      updatePayload.password = data.password;
      updatePayload.plain_password = data.password;
      updatePayload.pin = data.password;
    }
    if (data.pin) {
      updatePayload.pin = data.pin;
      updatePayload.password = data.pin;
      updatePayload.plain_password = data.pin;
    }
    if (phone !== undefined) updatePayload.phone = phone || null;
    if (email !== undefined) updatePayload.email = email || null;
    if (data.designation !== undefined) updatePayload.designation = data.designation;
    if (data.base_salary !== undefined || data.monthly_salary !== undefined) {
      const sal = Number(data.base_salary ?? data.monthly_salary) || 0;
      updatePayload.base_salary = sal;
      updatePayload.monthly_salary = sal;
    }
    if (data.advance_limit !== undefined) {
      updatePayload.advance_limit = Number(data.advance_limit) || 0;
    }
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.permissions !== undefined) updatePayload.permissions = data.permissions;
    if (data.notes !== undefined) updatePayload.notes = data.notes;

    await updateDoc(doc(db, "employees", id), updatePayload);

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("cw_employee_accounts");
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            const idx = arr.findIndex((x: any) => x.id === id);
            if (idx >= 0) {
              arr[idx] = { ...arr[idx], ...updatePayload };
              localStorage.setItem("cw_employee_accounts", JSON.stringify(arr));
            }
          }
        }
      } catch (_) {}
    }
    return { success: true };
  } catch (err: any) {
    throw new Error(err?.message || "Failed to update employee");
  }
}

export async function fsDeleteEmployee(id: string) {
  try {
    await fsMoveToRecycleBin("employees", id, "Employee #" + id);
    return { success: true };
  } catch (err: any) {
    try {
      await deleteDoc(doc(db, "employees", id));
      return { success: true };
    } catch (e: any) {
      throw new Error(e?.message || "Failed to delete employee");
    }
  }
}

// ── Employee Salaries ──────────────────────────────────────────────────────────
export async function fsGetEmployeeSalaries() {
  try {
    const q = query(collection(db, "employee_salaries"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
    })).filter((d: any) => belongsToCurrentTenant(d));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_salaries"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      })).filter((d: any) => belongsToCurrentTenant(d));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeSalary(data: any) {
  const scope = getTenantScope();
  const currentUser = scope.user;
  const ownerId = scope.effectiveOwnerId || scope.rootOwnerId || auth.currentUser?.uid || currentUser?.id;
  const amount = Number(data.amount) || 0;
  const empName = data.employee_name || "Employee";
  const month = data.month || new Date().toISOString().slice(0, 7);
  const paymentMethod = data.payment_method || "cash";
  const createdAtTs = toFirestoreTimestamp(data.created_at || data.payment_date);

  const salaryDoc = cleanFirestoreData({
    owner_id: ownerId,
    owner_uid: ownerId,
    profile_id: scope.activeProfile || "default",
    business_id: currentUser?.business_id || ownerId,
    employee_id: data.employee_id,
    employee_name: empName,
    month,
    cycle_id: data.cycle_id || month,
    amount,
    base_salary: Number(data.base_salary) || 0,
    deductions: Number(data.deductions) || 0,
    bonus: Number(data.bonus) || 0,
    payment_method: paymentMethod,
    payment_date: data.payment_date || new Date().toISOString().slice(0, 10),
    status: data.status || "paid",
    note: data.note || null,
    created_at: createdAtTs,
  });

  let salaryId: string;
  if (data?.id) {
    salaryId = String(data.id);
    await setDoc(doc(db, "employee_salaries", salaryId), salaryDoc, { merge: true });
  } else {
    const docRef = await addDoc(collection(db, "employee_salaries"), salaryDoc);
    salaryId = docRef.id;
  }

  const title = `[কর্মচারী বেতন] ${empName} (${month})`;

  // 1. Log in general expenses as "salary"
  if (amount > 0) {
    try {
      await addDoc(collection(db, "expenses"), {
        title,
        amount,
        category: "salary",
        note: `Employee Salary ID: ${salaryId} | Paid via ${paymentMethod}`,
        created_at: createdAtTs,
      });
    } catch (e) {
      console.warn("Salary expense log skipped:", e);
    }

    // 2. If paid via cash, deduct from cashbox
    if (paymentMethod === "cash") {
      try {
        await addDoc(collection(db, "cashbox_logs"), {
          kind: "withdraw",
          amount,
          note: title,
          ref_id: salaryId,
          created_at: createdAtTs,
        });
      } catch (e) {
        console.warn("Salary cashbox log skipped:", e);
      }
    }
  }

  // 3. If shopping deductions were applied, mark those employee shopping records as settled
  if (Number(data.deductions) > 0 && (data.employee_id || empName)) {
    try {
      const snap = await getDocs(collection(db, "employee_shoppings"));
      for (const sDoc of snap.docs) {
        const s = sDoc.data();
        const matchesEmp = (data.employee_id && s.employee_id === data.employee_id) ||
          (empName && s.employee_name && s.employee_name.toLowerCase() === empName.toLowerCase());
        if (matchesEmp && s.payment_status === "deduct_from_salary" && !s.is_settled && !s.settled) {
          await updateDoc(sDoc.ref, {
            is_settled: true,
            settled: true,
            settled_at: Timestamp.now(),
            settled_salary_id: salaryId,
            settled_month: month,
          });
        }
      }
    } catch (e) {
      console.warn("Could not settle employee shoppings:", e);
    }
  }

  return { success: true, id: salaryId, ...salaryDoc, created_at: createdAtTs.toDate().toISOString() };
}

export async function fsDeleteEmployeeSalary(id: string) {
  try {
    await fsMoveToRecycleBin("employee_salaries", id, "Salary Payment #" + id);
    return { success: true };
  } catch (_) {
    await deleteDoc(doc(db, "employee_salaries", id));
    return { success: true };
  }
}

// ── Employee Daily Expenses & Allowances ───────────────────────────────────────
export async function fsGetEmployeeExpenses() {
  try {
    const q = query(collection(db, "employee_expenses"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
    })).filter((d: any) => belongsToCurrentTenant(d));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_expenses"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      })).filter((d: any) => belongsToCurrentTenant(d));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeExpense(data: any) {
  const scope = getTenantScope();
  const currentUser = scope.user;
  const ownerId = scope.effectiveOwnerId || scope.rootOwnerId || auth.currentUser?.uid || currentUser?.id;
  const amount = Number(data.amount) || 0;
  const empName = data.employee_name || "Employee";
  const category = data.category || "food"; // food, travel, tea, bonus, advance, debt_repayment, adjustment_add, adjustment_deduct, other
  const note = data.note || "";
  const paymentMethod = data.payment_method || "cash";
  const ts = toFirestoreTimestamp(data.created_at || data.date);

  const isDebtRepayment = category === "debt_repayment";
  const isAdjustment = category === "adjustment_add" || category === "adjustment_deduct";

  const catLabel = category === "food" ? "খাবার ভাতা" : category === "travel" ? "যাতায়াত" : category === "tea" ? "নাস্তা/চা" : category === "bonus" ? "বোনাস" : category === "advance" || category === "salary_advance" ? "অগ্রিম বেতন" : isDebtRepayment ? "দোকান পাওনা আদায়" : category === "adjustment_add" ? "বেতন বৃদ্ধি/সমন্বয়" : category === "adjustment_deduct" ? "বেতন কর্তন/সমন্বয়" : "অন্যান্য";
  const title = `[কর্মচারী ${isDebtRepayment ? "পাওনা আদায়" : isAdjustment ? "সমন্বয়" : "খরচ"}] ${empName} (${catLabel}): ${note}`;

  const docId = data.id ? String(data.id) : undefined;
  const colRef = collection(db, "employee_expenses");
  const docRef = docId ? doc(db, "employee_expenses", docId) : doc(colRef);

  await setDoc(docRef, {
    owner_id: ownerId,
    owner_uid: ownerId,
    profile_id: scope.activeProfile || "default",
    business_id: currentUser?.business_id || ownerId,
    employee_id: data.employee_id || null,
    employee_name: empName,
    category,
    amount,
    payment_method: paymentMethod,
    date: data.date || new Date().toISOString().slice(0, 10),
    month: data.month || (data.date || new Date().toISOString().slice(0, 10)).slice(0, 7),
    note: note || null,
    created_at: ts,
  });

  if (amount > 0) {
    if (isDebtRepayment) {
      if (paymentMethod === "cash") {
        try {
          await addDoc(collection(db, "cashbox_logs"), {
            kind: "deposit",
            amount,
            note: title,
            ref_id: docRef.id,
            created_at: ts,
          });
        } catch (_) {}
      }
    } else if (!isAdjustment) {
      try {
        await addDoc(collection(db, "expenses"), {
          title,
          amount,
          category: category === "advance" || category === "salary_advance" ? "salary_advance" : "employee_expense",
          note: `Employee Expense ID: ${docRef.id}`,
          created_at: ts,
        });
      } catch (_) {}

      // Deduct from cashbox if paid via cash
      if (paymentMethod === "cash") {
        try {
          await addDoc(collection(db, "cashbox_logs"), {
            kind: "withdraw",
            amount,
            note: title,
            ref_id: docRef.id,
            created_at: ts,
          });
        } catch (_) {}
      }
    }
  }

  return { success: true, id: docRef.id };
}

export async function fsDeleteEmployeeExpense(id: string) {
  try {
    await fsMoveToRecycleBin("employee_expenses", id, "Employee Expense #" + id);
    return { success: true };
  } catch (_) {
    await deleteDoc(doc(db, "employee_expenses", id));
    return { success: true };
  }
}

// ── Employee Shopping / Clothing Draw (কর্মচারী কেনাকাটা) ──────────────────────────
export async function fsGetEmployeeShoppings() {
  try {
    const q = query(collection(db, "employee_shoppings"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
    })).filter((d: any) => belongsToCurrentTenant(d));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_shoppings"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      })).filter((d: any) => belongsToCurrentTenant(d));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeShopping(data: any) {
  const scope = getTenantScope();
  const currentUser = scope.user;
  const ownerId = scope.effectiveOwnerId || scope.rootOwnerId || auth.currentUser?.uid || currentUser?.id;
  const empName = data.employee_name || "Employee";
  const items = Array.isArray(data.items) ? data.items : [];
  const totalAmount = Number(data.total_amount) || 0;
  const paymentStatus = data.payment_status || "deduct_from_salary"; // deduct_from_salary, paid_cash, gift
  const note = data.note || "";
  const ts = toFirestoreTimestamp(data.created_at || data.date);

  // 1. Deduct stock from inventory for each item taken
  for (const item of items) {
    if (item.product_id) {
      try {
        const prodRef = doc(db, "products", item.product_id);
        const prodSnap = await getDoc(prodRef);
        if (prodSnap.exists()) {
          const curStock = Number(prodSnap.data().stock) || 0;
          const takeQty = Number(item.qty) || 1;
          const newStock = Math.max(curStock - takeQty, 0);
          await updateDoc(prodRef, {
            stock: newStock,
            updated_at: Timestamp.now(),
          });
        }
      } catch (e) {
        console.warn("Could not deduct stock for employee shopping:", e);
      }
    }
  }

  // 2. Save document
  const docId = data.id ? String(data.id) : undefined;
  const colRef = collection(db, "employee_shoppings");
  const docRef = docId ? doc(db, "employee_shoppings", docId) : doc(colRef);

  await setDoc(docRef, {
    owner_id: ownerId,
    owner_uid: ownerId,
    profile_id: scope.activeProfile || "default",
    business_id: currentUser?.business_id || ownerId,
    employee_id: data.employee_id || null,
    employee_name: empName,
    items,
    total_amount: totalAmount,
    payment_status: paymentStatus,
    date: data.date || new Date().toISOString().slice(0, 10),
    note: note || null,
    created_at: ts,
  });

  // 3. If paid in cash, add to cashbox as income
  if (paymentStatus === "paid_cash" && totalAmount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "deposit",
        amount: totalAmount,
        note: `[কর্মচারী কেনাকাটা নগদ আদায়] ${empName}: ${note || "পোশাক বিক্রয়"}`,
        ref_id: docRef.id,
        created_at: ts,
      });
    } catch (_) {}
  }

  return { success: true, id: docRef.id };
}

export async function fsDeleteEmployeeShopping(id: string) {
  try {
    await fsMoveToRecycleBin("employee_shoppings", id, "Employee Shopping #" + id);
    return { success: true };
  } catch (_) {
    await deleteDoc(doc(db, "employee_shoppings", id));
    return { success: true };
  }
}

export async function fsUpdateEmployeeShopping(id: string, data: any) {
  await updateDoc(doc(db, "employee_shoppings", id), data);
  return { success: true, id };
}

export async function fsEmployeeLogin(data: { username?: string; identifier?: string; password?: string }) {
  const rawIdent = (data.username || data.identifier || "").trim();
  const rawPwd = (data.password || "").trim();

  // If only one field is provided, check if it's a PIN or identifier
  const pwd = rawPwd || (rawIdent && /^\d{4,6}$/.test(rawIdent) ? rawIdent : "");
  const ident = rawIdent && rawIdent !== pwd ? rawIdent : (rawPwd && !/^\d{4,6}$/.test(rawPwd) ? rawPwd : rawIdent);

  if (!pwd && !ident) {
    throw new Error("কর্মচারী ইউজারনেম/মোবাইল নম্বর ও পিন কোড দিন (Please enter username/phone and PIN)");
  }

  // Get business settings & default staff PIN
  let bizSettings: any = null;
  try {
    const bizSnap = await getDoc(doc(db, "businesses", "classic-world-settings"));
    if (bizSnap.exists()) {
      bizSettings = bizSnap.data();
    }
  } catch (_) {}

  const defaultStaffPin = (
    (typeof window !== "undefined" ? localStorage.getItem("cw_default_staff_pin") : null) ||
    (typeof window !== "undefined" ? localStorage.getItem("app_employee_pin_code_val") : null) ||
    bizSettings?.default_staff_pin ||
    "1234"
  ).trim();

  let allEmps: any[] = [];
  try {
    const snap = await fbGetDocs(collection(db, "employees"));
    allEmps = snap.docs.map(docToData);
  } catch (err) {
    console.warn("Error finding employee in Firestore:", err);
  }

  // Merge with local employee accounts cache if available
  if (typeof window !== "undefined") {
    try {
      const localEmpsRaw = localStorage.getItem("cw_employee_accounts");
      if (localEmpsRaw) {
        const localEmps = JSON.parse(localEmpsRaw);
        if (Array.isArray(localEmps)) {
          for (const le of localEmps) {
            if (!allEmps.some((e: any) => e.id === le.id)) {
              allEmps.push(le);
            }
          }
        }
      }
    } catch (_) {}
  }

  const cleanPhone = ident.replace(/[^0-9]/g, "");
  const lowerName = ident.toLowerCase();
  const isGenericStaffId = !ident || ["staff", "employee", "sales", "cashier", "pos", "classic", "admin", "1234", "0000", defaultStaffPin].includes(lowerName);

  let matchedEmp: any = null;

  // 1. Direct match by identifier, phone, email, or PIN
  if (!isGenericStaffId) {
    matchedEmp = allEmps.find((e: any) => {
      const ePhone = (e.phone || "").replace(/[^0-9]/g, "");
      const eName = (e.name || "").toLowerCase().trim();
      const eEmail = (e.email || "").toLowerCase().trim();
      const eUsername = (e.username || "").toLowerCase().trim();
      const ePin = String(e.pin || e.plain_password || e.password || "").trim();

      const matchesIdent =
        (e.id && e.id.toLowerCase() === lowerName) ||
        (eName && (eName === lowerName || eName.includes(lowerName) || lowerName.includes(eName))) ||
        (eEmail && eEmail === lowerName) ||
        (eUsername && eUsername === lowerName) ||
        (ePhone && cleanPhone && cleanPhone.length >= 4 && (ePhone === cleanPhone || ePhone.endsWith(cleanPhone) || cleanPhone.endsWith(ePhone))) ||
        (ePin && pwd && ePin === pwd);

      return matchesIdent;
    });
  }

  // 2. If matching by specific employee PIN
  if (!matchedEmp && pwd) {
    matchedEmp = allEmps.find((e: any) => {
      const ePin = String(e.pin || e.plain_password || e.password || "").trim();
      return ePin && ePin === pwd;
    });
  }

  // 3. If generic identifier or default PIN given, pick first active employee
  if (!matchedEmp && (isGenericStaffId || !ident)) {
    matchedEmp = allEmps.find((e: any) => e.status !== "inactive") || allEmps[0];
  }

  // 4. Check users collection fallback
  if (!matchedEmp && ident && !isGenericStaffId) {
    try {
      const qUser = query(collection(db, "users"), where("role", "==", "employee"));
      const userSnap = await getDocs(qUser);
      matchedEmp = userSnap.docs.map(docToData).find((u: any) => {
        const uEmail = (u.email || "").toLowerCase();
        const uPhone = (u.phone || "").replace(/[^0-9]/g, "");
        const uName = (u.full_name || u.name || "").toLowerCase();
        return (
          uEmail === lowerName ||
          uName === lowerName ||
          (uPhone && cleanPhone && cleanPhone.length >= 4 && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone)))
        );
      });
    } catch (_) {}
  }

  // 5. If shop has no employee documents created yet, do NOT allow login
  if (!matchedEmp) {
    throw new Error(
      "কোন কর্মচারী অ্যাকাউন্ট পাওয়া যায়নি। দোকান মালিককে আগে এডমিন প্যানেল থেকে কর্মচারী যোগ করতে বলুন। (No registered employee account found. Shop owner must add employee first.)"
    );
  }

  if (matchedEmp.status === "inactive") {
    throw new Error("এই কর্মচারী অ্যাকাউন্টটি নিষ্ক্রিয় রয়েছে। দোকান মালিকের সাথে যোগাযোগ করুন। (Employee account inactive)");
  }

  // Check password or PIN strictly against this employee's credentials (no default pins allowed)
  const candidatePin = (pwd || ident).trim();

  const validPwd =
    Boolean(matchedEmp.pin && String(matchedEmp.pin).trim() === candidatePin) ||
    Boolean(matchedEmp.password && String(matchedEmp.password).trim() === candidatePin) ||
    Boolean(matchedEmp.plain_password && String(matchedEmp.plain_password).trim() === candidatePin);

  if (!validPwd) {
    throw new Error("ভুল কর্মচারী পিন কোড বা পাসওয়ার্ড! আবার চেষ্টা করুন। (Incorrect employee password or PIN)");
  }

  const empIsIsolated = Boolean(
    matchedEmp.is_isolated_tenant === true ||
      (matchedEmp.business_id &&
        matchedEmp.business_id !== "classic-world-default" &&
        matchedEmp.business_id !== "classic-world-settings")
  );
  const empOwnerId = matchedEmp.owner_id || matchedEmp.owner_uid || undefined;

  const employeeUser = {
    id: matchedEmp.id,
    employee_id: matchedEmp.id,
    owner_id: empOwnerId,
    is_isolated_tenant: empIsIsolated,
    email: matchedEmp.email || (matchedEmp.phone ? `${matchedEmp.phone}@classicworld.com` : `emp_${matchedEmp.id}@classicworld.com`),
    phone: matchedEmp.phone || undefined,
    full_name: matchedEmp.name || matchedEmp.full_name || ident || "Shop Staff",
    role: "employee",
    base_salary: Number(matchedEmp.base_salary || matchedEmp.monthly_salary) || 0,
    monthly_salary: Number(matchedEmp.monthly_salary || matchedEmp.base_salary) || 0,
    advance_limit: matchedEmp.advance_limit !== undefined ? Number(matchedEmp.advance_limit) : (Number(matchedEmp.base_salary || matchedEmp.monthly_salary) || 0),
    permissions: matchedEmp.permissions || {
      can_sales: true,
      can_customers: true,
      can_returns: true,
      can_products: false,
      can_expenses: false,
      can_reports: false,
      can_delete: false,
      can_discount: false,
    },
    activated: true,
    status: matchedEmp.status || "active",
    business_id: matchedEmp.business_id || "classic-world-default",
    business_name: matchedEmp.business_name || (empIsIsolated ? "Shop" : bizSettings?.name || "Classic World"),
    logo_url: empIsIsolated ? "" : (bizSettings?.logo_url || "/logo.png"),
    profiles: [{ id: matchedEmp.profile_id || "default", name: "Default", created_at: new Date().toISOString() }],
    activeProfile: matchedEmp.profile_id || "default",
  };

  if (typeof window !== "undefined") {
    try {
      const { auth } = await import("@/lib/firebase");
      // Prevent owner Google account from overwriting employee session
      await auth.signOut();
    } catch (_) {}

    clearAuthProfile();
    clearQueryCache();
    localStorage.setItem("user", JSON.stringify(employeeUser));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(employeeUser));
    localStorage.setItem("cw_active_employee_session", JSON.stringify(employeeUser));
    localStorage.setItem("cw_active_session_role", "employee");
    localStorage.setItem("auth_token", `token_emp_${employeeUser.id}`);
    localStorage.setItem("active_profile", "default");
    sessionStorage.removeItem("app_pin_unlocked");
    window.dispatchEvent(new Event("hz-employee-switched"));
    window.dispatchEvent(new Event("storage"));
  }

  return { user: employeeUser, token: `token_emp_${employeeUser.id}` };
}
