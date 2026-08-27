// Point to hosted endpoint for Classic-World static SPA & Capacitor apps
const API_BASE = (process.env.NEXT_PUBLIC_APP_URL || "https://hakim.qzz.io").replace(/\/$/, "");

async function callRemoteRpc(actionName: string, args: any) {
  const url = `${API_BASE}/api/rpc`;
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
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
    const res = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ actionName, args, token }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
      if (actionName === "superAdminLogoutFn" || actionName === "logoutFn") {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("auth_token");
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

const makeAdminAction = (name: string) => (args?: any) => callRemoteRpc(name, args);

// Expose admin actions
export const superAdminLoginFn = makeAdminAction("superAdminLoginFn");
export const superAdminLogoutFn = makeAdminAction("superAdminLogoutFn");
export const superAdminCheckFn = makeAdminAction("superAdminCheckFn");
export const generatePlatformLicenseFn = makeAdminAction("generatePlatformLicenseFn");
export const listPlatformLicensesFn = makeAdminAction("listPlatformLicensesFn");
export const listBusinessesFn = makeAdminAction("listBusinessesFn");
export const listAllUsersFn = makeAdminAction("listAllUsersFn");
export const getPlatformStatsFn = makeAdminAction("getPlatformStatsFn");
export const getPlatformActivitiesFn = makeAdminAction("getPlatformActivitiesFn");
export const suspendBusinessFn = makeAdminAction("suspendBusinessFn");
export const deleteBusinessFn = makeAdminAction("deleteBusinessFn");
export const activateLicenseFn = makeAdminAction("activateLicenseFn");
import { fsGetBusinessSettings, fsUpdateBusinessSettings, fsRemoveEmployee, fsUpdateEmployeePermissions } from "./firestore-service";

export const getBusinessSettingsFn = async () => {
  try {
    return await fsGetBusinessSettings();
  } catch (_) {
    try {
      return await callRemoteRpc("getBusinessSettingsFn", undefined);
    } catch (_) {
      return {
        business: {
          id: "classic-world-default",
          name: "Classic World",
          logo_url: "/logo.png",
          address: "Dhaka, Bangladesh",
          phone_numbers: "01700000000",
          emails: "info@classicworld.com",
          invoice_font_size: "22px",
          invoice_scale: "100%",
          invoice_line_spacing: "6px",
          invoice_terms: "",
          status: "active",
          sms_credits: 100,
        },
        role: "owner",
        permissions: {
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
  }
};

export const updateBusinessSettingsFn = async (args: any) => {
  try {
    return await fsUpdateBusinessSettings(args?.data || args);
  } catch (_) {
    return await callRemoteRpc("updateBusinessSettingsFn", args);
  }
};

export const updateEmployeePermissionsFn = async (args: any) => {
  try {
    return await fsUpdateEmployeePermissions(args?.data || args);
  } catch (_) {
    return await callRemoteRpc("updateEmployeePermissionsFn", args);
  }
};

export const removeEmployeeFn = async (args: any) => {
  try {
    return await fsRemoveEmployee(args?.data?.employeeId || args?.employeeId);
  } catch (_) {
    return await callRemoteRpc("removeEmployeeFn", args);
  }
};
export const deleteLicenseFn = makeAdminAction("deleteLicenseFn");
export const impersonateUserFn = makeAdminAction("impersonateUserFn");
export const deleteUserFn = makeAdminAction("deleteUserFn");
export const changeUserPasswordFn = makeAdminAction("changeUserPasswordFn");
export const changeSuperAdminPasswordFn = makeAdminAction("changeSuperAdminPasswordFn");
export const resetSalesFn = makeAdminAction("resetSalesFn");
export const resetSomitiFn = makeAdminAction("resetSomitiFn");
export const resetExpensesFn = makeAdminAction("resetExpensesFn");
export const refillBusinessSmsFn = makeAdminAction("refillBusinessSmsFn");
export const freezeBusinessFn = makeAdminAction("freezeBusinessFn");
export const setBusinessLimitsFn = makeAdminAction("setBusinessLimitsFn");
export const createAdminPopupFn = makeAdminAction("createAdminPopupFn");
export const listAdminPopupsFn = makeAdminAction("listAdminPopupsFn");
export const deleteAdminPopupFn = makeAdminAction("deleteAdminPopupFn");
export const getMasterSmsSettingsFn = makeAdminAction("getMasterSmsSettingsFn");
export const updateMasterSmsSettingsFn = makeAdminAction("updateMasterSmsSettingsFn");
export const directSendSmsAsAdminFn = makeAdminAction("directSendSmsAsAdminFn");
