/** Lightweight localStorage cache for instant UI hydration. */

const AUTH_KEY = "classicworld_auth_profile";
const LEGACY_AUTH_KEY = "cw-auth-profile";
const BRAND_KEY = "cw-brand";

export interface AuthProfileCache {
  id: string;
  email: string;
  full_name: string;
  activated: boolean;
  role: string;
  business_id: string | null;
  business_name: string;
  logo_url: string;
  avatar_url?: string;
  license_key?: string | null;
  updatedAt: number;
}

export interface BrandCache {
  name: string;
  logo_url: string;
  updatedAt: number;
}

function read<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T & { updatedAt?: number };
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function write<T extends object>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, updatedAt: Date.now() }));
  } catch {
    // quota — ignore
  }
}

const PROFILE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const BRAND_TTL = 30 * 24 * 60 * 60 * 1000;

export function readAuthProfile(): AuthProfileCache | null {
  return read<AuthProfileCache>(AUTH_KEY, PROFILE_TTL) || read<AuthProfileCache>(LEGACY_AUTH_KEY, PROFILE_TTL);
}

export function writeAuthProfile(profile: Omit<AuthProfileCache, "updatedAt">) {
  write(AUTH_KEY, profile);
  write(LEGACY_AUTH_KEY, profile);
}

export function clearAuthProfile() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem("user");
    localStorage.removeItem("auth_profile");
    localStorage.removeItem("classicworld_auth_profile");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("active_profile");
    localStorage.removeItem("app_pin_unlocked");
    sessionStorage.clear();
    try {
      const { clearQueryCache } = require("./query-cache");
      clearQueryCache();
    } catch (_) {}
  }
}

export function readBrand(): BrandCache | null {
  return read<BrandCache>(BRAND_KEY, BRAND_TTL);
}

export function writeBrand(brand: { name: string; logo_url: string }) {
  write(BRAND_KEY, brand);
}

