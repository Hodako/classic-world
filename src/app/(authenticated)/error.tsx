"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    console.error("[AuthenticatedError]", error);

    // Auto-recovery for genuine chunk loading failures
    const msg = error?.message || String(error || "");
    if (
      msg.includes("ChunkLoadError") ||
      msg.includes("Loading chunk") ||
      msg.includes("dynamically imported module") ||
      msg.includes("Cannot find module")
    ) {
      if (typeof window !== "undefined") {
        const lastReload = sessionStorage.getItem("last_chunk_reload");
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 8000) {
          sessionStorage.setItem("last_chunk_reload", String(now));
          (async () => {
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.allSettled(regs.map((r) => r.unregister()));
              }
              if (typeof caches !== "undefined") {
                const keys = await caches.keys();
                await Promise.allSettled(keys.map((k) => caches.delete(k)));
              }
            } catch (_) {}
            window.location.reload();
          })();
        }
      }
    }
  }, [error]);

  const handleHardRefresh = async () => {
    setBusy(true);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("last_chunk_reload");
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.allSettled(regs.map((r) => r.unregister()));
        }
        if (typeof caches !== "undefined") {
          const keys = await caches.keys();
          await Promise.allSettled(keys.map((k) => caches.delete(k)));
        }
      }
    } catch (_) {}

    if (typeof window !== "undefined") {
      window.location.replace("/dashboard");
    }
  };

  const handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.replace("/dashboard");
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-2xl text-center space-y-5">
        <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
          <AlertTriangle className="size-8 animate-pulse" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            অ্যাপ আপডেট হয়েছে / Reload Required
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            একটি নতুন আপডেট পাওয়া গেছে। দয়া করে রিফ্রেশ বাটনে চাপ দিন।
            <br />
            (A new update is available. Please reload to continue.)
          </p>
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <Button
            onClick={handleHardRefresh}
            disabled={busy}
            className="w-full h-11 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 cursor-pointer disabled:opacity-75"
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            <span>{busy ? "আপডেট হচ্ছে... (Updating...)" : "রিফ্রেশ ও আপডেট করুন (Reload Page)"}</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleGoHome}
            className="w-full h-10 rounded-2xl text-xs flex items-center justify-center gap-2 border border-border"
          >
            <Home className="size-3.5 text-muted-foreground" />
            <span>ড্যাশবোর্ডে প্রবেশ করুন (Go to Dashboard)</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => reset()}
            className="w-full h-8 rounded-xl text-xs text-muted-foreground"
          >
            পুনরায় চেষ্টা করুন (Try Again)
          </Button>
        </div>
      </div>
    </div>
  );
}
