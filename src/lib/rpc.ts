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


async function callRemoteRpc(actionName: string, args: any): Promise<any> {
  const url = `${API_BASE}/api/rpc`;
  let token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;

  // Auto-sync token with Firebase Auth if token is missing
  if (!token && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn" && actionName !== "registerFn") {
    try {
      const { auth } = await import("@/lib/firebase");
      if (auth.currentUser?.email) {
        const syncRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({
            actionName: "firebaseAuthSyncFn",
            args: {
              data: {
                email: auth.currentUser.email,
                fullName: auth.currentUser.displayName || undefined,
                photoUrl: auth.currentUser.photoURL || undefined,
                firebaseUid: auth.currentUser.uid,
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
      body: JSON.stringify({ actionName, args, token, activeProfile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Auto-refresh token and retry on 401 Unauthorized
    if (res.status === 401 && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn") {
      try {
        const { auth } = await import("@/lib/firebase");
        if (auth.currentUser?.email) {
          const retrySync = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
              actionName: "firebaseAuthSyncFn",
              args: {
                data: {
                  email: auth.currentUser.email,
                  fullName: auth.currentUser.displayName || undefined,
                  photoUrl: auth.currentUser.photoURL || undefined,
                  firebaseUid: auth.currentUser.uid,
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
                body: JSON.stringify({ actionName, args, token, activeProfile }),
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

// Helper to determine if we are offline or if a network error occurs
async function runWriteAction<T>(actionName: string, args: any): Promise<T | any> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    queueOfflineAction(actionName, args);
    return { success: true, offline: true, id: crypto.randomUUID() };
  }
  try {
    return await callRemoteRpc(actionName, args);
  } catch (err: any) {
    if (typeof window !== "undefined") {
      const isNetworkError =
        !navigator.onLine ||
        err?.message?.includes("timed out") ||
        err?.message?.includes("Failed to fetch") ||
        err?.message?.includes("NetworkError");

      if (isNetworkError) {
        console.warn(`Write action ${actionName} failed due to network error, queuing offline:`, err);
        queueOfflineAction(actionName, args);
        return { success: true, offline: true, id: crypto.randomUUID() };
      }
    }
    throw err;
  }
}

import * as fs from "./firestore-service";

// Direct Firestore Action Map for 100% Reliable Client Execution
const fsActionMap: Record<string, (args?: any) => Promise<any>> = {
  // Reads
  getProductsFn: async () => fs.fsGetProducts(),
  getStorefrontBySlug: async () => fs.fsGetProducts(),
  getPartiesFn: async () => fs.fsGetParties(),
  getPartyFn: async (args: any) => {
    const list = await fs.fsGetParties();
    return list.find((p: any) => p.id === (args?.data?.id || args?.id)) || null;
  },
  getCustomersFn: async () => fs.fsGetCustomers(),
  getCustomerFn: async (args: any) => {
    const list = await fs.fsGetCustomers();
    return list.find((c: any) => c.id === (args?.data?.id || args?.id)) || null;
  },
  getAllPartyReceivablesFn: async () => fs.fsGetAllPartyReceivables(),
  getPartyReceivablesFn: async (args: any) => {
    const list = await fs.fsGetAllPartyReceivables();
    const pid = args?.data?.partyId || args?.partyId;
    return list.filter((r: any) => r.party_id === pid);
  },
  getAllPartyPayablesFn: async () => fs.fsGetAllPartyPayables(),
  getPartyPayablesFn: async (args: any) => {
    const list = await fs.fsGetAllPartyPayables();
    const pid = args?.data?.partyId || args?.partyId;
    return list.filter((p: any) => p.party_id === pid);
  },
  getAllPayableSettlementsFn: async () => fs.fsGetAllPayableSettlements(),
  getPayableSettlementsFn: async (args: any) => {
    const list = await fs.fsGetAllPayableSettlements();
    const pid = args?.data?.partyId || args?.partyId;
    return list.filter((s: any) => s.party_id === pid);
  },
  getSalesFn: async () => fs.fsGetSales(),
  getSalesForPartyFn: async (args: any) => {
    const list = await fs.fsGetSales();
    const pid = args?.data?.partyId || args?.partyId;
    return list.filter((s: any) => s.party_id === pid);
  },
  getReturnsFn: async () => fs.fsGetReturns(),
  getPurchasesFn: async () => fs.fsGetPurchases(),
  getExpensesFn: async () => fs.fsGetExpenses(),
  getAllPaymentsFn: async () => fs.fsGetAllPayments(),
  getPaymentsForPartyFn: async (args: any) => {
    const list = await fs.fsGetAllPayments();
    const pid = args?.data?.partyId || args?.partyId;
    return list.filter((p: any) => p.party_id === pid);
  },
  getSomitiFn: async () => fs.fsGetSomiti(),
  getWithdrawalsFn: async () => fs.fsGetWithdrawals(),
  getCashboxFn: async () => fs.fsGetCashbox(),
  getRemindersFn: async () => fs.fsGetReminders(),
  getBankAccountsFn: async () => fs.fsGetBankAccounts(),
  getBankLoansFn: async () => fs.fsGetBankLoans(),

  // Writes
  createProductFn: async (args: any) => fs.fsCreateProduct(args?.data || args),
  updateProductFn: async (args: any) => fs.fsUpdateProduct(args?.data?.id || args?.id, args?.data || args),
  deleteProductFn: async (args: any) => fs.fsDeleteProduct(args?.data?.id || args?.id),
  archiveProductFn: async (args: any) => fs.fsUpdateProduct(args?.data?.id || args?.id, { archived: args?.data?.archived ?? true }),

  createPartyFn: async (args: any) => fs.fsCreateParty(args?.data || args),
  updatePartyFn: async (args: any) => fs.fsUpdateParty(args?.data?.id || args?.id, args?.data || args),
  deletePartyFn: async (args: any) => fs.fsDeleteParty(args?.data?.id || args?.id),
  archivePartyFn: async (args: any) => fs.fsUpdateParty(args?.data?.id || args?.id, { archived: args?.data?.archived ?? true }),

  createCustomerFn: async (args: any) => fs.fsCreateCustomer(args?.data || args),
  updateCustomerFn: async (args: any) => fs.fsUpdateCustomer(args?.data?.id || args?.id, args?.data || args),
  deleteCustomerFn: async (args: any) => fs.fsDeleteCustomer(args?.data?.id || args?.id),
  archiveCustomerFn: async (args: any) => fs.fsUpdateCustomer(args?.data?.id || args?.id, { archived: args?.data?.archived ?? true }),

  createPartyReceivableFn: async (args: any) => fs.fsCreatePartyReceivable(args?.data || args),
  createPartyPayableFn: async (args: any) => fs.fsCreatePartyPayable(args?.data || args),
  createPayableSettlementFn: async (args: any) => fs.fsCreatePayableSettlement(args?.data || args),

  createSaleFn: async (args: any) => fs.fsCreateSale(args?.data || args),
  editSaleFn: async (args: any) => fs.fsEditSale(args?.data?.id || args?.id, args?.data || args),
  deleteSaleFn: async (args: any) => fs.fsDeleteSale(args?.data?.id || args?.id),
  approveCourierPaymentFn: async (args: any) => fs.fsApproveCourierPayment(args?.data?.id || args?.id),
  cancelCourierOrderFn: async (args: any) => fs.fsCancelCourierOrder(args?.data?.id || args?.id),

  createReturnFn: async (args: any) => fs.fsCreateReturn(args?.data || args),
  createDirectProductReturnFn: async (args: any) => fs.fsCreateReturn(args?.data || args),
  createPartyReturnFn: async (args: any) => fs.fsCreateReturn(args?.data || args),
  deleteReturnFn: async (args: any) => fs.fsDeleteReturn(args?.data?.id || args?.id),

  createPurchaseFn: async (args: any) => fs.fsCreatePurchase(args?.data || args),
  editPurchaseFn: async (args: any) => fs.fsEditPurchase(args?.data?.id || args?.id, args?.data || args),
  deletePurchaseFn: async (args: any) => fs.fsDeletePurchase(args?.data?.id || args?.id),

  createExpenseFn: async (args: any) => fs.fsCreateExpense(args?.data || args),
  deleteExpenseFn: async (args: any) => fs.fsDeleteExpense(args?.data?.id || args?.id),

  createPaymentFn: async (args: any) => fs.fsCreatePayment(args?.data || args),
  deletePaymentFn: async (args: any) => fs.fsDeletePayment(args?.data?.id || args?.id),

  createSomitiFn: async (args: any) => fs.fsCreateSomiti(args?.data || args),
  updateSomitiFn: async (args: any) => fs.fsUpdateSomiti(args?.data?.id || args?.id, args?.data || args),
  deleteSomitiFn: async (args: any) => fs.fsDeleteSomiti(args?.data?.id || args?.id),

  createWithdrawalFn: async (args: any) => fs.fsCreateWithdrawal(args?.data || args),

  createCashboxFn: async (args: any) => fs.fsCreateCashbox(args?.data || args),
  updateCashboxFn: async (args: any) => fs.fsUpdateCashbox(args?.data?.id || args?.id, args?.data || args),
  deleteCashboxFn: async (args: any) => fs.fsDeleteCashbox(args?.data?.id || args?.id),
  emptyCashboxFn: async () => fs.fsEmptyCashbox(),

  createReminderFn: async (args: any) => fs.fsCreateReminder(args?.data || args),
  toggleReminderFn: async (args: any) => fs.fsToggleReminder(args?.data?.id || args?.id, args?.data || args),
  deleteReminderFn: async (args: any) => fs.fsDeleteReminder(args?.data?.id || args?.id),

  createBankAccountFn: async (args: any) => fs.fsCreateBankAccount(args?.data || args),
  updateBankAccountFn: async (args: any) => fs.fsUpdateBankAccount(args?.data?.id || args?.id, args?.data || args),
  deleteBankAccountFn: async (args: any) => fs.fsDeleteBankAccount(args?.data?.id || args?.id),
  createBankTransactionFn: async (args: any) => fs.fsCreateBankTransaction(args?.data || args),
  createBankLoanFn: async (args: any) => fs.fsCreateBankLoan(args?.data || args),
  payBankLoanInstallmentFn: async (args: any) => fs.fsPayBankLoanInstallment(args?.data || args),
  deleteBankLoanFn: async (args: any) => fs.fsDeleteBankLoan(args?.data?.id || args?.id),

  resetProductsFn: async () => fs.fsResetProducts(),
  resetSalesFn: async () => fs.fsResetSales(),
  resetPurchasesFn: async () => fs.fsResetPurchases(),
  resetSomitiFn: async () => fs.fsResetSomiti(),
  resetExpensesFn: async () => fs.fsResetExpenses(),
  resetPartiesFn: async () => fs.fsResetParties(),
  resetAllDataFn: async () => fs.fsResetAllData(),
};

async function executeAction(name: string, args: any): Promise<any> {
  const handler = fsActionMap[name];
  if (handler) {
    try {
      return await handler(args);
    } catch (fsErr) {
      console.warn(`Firestore action ${name} error, attempting remote fallback:`, fsErr);
    }
  }
  return await callRemoteRpc(name, args);
}

// Action factories
const makeReadAction = (name: string) => (args?: any) => executeAction(name, args);
const makeWriteAction = (name: string) => (args?: any) => {
  const handler = fsActionMap[name];
  if (handler) {
    return handler(args).catch((err: any) => {
      console.warn(`Firestore write ${name} caught error, queuing/retrying:`, err);
      return runWriteAction(name, args);
    });
  }
  return runWriteAction(name, args);
};

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

// ─── Export Offline-Supported Writes ─────────────────────────────────────────
export const createProductFn = makeWriteAction("createProductFn");
export const updateProductFn = makeWriteAction("updateProductFn");
export const deleteProductFn = makeWriteAction("deleteProductFn");
export const archiveProductFn = makeWriteAction("archiveProductFn");

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

export const createWithdrawalFn = makeWriteAction("createWithdrawalFn");
export const createCashboxFn = makeReadAction("createCashboxFn");
export const updateCashboxFn = makeReadAction("updateCashboxFn");
export const deleteCashboxFn = makeReadAction("deleteCashboxFn");
export const repairCashboxDbFn = makeReadAction("repairCashboxDbFn");

export const createReminderFn = makeWriteAction("createReminderFn");
export const toggleReminderFn = makeWriteAction("toggleReminderFn");
export const deleteReminderFn = makeWriteAction("deleteReminderFn");

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
  "updateUserAvatarFn", "createReturnFn", "createDirectProductReturnFn", "deleteReturnFn",
  "createPurchaseFn", "deletePurchaseFn", "createExpenseFn", "deleteExpenseFn",
  "createPaymentFn", "deletePaymentFn", "createSomitiFn", "updateSomitiFn", "deleteSomitiFn",
  "renameSomitiFn", "deleteSomitiFnByName", "createWithdrawalFn",
  "createReminderFn", "toggleReminderFn", "deleteReminderFn"
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

