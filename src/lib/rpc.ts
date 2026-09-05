import { queueOfflineAction, startBackgroundSync } from "./offline-sync";

// Detect if we are running inside the Capacitor Android/iOS native app or static hosting
const isStaticOrNative = typeof window !== "undefined" && (
  !!(window as any).Capacitor ||
  window.location.origin.startsWith("capacitor:") ||
  window.location.origin.startsWith("file:") ||
  window.location.hostname.includes("firebaseapp.com") ||
  window.location.hostname.includes("web.app")
);

// For Classic-World static SPA (Firebase Hosting) & native apps, point to the live Next.js backend server
export const API_BASE = (
  process.env.NEXT_PUBLIC_APP_URL ||
  (isStaticOrNative ? "https://hakim.qzz.io" : "https://hakim.qzz.io")
).replace(/\/$/, "");


async function callRemoteRpc(actionName: string, args: any = {}): Promise<any> {
  const safeArgs = args ?? {};
  const url = `${API_BASE}/api/rpc`;
  let token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;

  // Auto-sync token with Firebase Auth or cached profile if token is missing
  if (!token && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn" && actionName !== "registerFn") {
    try {
      const { auth } = await import("@/lib/firebase");
      let syncEmail = auth.currentUser?.email;
      let syncName = auth.currentUser?.displayName;
      let syncPhoto = auth.currentUser?.photoURL;
      let syncUid = auth.currentUser?.uid;

      if (!syncEmail) {
        const profileRaw = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("user");
        if (profileRaw) {
          const cachedUser = JSON.parse(profileRaw);
          syncEmail = cachedUser.email;
          syncName = cachedUser.full_name;
          syncPhoto = cachedUser.avatar_url || cachedUser.logo_url;
          syncUid = cachedUser.firebase_uid || cachedUser.id;
        }
      }

      if (syncEmail) {
        const syncRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            actionName: "firebaseAuthSyncFn",
            args: {
              data: {
                email: syncEmail,
                fullName: syncName || undefined,
                photoUrl: syncPhoto || undefined,
                firebaseUid: syncUid,
              },
            },
          }),
        });
        if (syncRes.ok) {
          const syncJson = await syncRes.json();
          if (syncJson?.token) {
            token = syncJson.token;
            window.localStorage.setItem("auth_token", syncJson.token);
          }
        }
      }
    } catch (_) {}

    // Fallback token synthesis if still no token
    if (!token && typeof window !== "undefined") {
      const profileRaw = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("user");
      const activeEmp = window.localStorage.getItem("cw_active_employee_session");
      if (activeEmp) {
        try {
          const emp = JSON.parse(activeEmp);
          token = `token_emp_${emp.id || "emp"}`;
        } catch (_) {}
      } else if (profileRaw) {
        try {
          const u = JSON.parse(profileRaw);
          token = `token_${u.id || "owner"}`;
        } catch (_) {}
      }
      if (token) {
        window.localStorage.setItem("auth_token", token);
      }
    }
  }

  const activeProfile = typeof window !== "undefined" ? window.localStorage.getItem("active_profile") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    let res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ actionName, args: safeArgs, token, activeProfile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Auto-refresh token and retry on 401 Unauthorized
    if (res.status === 401 && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn") {
      try {
        const { auth } = await import("@/lib/firebase");
        let syncEmail = auth.currentUser?.email;
        let syncName = auth.currentUser?.displayName;
        let syncPhoto = auth.currentUser?.photoURL;
        let syncUid = auth.currentUser?.uid;

        if (!syncEmail) {
          const profileRaw = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("user");
          if (profileRaw) {
            const cachedUser = JSON.parse(profileRaw);
            syncEmail = cachedUser?.email;
            syncName = cachedUser?.full_name;
            syncPhoto = cachedUser?.avatar_url || cachedUser?.logo_url;
            syncUid = cachedUser?.firebase_uid || cachedUser?.id;
          }
        }

        if (syncEmail) {
          const retrySync = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              actionName: "firebaseAuthSyncFn",
              args: {
                data: {
                  email: syncEmail,
                  fullName: syncName || undefined,
                  photoUrl: syncPhoto || undefined,
                  firebaseUid: syncUid,
                },
              },
            }),
          });
          if (retrySync.ok) {
            const syncJson = await retrySync.json();
            if (syncJson?.token) {
              token = syncJson.token;
              window.localStorage.setItem("auth_token", syncJson.token);
              headers["Authorization"] = `Bearer ${token}`;
              // Retry the original RPC with the refreshed token
              res = await fetch(url, {
                method: "POST",
                headers,
                credentials: "include",
                body: JSON.stringify({ actionName, args: safeArgs, token, activeProfile }),
              });
            }
          }
        }
      } catch (_) {}
    }

    const txt = await res.text();
    if (!res.ok) {
      let errorMsg = txt;
      try {
        const parsed = JSON.parse(txt);
        if (parsed?.error) errorMsg = parsed.error;
      } catch (_) {}
      throw new Error(errorMsg || `RPC Request failed with status ${res.status}`);
    }

    try {
      const result = JSON.parse(txt);
      if (result?.token && typeof window !== "undefined") {
        window.localStorage.setItem("auth_token", result.token);
      }
      if (actionName === "switchProfileFn" && args?.data?.profileId) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("active_profile", args.data.profileId);
        }
      }
      if (actionName === "logoutFn") {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("auth_token");
          window.localStorage.removeItem("active_profile");
        }
      }
      return result;
    } catch (err) {
      console.error("Failed to parse RPC response as JSON. Server returned:", txt);
      const snippet = txt.slice(0, 150) + (txt.length > 150 ? "..." : "");
      throw new Error(`Server returned invalid response for ${actionName}. Response snippet: "${snippet}". Please check your server status.`);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error("Request timed out. Please check your internet connection.");
    }
    throw err;
  }
}

