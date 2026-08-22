import { queueOfflineAction, startBackgroundSync } from "./offline-sync";
import * as fs from "./firestore-service";

// Helper to determine if we are offline or if a network error occurs
async function runWriteAction<T>(actionName: string, args: any): Promise<T | any> {
  if (typeof window !== "undefined" && !navigator.onLine) {
    queueOfflineAction(actionName, args);
    return { success: true, offline: true, id: crypto.randomUUID() };
  }
  try {
    return await executeFirestoreAction(actionName, args);
  } catch (err) {
    if (typeof window !== "undefined") {
      console.warn(`Write action ${actionName} failed, queuing offline:`, err);
      queueOfflineAction(actionName, args);
      return { success: true, offline: true, id: crypto.randomUUID() };
    }
    throw err;
  }
}

// ── Firestore Dispatch Engine for Classic World ──────────────────────────────
async function executeFirestoreAction(actionName: string, args: any) {
  const data = args?.data !== undefined ? args.data : args;
  const id = args?.id || data?.id;

  switch (actionName) {
    // Auth & Session
    case "getMeFn": {
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("hz-auth-profile");
        const token = window.localStorage.getItem("auth_token");
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && (parsed.id || parsed.email)) {
              if (!token) {
                window.localStorage.setItem("auth_token", "cw_token_" + (parsed.id || Date.now()));
              }
              return { user: parsed };
            }
          } catch (_) {}
        }
      }
      return { user: null };
    }
    case "loginFn":
    case "registerFn": {
      const email = (data?.email || "admin@classicworld.com").trim().toLowerCase();
      let isActivated = false;
      let existingProfile: any = null;

      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("hz-auth-profile");
        if (stored) {
          try {
            existingProfile = JSON.parse(stored);
            if (existingProfile.email?.toLowerCase() === email && existingProfile.activated && existingProfile.license_key) {
              isActivated = true;
            }
          } catch (_) {}
        }
      }

      if (existingProfile?.license_key && existingProfile?.activated) {
        isActivated = true;
      } else {
        isActivated = false;
      }

      const user = {
        id: existingProfile?.id || "cw_" + Date.now(),
        email: email,
        full_name: data?.fullName || existingProfile?.full_name || email.split("@")[0] || "Classic World Admin",
        business_name: "Classic World",
        role: existingProfile?.role || (existingProfile?.license_key?.startsWith("EMP-") ? "employee" : "owner"),
        activated: isActivated,
        license_key: existingProfile?.license_key || null,
        logo_url: "/logo.svg",
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem("auth_token", "cw_token_" + (user.id || Date.now()));
        window.localStorage.setItem("classicworld_auth_profile", JSON.stringify(user));
        window.localStorage.setItem("hz-auth-profile", JSON.stringify(user));
      }
      return { success: true, user, token: "cw_token_" + (user.id || Date.now()) };
    }
    case "logoutFn": {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("auth_token");
        window.localStorage.removeItem("active_profile");
        window.localStorage.removeItem("classicworld_auth_profile");
        window.localStorage.removeItem("hz-auth-profile");
      }
      return { success: true };
    }

    // Products
    case "getProductsFn": return await fs.fsGetProducts();
    case "createProductFn": return await fs.fsCreateProduct(data);
    case "updateProductFn": return await fs.fsUpdateProduct(id, data);
    case "deleteProductFn": return await fs.fsDeleteProduct(id);
    case "archiveProductFn": return await fs.fsUpdateProduct(id, { archived: true });

    // Sales
    case "getSalesFn": return await fs.fsGetSales();
    case "getSalesForPartyFn": {
      const allSales = await fs.fsGetSales();
      return allSales.filter((s: any) => s.party_id === args?.partyId);
    }
    case "createSaleFn": return await fs.fsCreateSale(data);
    case "deleteSaleFn": return await fs.fsDeleteSale(id);
    case "editSaleFn": return await fs.fsEditSale(id, data);
    case "approveCourierPaymentFn": return await fs.fsApproveCourierPayment(args?.data?.id || id);
    case "cancelCourierOrderFn": return await fs.fsCancelCourierOrder(args?.data?.id || id);

    // Expenses
    case "getExpensesFn": return await fs.fsGetExpenses();
    case "createExpenseFn": return await fs.fsCreateExpense(data);
    case "deleteExpenseFn": return await fs.fsDeleteExpense(id);

    // Parties
    case "getPartiesFn": return await fs.fsGetParties();
    case "getPartyFn": {
      const parties = await fs.fsGetParties();
      return parties.find((p: any) => p.id === (args?.id || id)) || null;
    }
    case "createPartyFn": return await fs.fsCreateParty(data);
    case "updatePartyFn": return await fs.fsUpdateParty(id, data);
    case "deletePartyFn": return await fs.fsDeleteParty(id);
    case "archivePartyFn": return await fs.fsUpdateParty(id, { archived: true });

    // Customers
    case "getCustomersFn": return await fs.fsGetCustomers();
    case "getCustomerFn": {
      const customers = await fs.fsGetCustomers();
      return customers.find((c: any) => c.id === (args?.id || id)) || null;
    }
    case "createCustomerFn": return await fs.fsCreateCustomer(data);
    case "updateCustomerFn": return await fs.fsUpdateCustomer(id, data);
    case "deleteCustomerFn": return await fs.fsDeleteCustomer(id);
    case "archiveCustomerFn": return await fs.fsUpdateCustomer(id, { archived: true });

    // Purchases
    case "getPurchasesFn": return await fs.fsGetPurchases();
    case "createPurchaseFn": return await fs.fsCreatePurchase(data);
    case "deletePurchaseFn": return await fs.fsDeletePurchase(id);

    // Cashbox & Withdrawals
    case "getCashboxFn": return await fs.fsGetCashbox();
    case "createCashboxFn": return await fs.fsCreateCashbox(data);
    case "getWithdrawalsFn": return await fs.fsGetWithdrawals();
    case "createWithdrawalFn": return await fs.fsCreateWithdrawal(data);

    // Somiti
    case "getSomitiFn": return await fs.fsGetSomiti();
    case "createSomitiFn": return await fs.fsCreateSomiti(data);
    case "updateSomitiFn": return await fs.fsUpdateSomiti(id, data);
    case "deleteSomitiFn": return await fs.fsDeleteSomiti(id);

    // Reminders
    case "getRemindersFn": return await fs.fsGetReminders();
    case "createReminderFn": return await fs.fsCreateReminder(data);
    case "toggleReminderFn": return await fs.fsToggleReminder(id, data);
    case "deleteReminderFn": return await fs.fsDeleteReminder(id);

    // Payments & Dues
    case "getAllPaymentsFn": return await fs.fsGetAllPayments();
    case "getPaymentsForPartyFn": {
      const allPayments = await fs.fsGetAllPayments();
      return allPayments.filter((p: any) => p.party_id === args?.partyId);
    }
    case "createPaymentFn": return await fs.fsCreatePayment(data);
    case "deletePaymentFn": return await fs.fsDeletePayment(id);

    case "getAllPartyReceivablesFn": return await fs.fsGetAllPartyReceivables();
    case "getPartyReceivablesFn": {
      const all = await fs.fsGetAllPartyReceivables();
      return all.filter((r: any) => r.party_id === args?.partyId);
    }
    case "createPartyReceivableFn": return await fs.fsCreatePartyReceivable(data);

    case "getAllPartyPayablesFn": return await fs.fsGetAllPartyPayables();
    case "getPartyPayablesFn": {
      const all = await fs.fsGetAllPartyPayables();
      return all.filter((p: any) => p.party_id === args?.partyId);
    }
    case "createPartyPayableFn": return await fs.fsCreatePartyPayable(data);

    case "getAllPayableSettlementsFn": return await fs.fsGetAllPayableSettlements();
    case "getPayableSettlementsFn": {
      const all = await fs.fsGetAllPayableSettlements();
      return all.filter((s: any) => s.party_id === args?.partyId);
    }

    // Bank & Loans
    case "getBankAccountsFn": return await fs.fsGetBankAccounts();
    case "createBankAccountFn": return await fs.fsCreateBankAccount(data);
    case "updateBankAccountFn": return await fs.fsUpdateBankAccount(id, data);
    case "deleteBankAccountFn": return await fs.fsDeleteBankAccount(id || data?.id);
    case "createBankTransactionFn": return await fs.fsCreateBankTransaction(data);
    case "getBankLoansFn": return await fs.fsGetBankLoans();
    case "createBankLoanFn": return await fs.fsCreateBankLoan(data);
    case "payBankLoanInstallmentFn": return await fs.fsPayBankLoanInstallment(data);
    case "deleteBankLoanFn": return await fs.fsDeleteBankLoan(id || data?.id);

    default:
      return { success: true };
  }
}

