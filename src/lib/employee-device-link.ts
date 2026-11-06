import { db, auth } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import type { AuthUser } from "@/hooks/use-auth";
import { clearAuthProfile, readAuthProfile, writeAuthProfile } from "@/lib/local-cache";
import { clearQueryCache } from "@/lib/query-cache";

export interface EmployeeDevice {
  id: string;
  employeeId: string;
  name: string;
  linkedAt: number;
}

export const DEVICE_LINK_KEY = "cw_employee_device_link_id";
const CACHE_KEY = "cw_employee_device_codes_cache";

function getLocalCache(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setLocalCache(cache: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function issueEmployeeDeviceCode(employeeId: string) {
  // Ensure the caller is an owner or admin
  const profile = readAuthProfile();
  let localUser: any = null;
  if (typeof window !== "undefined") {
    try {
      const uRaw = localStorage.getItem("user");
      if (uRaw) localUser = JSON.parse(uRaw);
    } catch {}
  }
  const currentRole = profile?.role || localUser?.role || (auth.currentUser ? "owner" : "owner");
  if (currentRole === "employee") {
    throw new Error("Employees cannot generate pairing codes. Ask the shop owner.");
  }

  // 1. Fetch employee details from Firestore or local storage
  let empData: any = null;
  try {
    const empSnap = await getDoc(doc(db, "employees", employeeId));
    if (empSnap.exists()) {
      empData = empSnap.data();
    }
  } catch (err) {
    console.warn("Could not fetch employee doc from Firestore:", err);
  }

  if (!empData && typeof window !== "undefined") {
    try {
      const localEmpsRaw = localStorage.getItem("cw_employee_accounts");
      if (localEmpsRaw) {
        const localEmps = JSON.parse(localEmpsRaw);
        if (Array.isArray(localEmps)) {
          empData = localEmps.find((e: any) => e.id === employeeId);
        }
      }
    } catch {}
  }

  const empName = empData?.name || "Employee";
  const empPin = String(empData?.pin || empData?.plain_password || empData?.password || "1234").trim();

  // 2. Generate clean 12-char formatted device pairing code (e.g., CW84-9123-5740)
  const part1 = "CW" + Math.floor(10 + Math.random() * 90);
  const part2 = Math.floor(1000 + Math.random() * 9000).toString();
  const part3 = Math.floor(1000 + Math.random() * 9000).toString();
  const formattedCode = `${part1}-${part2}-${part3}`;
  const cleanCode = formattedCode.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours validity

  const record = {
    code: formattedCode,
    cleanCode,
    employeeId,
    employeeName: empName,
    pin: empPin,
    designation: empData?.designation || "Sales Staff",
    permissions: empData?.permissions || null,
    createdAt: Date.now(),
    expiresAt,
    used: false,
    usedAt: null,
    deviceId: null,
    deviceName: null,
  };

  // 3. Save to Firestore `employee_device_codes` collection
  try {
    await setDoc(doc(db, "employee_device_codes", cleanCode), record);
  } catch (err) {
    console.warn("Could not save to Firestore employee_device_codes:", err);
  }

  // 4. Also backup in local storage
  const cache = getLocalCache();
  cache[cleanCode] = record;
  setLocalCache(cache);

  return {
    code: formattedCode,
    expiresAt,
    employeeName: empName,
    pin: empPin,
  };
}

export async function redeemEmployeeDeviceCode(code: string, deviceName: string) {
  const cleanCode = (code || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!cleanCode || cleanCode.length < 4) {
    throw new Error("দয়া করে সঠিক ডিভাইস কোড প্রদান করুন (Please enter a valid device code)");
  }

  let record: any = null;

  // 1. Check Firestore
  try {
    const snap = await getDoc(doc(db, "employee_device_codes", cleanCode));
    if (snap.exists()) {
      record = snap.data();
    }
  } catch (err) {
    console.warn("Firestore lookup failed for device code:", err);
  }

  // 2. Fallback to local cache
  if (!record) {
    const cache = getLocalCache();
    record = cache[cleanCode];
  }

  // 3. Check if not found
  if (!record) {
    throw new Error(
      "ডিভাইস কোডটি সঠিক নয় অথবা পাওয়া যায়নি (Invalid device code. Not found in shop records.)"
    );
  }

  if (record.used) {
    throw new Error(
      "এই ডিভাইস কোডটি ইতিমধ্যে ব্যবহার করা হয়েছে (This code has already been redeemed.)"
    );
  }

  if (record.expiresAt && Date.now() > record.expiresAt) {
    throw new Error(
      "এই কোডটির মেয়াদ শেষ হয়ে গেছে। দোকান মালিককে নতুন কোড দিতে বলুন (This code has expired.)"
    );
  }

  // 4. Retrieve fresh employee document
  let empData: any = null;
  try {
    const empSnap = await getDoc(doc(db, "employees", record.employeeId));
    if (empSnap.exists()) {
      empData = empSnap.data();
    }
  } catch {}

  const deviceId = "dev_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  // 5. Mark as used in Firestore & local cache
  try {
    await updateDoc(doc(db, "employee_device_codes", cleanCode), {
      used: true,
      usedAt: Date.now(),
      deviceId,
      deviceName: deviceName || "Staff Terminal",
    });
  } catch {}

  const cache = getLocalCache();
  if (cache[cleanCode]) {
    cache[cleanCode].used = true;
    cache[cleanCode].usedAt = Date.now();
    cache[cleanCode].deviceId = deviceId;
    cache[cleanCode].deviceName = deviceName || "Staff Terminal";
    setLocalCache(cache);
  }

  // 6. Assemble AuthUser
  const user: AuthUser = {
    id: record.employeeId,
    email: empData?.email || `${record.employeeId}@classicworld.app`,
    full_name: empData?.name || record.employeeName || "Employee",
    activated: true,
    role: "employee",
    business_id: "classic-world-default",
    business_name: "Classic World",
    logo_url: "/logo.png",
    permissions: empData?.permissions || record.permissions || {
      can_sales: true,
      can_customers: true,
      can_returns: true,
      can_products: false,
      can_expenses: false,
      can_reports: false,
      can_delete: false,
      can_discount: false,
    },
  };

  // 7. Store authenticated employee session
  clearAuthProfile();
  clearQueryCache();
  if (typeof window !== "undefined") {
    localStorage.setItem(DEVICE_LINK_KEY, deviceId);
    localStorage.setItem("cw_active_employee_session", JSON.stringify(user));
    localStorage.setItem("cw_active_session_role", "employee");
    localStorage.setItem("app_pin_unlocked", "true");
    localStorage.setItem("auth_token", `token_emp_${user.id}`);
    localStorage.setItem("user", JSON.stringify(user));
    sessionStorage.setItem("app_pin_unlocked", "true");
  }
  writeAuthProfile(user);

  return { user, token: `token_emp_${user.id}` };
}

export async function getLinkedEmployeeSession(): Promise<{ user: AuthUser }> {
  if (typeof window === "undefined") {
    throw new Error("Window unavailable");
  }
  const activeEmpRaw = localStorage.getItem("cw_active_employee_session");
  if (activeEmpRaw) {
    try {
      const u = JSON.parse(activeEmpRaw);
      if (u && u.id) return { user: u };
    } catch {}
  }

  const profile = readAuthProfile();
  if (profile && profile.role === "employee") {
    return { user: profile as any };
  }

  return expireLinkedSession();
}

function expireLinkedSession(): never {
  clearAuthProfile();
  if (typeof window !== "undefined") {
    localStorage.removeItem("cw_active_employee_session");
    localStorage.removeItem("cw_active_session_role");
    localStorage.removeItem(DEVICE_LINK_KEY);
  }
  void auth.signOut();
  throw new Error("Unauthorized: This employee device is unlinked. Ask your owner for a new code.");
}

export async function listEmployeeDevices(): Promise<{ devices: EmployeeDevice[] }> {
  const devices: EmployeeDevice[] = [];
  try {
    const q = query(collection(db, "employee_device_codes"), where("used", "==", true));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const data = d.data();
      devices.push({
        id: d.id,
        employeeId: data.employeeId,
        name: data.deviceName || `${data.employeeName} Device`,
        linkedAt: data.usedAt || data.createdAt || Date.now(),
      });
    });
  } catch (err) {
    console.warn("Could not list employee devices from Firestore:", err);
  }

  // Merge with local cache
  const cache = getLocalCache();
  Object.entries(cache).forEach(([id, data]: [string, any]) => {
    if (data.used && !devices.some((d) => d.id === id)) {
      devices.push({
        id,
        employeeId: data.employeeId,
        name: data.deviceName || `${data.employeeName} Device`,
        linkedAt: data.usedAt || data.createdAt || Date.now(),
      });
    }
  });

  return { devices };
}

export async function revokeEmployeeDevice(deviceIdOrCode: string) {
  try {
    await deleteDoc(doc(db, "employee_device_codes", deviceIdOrCode));
  } catch {}

  const cache = getLocalCache();
  delete cache[deviceIdOrCode];
  setLocalCache(cache);

  return { success: true };
}
