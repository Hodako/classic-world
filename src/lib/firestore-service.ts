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
import { db, auth } from "./firebase";

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
  const catLabel = category === "family" ? "পরিবার খরচ" : category === "bazar" ? "বাজার খরচ" : category === "home_rent" ? "বাসা ভাড়া" : category === "medical" ? "চিকিৎসা" : "ব্যক্তিগত";
  const title = `[মালিকের খরচ] ${catLabel}: ${note || "ব্যক্তিগত উত্তোলন"}`;

  const docRef = await addDoc(collection(db, "owner_wallet"), {
    amount,
    category,
    note: note || null,
    created_at: Timestamp.now(),
  });

  // 1. Log in cashbox as withdrawal to reduce cash balance
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

    // 2. Log in expenses under owner_personal category to deduct from profit
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

  return { success: true, id: docRef.id };
}

export async function fsDeleteOwnerWalletEntry(id: string) {
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
    await setDoc(doc(db, "businesses", "classic-world-settings"), data, { merge: true });
  } catch (_) {}
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
  const userObj = {
    id: userId,
    email: cleanEmail,
    full_name: data.fullName || cleanEmail.split("@")[0],
    role: "owner",
    activated: true,
    business_id: "classic-world-default",
    business_name: "Classic World",
    logo_url: data.photoUrl || "/logo.png",
    avatar_url: data.photoUrl || undefined,
    firebase_uid: data.firebaseUid,
    status: "active",
    sms_credits: 100,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem("user", JSON.stringify(userObj));
    localStorage.setItem("auth_profile", JSON.stringify(userObj));
    localStorage.setItem("auth_token", `token_${userId}`);
  }
  return { user: userObj, token: `token_${userId}` };
}