// Helper to determine if we are offline or if a network/auth error occurs
async function runWriteAction<T>(actionName: string, args: any = {}): Promise<T | any> {
  const safeArgs = args ?? {};
  if (typeof window !== "undefined" && !navigator.onLine) {
    queueOfflineAction(actionName, safeArgs);
    return { success: true, offline: true, id: crypto.randomUUID() };
  }
  try {
    return await callRemoteRpc(actionName, safeArgs);
  } catch (err: any) {
    if (typeof window !== "undefined") {
      const isFallbackable =
        !navigator.onLine ||
        err?.message?.includes("timed out") ||
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("NetworkError") ||
        err?.message?.includes("Unauthorized") ||
        err?.message?.includes("401");

      if (isFallbackable) {
        console.warn(`Write action ${actionName} encountered error (${err?.message}), using local/Firestore fallback:`, err);
        queueOfflineAction(actionName, safeArgs);
        if (actionName === "createCashboxFn") {
          try {
            const { fsCreateCashbox } = await import("@/lib/firestore-service");
            const fsRes = await fsCreateCashbox({
              kind: safeArgs?.data?.kind || "deposit",
              amount: Number(safeArgs?.data?.amount) || 0,
              note: safeArgs?.data?.note ?? null,
            });
            return { success: true, offline: true, id: fsRes?.id || crypto.randomUUID() };
          } catch (_) {}
        }
        if (actionName === "acceptDigitalPaymentFn") {
          try {
            const { fsAcceptDigitalPayment } = await import("@/lib/firestore-service");
            const fsRes = await fsAcceptDigitalPayment(safeArgs?.data?.id);
            return { success: true, offline: true, id: fsRes?.id || crypto.randomUUID() };
          } catch (_) {}
        }
        if (actionName === "createOwnerWalletEntryFn") {
          try {
            const { fsCreateOwnerWalletEntry } = await import("@/lib/firestore-service");
            const fsRes = await fsCreateOwnerWalletEntry(safeArgs?.data);
            return { success: true, offline: true, id: fsRes?.id || crypto.randomUUID() };
          } catch (_) {}
        }
        if (actionName === "updateOwnerWalletEntryFn") {
          try {
            const { fsUpdateOwnerWalletEntry } = await import("@/lib/firestore-service");
            await fsUpdateOwnerWalletEntry(safeArgs?.data?.id, safeArgs?.data);
            return { success: true, offline: true };
          } catch (_) {}
        }
        if (actionName === "deleteOwnerWalletEntryFn") {
          try {
            const { fsDeleteOwnerWalletEntry } = await import("@/lib/firestore-service");
            await fsDeleteOwnerWalletEntry(safeArgs?.data?.id);
            return { success: true, offline: true };
          } catch (_) {}
        }
        return { success: true, offline: true, id: crypto.randomUUID() };
      }
    }
    throw err;
  }
}