// ─── Export READS ────────────────────────────────────────────────────────────
export const getMeFn = (args?: any) => executeFirestoreAction("getMeFn", args);
export const getProductsFn = (args?: any) => executeFirestoreAction("getProductsFn", args);
export const getStorefrontBySlug = (args?: any) => executeFirestoreAction("getStorefrontBySlug", args);
export const getPartiesFn = (args?: any) => executeFirestoreAction("getPartiesFn", args);
export const getPartyFn = (args?: any) => executeFirestoreAction("getPartyFn", args);
export const getCustomersFn = (args?: any) => executeFirestoreAction("getCustomersFn", args);
export const getCustomerFn = (args?: any) => executeFirestoreAction("getCustomerFn", args);
export const getAllPartyReceivablesFn = (args?: any) => executeFirestoreAction("getAllPartyReceivablesFn", args);
export const getAllPartyPayablesFn = (args?: any) => executeFirestoreAction("getAllPartyPayablesFn", args);
export const getAllPayableSettlementsFn = (args?: any) => executeFirestoreAction("getAllPayableSettlementsFn", args);
export const getPartyReceivablesFn = (args?: any) => executeFirestoreAction("getPartyReceivablesFn", args);
export const getPartyPayablesFn = (args?: any) => executeFirestoreAction("getPartyPayablesFn", args);
export const getPayableSettlementsFn = (args?: any) => executeFirestoreAction("getPayableSettlementsFn", args);
export const getSalesFn = (args?: any) => executeFirestoreAction("getSalesFn", args);
export const getSalesForPartyFn = (args?: any) => executeFirestoreAction("getSalesForPartyFn", args);
export const getReturnsFn = (args?: any) => executeFirestoreAction("getReturnsFn", args);
export const getPurchasesFn = (args?: any) => executeFirestoreAction("getPurchasesFn", args);
export const getExpensesFn = (args?: any) => executeFirestoreAction("getExpensesFn", args);
export const getPaymentsForPartyFn = (args?: any) => executeFirestoreAction("getPaymentsForPartyFn", args);
export const getAllPaymentsFn = (args?: any) => executeFirestoreAction("getAllPaymentsFn", args);
export const getSomitiFn = (args?: any) => executeFirestoreAction("getSomitiFn", args);
export const getWithdrawalsFn = (args?: any) => executeFirestoreAction("getWithdrawalsFn", args);
export const getCashboxFn = (args?: any) => executeFirestoreAction("getCashboxFn", args);
export const getRemindersFn = (args?: any) => executeFirestoreAction("getRemindersFn", args);

