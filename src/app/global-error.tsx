"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-background p-4 text-foreground font-sans">
        <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-2xl text-center space-y-5">
          <div className="size-14 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="size-7" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
              Something went wrong
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              একটি অপ্রত্যাশিত সমস্যা দেখা দিয়েছে। দয়া করে আবার চেষ্টা করুন।
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  if ("caches" in window) {
                    caches.keys().then((names) => {
                      names.forEach((name) => caches.delete(name));
                    });
                  }
                  if ("serviceWorker" in navigator) {
                    navigator.serviceWorker.getRegistrations().then((regs) => {
                      regs.forEach((r) => r.unregister());
                    });
                  }
                  sessionStorage.clear();
                  window.location.replace("/dashboard");
                }
              }}
              className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <RefreshCw className="size-3.5" />
              <span>ক্যাশ ক্লিয়ার করে রিলোড (Clear Cache & Reload)</span>
            </button>

            <button
              onClick={() => reset()}
              className="w-full h-10 rounded-xl border border-border bg-muted/30 hover:bg-muted text-xs text-foreground font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="size-3.5" />
              <span>পুনরায় চেষ্টা করুন (Try Again)</span>
            </button>

            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.replace("/dashboard");
                }
              }}
              className="w-full h-10 rounded-xl border border-border/60 hover:bg-muted/50 text-xs text-muted-foreground font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Home className="size-3.5 text-muted-foreground" />
              <span>ড্যাশবোর্ড (Dashboard)</span>
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