async function runReadAction(name: string, args: any = {}): Promise<any> {
  const safeArgs = args ?? {};
  try {
    const res = await callRemoteRpc(name, safeArgs);
    if (Array.isArray(res) && res.length === 0 && typeof window !== "undefined") {
      if (name === "getOwnerWalletFn") {
        try {
          const { fsGetOwnerWallet } = await import("@/lib/firestore-service");
          const fsData = await fsGetOwnerWallet();
          if (Array.isArray(fsData) && fsData.length > 0) return fsData;
        } catch (_) {}
      }
    }
    return res;
  } catch (err: any) {
    if (typeof window !== "undefined") {
      try {
        if (name === "getOwnerWalletFn") {
          const { fsGetOwnerWallet } = await import("@/lib/firestore-service");
          return await fsGetOwnerWallet();
        }
        if (name === "getExpensesFn") {
          const { fsGetExpenses } = await import("@/lib/firestore-service");
          return await fsGetExpenses();
        }
        if (name === "getSalesFn") {
          const { fsGetSales } = await import("@/lib/firestore-service");
          return await fsGetSales();
        }
        if (name === "getPurchasesFn") {
          const { fsGetPurchases } = await import("@/lib/firestore-service");
          return await fsGetPurchases();
        }
        if (name === "getCashboxFn") {
          const { fsGetCashbox } = await import("@/lib/firestore-service");
          return await fsGetCashbox();
        }
        if (name === "getWithdrawalsFn") {
          const { fsGetWithdrawals } = await import("@/lib/firestore-service");
          return await fsGetWithdrawals();
        }
        if (name === "getSomitiFn") {
          const { fsGetSomiti } = await import("@/lib/firestore-service");
          return await fsGetSomiti();
        }
        if (name === "getPartiesFn") {
          const { fsGetParties } = await import("@/lib/firestore-service");
          return await fsGetParties();
        }
        if (name === "getCustomersFn") {
          const { fsGetCustomers } = await import("@/lib/firestore-service");
          return await fsGetCustomers();
        }
        if (name === "getAllPaymentsFn") {
          const { fsGetAllPayments } = await import("@/lib/firestore-service");
          return await fsGetAllPayments();
        }
        if (name === "getReturnsFn") {
          const { fsGetReturns } = await import("@/lib/firestore-service");
          return await fsGetReturns();
        }
        if (name === "getRemindersFn") {
          const { fsGetReminders } = await import("@/lib/firestore-service");
          return await fsGetReminders();
        }
        if (name === "getProductsFn") {
          const { fsGetProducts } = await import("@/lib/firestore-service");
          return await fsGetProducts();
        }
      } catch (fsErr) {
        console.warn(`Firestore read fallback error for ${name}:`, fsErr);
      }
    }
    throw err;
  }
}

// Action factories
const makeReadAction = (name: string) => (args: any = {}) => runReadAction(name, args ?? {});
const makeWriteAction = (name: string) => (args: any = {}) => runWriteAction(name, args ?? {});

