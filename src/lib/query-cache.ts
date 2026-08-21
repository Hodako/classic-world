const CACHE_PREFIX = "df-cache:";
const CACHE_META_KEY = "df-cache-meta";
const MAX_AGE_MS = 60 * 60 * 1000;

interface CacheEntry {
  data: unknown;
  updatedAt: number;
}

interface CacheMeta {
  keys: string[];
}

function storageKey(queryKey: readonly unknown[]) {
  return CACHE_PREFIX + JSON.stringify(queryKey);
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
    if (Date.now() - entry.updatedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(queryKey));
      return undefined;
    }
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
      if (meta.keys.length > 40) {
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
    const meta: CacheMeta = JSON.parse(localStorage.getItem(CACHE_META_KEY) ?? '{"keys":[]}');
    meta.keys.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(CACHE_META_KEY);
  } catch {
    // ignore
  }
}
