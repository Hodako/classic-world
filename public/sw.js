const CACHE_NAME = "classicworld-v3";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/classic-world.svg",
  "/logo.svg",
  "/background.avif",
];

// ── Install: Pre-cache core shell & images ───────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res && res.status === 200) {
              await cache.put(url, res);
            }
          } catch (_) {}
        })
      );
    })
  );
  self.skipWaiting();
});

// ── Activate: Clean up old caches ────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: Robust Cache-First with Guaranteed Valid Response ─────────
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip non-http, WebSockets, API calls, and Chrome extension URLs
  if (
    !url.protocol.startsWith("http") ||
    url.pathname.includes("/_next/webpack-hmr") ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com")
  ) {
    return;
  }

  const isStaticAsset = (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".avif") ||
    url.pathname.endsWith(".lottie") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".ttf") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("banglawebfonts.pages.dev")
  );

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);

        if (isStaticAsset && cached) {
          return cached;
        }

        try {
          const networkRes = await fetch(event.request);
          if (networkRes && networkRes.status === 200) {
            cache.put(event.request, networkRes.clone()).catch(() => {});
          }
          return networkRes;
        } catch (_) {
          if (cached) return cached;
          return new Response("Offline resource unavailable", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      } catch (_) {
        return fetch(event.request);
      }
    })()
  );
});
