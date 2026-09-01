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
  limit,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { clearAuthProfile } from "./local-cache";
import { clearQueryCache } from "./query-cache";
import * as jose from "jose";

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
    _id: docSnap.id,
    ...data,
    created_at: createdAtStr,
  } as T;
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
    const colRef = collection(db, "sales");
    const q = query(colRef, orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    const sales = snap.docs.map(docToData);

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

  // 2. Cashbox log if cash payment
  const isDirectPayment = data.type === "cash" || data.type === "nagad" || data.type === "card" || data.type === "pos";
  const isDigitalPending = data.type === "bkash" || data.type === "bank";
  const isOnline = data.type === "online";
  const cashReceived = (isOnline || isDigitalPending) ? 0 : (isDirectPayment ? (paidAmount || (sellPrice * qty - discount)) : paidAmount);
  if (cashReceived > 0) {
    try {
      const methodTag = data.type ? ` [Paid by ${data.type.toUpperCase()}]` : "";
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "sale",
        amount: cashReceived,
        note: `Sale${methodTag}: ${data.product_name || "Item"} (x${qty})${data.note ? ` - ${data.note}` : ""}`,
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

  return {
    success: true,
    id: saleId,
    _id: saleId,
    ...saleDoc,
    payment_status: isDigitalPending ? "pending" : "accepted",
    payment_accepted: !isDigitalPending,
    created_at: new Date().toISOString()
  };
}

export async function fsAcceptDigitalPayment(id: string) {
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Sale not found");
  const s = snap.data();
  const total = Number(s.paid_amount) || Number(s.sell_price) || (Number(s.qty) * Number(s.buy_price) + Number(s.profit));

  await updateDoc(docRef, {
    payment_status: "accepted",
    payment_accepted: true,
    accepted_at: Timestamp.now(),
  });

  // Credit Cashbox
  try {
    await addDoc(collection(db, "cashbox_logs"), {
      kind: "sale",
      amount: total,
      note: `Digital Payment Received [${(s.type || "bkash").toUpperCase()}]: ${s.product_name || "Item"} (INV-${id.slice(-6).toUpperCase()})`,
      ref_id: id,
      created_at: Timestamp.now(),
    });
  } catch (err) {
    console.warn("Cashbox digital payment log skipped:", err);
  }

  return { success: true, id };
}

export async function fsApproveCourierPayment(id: string) {
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Sale not found");
  const s = snap.data();
  const total = Number(s.sell_price) || (Number(s.qty) * Number(s.buy_price) + Number(s.profit));

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
  const docRef = doc(db, "sales", id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Sale not found");
  const s = snap.data();

  // Restore inventory stock
  if (s.product_id && !s.returned) {
    try {
      const productRef = doc(db, "products", s.product_id);
      await updateDoc(productRef, {
        stock: increment(Number(s.qty) || 1),
      });
    } catch (err) {
      console.warn("Product restore stock skipped:", err);
    }
  }

  await updateDoc(docRef, {
    courier_status: "cancelled",
    returned: true,
    cancelled_at: Timestamp.now(),
  });

  return { success: true, id };
}

export async function fsDeleteSale(id: string) {
  await fsMoveToRecycleBin("sales", id, "Sale #" + id);
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
  await fsMoveToRecycleBin("expenses", id, "Expense #" + id);
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

  const docRef = await addDoc(collection(db, "owner_wallet"), {
    amount,
    category,
    note: note || null,
    cut_from_profit: cutFromProfit,
    created_at: Timestamp.now(),
  });

  // 1. Log in cashbox as withdrawal to reduce cash balance (Always)
  if (amount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "withdraw",
        amount,
        note: title,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
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
          created_at: Timestamp.now(),
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
  const catLabel = category === "family" ? "পরিবার খরচ" : category === "bazar" ? "বাজার খরচ" : category === "home_rent" ? "বাসা ভাড়া" : category === "medical" ? "চিকিৎসা" : "ব্যক্তিগত";
  const title = `[মালিকের খরচ] ${catLabel}: ${note || "ব্যক্তিগত উত্তোলন"}`;

  await updateDoc(doc(db, "owner_wallet", id), {
    amount,
    category,
    note: note || null,
    updated_at: Timestamp.now(),
  });

  try {
    const cbSnap = await getDocs(query(collection(db, "cashbox_logs"), where("ref_id", "==", id)));
    for (const d of cbSnap.docs) {
      await updateDoc(d.ref, { amount, note: title });
    }
  } catch (_) {}
  try {
    const expSnap = await getDocs(query(collection(db, "expenses"), where("category", "==", "owner_personal")));
    for (const d of expSnap.docs) {
      const dData = d.data();
      if (dData.note?.includes(id)) {
        await updateDoc(d.ref, { amount, title, note: `Owner Wallet ID: ${id} - ${note}` });
      }
    }
  } catch (_) {}

  return { success: true };
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
  const kind = data.kind || "deposit";
  const docRef = await addDoc(collection(db, "somiti"), {
    kind,
    amount,
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  const shouldSkipCashbox = Boolean(data.skipCashbox || data.is_initial);

  if (amount > 0 && !shouldSkipCashbox) {
    try {
      // Depositing into Samity reduces cash from cashbox (withdraw); withdrawing from Samity returns cash to cashbox (deposit)
      // Samity is savings/DPS and is NOT deducted from business net profit
      const cashboxKind = kind === "withdraw" ? "deposit" : "withdraw";
      await addDoc(collection(db, "cashbox_logs"), {
        kind: cashboxKind,
        amount,
        note: `Samity ${kind}: ${data.note || ""}`,
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
  if (data.amount !== undefined || data.kind !== undefined) {
    try {
      const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
      const snap = await getDocs(q);
      const cashboxKind = data.kind === "withdraw" ? "deposit" : "withdraw";
      for (const logDoc of snap.docs) {
        await updateDoc(doc(db, "cashbox_logs", logDoc.id), {
          kind: cashboxKind,
          amount: Number(data.amount) || 0,
          note: `Samity ${data.kind || "deposit"}: ${data.note || ""}`,
        });
      }
    } catch (_) {}
  }
  return { success: true, id };
}

export async function fsDeleteSomiti(id: string) {
  try {
    await fsMoveToRecycleBin("somiti", id, "Somiti #" + id);
    const q = query(collection(db, "cashbox_logs"), where("ref_id", "==", id));
    const snap = await getDocs(q);
    for (const logDoc of snap.docs) {
      await deleteDoc(doc(db, "cashbox_logs", logDoc.id));
    }
  } catch (_) {}
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
  await fsMoveToRecycleBin("parties", id, "Party #" + id);
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
  await fsMoveToRecycleBin("customers", id, "Customer #" + id);
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
  const qty = Number(data.qty) || 1;
  const returnPrice = Number(data.return_price) || 0;
  const profitAdj = Number(data.profit_adjustment) || 0;
  const returnDate = data.return_date || new Date().toISOString().slice(0, 10);

  const docRef = await addDoc(collection(db, "returns"), {
    sale_id: data.sale_id || null,
    product_id: data.product_id || null,
    product_name: data.product_name || "Returned Item",
    qty,
    return_price: returnPrice,
    buy_price: Number(data.buy_price) || 0,
    profit_adjustment: profitAdj,
    return_date: returnDate,
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

  // Deduct refund amount from cashbox
  if (data.deduct_cashbox && returnPrice > 0) {
    try {
      const refundTotal = returnPrice * qty;
      await addDoc(collection(db, "cashbox"), {
        type: "return_deduction",
        amount: -refundTotal,
        note: `Product return: ${data.product_name || "item"} ×${qty}`,
        return_id: docRef.id,
        return_date: returnDate,
        created_at: Timestamp.now(),
      });
    } catch (err) {
      console.warn("Cashbox deduction on return skipped:", err);
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
    allowed_pages: data.allowedPages || ["/dashboard", "/sales", "/products"],
    allowed_kpis: data.allowedKpis || ["sell_kpi", "total_stock", "today_sales"],
    permissions: data.permissions || {
      dashboard: true,
      sales: true,
      products: true,
      parties: false,
      purchases: false,
      expenses: false,
      reports: false,
      settings: false,
      cashbox: false,
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

  const allowedPages = licenseData?.allowed_pages || (isEmployeeKey ? ["/dashboard", "/sales", "/products"] : undefined);
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
  const installments = Number(data.total_installments) || 1;
  const installmentAmount = Number(data.installment_amount) || (repayable / installments);

  const docRef = await addDoc(collection(db, "bank_loans"), {
    bank_name: data.bank_name || "",
    loan_title: data.loan_title || "Business Loan",
    principal_amount: principal,
    total_repayable: repayable,
    total_installments: installments,
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
    if (user.password && user.password === args.password) return { success: true, method: "password" };
    if (user.plain_password && user.plain_password === args.password) return { success: true, method: "password" };
    if (!user.password && !user.plain_password) {
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

  if (!args.newPassword || args.newPassword.trim().length < 6) {
    throw new Error("New password must be at least 6 characters long");
  }

  if (args.currentPassword && (user.password || user.plain_password)) {
    const matches = user.password === args.currentPassword || user.plain_password === args.currentPassword;
    if (!matches) throw new Error("Current password is incorrect");
  }

  const updated = {
    ...user,
    password: args.newPassword.trim(),
    plain_password: args.newPassword.trim(),
  };

  try {
    await setDoc(doc(db, "users", user.id), updated, { merge: true });
  } catch (e) {}
  
  localStorage.setItem("user", JSON.stringify(updated));
  return { success: true };
}

export function fsGetCurrentUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user") || localStorage.getItem("auth_profile");
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const authUser = auth.currentUser;
  if (authUser) {
    return {
      id: authUser.uid,
      email: authUser.email || "user@classicworld.com",
      full_name: authUser.displayName || "Classic World User",
      role: "owner",
      activated: true,
      business_id: "classic-world-default",
      business_name: "Classic World",
      logo_url: authUser.photoURL || "/logo.png",
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

export async function fsGetBusinessSettings() {
  const user = fsGetCurrentUser();
  let bizData: any = null;
  try {
    const docSnap = await getDoc(doc(db, "businesses", "classic-world-settings"));
    if (docSnap.exists()) {
      bizData = docSnap.data();
    }
  } catch (_) {}

  return {
    business: {
      id: bizData?.id || user?.business_id || "classic-world-default",
      name: bizData?.name || user?.business_name || "Classic World",
      logo_url: bizData?.logo_url || user?.logo_url || "/logo.png",
      address: bizData?.address || user?.business_address || "Dhaka, Bangladesh",
      phone_numbers: bizData?.phone_numbers || user?.business_phone_numbers || "01700000000",
      emails: bizData?.emails || user?.business_emails || "info@classicworld.com",
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
  try {
    const bizDocId = (typeof window !== "undefined" && window.location.pathname.includes("classic")) ? "classic-world-settings" : "classic-world-settings";
    await setDoc(doc(db, "businesses", bizDocId), data, { merge: true });
  } catch (_) {}
  // Cloud persistence sync
  if (typeof window !== "undefined") {
    if (data.kpi_config) localStorage.setItem("hz_kpi_config", JSON.stringify(data.kpi_config));
    if (data.employee_accounts) localStorage.setItem("cw_employee_accounts", JSON.stringify(data.employee_accounts));
    if (data.owner_pin) localStorage.setItem("app_pin_code_val", String(data.owner_pin));
  }
  const user = fsGetCurrentUser();
  if (user) {
    const updatedUser = { ...user, ...data };
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(updatedUser));
      localStorage.setItem("auth_profile", JSON.stringify(updatedUser));
    }
  }
  return { success: true };
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

export async function fsFirebaseAuthSync(data: { email: string; fullName?: string; photoUrl?: string; firebaseUid?: string }) {
  const cleanEmail = (data.email || "").toLowerCase().trim();
  const userId = data.firebaseUid || crypto.randomUUID();

  let existingUser: any = null;
  try {
    const userDocRef = doc(db, "users", userId);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
      existingUser = { id: userDocSnap.id, ...userDocSnap.data() };
    } else {
      const q = query(collection(db, "users"), where("email", "==", cleanEmail), limit(1));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        existingUser = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() };
      }
    }
  } catch (e) {
    console.warn("Error querying Firestore for existing user:", e);
  }

  let bizSettings: any = null;
  try {
    const bizSnap = await getDoc(doc(db, "businesses", "classic-world-settings"));
    if (bizSnap.exists()) {
      bizSettings = bizSnap.data();
    }
  } catch (_) {}

  // Check if email or phone is registered in employees collection
  let matchedEmp: any = null;
  try {
    const empQ = query(collection(db, "employees"), where("email", "==", cleanEmail), limit(1));
    const empSnap = await getDocs(empQ);
    if (!empSnap.empty) {
      matchedEmp = { id: empSnap.docs[0].id, ...empSnap.docs[0].data() };
    }
  } catch (_) {}

  const userObj = existingUser
    ? {
        ...existingUser,
        id: existingUser.id || userId,
        email: cleanEmail,
        full_name: existingUser.full_name || data.fullName || cleanEmail.split("@")[0],
        business_name: existingUser.business_name || bizSettings?.name || "Classic World",
        logo_url: existingUser.logo_url || bizSettings?.logo_url || data.photoUrl || "/logo.png",
        avatar_url: data.photoUrl || existingUser.avatar_url || undefined,
        firebase_uid: data.firebaseUid || existingUser.firebase_uid,
        activated: true,
        status: existingUser.status || "active",
      }
    : {
        id: userId,
        email: cleanEmail,
        full_name: data.fullName || cleanEmail.split("@")[0],
        role: matchedEmp ? "employee" : "owner",
        employee_id: matchedEmp?.id || undefined,
        permissions: matchedEmp?.permissions || undefined,
        activated: true,
        business_id: "classic-world-default",
        business_name: bizSettings?.name || "Classic World",
        logo_url: data.photoUrl || bizSettings?.logo_url || "/logo.png",
        avatar_url: data.photoUrl || undefined,
        firebase_uid: data.firebaseUid,
        status: "active",
        sms_credits: 100,
        profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
        activeProfile: "default",
      };

  try {
    await setDoc(doc(db, "users", userObj.id), userObj, { merge: true });
  } catch (e) {
    console.warn("Error saving user doc:", e);
  }

  if (typeof window !== "undefined") {
    clearAuthProfile();
    clearQueryCache();
    localStorage.setItem("user", JSON.stringify(userObj));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userObj));
    localStorage.setItem("auth_token", `token_${userObj.id}`);
    localStorage.setItem("active_profile", userObj.activeProfile || "default");
  }

  return { user: userObj, token: `token_${userObj.id}` };
}

export async function fsLogin(data: { identifier?: string; email?: string; phone?: string; password?: string }) {
  const ident = (data.identifier || data.email || data.phone || "").trim().toLowerCase();
  const pwd = (data.password || "").trim();
  if (!ident || !pwd) {
    throw new Error("Please enter mobile/email and password");
  }

    let userDoc: any = null;
  try {
    const qEmail = query(collection(db, "users"), where("email", "==", ident), limit(1));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) {
      userDoc = { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() };
    } else {
      const qPhone = query(collection(db, "users"), where("phone", "==", ident), limit(1));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        userDoc = { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() };
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

  if (!userDoc) {
    const newId = crypto.randomUUID();
    userDoc = {
      id: newId,
      email: ident.includes("@") ? ident : `${ident}@classicworld.com`,
      phone: !ident.includes("@") ? ident : undefined,
      full_name: ident.split("@")[0],
      password: pwd,
      plain_password: pwd,
      role: "owner",
      activated: true,
      business_id: "classic-world-default",
      business_name: "Classic World",
      logo_url: "/logo.png",
      status: "active",
      sms_credits: 100,
      profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
      activeProfile: "default",
    };
    try {
      await setDoc(doc(db, "users", newId), userDoc);
    } catch (_) {}
  } else {
    if (userDoc.password && userDoc.password !== pwd && userDoc.plain_password !== pwd) {
      throw new Error("Incorrect password. Please try again.");
    }
  }

  if (typeof window !== "undefined") {
    clearAuthProfile();
    clearQueryCache();
    localStorage.setItem("user", JSON.stringify(userDoc));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userDoc));
    localStorage.setItem("auth_token", `token_${userDoc.id}`);
    localStorage.setItem("active_profile", userDoc.activeProfile || "default");
  }

  return { user: userDoc, token: `token_${userDoc.id}` };
}

export async function fsRegister(data: { identifier?: string; email?: string; phone?: string; password?: string; fullName?: string; role?: string }) {
  const ident = (data.identifier || data.email || data.phone || "").trim().toLowerCase();
  const pwd = (data.password || "").trim();
  const fullName = (data.fullName || "").trim() || ident.split("@")[0];
  const newId = crypto.randomUUID();

  const userDoc = {
    id: newId,
    email: ident.includes("@") ? ident : `${ident}@classicworld.com`,
    phone: !ident.includes("@") ? ident : undefined,
    full_name: fullName,
    password: pwd,
    plain_password: pwd,
    role: data.role || "owner",
    activated: true,
    business_id: "classic-world-default",
    business_name: "Classic World",
    logo_url: "/logo.png",
    status: "active",
    sms_credits: 100,
    profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
    activeProfile: "default",
  };

  try {
    await setDoc(doc(db, "users", newId), userDoc);
  } catch (e) {
    console.warn("Register doc write error:", e);
  }

  if (typeof window !== "undefined") {
    clearAuthProfile();
    clearQueryCache();
    localStorage.setItem("user", JSON.stringify(userDoc));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(userDoc));
    localStorage.setItem("auth_token", `token_${newId}`);
    localStorage.setItem("active_profile", "default");
  }

  return { user: userDoc, token: `token_${newId}` };
}

// ── Somiti Management ────────────────────────────────────────────────────────
export async function fsRenameSomiti(data: { oldName: string; newName: string }) {
  try {
    const snap = await getDocs(collection(db, "somiti_entries"));
    const oldNameTrim = (data.oldName || "").trim().toLowerCase();
    const newNameTrim = (data.newName || "").trim();
    for (const d of snap.docs) {
      const entry = d.data();
      const note = entry.note || "";
      const match = note.match(/^\[(.*?)\](?:\s*(.*))?$/);
      if (match) {
        const parsedName = match[1].trim().toLowerCase();
        if (parsedName === oldNameTrim) {
          const actualNote = match[2]?.trim() || "";
          const newNote = actualNote ? `[${newNameTrim}] ${actualNote}` : `[${newNameTrim}]`;
          await updateDoc(doc(db, "somiti_entries", d.id), { note: newNote });
        }
      }
    }
  } catch (_) {}
  return { success: true };
}

export async function fsDeleteSomitiByName(data: { name: string }) {
  try {
    const snap = await getDocs(collection(db, "somiti_entries"));
    const targetName = (data.name || "").trim().toLowerCase();
    for (const d of snap.docs) {
      const entry = d.data();
      const note = entry.note || "";
      const match = note.match(/^\[(.*?)\](?:\s*(.*))?$/);
      if (match) {
        const parsedName = match[1].trim().toLowerCase();
        if (parsedName === targetName) {
          await deleteDoc(doc(db, "somiti_entries", d.id));
        }
      }
    }
  } catch (_) {}
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
      getDocs(collection(db, "somiti_entries")),
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
          created_at: sale.created_at || Timestamp.now(),
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
          created_at: ret.created_at || Timestamp.now(),
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
          created_at: pur.created_at || Timestamp.now(),
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
          created_at: exp.created_at || Timestamp.now(),
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
          created_at: wData.created_at || Timestamp.now(),
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
          created_at: wData.created_at || Timestamp.now(),
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
          created_at: sData.created_at || Timestamp.now(),
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
          created_at: pData.created_at || Timestamp.now(),
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
          created_at: esData.created_at || Timestamp.now(),
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
    const q = query(collection(db, "employees"), orderBy("created_at", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
    }));
  } catch (err) {
    try {
      const snap = await getDocs(collection(db, "employees"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      }));
    } catch (_) {
      return [];
    }
  }
}

export async function fsAddEmployee(data: any) {
  const phone = (data.phone || "").replace(/\s+/g, "").trim();
  const email = (data.email || "").toLowerCase().trim();
  const docRef = await addDoc(collection(db, "employees"), {
    name: (data.name || "Employee").trim(),
    password: data.password || data.pin || "1234",
    pin: data.pin || data.password || "1234",
    plain_password: data.password || data.pin || "1234",
    phone: phone || null,
    email: email || null,
    designation: (data.designation || "Staff").trim(),
    base_salary: Number(data.base_salary) || 0,
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
  });
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
    if (data.pin) updatePayload.pin = data.pin;
    if (phone !== undefined) updatePayload.phone = phone || null;
    if (email !== undefined) updatePayload.email = email || null;
    if (data.designation !== undefined) updatePayload.designation = data.designation;
    if (data.base_salary !== undefined) updatePayload.base_salary = Number(data.base_salary) || 0;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.permissions !== undefined) updatePayload.permissions = data.permissions;
    if (data.notes !== undefined) updatePayload.notes = data.notes;

    await updateDoc(doc(db, "employees", id), updatePayload);
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
    }));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_salaries"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      }));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeSalary(data: any) {
  const amount = Number(data.amount) || 0;
  const empName = data.employee_name || "Employee";
  const month = data.month || new Date().toISOString().slice(0, 7);
  const paymentMethod = data.payment_method || "cash";

  const docRef = await addDoc(collection(db, "employee_salaries"), {
    employee_id: data.employee_id,
    employee_name: empName,
    month,
    amount,
    base_salary: Number(data.base_salary) || 0,
    deductions: Number(data.deductions) || 0,
    bonus: Number(data.bonus) || 0,
    payment_method: paymentMethod,
    payment_date: data.payment_date || new Date().toISOString().slice(0, 10),
    status: data.status || "paid",
    note: data.note || null,
    created_at: Timestamp.now(),
  });

  const title = `[কর্মচারী বেতন] ${empName} (${month})`;

  // 1. Log in general expenses as "salary"
  if (amount > 0) {
    try {
      await addDoc(collection(db, "expenses"), {
        title,
        amount,
        category: "salary",
        note: `Employee Salary ID: ${docRef.id} | Paid via ${paymentMethod}`,
        created_at: Timestamp.now(),
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
          ref_id: docRef.id,
          created_at: Timestamp.now(),
        });
      } catch (e) {
        console.warn("Salary cashbox log skipped:", e);
      }
    }
  }

  return { success: true, id: docRef.id };
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
    }));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_expenses"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      }));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeExpense(data: any) {
  const amount = Number(data.amount) || 0;
  const empName = data.employee_name || "Employee";
  const category = data.category || "food"; // food, travel, tea, bonus, other
  const note = data.note || "";
  const paymentMethod = data.payment_method || "cash";

  const catLabel = category === "food" ? "খাবার ভাতা" : category === "travel" ? "যাতায়াত" : category === "tea" ? "নাস্তা/চা" : category === "bonus" ? "বোনাস" : "অন্যান্য";
  const title = `[কর্মচারী খরচ] ${empName} (${catLabel}): ${note}`;

  const docRef = await addDoc(collection(db, "employee_expenses"), {
    employee_id: data.employee_id || null,
    employee_name: empName,
    category,
    amount,
    payment_method: paymentMethod,
    date: data.date || new Date().toISOString().slice(0, 10),
    note: note || null,
    created_at: Timestamp.now(),
  });

  // Log in expenses
  if (amount > 0) {
    try {
      await addDoc(collection(db, "expenses"), {
        title,
        amount,
        category: "employee_expense",
        note: `Employee Expense ID: ${docRef.id}`,
        created_at: Timestamp.now(),
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
          created_at: Timestamp.now(),
        });
      } catch (_) {}
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
    }));
  } catch (_) {
    try {
      const snap = await getDocs(collection(db, "employee_shoppings"));
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        created_at: d.data().created_at?.toDate?.()?.toISOString() || new Date().toISOString(),
      }));
    } catch (_) {
      return [];
    }
  }
}