// ─── Export READS ────────────────────────────────────────────────────────────
export const getMeFn = makeReadAction("getMeFn");
export const getProductsFn = makeReadAction("getProductsFn");
export const getStorefrontBySlug = makeReadAction("getStorefrontBySlug");
export const getPartiesFn = makeReadAction("getPartiesFn");
export const getPartyFn = makeReadAction("getPartyFn");
export const getCustomersFn = makeReadAction("getCustomersFn");
export const getCustomerFn = makeReadAction("getCustomerFn");
export const getAllPartyReceivablesFn = makeReadAction("getAllPartyReceivablesFn");
export const getAllPartyPayablesFn = makeReadAction("getAllPartyPayablesFn");
export const getAllPayableSettlementsFn = makeReadAction("getAllPayableSettlementsFn");
export const getPartyReceivablesFn = makeReadAction("getPartyReceivablesFn");
export const getPartyPayablesFn = makeReadAction("getPartyPayablesFn");
export const getPayableSettlementsFn = makeReadAction("getPayableSettlementsFn");
export const getSalesFn = makeReadAction("getSalesFn");
export const getSalesForPartyFn = makeReadAction("getSalesForPartyFn");
export const getReturnsFn = makeReadAction("getReturnsFn");
export const getPurchasesFn = makeReadAction("getPurchasesFn");
export const getExpensesFn = makeReadAction("getExpensesFn");
export const getPaymentsForPartyFn = makeReadAction("getPaymentsForPartyFn");
export const getAllPaymentsFn = makeReadAction("getAllPaymentsFn");
export const getSomitiFn = makeReadAction("getSomitiFn");
export const getWithdrawalsFn = makeReadAction("getWithdrawalsFn");
export const getCashboxFn = makeReadAction("getCashboxFn");
export const getRemindersFn = makeReadAction("getRemindersFn");

// ─── Export Network-Only Auth/Writes ─────────────────────────────────────────
export const loginFn = makeReadAction("loginFn");
export const employeeLoginFn = makeReadAction("employeeLoginFn");
export const registerFn = makeReadAction("registerFn");
export const firebaseAuthSyncFn = makeReadAction("firebaseAuthSyncFn");
export const logoutFn = makeReadAction("logoutFn");
export const changeMyPasswordFn = makeReadAction("changeMyPasswordFn");
export const verifyOwnerPasswordFn = makeReadAction("verifyOwnerPasswordFn");
export const uploadImageFn = makeReadAction("uploadImageFn");
export const bulkExportToGoogleSheetsFn = makeReadAction("bulkExportToGoogleSheetsFn");
export const toggleGoogleSheetsSyncFn = makeWriteAction("toggleGoogleSheetsSyncFn");
export const createProfileFn = makeReadAction("createProfileFn");
export const switchProfileFn = makeReadAction("switchProfileFn");
export const importProfileModuleFn = makeReadAction("importProfileModuleFn");

// Employee Management Actions
export const listShopEmployeesFn = makeReadAction("listShopEmployeesFn");
export const createShopEmployeeFn = makeWriteAction("createShopEmployeeFn");
export const updateShopEmployeeFn = makeWriteAction("updateShopEmployeeFn");
export const deleteShopEmployeeFn = makeWriteAction("deleteShopEmployeeFn");

// ─── Export Offline-Supported Writes ─────────────────────────────────────────
export const createProductFn = makeWriteAction("createProductFn");
export const updateProductFn = makeWriteAction("updateProductFn");
export const deleteProductFn = makeWriteAction("deleteProductFn");
export const archiveProductFn = makeWriteAction("archiveProductFn");
export const exchangeProductsFn = makeWriteAction("exchangeProductsFn");

export const createPartyFn = makeWriteAction("createPartyFn");
export const updatePartyFn = makeWriteAction("updatePartyFn");
export const deletePartyFn = makeWriteAction("deletePartyFn");
export const archivePartyFn = makeWriteAction("archivePartyFn");

export const createCustomerFn = makeWriteAction("createCustomerFn");
export const updateCustomerFn = makeWriteAction("updateCustomerFn");
export const deleteCustomerFn = makeWriteAction("deleteCustomerFn");
export const archiveCustomerFn = makeWriteAction("archiveCustomerFn");

