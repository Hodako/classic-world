"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, KeyRound, Delete, ArrowRight, ShieldCheck, UserCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { playTapSound, playErrorSound, playSaleSuccessSound } from "@/lib/audio";

export function PinLockModal() {
  const { lang } = useT();
  const { user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [errorShake, setErrorShake] = useState(false);
  const [savedPin, setSavedPin] = useState<string | null>(null);

  // Check pin lock configuration
  const checkLockState = useCallback(() => {
    if (typeof window === "undefined") return;
    const enabled = localStorage.getItem("app_pin_code_enabled") === "true";
    const pin = localStorage.getItem("app_pin_code_val");
    setSavedPin(pin);

    if (enabled && pin) {
      const unlocked = sessionStorage.getItem("app_pin_unlocked") === "true";
      setIsLocked(!unlocked);
    } else {
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    checkLockState();

    const handleStorageChange = () => checkLockState();
    window.addEventListener("storage", handleStorageChange);
    const handleLockEvent = () => {
      sessionStorage.removeItem("app_pin_unlocked");
      setIsLocked(true);
    };
    window.addEventListener("app_lock_screen", handleLockEvent);

    // Auto-lock on inactivity
    const timeoutMinStr = localStorage.getItem("app_pin_timeout") ?? "10";
    const timeoutMin = Number(timeoutMinStr);
    let idleTimer: NodeJS.Timeout | null = null;

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutMin > 0) {
        idleTimer = setTimeout(() => {
          const enabled = localStorage.getItem("app_pin_code_enabled") === "true";
          if (enabled) {
            sessionStorage.removeItem("app_pin_unlocked");
            setIsLocked(true);
          }
        }, timeoutMin * 60 * 1000);
      }
    };

    resetIdleTimer();
    window.addEventListener("mousemove", resetIdleTimer);
    window.addEventListener("keydown", resetIdleTimer);
    window.addEventListener("touchstart", resetIdleTimer);
    window.addEventListener("click", resetIdleTimer);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("app_lock_screen", handleLockEvent);
      window.removeEventListener("mousemove", resetIdleTimer);
      window.removeEventListener("keydown", resetIdleTimer);
      window.removeEventListener("touchstart", resetIdleTimer);
      window.removeEventListener("click", resetIdleTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [checkLockState]);

  // Handle number pad inputs
  const handleDigit = (digit: string) => {
    playTapSound();
    if (pinInput.length < 6) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === (savedPin?.length || 4)) {
        verifyPin(next);
      }
    }
  };

  const handleDelete = () => {
    playTapSound();
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    playTapSound();
    setPinInput("");
  };

  const verifyPin = (inputToVerify: string) => {
    const currentPin = savedPin || localStorage.getItem("app_pin_code_val") || "1234";
    if (inputToVerify === currentPin) {
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
      setIsLocked(false);
      setPinInput("");
      toast.success(lang === "bn" ? "পিন কোড সঠিক হয়েছে! স্বাগতম।" : "PIN code verified! Welcome.");
    } else {
      playErrorSound();
      setErrorShake(true);
      setTimeout(() => {
        setErrorShake(false);
        setPinInput("");
      }, 500);
      toast.error(lang === "bn" ? "ভুল পিন কোড! আবার চেষ্টা করুন।" : "Incorrect PIN code! Please try again.");
    }
  };

  // Listen to physical keyboard typing
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, pinInput, savedPin]);

  if (!isLocked) return null;

  const targetLength = savedPin?.length || 4;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-2xl p-4 select-none">
      <div className={`w-full max-w-sm flex flex-col items-center justify-center text-center space-y-6 ${errorShake ? "animate-shake" : "animate-in fade-in zoom-in-95 duration-200"}`}>
        {/* Lock Header */}
        <div className="space-y-2">
          <div className="mx-auto size-16 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Lock className="size-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {lang === "bn" ? "সাইট লক করা আছে (Classic World)" : "Screen Locked (Classic World)"}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xs">
            {lang === "bn" ? "চালিয়ে যেতে আপনার ৪ সংখ্যার সিকিউরিটি পিন দিন" : "Enter your 4-digit security PIN to access POS"}
          </p>
        </div>

        {/* PIN Dots Indicator */}
        <div className="flex items-center justify-center gap-3 py-2">
          {Array.from({ length: targetLength }).map((_, i) => (
            <div
              key={i}
              className={`size-4 rounded-full border-2 transition-all duration-200 ${
                i < pinInput.length
                  ? "bg-primary border-primary scale-110 shadow-sm shadow-primary/50"
                  : "border-muted-foreground/30 bg-muted/20"
              }`}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-card border border-border/80 text-foreground font-bold text-xl hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all shadow-xs flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-muted/40 text-muted-foreground font-semibold text-xs hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {lang === "bn" ? "ক্লিয়ার" : "Clear"}
          </button>

          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-14 rounded-2xl bg-card border border-border/80 text-foreground font-bold text-xl hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all shadow-xs flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-muted/40 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="size-5" />
          </button>
        </div>

        {/* Fast Account / ID Switcher Option */}
        <div className="pt-2 border-t border-border/60 w-full flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirm(lang === "bn" ? "আপনি কি অন্য একাউন্টে সুইচ করতে চান?" : "Switch to another profile or ID?")) {
                localStorage.removeItem("token");
                sessionStorage.clear();
                window.location.href = "/auth";
              }
            }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer py-1 px-3 rounded-lg hover:bg-muted/50 font-medium"
          >
            <UserCheck className="size-3.5" />
            {lang === "bn" ? "আইডি সুইচ করুন (Switch Profile / User)" : "Switch Profile / User ID"}
          </button>
        </div>
      </div>
    </div>
  );
}
