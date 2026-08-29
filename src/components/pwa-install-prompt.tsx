"use client";

import { useEffect, useState } from "react";
import { Download, X, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallPrompt() {
  const { lang, t } = useT();
  const [mounted, setMounted] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if already running in standalone mode (already installed)
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");
    
    setIsStandalone(isStandaloneMode);

    const dismissed = sessionStorage.getItem("pwa_install_dismissed");
    if (dismissed) {
      setIsDismissed(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for custom trigger from buttons in the app
    const handleTriggerInstall = async () => {
      if (deferredPrompt) {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setDeferredPrompt(null);
        }
      }
    };
    window.addEventListener("trigger-pwa-install", handleTriggerInstall);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("trigger-pwa-install", handleTriggerInstall);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem("pwa_install_dismissed", "true");
  };

  if (!mounted || isStandalone || isDismissed || !deferredPrompt) {
    return null;
  }

  return (
    <aside
      aria-label={lang === "bn" ? "অ্যাপ ইনস্টল ব্যানার" : "App Install Banner"}
      className="fixed bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 z-50 max-w-sm bg-card/95 backdrop-blur-md border border-primary/30 p-3.5 rounded-2xl shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Smartphone className="size-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>Classic World POS</span>
              <Sparkles className="size-3 text-amber-500" />
            </h4>
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {lang === "bn"
                ? "দ্রুত ব্যবহারের জন্য ডিভাইসে ইনস্টল করুন"
                : "Install app for faster offline-ready POS"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/50 cursor-pointer"
          aria-label={lang === "bn" ? "বন্ধ করুন" : "Dismiss"}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/50">
        <Button
          onClick={handleInstallClick}
          size="sm"
          className="h-8 text-xs font-bold w-full bg-primary text-primary-foreground gap-1.5 rounded-xl shadow-xs cursor-pointer"
        >
          <Download className="size-3.5" />
          <span>{lang === "bn" ? "ইনস্টল করুন (PWA)" : "Install App"}</span>
        </Button>
      </div>
    </aside>
  );
}
