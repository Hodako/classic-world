"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useT } from "@/lib/i18n";

export function PwaAutoUpdater() {
  const { lang } = useT();
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    let refreshing = false;

    // Reload page when new service worker takes control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    // Helper to check for waiting worker or track new install
    function trackInstalling(registration: ServiceWorkerRegistration) {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setUpdateAvailable(true);
        // Automatically activate new service worker
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setUpdateAvailable(true);
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    }

    // Register Service Worker with cache bypass for sw.js
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        trackInstalling(registration);

        // Periodically check for updates every 10 minutes
        const intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 10 * 60 * 1000);

        // Check for updates when user returns to the tab
        const handleVisibilityChange = () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
          clearInterval(intervalId);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
      })
      .catch((err) => {
        console.warn("PWA Service Worker registration notice:", err);
      });
  }, []);

  const handleUpdateNow = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] sm:w-auto bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300 border border-white/20">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Sparkles className="size-4 text-amber-300 shrink-0 animate-pulse" />
        <span>
          {lang === "bn"
            ? "নতুন সংস্করণ আপডেট হচ্ছে..."
            : "New update available..."}
        </span>
      </div>
      <button
        onClick={handleUpdateNow}
        className="text-[11px] font-bold px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
      >
        <RefreshCw className="size-3" />
        <span>{lang === "bn" ? "রিলোড" : "Reload"}</span>
      </button>
    </div>
  );
}
