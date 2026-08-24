"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AuthenticatedError]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
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
          <Button
            onClick={() => reset()}
            className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <RefreshCw className="size-3.5" />
            <span>পুনরায় চেষ্টা করুন (Try Again)</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.replace("/dashboard");
              }
            }}
            className="w-full h-10 rounded-xl text-xs flex items-center justify-center gap-2 border border-border"
          >
            <Home className="size-3.5 text-muted-foreground" />
            <span>ড্যাশবোর্ডে ফিরে যান (Back to Dashboard)</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