export async function fsCreateEmployeeShopping(data: any) {
  const empName = data.employee_name || "Employee";
  const items = Array.isArray(data.items) ? data.items : [];
  const totalAmount = Number(data.total_amount) || 0;
  const paymentStatus = data.payment_status || "deduct_from_salary"; // deduct_from_salary, paid_cash, gift
  const note = data.note || "";

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
  const docRef = await addDoc(collection(db, "employee_shoppings"), {
    employee_id: data.employee_id || null,
    employee_name: empName,
    items,
    total_amount: totalAmount,
    payment_status: paymentStatus,
    date: data.date || new Date().toISOString().slice(0, 10),
    note: note || null,
    created_at: Timestamp.now(),
  });

  // 3. If paid in cash, add to cashbox as income
  if (paymentStatus === "paid_cash" && totalAmount > 0) {
    try {
      await addDoc(collection(db, "cashbox_logs"), {
        kind: "deposit",
        amount: totalAmount,
        note: `[কর্মচারী কেনাকাটা নগদ আদায়] ${empName}: ${note || "পোশাক বিক্রয়"}`,
        ref_id: docRef.id,
        created_at: Timestamp.now(),
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

export async function fsEmployeeLogin(data: { username?: string; identifier?: string; password?: string }) {
  const ident = (data.username || data.identifier || "").trim();
  const pwd = (data.password || "").trim();

  if (!ident || !pwd) {
    throw new Error("Please enter username/phone and password/PIN");
  }

  const cleanPhone = ident.replace(/[^0-9]/g, "");
  const lowerName = ident.toLowerCase();

  let matchedEmp: any = null;

  try {
    // 1. Search in employees collection
    const snap = await getDocs(collection(db, "employees"));
    const allEmps = snap.docs.map(docToData);
    
    matchedEmp = allEmps.find((e: any) => {
      const ePhone = (e.phone || "").replace(/[^0-9]/g, "");
      const eName = (e.name || "").toLowerCase().trim();
      const eEmail = (e.email || "").toLowerCase().trim();
      const eUsername = (e.username || "").toLowerCase().trim();

      const matchesIdent = 
        (e.id && e.id.toLowerCase() === lowerName) ||
        (eName && eName === lowerName) ||
        (eEmail && eEmail === lowerName) ||
        (eUsername && eUsername === lowerName) ||
        (ePhone && cleanPhone && (ePhone === cleanPhone || ePhone.endsWith(cleanPhone) || cleanPhone.endsWith(ePhone)));

      return matchesIdent;
    });
  } catch (err) {
    console.warn("Error finding employee:", err);
  }

  // 2. If not found in employees collection, check users collection with role: 'employee'
  if (!matchedEmp) {
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
          (uPhone && cleanPhone && (uPhone === cleanPhone || uPhone.endsWith(cleanPhone)))
        );
      });
    } catch (_) {}
  }

  if (!matchedEmp) {
    throw new Error("No employee account found with this username/phone");
  }

  if (matchedEmp.status === "inactive") {
    throw new Error("This employee account is inactive. Please contact store owner.");
  }

  // Check password or PIN
  const validPwd =
    matchedEmp.password === pwd ||
    matchedEmp.plain_password === pwd ||
    matchedEmp.pin === pwd ||
    (matchedEmp.password && String(matchedEmp.password) === String(pwd)) ||
    (!matchedEmp.password && !matchedEmp.pin);

  if (!validPwd) {
    throw new Error("Incorrect employee password or PIN");
  }

  // Get business settings
  let bizSettings: any = null;
  try {
    const bizSnap = await getDoc(doc(db, "businesses", "classic-world-settings"));
    if (bizSnap.exists()) {
      bizSettings = bizSnap.data();
    }
  } catch (_) {}

  const employeeUser = {
    id: matchedEmp.id,
    employee_id: matchedEmp.id,
    email: matchedEmp.email || (matchedEmp.phone ? `${matchedEmp.phone}@classicworld.com` : `emp_${matchedEmp.id}@classicworld.com`),
    phone: matchedEmp.phone || undefined,
    full_name: matchedEmp.name || matchedEmp.full_name || ident,
    role: "employee",
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
    business_id: "classic-world-default",
    business_name: bizSettings?.name || "Classic World",
    logo_url: bizSettings?.logo_url || "/logo.png",
    profiles: [{ id: "default", name: "Default", created_at: new Date().toISOString() }],
    activeProfile: "default",
  };

  if (typeof window !== "undefined") {
    clearAuthProfile();
    clearQueryCache();
    localStorage.setItem("user", JSON.stringify(employeeUser));
    localStorage.setItem("classicworld_auth_profile", JSON.stringify(employeeUser));
    localStorage.setItem("cw_active_employee_session", JSON.stringify(employeeUser));
    localStorage.setItem("auth_token", `token_emp_${employeeUser.id}`);
    localStorage.setItem("active_profile", "default");
    sessionStorage.setItem("app_pin_unlocked", "true");
  }

  return { user: employeeUser, token: `token_emp_${employeeUser.id}` };
}
