"use client";

import { useEffect, useState } from "react";

// In-memory fast cache map
const MEMORY_ASSET_CACHE = new Map<string, string>();

/**
 * Simple string hash helper for localStorage key generation
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return `asset_cache_${Math.abs(hash).toString(36)}`;
}

/**
 * Sync lookup in memory or localStorage
 */
export function getCachedAssetSync(url: string | null): string | null {
  if (!url) return null;

  // 1. Check in-memory map
  if (MEMORY_ASSET_CACHE.has(url)) {
    return MEMORY_ASSET_CACHE.get(url)!;
  }

  // 2. Check localStorage
  if (typeof window !== "undefined") {
    try {
      const key = hashUrl(url);
      const cached = localStorage.getItem(key);
      if (cached) {
        MEMORY_ASSET_CACHE.set(url, cached);
        return cached;
      }
    } catch (_) {}
  }

  return url;
}

/**
 * Asynchronously fetch asset, convert to Base64 Data URL, and save in localStorage & CacheStorage
 */
export async function cacheAssetAsync(url: string | null): Promise<string | null> {
  if (!url || typeof window === "undefined") return url;

  // Data URLs or SVG strings are already local
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  const existing = getCachedAssetSync(url);
  if (existing && existing.startsWith("data:")) {
    return existing;
  }

  try {
    const res = await fetch(url, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return url;

    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (base64 && base64.startsWith("data:")) {
          MEMORY_ASSET_CACHE.set(url, base64);
          try {
            const key = hashUrl(url);
            localStorage.setItem(key, base64);
          } catch (e) {
            // Storage quota exceeded fallback
          }
          resolve(base64);
        } else {
          resolve(url);
        }
      };
      reader.onerror = () => resolve(url);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return url;
  }
}

/**
 * Preload multiple product images or static icons into local storage in the background
 */
export function preloadAssetsToLocalStorage(urls: (string | null)[]): void {
  if (typeof window === "undefined") return;

  const validUrls = urls.filter((u): u is string => typeof u === "string" && !u.startsWith("data:"));
  const uniqueUrls = Array.from(new Set(validUrls)).slice(0, 100);

  // Background non-blocking preloader
  setTimeout(() => {
    uniqueUrls.forEach((url) => {
      if (!getCachedAssetSync(url)?.startsWith("data:")) {
        cacheAssetAsync(url);
      }
    });
  }, 500);
}

/**
 * React hook to return instantaneous cached Base64 asset or load & cache on-the-fly
 */
export function useCachedAsset(url: string | null): string | null {
  const [src, setSrc] = useState<string | null>(() => getCachedAssetSync(url));

  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }

    const cached = getCachedAssetSync(url);
    if (cached) {
      setSrc(cached);
    }

    let isMounted = true;
    cacheAssetAsync(url).then((b64) => {
      if (isMounted && b64) {
        setSrc(b64);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [url]);

  return src || url;
}
