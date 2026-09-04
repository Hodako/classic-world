import { readQueryCache, writeQueryCache } from "./query-cache";
import { toast } from "sonner";

export interface QueuedAction {
  id: string;
  actionName: string;
  args: any;
  timestamp: number;
  retries?: number;
}

const QUEUE_KEY = "df-offline-sync-queue";

export function getOfflineQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveOfflineQueue(queue: QueuedAction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

/**
 * Queue a write action and apply an optimistic update to local cache
 */
export function queueOfflineAction(actionName: string, args: any) {
  const queue = getOfflineQueue();
  const newAction: QueuedAction = {
    id: crypto.randomUUID(),
    actionName,
    args,
    timestamp: Date.now(),
  };
  queue.push(newAction);
  saveOfflineQueue(queue);

  // Apply optimistic cache updates so user sees changes instantly!
  try {
    applyOptimisticUpdate(actionName, args);
  } catch (err) {
    console.error("Failed to apply optimistic update:", err);
  }

  // Show user friendly warning
  toast.warning("Stored offline. Will sync to cloud once connected.");
}

/**
 * Apply changes directly to query caches in localStorage
 */
function applyOptimisticUpdate(actionName: string, args: any) {
  const now = new Date().toISOString();

  if (actionName === "createSaleFn") {
    // 1. Update sales
    const sales = readQueryCache<any[]>(["sales"]) ?? [];
    const newSale = {
      id: crypto.randomUUID(),
      product_id: args.data.product_id ?? null,
      product_name: args.data.product_name,
      qty: Number(args.data.qty) || 1,
      buy_price: Number(args.data.buy_price) || 0,
      sell_price: Number(args.data.sell_price) || 0,
      profit: Number(args.data.profit) || 0,
      type: args.data.type || "cash",
      party_id: args.data.party_id ?? null,
      paid_amount: Number(args.data.paid_amount) || 0,
      due_amount: Number(args.data.due_amount) || 0,
      note: args.data.note ?? null,
      cart_id: args.data.cart_id ?? null,
      created_at: now,
    };
    writeQueryCache(["sales"], [newSale, ...sales]);

    // 2. Update product stock
    if (args.data.product_id) {
      const products = readQueryCache<any[]>(["products"]) ?? [];
      const updatedProducts = products.map((p) => {
        if (p.id === args.data.product_id) {
          return { ...p, stock: Math.max(0, (p.stock || 0) - newSale.qty) };
        }
        return p;
      });
      writeQueryCache(["products"], updatedProducts);
    }

    // 3. Update cashbox ledger
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const newCashbox = {
      id: crypto.randomUUID(),
      kind: "sale",
      amount: newSale.type === "credit" ? newSale.paid_amount : newSale.sell_price * newSale.qty,
      note: newSale.note || `Sale: ${newSale.product_name}`,
      created_at: now,
    };
    writeQueryCache(["cashbox"], [newCashbox, ...cashbox]);
  }

  else if (actionName === "createProductFn") {
    const products = readQueryCache<any[]>(["products"]) ?? [];
    const newProduct = {
      id: crypto.randomUUID(),
      name: args.data.name,
      image_url: args.data.image_url ?? null,
      buy_price: Number(args.data.buy_price) || 0,
      sell_price: Number(args.data.sell_price) || 0,
      stock: Number(args.data.stock) || 0,
      min_stock: Number(args.data.min_stock) || 0,
      category: args.data.category ?? "",
      created_at: now,
      archived: false,
    };
    writeQueryCache(["products"], [newProduct, ...products]);
  }

  else if (actionName === "updateProductFn") {
    const products = readQueryCache<any[]>(["products"]) ?? [];
    const updatedProducts = products.map((p) => {
      if (p.id === args.data.id) {
        return {
          ...p,
          ...args.data,
          buy_price: args.data.buy_price !== undefined ? Number(args.data.buy_price) : p.buy_price,
          sell_price: args.data.sell_price !== undefined ? Number(args.data.sell_price) : p.sell_price,
          stock: args.data.stock !== undefined ? Number(args.data.stock) : p.stock,
          min_stock: args.data.min_stock !== undefined ? Number(args.data.min_stock) : p.min_stock,
        };
      }
      return p;
    });
    writeQueryCache(["products"], updatedProducts);
  }

  else if (actionName === "deleteProductFn") {
    const products = readQueryCache<any[]>(["products"]) ?? [];
    const filtered = products.filter((p) => p.id !== args.data.id);
    writeQueryCache(["products"], filtered);
  }

  else if (actionName === "archiveProductFn") {
    const products = readQueryCache<any[]>(["products"]) ?? [];
    const updated = products.map((p) => {
      if (p.id === args.data.id) {
        return { ...p, archived: !!args.data.archived };
      }
      return p;
    });
    writeQueryCache(["products"], updated);
  }

  else if (actionName === "createExpenseFn") {
    const expenses = readQueryCache<any[]>(["expenses"]) ?? [];
    const newExpense = {
      id: crypto.randomUUID(),
      title: args.data.title,
      amount: Number(args.data.amount) || 0,
      note: args.data.note ?? null,
      created_at: now,
    };
    writeQueryCache(["expenses"], [newExpense, ...expenses]);

    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const newCashbox = {
      id: crypto.randomUUID(),
      kind: "expense",
      amount: newExpense.amount,
      note: newExpense.note || `Expense: ${newExpense.title}`,
      created_at: now,
    };
    writeQueryCache(["cashbox"], [newCashbox, ...cashbox]);
  }

  else if (actionName === "deleteExpenseFn") {
    const expenses = readQueryCache<any[]>(["expenses"]) ?? [];
    writeQueryCache(["expenses"], expenses.filter((e) => e.id !== args.data.id));
  }

  else if (actionName === "createSomitiFn") {
    const somiti = readQueryCache<any[]>(["somiti"]) ?? [];
    const newSomiti = {
      id: crypto.randomUUID(),
      kind: args.data.kind || "deposit",
      amount: Number(args.data.amount) || 0,
      note: args.data.note ?? null,
      skipCashbox: args.data.skipCashbox,
      is_initial: args.data.is_initial,
      created_at: now,
    };
    writeQueryCache(["somiti"], [newSomiti, ...somiti]);

    // Initial opening balance should NOT cut from cashbox
    if (!args.data.skipCashbox && !args.data.is_initial) {
      const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
      const newCashbox = {
        id: crypto.randomUUID(),
        kind: args.data.kind === "withdraw" ? "deposit" : "withdraw",
        amount: newSomiti.amount,
        note: newSomiti.note || `Samity (${args.data.kind})`,
        ref_id: newSomiti.id,
        created_at: now,
      };
      writeQueryCache(["cashbox"], [newCashbox, ...cashbox]);
    }
  }

  else if (actionName === "deleteSomitiFn") {
    const somiti = readQueryCache<any[]>(["somiti"]) ?? [];
    writeQueryCache(["somiti"], somiti.filter((s) => s.id !== args.data.id));
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    writeQueryCache(["cashbox"], cashbox.filter((c) => c.ref_id !== args.data.id));
  }

  else if (actionName === "createOwnerWalletEntryFn") {
    const ownerWallet = readQueryCache<any[]>(["owner_wallet"]) ?? [];
    const newEntry = {
      id: crypto.randomUUID(),
      amount: Number(args.data.amount) || 0,
      category: args.data.category || "personal",
      note: args.data.note ?? null,
      cut_from_profit: args.data.cut_from_profit !== false,
      created_at: args.data.created_at || now,
    };
    writeQueryCache(["owner_wallet"], [newEntry, ...ownerWallet]);

    // Deduct from cashbox as withdrawal
    if (newEntry.amount > 0) {
      const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
      const newCashbox = {
        id: crypto.randomUUID(),
        kind: "withdraw",
        amount: newEntry.amount,
        note: `[মালিকের খরচ] ${newEntry.note || "ব্যক্তিগত উত্তোলন"}`,
        ref_id: newEntry.id,
        created_at: newEntry.created_at,
      };
      writeQueryCache(["cashbox"], [newCashbox, ...cashbox]);
    }
  }

  else if (actionName === "updateOwnerWalletEntryFn") {
    const ownerWallet = readQueryCache<any[]>(["owner_wallet"]) ?? [];
    const updated = ownerWallet.map((w) => {
      if (w.id === args.data.id) {
        return {
          ...w,
          amount: args.data.amount !== undefined ? Number(args.data.amount) : w.amount,
          category: args.data.category !== undefined ? args.data.category : w.category,
          note: args.data.note !== undefined ? args.data.note : w.note,
        };
      }
      return w;
    });
    writeQueryCache(["owner_wallet"], updated);

    if (args.data.amount !== undefined) {
      const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
      const updatedCashbox = cashbox.map((c) => {
        if (c.ref_id === args.data.id) {
          return {
            ...c,
            amount: Number(args.data.amount),
            note: args.data.note ? `[মালিকের খরচ] ${args.data.note}` : c.note,
          };
        }
        return c;
      });
      writeQueryCache(["cashbox"], updatedCashbox);
    }
  }

  else if (actionName === "deleteOwnerWalletEntryFn") {
    const ownerWallet = readQueryCache<any[]>(["owner_wallet"]) ?? [];
    writeQueryCache(["owner_wallet"], ownerWallet.filter((w) => w.id !== args.data.id));
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    writeQueryCache(["cashbox"], cashbox.filter((c) => c.ref_id !== args.data.id));
  }

  else if (actionName === "createCashboxFn") {
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const newEntry = {
      id: crypto.randomUUID(),
      kind: args.data.kind || "deposit",
      amount: Math.abs(Number(args.data.amount) || 0),
      note: args.data.note ?? null,
      ref_id: null,
      created_at: args.data.created_at || now,
    };
    writeQueryCache(["cashbox"], [newEntry, ...cashbox]);
  }

  else if (actionName === "updateCashboxFn") {
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const updated = cashbox.map((c) => {
      if (c.id === args.data.id) {
        return {
          ...c,
          kind: args.data.kind !== undefined ? args.data.kind : c.kind,
          amount: args.data.amount !== undefined ? Math.abs(Number(args.data.amount) || 0) : c.amount,
          note: args.data.note !== undefined ? args.data.note : c.note,
          created_at: args.data.created_at || c.created_at,
        };
      }
      return c;
    });
    writeQueryCache(["cashbox"], updated);
  }

  else if (actionName === "deleteCashboxFn") {
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    writeQueryCache(["cashbox"], cashbox.filter((c) => c.id !== args.data.id));
  }

  else if (actionName === "createPurchaseFn") {
    const purchases = readQueryCache<any[]>(["purchases"]) ?? [];
    const newPurchase = {
      id: crypto.randomUUID(),
      product_id: args.data.product_id ?? null,
      product_name: args.data.product_name,
      qty: Number(args.data.qty) || 1,
      unit_cost: Number(args.data.unit_cost) || 0,
      total: Number(args.data.total) || 0,
      note: args.data.note ?? null,
      created_at: now,
    };
    writeQueryCache(["purchases"], [newPurchase, ...purchases]);

    if (args.data.product_id) {
      const products = readQueryCache<any[]>(["products"]) ?? [];
      const updatedProducts = products.map((p) => {
        if (p.id === args.data.product_id) {
          const buy_price = newPurchase.unit_cost;
          const sell_price = args.data.sell_price !== undefined ? Number(args.data.sell_price) : p.sell_price;
          return {
            ...p,
            stock: (p.stock || 0) + newPurchase.qty,
            buy_price,
            sell_price,
          };
        }
        return p;
      });
      writeQueryCache(["products"], updatedProducts);
    }

    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const newCashboxEntry = {
      id: crypto.randomUUID(),
      kind: "withdraw",
      amount: newPurchase.total,
      note: newPurchase.note || `Purchase: ${newPurchase.product_name}`,
      created_at: now,
    };
    writeQueryCache(["cashbox"], [newCashboxEntry, ...cashbox]);
  }

  else if (actionName === "createWithdrawalFn") {
    // Owner withdrawal takes money out of the cashbox
    const cashbox = readQueryCache<any[]>(["cashbox"]) ?? [];
    const newCashbox = {
      id: crypto.randomUUID(),
      kind: "withdraw",
      amount: Number(args.data.amount) || 0,
      note: args.data.note || "Owner Withdrawal",
      created_at: now,
    };
    writeQueryCache(["cashbox"], [newCashbox, ...cashbox]);
  }
}

// Background sync loop controller
let isSyncing = false;

export function startBackgroundSync(actionsMap: Record<string, Function>) {
  if (typeof window === "undefined") return;

  async function syncQueue() {
    if (isSyncing) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    if (!navigator.onLine) return;

    isSyncing = true;

    const remainingQueue: QueuedAction[] = [];
    let successCount = 0;
    let discardedCount = 0;

    for (const item of queue) {
      const action = actionsMap[item.actionName];
      if (action) {
        try {
          await action(item.args);
          successCount++;
        } catch (err) {
          console.error(`Failed to sync action ${item.actionName}:`, err);
          const currentRetries = (item.retries ?? 0) + 1;
          if (currentRetries >= 3) {
            discardedCount++;
            console.warn(`Action ${item.actionName} failed 3 times. Discarding from queue.`, item);
          } else {
            remainingQueue.push({ ...item, retries: currentRetries });
          }
        }
      } else {
        console.warn(`Action ${item.actionName} not found in sync register.`);
        discardedCount++;
      }
    }

    saveOfflineQueue(remainingQueue);
    isSyncing = false;

    if (successCount > 0) {
      toast.success(`Successfully synced ${successCount} transactions to cloud!`);
      // Invalidate queries so that clean DB state is re-fetched
      window.dispatchEvent(new CustomEvent("df-sync-complete"));
    } else if (discardedCount > 0 && remainingQueue.length === 0) {
      toast.error("Some offline changes failed validation and were discarded.");
    }
  }

  // Trigger sync on online event
  window.addEventListener("online", () => {
    syncQueue();
  });

  // Periodically poll sync status every 15 seconds
  setInterval(() => {
    syncQueue();
  }, 15000);

  // Run immediately on startup
  if (navigator.onLine) {
    syncQueue();
  }
}