// ─── Export Auth ─────────────────────────────────────────────────────────────
export const loginFn = (args?: any) => executeFirestoreAction("loginFn", args);
export const registerFn = (args?: any) => executeFirestoreAction("registerFn", args);
export const logoutFn = (args?: any) => executeFirestoreAction("logoutFn", args);
export const changeMyPasswordFn = (args?: any) => executeFirestoreAction("changeMyPasswordFn", args);
export const verifyOwnerPasswordFn = (args?: any) => executeFirestoreAction("verifyOwnerPasswordFn", args);
export const uploadImageFn = (args?: any) => executeFirestoreAction("uploadImageFn", args);
export const bulkExportToGoogleSheetsFn = (args?: any) => executeFirestoreAction("bulkExportToGoogleSheetsFn", args);
export const createProfileFn = (args?: any) => executeFirestoreAction("createProfileFn", args);
export const switchProfileFn = (args?: any) => executeFirestoreAction("switchProfileFn", args);
export const importProfileModuleFn = (args?: any) => executeFirestoreAction("importProfileModuleFn", args);

// ─── Export Writes ───────────────────────────────────────────────────────────
export const createProductFn = (args?: any) => runWriteAction("createProductFn", args);
export const updateProductFn = (args?: any) => runWriteAction("updateProductFn", args);
export const deleteProductFn = (args?: any) => runWriteAction("deleteProductFn", args);
export const archiveProductFn = (args?: any) => runWriteAction("archiveProductFn", args);

