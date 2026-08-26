"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/hooks/use-theme";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { SpeedLoader } from "@/components/speed-loader";
import { CustomThemeManager } from "@/components/custom-theme-manager";
import { AutoCameraTrigger } from "@/components/auto-camera-trigger";
import { CameraPermissionChecker } from "@/components/camera-permission-checker";
import { EmployeeInvitationModal } from "@/components/employee-invitation-modal";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Global Auto-Recovery for Stale Chunk / Service Worker Load Errors
    const handleGlobalError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const msg = (event as ErrorEvent).message || String((event as PromiseRejectionEvent).reason || "");
      if (
        msg.includes("ChunkLoadError") ||
        msg.includes("Loading chunk") ||
        msg.includes("dynamically imported module") ||
        msg.includes("Cannot find module")
      ) {
        console.warn("[AutoRecovery] Stale chunk detected. Clearing ServiceWorker caches...");
        const lastReload = sessionStorage.getItem("last_chunk_reload");
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 8000) {
          sessionStorage.setItem("last_chunk_reload", String(now));
          (async () => {
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.allSettled(regs.map((reg) => reg.unregister()));
              }
              if (typeof caches !== "undefined") {
                const keys = await caches.keys();
                await Promise.allSettled(keys.map((key) => caches.delete(key)));
              }
            } catch (_) {}
            window.location.reload();
          })();
        }
      }
    };

    window.addEventListener("error", handleGlobalError);
    window.addEventListener("unhandledrejection", handleGlobalError);

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => console.log("Service Worker registered with scope:", reg.scope))
        .catch((err) => console.error("Service Worker registration failed:", err));
    }

    let appBackButtonListener: any = null;
    const initBackButton = async () => {
      try {
        const { App } = await import("@capacitor/app");
        appBackButtonListener = await App.addListener("backButton", (info) => {
          const overlayBackdrop = document.querySelector('[role="dialog"], [data-state="open"], .fixed.inset-0');
          if (overlayBackdrop) {
            const escapeEvent = new KeyboardEvent("keydown", {
              key: "Escape",
              code: "Escape",
              keyCode: 27,
              which: 27,
              bubbles: true,
              cancelable: true
            });
            document.dispatchEvent(escapeEvent);
            return;
          }
          if (info.canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
      } catch (err) {
        console.warn("Capacitor App plugin not available or not running on native device.", err);
      }
    };
    initBackButton();

    return () => {
      if (appBackButtonListener) {
        appBackButtonListener.remove();
      }
    };
  }, []);

  useEffect(() => {
    const handleFocus = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target && target.tagName === "INPUT") {
        const name = (target.name || "").toLowerCase();
        const id = (target.id || "").toLowerCase();
        const type = (target.type || "").toLowerCase();
        const placeholder = (target.placeholder || "").toLowerCase();
        
        const isNumericField =
          type === "number" ||
          type === "tel" ||
          name.includes("phone") ||
          name.includes("mobile") ||
          name.includes("qty") ||
          name.includes("price") ||
          name.includes("amount") ||
          name.includes("cost") ||
          name.includes("due") ||
          name.includes("paid") ||
          name.includes("discount") ||
          id.includes("phone") ||
          id.includes("mobile") ||
          id.includes("qty") ||
          id.includes("price") ||
          id.includes("amount") ||
          id.includes("cost") ||
          id.includes("due") ||
          id.includes("paid") ||
          id.includes("discount") ||
          placeholder.includes("phone") ||
          placeholder.includes("01") ||
          placeholder.includes("qty") ||
          placeholder.includes("price") ||
          placeholder.includes("amount");

        if (isNumericField) {
          const isPhone = type === "tel" || name.includes("phone") || name.includes("mobile") || id.includes("phone") || id.includes("mobile");
          target.setAttribute("inputmode", isPhone ? "numeric" : "decimal");
          target.setAttribute("pattern", isPhone ? "[0-9]*" : "[0-9.]*");
        }
      }
    };
    document.addEventListener("focusin", handleFocus, true);
    document.addEventListener("touchstart", handleFocus, true);
    return () => {
      document.removeEventListener("focusin", handleFocus, true);
      document.removeEventListener("touchstart", handleFocus, true);
    };
  }, []);

  useEffect(() => {
    const handleGlobalError = () => {
      document.body.style.pointerEvents = "auto";
      document.body.style.overflow = "auto";
    };
    window.addEventListener("unhandledrejection", handleGlobalError);
    window.addEventListener("error", handleGlobalError);
    return () => {
      window.removeEventListener("unhandledrejection", handleGlobalError);
      window.removeEventListener("error", handleGlobalError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <CustomThemeManager />
            <EmployeeInvitationModal />
            {children}
            <Toaster richColors position="top-center" />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