export const createPartyReceivableFn = makeWriteAction("createPartyReceivableFn");
export const createPartyPayableFn = makeWriteAction("createPartyPayableFn");
export const deletePartyReceivableFn = makeWriteAction("deletePartyReceivableFn");
export const deletePartyPayableFn = makeWriteAction("deletePartyPayableFn");

export const createPayableSettlementFn = makeWriteAction("createPayableSettlementFn");
export const deletePayableSettlementFn = makeWriteAction("deletePayableSettlementFn");

export const createSaleFn = makeWriteAction("createSaleFn");
export const deleteSaleFn = makeWriteAction("deleteSaleFn");
export const editSaleFn = makeWriteAction("editSaleFn");
export const approveCourierPaymentFn = makeWriteAction("approveCourierPaymentFn");
export const cancelCourierOrderFn = makeWriteAction("cancelCourierOrderFn");
export const acceptDigitalPaymentFn = makeWriteAction("acceptDigitalPaymentFn");

export const updateUserAvatarFn = makeWriteAction("updateUserAvatarFn");
export const createReturnFn = makeWriteAction("createReturnFn");
export const createDirectProductReturnFn = makeWriteAction("createDirectProductReturnFn");
export const createPartyReturnFn = makeWriteAction("createPartyReturnFn");
export const deleteReturnFn = makeWriteAction("deleteReturnFn");

export const createPurchaseFn = makeWriteAction("createPurchaseFn");
export const editPurchaseFn = makeWriteAction("editPurchaseFn");
export const deletePurchaseFn = makeWriteAction("deletePurchaseFn");

export const createExpenseFn = makeWriteAction("createExpenseFn");
export const deleteExpenseFn = makeWriteAction("deleteExpenseFn");

export const createPaymentFn = makeWriteAction("createPaymentFn");
export const deletePaymentFn = makeWriteAction("deletePaymentFn");

export const createSomitiFn = makeWriteAction("createSomitiFn");
export const updateSomitiFn = makeWriteAction("updateSomitiFn");
export const deleteSomitiFn = makeWriteAction("deleteSomitiFn");
export const renameSomitiFn = makeWriteAction("renameSomitiFn");
export const deleteSomitiFnByName = makeWriteAction("deleteSomitiFnByName");

export const getOwnerWalletFn = makeReadAction("getOwnerWalletFn");
export const createOwnerWalletEntryFn = makeWriteAction("createOwnerWalletEntryFn");
export const updateOwnerWalletEntryFn = makeWriteAction("updateOwnerWalletEntryFn");
export const deleteOwnerWalletEntryFn = makeWriteAction("deleteOwnerWalletEntryFn");

export const createWithdrawalFn = makeWriteAction("createWithdrawalFn");
export const createCashboxFn = makeWriteAction("createCashboxFn");
export const updateCashboxFn = makeWriteAction("updateCashboxFn");
export const deleteCashboxFn = makeWriteAction("deleteCashboxFn");
export const repairCashboxDbFn = makeWriteAction("repairCashboxDbFn");

export const createReminderFn = makeWriteAction("createReminderFn");
export const toggleReminderFn = makeWriteAction("toggleReminderFn");
export const deleteReminderFn = makeWriteAction("deleteReminderFn");

// ─── Employees & Staff Management ─────────────────────────────────────────────
export const getEmployeesFn = makeReadAction("getEmployeesFn");
export const createEmployeeFn = makeWriteAction("createEmployeeFn");
export const addEmployeeFn = createEmployeeFn;
export const updateEmployeeFn = makeWriteAction("updateEmployeeFn");
export const deleteEmployeeFn = makeWriteAction("deleteEmployeeFn");

export const getEmployeeSalariesFn = makeReadAction("getEmployeeSalariesFn");
export const createEmployeeSalaryFn = makeWriteAction("createEmployeeSalaryFn");
export const deleteEmployeeSalaryFn = makeWriteAction("deleteEmployeeSalaryFn");

export const getEmployeeExpensesFn = makeReadAction("getEmployeeExpensesFn");
export const createEmployeeExpenseFn = makeWriteAction("createEmployeeExpenseFn");
export const deleteEmployeeExpenseFn = makeWriteAction("deleteEmployeeExpenseFn");