export const createPartyFn = (args?: any) => runWriteAction("createPartyFn", args);
export const updatePartyFn = (args?: any) => runWriteAction("updatePartyFn", args);
export const deletePartyFn = (args?: any) => runWriteAction("deletePartyFn", args);
export const archivePartyFn = (args?: any) => runWriteAction("archivePartyFn", args);

export const createCustomerFn = (args?: any) => runWriteAction("createCustomerFn", args);
export const updateCustomerFn = (args?: any) => runWriteAction("updateCustomerFn", args);
export const deleteCustomerFn = (args?: any) => runWriteAction("deleteCustomerFn", args);
export const archiveCustomerFn = (args?: any) => runWriteAction("archiveCustomerFn", args);

export const createPartyReceivableFn = (args?: any) => runWriteAction("createPartyReceivableFn", args);
export const createPartyPayableFn = (args?: any) => runWriteAction("createPartyPayableFn", args);
export const deletePartyReceivableFn = (args?: any) => runWriteAction("deletePartyReceivableFn", args);
export const deletePartyPayableFn = (args?: any) => runWriteAction("deletePartyPayableFn", args);

export const createPayableSettlementFn = (args?: any) => runWriteAction("createPayableSettlementFn", args);
export const deletePayableSettlementFn = (args?: any) => runWriteAction("deletePayableSettlementFn", args);

export const createSaleFn = (args?: any) => runWriteAction("createSaleFn", args);
export const deleteSaleFn = (args?: any) => runWriteAction("deleteSaleFn", args);
export const editSaleFn = (args?: any) => runWriteAction("editSaleFn", args);
export const approveCourierPaymentFn = (args?: any) => runWriteAction("approveCourierPaymentFn", args);
export const cancelCourierOrderFn = (args?: any) => runWriteAction("cancelCourierOrderFn", args);

export const updateUserAvatarFn = (args?: any) => runWriteAction("updateUserAvatarFn", args);
export const createReturnFn = (args?: any) => runWriteAction("createReturnFn", args);
export const createDirectProductReturnFn = (args?: any) => runWriteAction("createDirectProductReturnFn", args);
export const createPartyReturnFn = (args?: any) => runWriteAction("createPartyReturnFn", args);
export const deleteReturnFn = (args?: any) => runWriteAction("deleteReturnFn", args);

export const createPurchaseFn = (args?: any) => runWriteAction("createPurchaseFn", args);
export const deletePurchaseFn = (args?: any) => runWriteAction("deletePurchaseFn", args);

export const createExpenseFn = (args?: any) => runWriteAction("createExpenseFn", args);
export const deleteExpenseFn = (args?: any) => runWriteAction("deleteExpenseFn", args);

export const createPaymentFn = (args?: any) => runWriteAction("createPaymentFn", args);
export const deletePaymentFn = (args?: any) => runWriteAction("deletePaymentFn", args);

