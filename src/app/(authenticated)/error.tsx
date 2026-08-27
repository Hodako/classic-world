"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, Home, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    console.error("[AuthenticatedError]", error);
  }, [error]);

  const handleClearCacheAndReload = async () => {
    setClearing(true);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.clear();
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        window.location.href = "/dashboard";
      }
    } catch (_) {
      window.location.reload();
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-2xl text-center space-y-5">
        <div className="size-14 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto shadow-inner">
          <AlertCircle className="size-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            একটি অপ্রত্যাশিত সমস্যা দেখা দিয়েছে। দয়া করে ক্যাশ ক্লিয়ার করে আবার চেষ্টা করুন।
          </p>
          {error?.message && (
            <div className="p-2.5 rounded-xl bg-muted/50 border border-border/60 text-[11px] font-mono text-muted-foreground text-left break-words max-h-24 overflow-y-auto">
              {error.message}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5 pt-2">
          <Button
            onClick={() => reset()}
            className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            <span>পুনরায় চেষ্টা করুন (Try Again)</span>
          </Button>

          <Button
            variant="outline"
            onClick={handleClearCacheAndReload}
            disabled={clearing}
            className="w-full h-10 rounded-xl text-xs flex items-center justify-center gap-2 border border-border hover:bg-muted font-medium"
          >
            <Trash2 className="size-3.5 text-amber-500" />
            <span>{clearing ? "ক্যাশ ক্লিয়ার হচ্ছে..." : "ক্যাশ ক্লিয়ার করে রিলোড (Clear Cache & Reload)"}</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.href = "/dashboard";
              }
            }}
            className="w-full h-9 rounded-xl text-xs flex items-center justify-center gap-2 text-muted-foreground"
          >
            <Home className="size-3.5" />
            <span>ড্যাশবোর্ডে ফিরে যান (Back to Dashboard)</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