export const getEmployeeShoppingsFn = makeReadAction("getEmployeeShoppingsFn");
export const createEmployeeShoppingFn = makeWriteAction("createEmployeeShoppingFn");
export const deleteEmployeeShoppingFn = makeWriteAction("deleteEmployeeShoppingFn");

// ─── Export Reset Operations ─────────────────────────────────────────────────
export const emptyCashboxFn = makeReadAction("emptyCashboxFn");
export const resetProductsFn = makeReadAction("resetProductsFn");
export const resetSalesFn = makeReadAction("resetSalesFn");
export const resetPurchasesFn = makeReadAction("resetPurchasesFn");
export const resetSomitiFn = makeReadAction("resetSomitiFn");
export const resetExpensesFn = makeReadAction("resetExpensesFn");
export const resetPartiesFn = makeReadAction("resetPartiesFn");
export const resetAllDataFn = makeReadAction("resetAllDataFn");

// Register background sync engine with remote HTTP execution map
const actionsList = [
  "createProductFn", "updateProductFn", "deleteProductFn", "archiveProductFn",
  "createPartyFn", "updatePartyFn", "deletePartyFn", "archivePartyFn",
  "createCustomerFn", "updateCustomerFn", "deleteCustomerFn", "archiveCustomerFn",
  "createPartyReceivableFn", "createPartyPayableFn", "deletePartyReceivableFn", "deletePartyPayableFn",
  "createPayableSettlementFn", "deletePayableSettlementFn", "createSaleFn", "deleteSaleFn", "editSaleFn",
  "approveCourierPaymentFn", "cancelCourierOrderFn", "acceptDigitalPaymentFn",
  "updateUserAvatarFn", "createReturnFn", "createDirectProductReturnFn", "deleteReturnFn",
  "createPurchaseFn", "deletePurchaseFn", "createExpenseFn", "deleteExpenseFn",
  "createPaymentFn", "deletePaymentFn", "createSomitiFn", "updateSomitiFn", "deleteSomitiFn",
  "renameSomitiFn", "deleteSomitiFnByName", "createWithdrawalFn",
  "createOwnerWalletEntryFn", "updateOwnerWalletEntryFn", "deleteOwnerWalletEntryFn",
  "createCashboxFn", "updateCashboxFn", "deleteCashboxFn",
  "createReminderFn", "toggleReminderFn", "deleteReminderFn",
  "createEmployeeFn", "updateEmployeeFn", "deleteEmployeeFn",
  "createEmployeeSalaryFn", "deleteEmployeeSalaryFn",
  "createEmployeeExpenseFn", "deleteEmployeeExpenseFn",
  "createEmployeeShoppingFn", "deleteEmployeeShoppingFn"
];

const syncActions: Record<string, Function> = {};
actionsList.forEach(name => {
  syncActions[name] = (args: any) => callRemoteRpc(name, args);
});

if (typeof window !== "undefined") {
  startBackgroundSync(syncActions);
}

export async function callAiChat(messages: any[], lang: string) {
  const url = `${API_BASE}/api/ai-chat`;
  
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return await fetch(url, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      lang,
    }),
  });
}

// ── Bank & Loans ─────────────────────────────────────────────────────────────
export const getBankAccountsFn = makeReadAction("getBankAccountsFn");
export const createBankAccountFn = makeWriteAction("createBankAccountFn");
export const updateBankAccountFn = makeWriteAction("updateBankAccountFn");
export const deleteBankAccountFn = makeWriteAction("deleteBankAccountFn");
export const createBankTransactionFn = makeWriteAction("createBankTransactionFn");
export const getBankLoansFn = makeReadAction("getBankLoansFn");
export const createBankLoanFn = makeWriteAction("createBankLoanFn");
export const payBankLoanInstallmentFn = makeWriteAction("payBankLoanInstallmentFn");
export const deleteBankLoanFn = makeWriteAction("deleteBankLoanFn");