export const createSomitiFn = (args?: any) => runWriteAction("createSomitiFn", args);
export const updateSomitiFn = (args?: any) => runWriteAction("updateSomitiFn", args);
export const deleteSomitiFn = (args?: any) => runWriteAction("deleteSomitiFn", args);
export const renameSomitiFn = (args?: any) => runWriteAction("renameSomitiFn", args);
export const deleteSomitiFnByName = (args?: any) => runWriteAction("deleteSomitiFnByName", args);

export const createWithdrawalFn = (args?: any) => runWriteAction("createWithdrawalFn", args);
export const createCashboxFn = (args?: any) => runWriteAction("createCashboxFn", args);
export const updateCashboxFn = (args?: any) => runWriteAction("updateCashboxFn", args);
export const deleteCashboxFn = (args?: any) => runWriteAction("deleteCashboxFn", args);
export const repairCashboxDbFn = (args?: any) => runWriteAction("repairCashboxDbFn", args);

export const createReminderFn = (args?: any) => runWriteAction("createReminderFn", args);
export const toggleReminderFn = (args?: any) => runWriteAction("toggleReminderFn", args);
export const deleteReminderFn = (args?: any) => runWriteAction("deleteReminderFn", args);

// ── Bank & Loans ─────────────────────────────────────────────────────────────
export const getBankAccountsFn = (args?: any) => executeFirestoreAction("getBankAccountsFn", args);
export const createBankAccountFn = (args?: any) => runWriteAction("createBankAccountFn", args);
export const updateBankAccountFn = (args?: any) => runWriteAction("updateBankAccountFn", args);
export const deleteBankAccountFn = (args?: any) => runWriteAction("deleteBankAccountFn", args);
export const createBankTransactionFn = (args?: any) => runWriteAction("createBankTransactionFn", args);
export const getBankLoansFn = (args?: any) => executeFirestoreAction("getBankLoansFn", args);
export const createBankLoanFn = (args?: any) => runWriteAction("createBankLoanFn", args);
export const payBankLoanInstallmentFn = (args?: any) => runWriteAction("payBankLoanInstallmentFn", args);
export const deleteBankLoanFn = (args?: any) => runWriteAction("deleteBankLoanFn", args);

// ─── Export Reset Operations ─────────────────────────────────────────────────
export const emptyCashboxFn = (args?: any) => executeFirestoreAction("emptyCashboxFn", args);
export const resetProductsFn = (args?: any) => executeFirestoreAction("resetProductsFn", args);
export const resetSalesFn = (args?: any) => executeFirestoreAction("resetSalesFn", args);
export const resetPurchasesFn = (args?: any) => executeFirestoreAction("resetPurchasesFn", args);
export const resetSomitiFn = (args?: any) => executeFirestoreAction("resetSomitiFn", args);
export const resetExpensesFn = (args?: any) => executeFirestoreAction("resetExpensesFn", args);
export const resetPartiesFn = (args?: any) => executeFirestoreAction("resetPartiesFn", args);
export const resetAllDataFn = (args?: any) => executeFirestoreAction("resetAllDataFn", args);

if (typeof window !== "undefined") {
  startBackgroundSync({
    createProductFn, updateProductFn, deleteProductFn, archiveProductFn,
    createPartyFn, updatePartyFn, deletePartyFn, archivePartyFn,
    createCustomerFn, updateCustomerFn, deleteCustomerFn, archiveCustomerFn,
    createPartyReceivableFn, createPartyPayableFn, deletePartyReceivableFn, deletePartyPayableFn,
    createPayableSettlementFn, deletePayableSettlementFn,
    createSaleFn, deleteSaleFn, editSaleFn,
    updateUserAvatarFn, createReturnFn, createDirectProductReturnFn, createPartyReturnFn, deleteReturnFn,
    createPurchaseFn, deletePurchaseFn,
    createExpenseFn, deleteExpenseFn,
    createPaymentFn, deletePaymentFn,
    createSomitiFn, updateSomitiFn, deleteSomitiFn, renameSomitiFn, deleteSomitiFnByName,
    createWithdrawalFn, createReminderFn, toggleReminderFn, deleteReminderFn
  });
}
