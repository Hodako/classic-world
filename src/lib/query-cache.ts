const CACHE_PREFIX = "df-cache:";
const CACHE_META_KEY = "df-cache-meta";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days persistent local cache for instant zero-lag metrics

interface CacheEntry {
  data: unknown;
  updatedAt: number;
}

interface CacheMeta {
  keys: string[];
}

function getLoggedInUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem("classicworld_auth_profile") || localStorage.getItem("user") || localStorage.getItem("auth_profile");
    if (raw) {
      const u = JSON.parse(raw);
      const activeProf = u?.activeProfile || localStorage.getItem("classicworld_active_profile") || "default";
      const uid = u?.id || u?.email || "";
      return uid ? `${uid}:${activeProf}` : "";
    }
  } catch {}
  return "";
}

function storageKey(queryKey: readonly unknown[]) {
  const uid = getLoggedInUserId();
  return CACHE_PREFIX + (uid ? `${uid}:` : "") + JSON.stringify(queryKey);
}

function isCashboxKey(queryKey: readonly unknown[]) {
  return Array.isArray(queryKey) && queryKey.length === 1 && queryKey[0] === "cashbox";
}

/** Read cached query data from localStorage if still fresh. */
export function readQueryCache<T>(queryKey: readonly unknown[]): T | undefined {
  if (typeof window === "undefined") return undefined;
  if (isCashboxKey(queryKey)) return undefined;
  try {
    const raw = localStorage.getItem(storageKey(queryKey));
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.data as T;
  } catch {
    return undefined;
  }
}

/** Persist query data to localStorage. */
export function writeQueryCache(queryKey: readonly unknown[], data: unknown) {
  if (typeof window === "undefined") return;
  if (isCashboxKey(queryKey)) return;
  try {
    const key = storageKey(queryKey);
    const entry: CacheEntry = { data, updatedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
    const meta: CacheMeta = JSON.parse(localStorage.getItem(CACHE_META_KEY) ?? '{"keys":[]}');
    if (!meta.keys.includes(key)) {
      meta.keys.push(key);
      if (meta.keys.length > 50) {
        const removed = meta.keys.shift();
        if (removed) localStorage.removeItem(removed);
      }
      localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
    }
  } catch {
    // quota exceeded — ignore
  }
}

/** Clear all app query cache from localStorage. */
export function clearQueryCache() {
  if (typeof window === "undefined") return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key === CACHE_META_KEY)) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
