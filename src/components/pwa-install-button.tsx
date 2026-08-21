"use client";

import { useState } from "react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useT } from "@/lib/i18n";
import { Download, CheckCircle, Share, PlusSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export function PWAInstallButton({ variant = "outline", className = "" }: { variant?: "default" | "outline" | "ghost"; className?: string }) {
  const { isInstallable, isInstalled, isIOS, installApp } = usePwaInstall();
  const { lang } = useT();
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isIOS) {
      setShowIosGuide(true);
      return;
    }

    if (isInstallable) {
      setInstalling(true);
      await installApp();
      setInstalling(false);
    } else {
      // Fallback guide if browser has not yet fired prompt
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        onClick={handleClick}
        disabled={installing}
        className={`gap-1.5 font-medium border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 ${className}`}
        title={lang === "bn" ? "অ্যাপ ইনস্টল করুন" : "Install App"}
      >
        <Download className="size-4 text-emerald-600 animate-bounce" />
        <span>{lang === "bn" ? "অ্যাপ ইনস্টল" : "Install App"}</span>
      </Button>

      {/* iOS or Manual Browser Installation Guide Dialog */}
      <Dialog open={showIosGuide} onOpenChange={setShowIosGuide}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Download className="size-5 text-primary" />
              {lang === "bn" ? "মোবাইলে অ্যাপ ইনস্টল করার নিয়ম" : "How to Install Web App"}
            </DialogTitle>
            <DialogDescription>
              {lang === "bn"
                ? "ব্রাউজার থেকে সরাসরি আপনার হোম স্ক্রিনে ইনস্টল করে পূর্ণ অ্যাপের মতো ব্যবহার করুন:"
                : "Add this app to your mobile home screen for a fast, full-screen native experience:"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            {isIOS ? (
              <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/40 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  <span>{lang === "bn" ? "Safari ব্রাউজারের নিচে শেয়ার (Share) বাটনে ট্যাপ করুন" : "Tap the Share button in Safari"}</span>
                  <Share className="size-4 text-sky-500" />
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  <span>{lang === "bn" ? "'Add to Home Screen' বা 'হোম স্ক্রিনে যোগ করুন' নির্বাচন করুন" : "Select 'Add to Home Screen'"}</span>
                  <PlusSquare className="size-4 text-emerald-500" />
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                  <span>{lang === "bn" ? "উপরে 'Add' বাটনে চাপলে অ্যাপটি ইনস্টল হয়ে যাবে" : "Tap 'Add' on top right"}</span>
                  <CheckCircle className="size-4 text-emerald-600" />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 rounded-lg border border-border/80 bg-muted/40 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  <span>{lang === "bn" ? "Chrome ব্রাউজারের থ্রি-ডট (⋮) মেন্যুতে ট্যাপ করুন" : "Tap the three dots (⋮) menu in Chrome"}</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  <span>{lang === "bn" ? "'Install app' বা 'হোম স্ক্রিনে যুক্ত করুন' চাপুন" : "Select 'Install app' or 'Add to Home screen'"}</span>
                  <Download className="size-4 text-emerald-500" />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
