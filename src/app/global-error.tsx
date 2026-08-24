"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    console.error("[GlobalError]", error);

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
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-slate-950 p-4 text-slate-100 font-sans">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-5">
          <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
            <AlertTriangle className="size-8 animate-pulse" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              অ্যাপ আপডেট হয়েছে / Update Available
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              সফটওয়্যারের নতুন ভার্সন লোড করতে অনুগ্রহ করে রিলোড বাটনে ক্লিক করুন।
              <br />
              (Please refresh to load the latest application version)
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={handleHardRefresh}
              disabled={busy}
              className="w-full h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer transition-all active:scale-[0.98] disabled:opacity-75"
            >
              <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
              <span>{busy ? "আপডেট হচ্ছে... (Updating...)" : "রিফ্রেশ ও আপডেট করুন (Reload App)"}</span>
            </button>

            <button
              onClick={handleGoHome}
              className="w-full h-10 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-colors"
            >
              <Home className="size-3.5 text-slate-400" />
              <span>ড্যাশবোর্ডে প্রবেশ করুন (Go to Dashboard)</span>
            </button>

            <button
              onClick={() => reset()}
              className="w-full h-8 rounded-xl bg-transparent hover:bg-slate-800/60 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              পুনরায় চেষ্টা করুন (Try Again)
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
