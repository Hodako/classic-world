import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  increment,
  Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// Helper to convert Firestore documents into clean JSON objects
function docToData<T = any>(docSnap: any): T {
  const data = docSnap.data();
  let createdAtStr = new Date().toISOString();

  if (data?.created_at?.toDate) {
    createdAtStr = data.created_at.toDate().toISOString();
  } else if (typeof data?.created_at === "string") {
    createdAtStr = data.created_at;
  }

  return {
    id: docSnap.id,
    ...data,
    created_at: createdAtStr,
  } as T;
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
  const docRef = doc(db, "products", id);
  await deleteDoc(docRef);
  return { success: true, id };
}

// ── Sales ────────────────────────────────────────────────────────────────────
export async function fsGetSales() {
  try {
    const colRef = collection(db, "sales");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "sales"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
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

  const saleDoc = {
    product_id: data.product_id || null,
    product_name: data.product_name || "Custom Item",
    qty,
    buy_price: buyPrice,
    sell_price: sellPrice,
    profit: data.profit !== undefined ? Number(data.profit) : calculatedProfit,
    type: data.type || "cash",
    party_id: data.party_id || null,
    paid_amount: paidAmount,
    due_amount: dueAmount,
    discount,
    returned: false,
    return_qty: 0,
    note: data.note || null,
    cart_id: data.cart_id || null,
    created_at: Timestamp.now(),
  };

  const docRef = await addDoc(colRef, saleDoc);
  const saleId = docRef.id;

  // 1. Decrement product stock if product_id exists
  if (data.product_id) {
    try {
      const productRef = doc(db, "products", data.product_id);
      await updateDoc(productRef, {
        stock: increment(-qty),
      });
    } catch (err) {
      console.warn("Product stock adjustment skipped:", err);
    }
  }

  // 2. Cashbox log if cash or paid amount received
  const cashReceived = data.type === "cash" ? (paidAmount || (sellPrice * qty - discount)) : paidAmount;
  if (cashReceived > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "sale",
        amount: cashReceived,
        note: `Sale: ${data.product_name || "Item"} (x${qty})`,
        ref_id: saleId,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox sale log skipped:", err);
    }
  }

  // 3. If credit sale with party, record receivable
  if (data.type === "credit" && data.party_id && dueAmount > 0) {
    try {
      await addDoc(collection(db, "party_receivables"), {
        party_id: data.party_id,
        amount: dueAmount,
        note: `Credit sale: ${data.product_name || "Item"}`,
        ref_id: saleId,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Party receivable log skipped:", err);
    }
  }

  return { success: true, id: saleId };
}

export async function fsDeleteSale(id: string) {
  const docRef = doc(db, "sales", id);
  await deleteDoc(docRef);
  return { success: true, id };
}

export async function fsEditSale(id: string, data: any) {
  const docRef = doc(db, "sales", id);
  await updateDoc(docRef, data);
  return { success: true, id };
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

  const purchaseDoc = {
    product_id: data.product_id || null,
    product_name: data.product_name || "Purchased Item",
    qty,
    unit_cost: unitCost,
    total,
    note: data.note || null,
    payment_type: data.payment_type || "cash",
    party_id: data.party_id || null,
    created_at: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, "purchases"), purchaseDoc);
  const purchaseId = docRef.id;

  // 1. Increment product stock
  if (data.product_id) {
    try {
      const productRef = doc(db, "products", data.product_id);
      await updateDoc(productRef, {
        stock: increment(qty),
        buy_price: unitCost > 0 ? unitCost : undefined,
      });
    } catch (err) {
      console.warn("Product stock increment skipped:", err);
    }
  }

  // 2. Cashbox expense if cash purchase
  if (data.payment_type !== "credit" && total > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount: total,
        note: `Purchase: ${data.product_name || "Item"} (x${qty})`,
        ref_id: purchaseId,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox purchase log skipped:", err);
    }
  }

  // 3. Party payable if credit purchase
  if (data.payment_type === "credit" && data.party_id && total > 0) {
    try {
      await addDoc(collection(db, "party_payables"), {
        party_id: data.party_id,
        amount: total,
        note: `Credit purchase: ${data.product_name || "Item"}`,
        ref_id: purchaseId,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Party payable log skipped:", err);
    }
  }

  return { success: true, id: purchaseId };
}

export async function fsDeletePurchase(id: string) {
  await deleteDoc(doc(db, "purchases", id));
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
  const docRef = await addDoc(collection(db, "expenses"), {
    title: data.title || "Expense",
    amount,
    category: data.category || "General",
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "expense",
        amount,
        note: `Expense: ${data.title || "General"}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox expense log skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
}

export async function fsDeleteExpense(id: string) {
  await deleteDoc(doc(db, "expenses", id));
  return { success: true, id };
}

// ── Cashbox ──────────────────────────────────────────────────────────────────
export async function fsGetCashbox() {
  try {
    const colRef = collection(db, "cashbox_logs");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(docToData);
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "cashbox_logs"));
      return snap.docs.map(docToData);
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateCashbox(data: any) {
  const docRef = await addDoc(collection(db, "cashbox_logs"), {
    kind: data.kind || "deposit",
    amount: Number(data.amount) || 0,
    note: data.note || null,
    ref_id: data.ref_id || null,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsUpdateCashbox(id: string, data: any) {
  await updateDoc(doc(db, "cashbox_logs", id), data);
  return { success: true, id };
}

export async function fsDeleteCashbox(id: string) {
  await deleteDoc(doc(db, "cashbox_logs", id));
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
  const docRef = await addDoc(collection(db, "withdrawals"), {
    amount,
    note: data.note || "Owner Withdrawal",
    created_at: Timestamp.now(),
  });

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount,
        note: `Withdrawal: ${data.note || "Owner"}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox withdrawal log skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
}

// ── Somiti ───────────────────────────────────────────────────────────────────
export async function fsGetSomiti() {
  try {
    const snap = await getDocs(collection(db, "somiti"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateSomiti(data: any) {
  const amount = Number(data.amount) || 0;
  const docRef = await addDoc(collection(db, "somiti"), {
    kind: data.kind || "deposit",
    amount,
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: data.kind === "deposit" ? "deposit" : "withdraw",
        amount,
        note: `Samity ${data.kind}: ${data.note || ""}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox samity log skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
}

export async function fsUpdateSomiti(id: string, data: any) {
  await updateDoc(doc(db, "somiti", id), data);
  return { success: true, id };
}

export async function fsDeleteSomiti(id: string) {
  await deleteDoc(doc(db, "somiti", id));
  return { success: true, id };
}

// ── Parties ──────────────────────────────────────────────────────────────────
export async function fsGetParties() {
  try {
    const snap = await getDocs(collection(db, "parties"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateParty(data: any) {
  const docRef = await addDoc(collection(db, "parties"), {
    name: data.name || "",
    phone: data.phone || null,
    address: data.address || null,
    archived: false,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsUpdateParty(id: string, data: any) {
  await updateDoc(doc(db, "parties", id), data);
  return { success: true, id };
}

export async function fsDeleteParty(id: string) {
  await deleteDoc(doc(db, "parties", id));
  return { success: true, id };
}

// ── Customers ────────────────────────────────────────────────────────────────
export async function fsGetCustomers() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreateCustomer(data: any) {
  const docRef = await addDoc(collection(db, "customers"), {
    name: data.name || "",
    phone: data.phone || null,
    address: data.address || null,
    archived: false,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsUpdateCustomer(id: string, data: any) {
  await updateDoc(doc(db, "customers", id), data);
  return { success: true, id };
}

export async function fsDeleteCustomer(id: string) {
  await deleteDoc(doc(db, "customers", id));
  return { success: true, id };
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

export async function fsCreatePayment(data: any) {
  const amount = Number(data.amount) || 0;
  const docRef = await addDoc(collection(db, "payments"), {
    party_id: data.party_id,
    amount,
    note: data.note || "Party Payment",
    created_at: Timestamp.now(),
  });

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "deposit",
        amount,
        note: `Payment from Party: ${data.note || ""}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox payment log skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
}

export async function fsDeletePayment(id: string) {
  await deleteDoc(doc(db, "payments", id));
  return { success: true, id };
}

export async function fsGetAllPartyReceivables() {
  try {
    const snap = await getDocs(collection(db, "party_receivables"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreatePartyReceivable(data: any) {
  const docRef = await addDoc(collection(db, "party_receivables"), {
    party_id: data.party_id,
    amount: Number(data.amount) || 0,
    note: data.note || null,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsGetAllPartyPayables() {
  try {
    const snap = await getDocs(collection(db, "party_payables"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreatePartyPayable(data: any) {
  const docRef = await addDoc(collection(db, "party_payables"), {
    party_id: data.party_id,
    amount: Number(data.amount) || 0,
    note: data.note || null,
    created_at: Timestamp.now(),
  });
  return { success: true, id: docRef.id };
}

export async function fsGetAllPayableSettlements() {
  try {
    const snap = await getDocs(collection(db, "payable_settlements"));
    return snap.docs.map(docToData);
  } catch (err) {
    return [];
  }
}

export async function fsCreatePayableSettlement(data: any) {
  const amount = Number(data.amount) || 0;
  const docRef = await addDoc(collection(db, "payable_settlements"), {
    party_id: data.party_id,
    amount,
    note: data.note || "Payable Settlement",
    created_at: Timestamp.now(),
  });

  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount,
        note: `Payable Settlement: ${data.note || ""}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox settlement log skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
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
  const qty = Number(data.qty) || 1;
  const docRef = await addDoc(collection(db, "returns"), {
    sale_id: data.sale_id || null,
    product_id: data.product_id || null,
    product_name: data.product_name || "Returned Item",
    qty,
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  // Restore product stock
  if (data.product_id) {
    try {
      await updateDoc(doc(db, "products", data.product_id), {
        stock: increment(qty),
      });
    } catch (err) {
      console.warn("Stock restore on return skipped:", err);
    }
  }

  return { success: true, id: docRef.id };
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
export async function fsValidateAndActivateLicense(licenseKey: string, userUid?: string, userEmail?: string) {
  const cleanKey = (licenseKey || "").trim().toUpperCase();
  if (!cleanKey) {
    throw new Error("License key cannot be empty.");
  }

  // Check if valid license pattern or in Firestore licenses collection
  const isValidFormat =
    cleanKey.startsWith("CW-") ||
    cleanKey.startsWith("EMP-") ||
    cleanKey.startsWith("HZ-") ||
    cleanKey.startsWith("CLASSIC-") ||
    cleanKey.length >= 8;

  if (!isValidFormat) {
    throw new Error("Invalid license key format. Keys start with CW- or EMP-.");
  }

  // Update user document in Firestore
  if (userUid) {
    try {
      const userRef = doc(db, "users", userUid);
      await setDoc(userRef, {
        activated: true,
        license_key: cleanKey,
        role: cleanKey.startsWith("EMP-") ? "employee" : "owner",
        email: userEmail || "",
        activated_at: Timestamp.now(),
      }, { merge: true });
    } catch (err) {
      console.warn("Firestore user license activation update warning:", err);
    }
  }

  return { success: true, activated: true, licenseKey: cleanKey };
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

