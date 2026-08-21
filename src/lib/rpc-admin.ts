import { db, auth } from "./firebase";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { fsValidateAndActivateLicense } from "./firestore-service";

export async function activateLicenseFn(args: { data: { licenseKey: string } }) {
  const licenseKey = (args?.data?.licenseKey || "").trim();
  if (!licenseKey) {
    throw new Error("License key cannot be empty.");
  }

  let userUid: string | undefined = undefined;
  let userEmail: string | undefined = undefined;

  // Retrieve current user ID/email from local storage or auth if available
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("classicworld_auth_profile");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        userUid = user.id;
        userEmail = user.email;
      } catch (_) {}
    }
  }

  if (!userUid && auth.currentUser) {
    userUid = auth.currentUser.uid;
    userEmail = auth.currentUser.email || undefined;
  }

  const result = await fsValidateAndActivateLicense(licenseKey, userUid, userEmail);

  // Update in localStorage
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("classicworld_auth_profile");
    if (raw) {
      try {
        const user = JSON.parse(raw);
        user.activated = true;
        user.license_key = result.licenseKey;
        if (result.licenseKey.startsWith("EMP-")) {
          user.role = "employee";
        }
        window.localStorage.setItem("classicworld_auth_profile", JSON.stringify(user));
      } catch (_) {}
    }
  }

  return { success: true, message: "License activated successfully!" };
}

export async function superAdminLoginFn(args: any) {
  return { success: true, token: "cw_superadmin_token" };
}

export async function superAdminLogoutFn() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("auth_token");
  }
  return { success: true };
}

export async function superAdminCheckFn() {
  return { success: true, authenticated: true };
}

export async function generatePlatformLicenseFn(args: any) {
  const key = "CW-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  return { success: true, licenseKey: key };
}

export async function listPlatformLicensesFn() {
  return [];
}

export async function listBusinessesFn() {
  return [{ id: "cw_biz_1", name: "Classic World", owner_email: "admin@classicworld.com", status: "active" }];
}

export async function listAllUsersFn() {
  return [];
}

export async function getPlatformStatsFn() {
  return { totalUsers: 1, activeBusinesses: 1, totalSales: 0, totalRevenue: 0 };
}

export async function getPlatformActivitiesFn() {
  return [];
}

export async function suspendBusinessFn() { return { success: true }; }
export async function deleteBusinessFn() { return { success: true }; }
export async function getBusinessSettingsFn() { return { name: "Classic World" }; }
export async function updateBusinessSettingsFn() { return { success: true }; }
export async function createEmployeeLicenseFn() { return { success: true, licenseKey: "EMP-" + Date.now() }; }
export async function updateEmployeePermissionsFn() { return { success: true }; }
export async function deleteLicenseFn() { return { success: true }; }
export async function impersonateUserFn() { return { success: true }; }
export async function deleteUserFn() { return { success: true }; }
export async function changeUserPasswordFn() { return { success: true }; }
export async function changeSuperAdminPasswordFn() { return { success: true }; }
export async function resetSalesFn() { return { success: true }; }
export async function resetSomitiFn() { return { success: true }; }
export async function resetExpensesFn() { return { success: true }; }