// ── SMS Gateway & Campaigns (MiMSMS v2) ─────────────────────────────────────
export const getSmsSettingsFn = makeReadAction("getSmsSettingsFn");
export const updateSmsSettingsFn = makeWriteAction("updateSmsSettingsFn");
export const checkSmsBalanceFn = makeReadAction("checkSmsBalanceFn");
export const sendSmsCampaignFn = makeWriteAction("sendSmsCampaignFn");
export const getSmsLogsFn = makeReadAction("getSmsLogsFn");
export const checkSmsDeliveryStatusFn = makeWriteAction("checkSmsDeliveryStatusFn");
export const deleteSmsLogFn = makeWriteAction("deleteSmsLogFn");

// ── Admin Popups & Announcements ──────────────────────────────────────────
export const getActiveAdminPopupsFn = makeReadAction("getActiveAdminPopupsFn");
export const dismissAdminPopupFn = makeWriteAction("dismissAdminPopupFn");

// ── Employee Email Invitations & Joining ───────────────────────────────────
export const inviteEmployeeByEmailFn = makeWriteAction("inviteEmployeeByEmailFn");
export const sendEmployeeInvitationFn = makeWriteAction("sendEmployeeInvitationFn");
export const listEmployeeInvitationsFn = makeReadAction("listEmployeeInvitationsFn");
export const cancelEmployeeInvitationFn = makeWriteAction("cancelEmployeeInvitationFn");
export const getMyPendingEmployeeInvitationsFn = makeReadAction("getMyPendingEmployeeInvitationsFn");
export const respondToEmployeeInvitationFn = makeWriteAction("respondToEmployeeInvitationFn");
export const removeEmployeeFn = makeWriteAction("removeEmployeeFn");

// ── Google Sheets OAuth Integration ──────────────────────────────────────
export const connectGoogleSheetsOAuthFn = makeWriteAction("connectGoogleSheetsOAuthFn");
export const disconnectGoogleSheetsFn = makeWriteAction("disconnectGoogleSheetsFn");


export const updateBusinessSettingsFn = makeWriteAction("updateBusinessSettingsFn");
export const getBusinessSettingsFn = makeReadAction("getBusinessSettingsFn");

// ── Recycle Bin & Command History ──────────────────────────────────────────
export const getRecycleBinFn = makeReadAction("getRecycleBinFn");
export const restoreRecycleItemFn = makeWriteAction("restoreRecycleItemFn");
export const restoreFromRecycleBinFn = restoreRecycleItemFn;
export const permanentDeleteRecycleItemFn = makeWriteAction("permanentDeleteRecycleItemFn");
export const permanentDeleteRecycleBinFn = permanentDeleteRecycleItemFn;
export const emptyRecycleBinFn = makeWriteAction("emptyRecycleBinFn");
export const getCommandHistoryFn = makeReadAction("getCommandHistoryFn");
export const undoCommandFn = makeWriteAction("undoCommandFn");

// ── Additional License Key Actions ─────────────────────────────────────────
export const generateOwnerLicenseKeyFn = makeWriteAction("generateOwnerLicenseKeyFn");
export const generateEmployeeLicenseKeyFn = makeWriteAction("generateEmployeeLicenseKeyFn");
export const listLicensesFn = makeReadAction("listLicensesFn");
export const revokeLicenseFn = makeWriteAction("revokeLicenseFn");
export const validateAndActivateLicenseFn = makeWriteAction("validateAndActivateLicenseFn");
export const activateLicenseFn = makeWriteAction("activateLicenseFn");

// ── Asset Transfer & Export Keys ──────────────────────────────────────────
export const createAssetTransferKeyFn = makeWriteAction("createAssetTransferKeyAction");
export const inspectAssetTransferKeyFn = makeReadAction("inspectAssetTransferKeyAction");
export const applyAssetTransferKeyFn = makeWriteAction("applyAssetTransferKeyAction");
export const listMyTransferKeysFn = makeReadAction("listMyTransferKeysAction");
export const deleteTransferKeyFn = makeWriteAction("deleteTransferKeyAction");
