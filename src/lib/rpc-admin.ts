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

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ actionName, args, token }),
  });

  const txt = await res.text();
  if (!res.ok) {
    throw new Error(txt || `RPC Request failed with status ${res.status}`);
  }

  try {
    const result = JSON.parse(txt);
    if ((actionName === "superAdminLoginFn" || actionName === "loginFn") && result?.token) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("auth_token", result.token);
      }
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
export const getBusinessSettingsFn = makeAdminAction("getBusinessSettingsFn");
export const updateBusinessSettingsFn = makeAdminAction("updateBusinessSettingsFn");
export const createEmployeeLicenseFn = makeAdminAction("createEmployeeLicenseFn");
export const updateEmployeePermissionsFn = makeAdminAction("updateEmployeePermissionsFn");
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
