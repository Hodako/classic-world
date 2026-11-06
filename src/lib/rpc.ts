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
  let token: string | null = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
  const isEmployeeSession = typeof window !== "undefined" && (
    !!window.localStorage.getItem("cw_active_employee_session") ||
    window.localStorage.getItem("cw_active_session_role") === "employee" ||
    (token ? token.startsWith("token_emp_") : false)
  );

  // Return local employee or mock session user immediately for getMeFn
  if (actionName === "getMeFn") {
    if (isEmployeeSession) {
      const activeEmpRaw = window.localStorage.getItem("cw_active_employee_session") || window.localStorage.getItem("user");
      if (activeEmpRaw) {
        try {
          return { user: JSON.parse(activeEmpRaw) };
        } catch (_) {}
      }
    }
    if (token && (token.startsWith("token_mock_") || !token.includes("."))) {
      const profileRaw = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("cw-auth-profile");
      if (profileRaw) {
        try {
          return { user: JSON.parse(profileRaw) };
        } catch (_) {}
      }
    }
  }

  // Auto-sync token with Firebase Auth or cached profile if token is missing or non-JWT (only for store owner)
  if (!isEmployeeSession && (!token || !token.includes(".")) && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn" && actionName !== "registerFn") {
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
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    let res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ actionName, args: safeArgs, token, activeProfile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Auto-refresh token and retry on 401 Unauthorized (only for store owner, never for employee session)
    if (!isEmployeeSession && res.status === 401 && typeof window !== "undefined" && actionName !== "firebaseAuthSyncFn" && actionName !== "loginFn") {
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

// Dispatcher for writing directly to Firestore (used offline, in employee sessions, and as mirror sync)
async function executeFirestoreWriteAction(actionName: string, args: any): Promise<any> {
  const safeArgs = args ?? {};
  const data = safeArgs?.data ?? safeArgs;
  const fs = await import("@/lib/firestore-service");

  switch (actionName) {
    case "createSaleFn":
      return await fs.fsCreateSale(data);
    case "editSaleFn":
      return await fs.fsEditSale(data?.id, data);
    case "deleteSaleFn":
      return await fs.fsDeleteSale(data?.id);
    case "approveCourierPaymentFn":
      return await fs.fsApproveCourierPayment(data?.id);
    case "cancelCourierOrderFn":
      return await fs.fsCancelCourierOrder(data?.id);
    case "acceptDigitalPaymentFn":
      return await fs.fsAcceptDigitalPayment(data?.id);

    case "createProductFn":
      return await fs.fsCreateProduct(data);
    case "updateProductFn":
      return await fs.fsUpdateProduct(data?.id, data);
    case "deleteProductFn":
      return await fs.fsDeleteProduct(data?.id);
    case "archiveProductFn":
      return await fs.fsUpdateProduct(data?.id, { archived: data?.archived ?? true });
    case "exchangeProductsFn":
      return await fs.fsExchangeProducts(data);

    case "createCustomerFn":
      return await fs.fsCreateCustomer(data);
    case "updateCustomerFn":
      return await fs.fsUpdateCustomer(data?.id, data);
    case "deleteCustomerFn":
      return await fs.fsDeleteCustomer(data?.id);
    case "archiveCustomerFn":
      return await fs.fsArchiveCustomer(data?.id, data?.archived ?? true);

    case "createPartyFn":
      return await fs.fsCreateParty(data);
    case "updatePartyFn":
      return await fs.fsUpdateParty(data?.id, data);
    case "deletePartyFn":
      return await fs.fsDeleteParty(data?.id);
    case "archivePartyFn":
      return await fs.fsArchiveParty(data?.id, data?.archived ?? true);

    case "createPurchaseFn":
      return await fs.fsCreatePurchase(data);
    case "editPurchaseFn":
      return await fs.fsEditPurchase(data?.id, data);
    case "deletePurchaseFn":
      return await fs.fsDeletePurchase(data?.id);

    case "createExpenseFn":
      return await fs.fsCreateExpense(data);
    case "deleteExpenseFn":
      return await fs.fsDeleteExpense(data?.id);

    case "createReturnFn":
      return await fs.fsCreateReturn(data);
    case "createDirectProductReturnFn":
      return await fs.fsCreateReturn({ ...data, return_type: "direct" });
    case "createPartyReturnFn":
      return await fs.fsCreateReturn({ ...data, return_type: "party" });
    case "deleteReturnFn":
      return await fs.fsDeleteReturn(data?.id);

    case "createPaymentFn":
      return await fs.fsCreatePartyPayment(data);
    case "deletePaymentFn":
      return await fs.fsDeletePayment(data?.id);

    case "createPartyReceivableFn":
      return await fs.fsCreatePartyReceivable(data);
    case "deletePartyReceivableFn":
      return await fs.fsDeletePartyReceivable(data?.id);
    case "createPartyPayableFn":
      return await fs.fsCreatePartyPayable(data);
    case "deletePartyPayableFn":
      return await fs.fsDeletePartyPayable(data?.id);
    case "createPayableSettlementFn":
      return await fs.fsCreatePayableSettlement(data);
    case "deletePayableSettlementFn":
      return await fs.fsDeletePayableSettlement(data?.id);

    case "createCashboxFn":
      return await fs.fsCreateCashbox({
        id: data?.id,
        kind: data?.kind || "deposit",
        amount: Number(data?.amount) || 0,
        note: data?.note ?? null,
        created_at: data?.created_at,
        ref_id: data?.ref_id ?? null,
      });
    case "updateCashboxFn":
      return await fs.fsUpdateCashbox(data?.id, data);
    case "deleteCashboxFn":
      return await fs.fsDeleteCashbox(data?.id);
    case "repairCashboxDbFn":
      return await fs.fsRepairCashbox();

    case "createOwnerWalletEntryFn":
      return await fs.fsCreateOwnerWalletEntry(data);
    case "updateOwnerWalletEntryFn":
      return await fs.fsUpdateOwnerWalletEntry(data?.id, data);
    case "deleteOwnerWalletEntryFn":
      return await fs.fsDeleteOwnerWalletEntry(data?.id);

    case "createWithdrawalFn":
      return await fs.fsCreateWithdrawal(data);
    case "deleteWithdrawalFn":
      return await fs.fsDeleteWithdrawal(data?.id);

    case "createSomitiFn":
      return await fs.fsCreateSomiti(data);
    case "updateSomitiFn":
      return await fs.fsUpdateSomiti(data?.id, data);
    case "deleteSomitiFn":
      return await fs.fsDeleteSomiti(data?.id);
    case "renameSomitiFn":
      return await fs.fsRenameSomiti(data);
    case "deleteSomitiFnByName":
      return await fs.fsDeleteSomitiByName(data);

    case "createReminderFn":
      return await fs.fsCreateReminder(data);
    case "toggleReminderFn":
      return await fs.fsToggleReminder(data?.id, data);
    case "deleteReminderFn":
      return await fs.fsDeleteReminder(data?.id);

    case "createEmployeeFn":
    case "addEmployeeFn":
    case "createShopEmployeeFn":
      return await fs.fsAddEmployee(data);
    case "updateEmployeeFn":
    case "updateShopEmployeeFn":
      return await fs.fsUpdateEmployee(data?.id, data);
    case "deleteEmployeeFn":
    case "deleteShopEmployeeFn":
      return await fs.fsDeleteEmployee(data?.id);
    case "removeEmployeeFn":
      return await fs.fsRemoveEmployee(data?.employeeId || data?.id);
    case "inviteEmployeeByEmailFn":
    case "sendEmployeeInvitationFn":
      return await fs.fsSendEmployeeInvitation(data);
    case "cancelEmployeeInvitationFn":
      return await fs.fsCancelEmployeeInvitation(data?.id);

    case "createEmployeeShoppingFn":
      return await fs.fsCreateEmployeeShopping(data);
    case "deleteEmployeeShoppingFn":
      return await fs.fsDeleteEmployeeShopping(data?.id);

    case "createEmployeeSalaryFn":
      return await fs.fsCreateEmployeeSalary(data);
    case "deleteEmployeeSalaryFn":
      return await fs.fsDeleteEmployeeSalary(data?.id);

    case "createEmployeeExpenseFn":
      return await fs.fsCreateEmployeeExpense(data);
    case "deleteEmployeeExpenseFn":
      return await fs.fsDeleteEmployeeExpense(data?.id);

    case "createBankAccountFn":
      return await fs.fsCreateBankAccount(data);
    case "updateBankAccountFn":
      return await fs.fsUpdateBankAccount(data?.id, data);
    case "deleteBankAccountFn":
      return await fs.fsDeleteBankAccount(data?.id);
    case "createBankTransactionFn":
      return await fs.fsCreateBankTransaction(data);
    case "createBankLoanFn":
      return await fs.fsCreateBankLoan(data);
    case "payBankLoanInstallmentFn":
      return await fs.fsPayBankLoanInstallment(data);
    case "deleteBankLoanFn":
      return await fs.fsDeleteBankLoan(data?.id);

    case "restoreRecycleItemFn":
    case "restoreFromRecycleBinFn":
      return await fs.fsRestoreFromRecycleBin(data?.id || data?.recycleDocId);
    case "permanentDeleteRecycleItemFn":
    case "permanentDeleteRecycleBinFn":
      return await fs.fsPermanentDeleteRecycleBin(data?.id || data?.recycleDocId);

    case "updateBusinessSettingsFn":
      return await fs.fsUpdateBusinessSettings(data);
    case "updateSmsSettingsFn":
      return await fs.fsUpdateSmsSettings(data);
    case "sendSmsCampaignFn":
      return await fs.fsSendSmsCampaign(data);
    case "deleteSmsLogFn":
      return await fs.fsDeleteSmsLog(data?.id);
    case "dismissAdminPopupFn":
      return await fs.fsDismissAdminPopup(data?.popupId || data?.id);
    case "toggleGoogleSheetsSyncFn":
      return await fs.fsToggleGoogleSheetsSync(data);
    case "generateOwnerLicenseKeyFn":
      return await fs.fsGenerateOwnerLicenseKey(data);
    case "generateEmployeeLicenseKeyFn":
      return await fs.fsGenerateEmployeeLicenseKey(data);
    case "revokeLicenseFn":
      return await fs.fsRevokeLicense(data?.key || data?.licenseKey);
    case "validateAndActivateLicenseFn":
    case "activateLicenseFn":
      return await fs.fsValidateAndActivateLicense(data?.licenseKey || data?.key, data?.userUid, data?.userEmail);
    case "createProfileFn":
      return await fs.fsCreateProfile(data);
    case "switchProfileFn":
      return await fs.fsSwitchProfile(data);
    case "importProfileModuleFn":
      return await fs.fsImportProfileModule(data);

    default:
      return { success: true, id: data?.id || crypto.randomUUID() };
  }
}

// Dispatcher for reading directly from Firestore (used for employee sessions and offline fallback)
async function executeFirestoreReadAction(name: string, args: any = {}): Promise<any> {
  const safeArgs = args ?? {};
  const data = safeArgs?.data || safeArgs;
  const fs = await import("@/lib/firestore-service");

  switch (name) {
    case "loginFn":
      return await fs.fsLogin(data);
    case "registerFn":
      return await fs.fsRegister(data);
    case "firebaseAuthSyncFn":
      return await fs.fsFirebaseAuthSync(data);
    case "createProfileFn":
      return await fs.fsCreateProfile(data);
    case "switchProfileFn":
      return await fs.fsSwitchProfile(data);
    case "importProfileModuleFn":
      return await fs.fsImportProfileModule(data);
    case "logoutFn":
      return { success: true };
    case "changeMyPasswordFn":
      return await fs.fsChangeMyPassword(data);
    case "verifyOwnerPasswordFn":
      return await fs.fsVerifyOwnerPassword(data);
    case "uploadImageFn":
      return await fs.fsUploadImage(data);
    case "bulkExportToGoogleSheetsFn":
      return await fs.fsBulkExportToGoogleSheets();
    case "employeeLoginFn":
      return await fs.fsEmployeeLogin(data);
    case "getMeFn":
      return await fs.fsGetMe();
    case "getSalesFn":
      return await fs.fsGetSales();
    case "getProductsFn":
      return await fs.fsGetProducts();
    case "getCustomersFn":
      return await fs.fsGetCustomers();
    case "getCustomerFn": {
      const allC = await fs.fsGetCustomers();
      const targetId = data?.id;
      return allC.find((c: any) => c.id === targetId) || null;
    }
    case "getPartiesFn":
      return await fs.fsGetParties();
    case "getPartyFn": {
      const targetId = data?.id;
      if (!targetId) return null;
      try {
        return await fs.fsGetParty(targetId);
      } catch (err) {
        const allP = await fs.fsGetParties();
        return allP.find((p: any) => p.id === targetId) || null;
      }
    }
    case "getPurchasesForPartyFn": {
      const partyId = data?.partyId;
      return await fs.fsGetPurchasesForParty(partyId);
    }
    case "getCashboxFn":
      return await fs.fsGetCashbox();
    case "getPurchasesFn":
      return await fs.fsGetPurchases();
    case "getExpensesFn":
      return await fs.fsGetExpenses();
    case "getOwnerWalletFn":
      return await fs.fsGetOwnerWallet();
    case "getWithdrawalsFn":
      return await fs.fsGetWithdrawals();
    case "getSomitiFn":
      return await fs.fsGetSomiti();
    case "getEmployeesFn":
    case "listShopEmployeesFn":
      return await fs.fsGetEmployees();
    case "listEmployeeInvitationsFn":
      return await fs.fsListEmployeeInvitations();
    case "getMyPendingEmployeeInvitationsFn":
      return [];
    case "getReturnsFn":
      return await fs.fsGetReturns();
    case "getAllPaymentsFn":
      return await fs.fsGetAllPayments();
    case "getAllPartyReceivablesFn":
      return await fs.fsGetAllPartyReceivables();
    case "getAllPartyPayablesFn":
      return await fs.fsGetAllPartyPayables();
    case "getAllPayableSettlementsFn":
      return await fs.fsGetAllPayableSettlements();
    case "getPartyReceivablesFn": {
      const partyId = data?.partyId;
      const allRec = await fs.fsGetAllPartyReceivables();
      return partyId ? allRec.filter((r: any) => r.party_id === partyId) : allRec;
    }
    case "getPartyPayablesFn": {
      const partyId = data?.partyId;
      const allPay = await fs.fsGetAllPartyPayables();
      return partyId ? allPay.filter((p: any) => p.party_id === partyId) : allPay;
    }
    case "getPayableSettlementsFn": {
      const partyId = data?.partyId;
      const allSet = await fs.fsGetAllPayableSettlements();
      return partyId ? allSet.filter((s: any) => s.party_id === partyId) : allSet;
    }
    case "getSalesForPartyFn": {
      const partyId = data?.partyId;
      const allSales = await fs.fsGetSales();
      return partyId ? allSales.filter((s: any) => s.party_id === partyId) : allSales;
    }
    case "getPaymentsForPartyFn": {
      const partyId = data?.partyId;
      const allPayments = await fs.fsGetAllPayments();
      return partyId ? allPayments.filter((p: any) => p.party_id === partyId) : allPayments;
    }
    case "getEmployeeSalariesFn":
      return await fs.fsGetEmployeeSalaries();
    case "getEmployeeExpensesFn":
      return await fs.fsGetEmployeeExpenses();
    case "getEmployeeShoppingsFn":
      return await fs.fsGetEmployeeShoppings();
    case "getBankAccountsFn":
      return await fs.fsGetBankAccounts();
    case "getBankLoansFn":
      return await fs.fsGetBankLoans();
    case "getRecycleBinFn":
      return await fs.fsGetRecycleBin();
    case "getRemindersFn":
      return await fs.fsGetReminders();
    case "getBusinessSettingsFn":
      return await fs.fsGetBusinessSettings();
    case "getSmsSettingsFn":
      return await fs.fsGetSmsSettings();
    case "checkSmsBalanceFn":
      return await fs.fsCheckSmsBalance();
    case "checkSmsDeliveryStatusFn":
      return await fs.fsCheckSmsDeliveryStatus(data);
    case "getSmsLogsFn":
      return await fs.fsGetSmsLogs();
    case "getActiveAdminPopupsFn":
      return await fs.fsGetActiveAdminPopups();
    case "listLicensesFn":
      return await fs.fsListLicenses(data?.type);
    case "emptyCashboxFn":
      return await fs.fsEmptyCashbox();
    case "resetProductsFn":
      return await fs.fsResetProducts();
    case "resetSalesFn":
      return await fs.fsResetSales();
    case "resetPurchasesFn":
      return await fs.fsResetPurchases();
    case "resetSomitiFn":
      return await fs.fsResetSomiti();
    case "resetExpensesFn":
      return await fs.fsResetExpenses();
    case "resetPartiesFn":
      return await fs.fsResetParties();
    case "resetAllDataFn":
      return await fs.fsResetAllData();
    case "getCommandHistoryFn":
      return [];
    default:
      return [];
  }
}

// Helper to determine if we are offline or if a network/auth error occurs
async function runWriteAction<T>(actionName: string, args: any = {}): Promise<T | any> {
  const safeArgs = args ?? {};

  // 1. Offline write: save to offline sync queue & local IndexedDB
  if (typeof window !== "undefined" && !navigator.onLine) {
    queueOfflineAction(actionName, safeArgs);
    try {
      const fsRes = await executeFirestoreWriteAction(actionName, safeArgs);
      return fsRes ?? { success: true, offline: true, id: safeArgs?.data?.id || crypto.randomUUID() };
    } catch (_) {
      return { success: true, offline: true, id: safeArgs?.data?.id || crypto.randomUUID() };
    }
  }

  // 2. Direct Firestore write — sub-100ms local IndexedDB commit and real-time cloud sync
  try {
    const fsRes = await executeFirestoreWriteAction(actionName, safeArgs);
    return fsRes ?? { success: true, id: safeArgs?.data?.id || crypto.randomUUID() };
  } catch (err: any) {
    if (typeof window !== "undefined" && !navigator.onLine) {
      queueOfflineAction(actionName, safeArgs);
      return { success: true, offline: true, id: safeArgs?.data?.id || crypto.randomUUID() };
    }
    console.error(`Firestore write error for ${actionName}:`, err);
    throw err;
  }
}

const THROWING_READ_ACTIONS = new Set([
  "loginFn",
  "employeeLoginFn",
  "registerFn",
  "firebaseAuthSyncFn",
  "createProfileFn",
  "switchProfileFn",
  "importProfileModuleFn",
  "changeMyPasswordFn",
  "verifyOwnerPasswordFn",
  "uploadImageFn",
  "emptyCashboxFn",
  "resetProductsFn",
  "resetSalesFn",
  "resetPurchasesFn",
  "resetSomitiFn",
  "resetExpensesFn",
  "resetPartiesFn",
  "resetAllDataFn",
]);

async function runReadAction(name: string, args: any = {}): Promise<any> {
  const safeArgs = args ?? {};
  if (name === "getMeFn" && typeof window !== "undefined" && localStorage.getItem("cw_employee_device_link_id")) {
    const { getLinkedEmployeeSession } = await import("./employee-device-link");
    return getLinkedEmployeeSession();
  }

  // Return local employee user immediately for getMeFn
  if (name === "getMeFn" && typeof window !== "undefined") {
    const activeEmpRaw = window.localStorage.getItem("cw_active_employee_session") || window.localStorage.getItem("user");
    if (activeEmpRaw) {
      try {
        const u = JSON.parse(activeEmpRaw);
        if (u?.role === "employee") {
          return { user: u };
        }
      } catch (_) {}
    }
  }

  // Direct Firestore read — instant local IndexedDB + background cloud sync (zero remote latency)
  try {
    const fsRes = await executeFirestoreReadAction(name, safeArgs);
    if (fsRes !== undefined) return fsRes;
  } catch (fsErr) {
    console.warn(`Firestore read error for ${name}:`, fsErr);
    if (THROWING_READ_ACTIONS.has(name)) {
      throw fsErr;
    }
  }

  // Return empty array for list queries rather than failing completely
  if (name.endsWith("sFn") || name.startsWith("list")) return [];
  return null;
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
export const getPurchasesForPartyFn = makeReadAction("getPurchasesForPartyFn");
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
