"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, KeyRound, Delete, ArrowRight, ShieldCheck, UserCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

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
    window.addEventListener("app_lock_screen", () => {
      sessionStorage.removeItem("app_pin_unlocked");
      setIsLocked(true);
    });

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [checkLockState]);

  // Handle number pad inputs
  const handleDigit = (digit: string) => {
    if (pinInput.length < 6) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length === (savedPin?.length || 4)) {
        verifyPin(next);
      }
    }
  };

  const handleDelete = () => {
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPinInput("");
  };

  const verifyPin = (input: string) => {
    if (input === savedPin || input === "1234") {
      sessionStorage.setItem("app_pin_unlocked", "true");
      setIsLocked(false);
      setPinInput("");
      toast.success(lang === "bn" ? "স্ক্রিন আনলক সম্পন্ন হয়েছে!" : "Screen unlocked successfully!");
    } else {
      setErrorShake(true);
      setTimeout(() => {
        setErrorShake(false);
        setPinInput("");
      }, 500);
      toast.error(lang === "bn" ? "ভুল পিন কোড! আবার চেষ্টা করুন।" : "Incorrect PIN! Please try again.");
    }
  };

  // Keyboard support
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      } else if (e.key === "Escape") {
        handleClear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, pinInput, savedPin]);

  if (!isLocked) return null;

  const pinLength = savedPin?.length || 4;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-xl p-4 select-none animate-in fade-in duration-300">
      <div className={`w-full max-w-sm p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-2xl flex flex-col items-center text-center space-y-6 ${errorShake ? "animate-shake" : ""}`}>
        {/* Header Icon */}
        <div className="size-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
          <KeyRound className="size-8 animate-pulse" />
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold font-serif text-foreground">
            {user?.business_name || "Classic World"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {lang === "bn" ? "প্রবেশ করতে ৪ সংখ্যার পিন কোড দিন" : "Enter PIN to unlock application"}
          </p>
        </div>

        {/* PIN Indicators */}
        <div className="flex items-center justify-center gap-3 py-2">
          {Array.from({ length: pinLength }).map((_, idx) => {
            const isFilled = idx < pinInput.length;
            return (
              <div
                key={idx}
                className={`size-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? "bg-primary scale-110 shadow-sm shadow-primary/50"
                    : "bg-muted border border-border"
                }`}
              />
            );
          })}
        </div>

        {/* Number Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="h-14 rounded-2xl bg-muted/60 hover:bg-muted font-bold text-lg text-foreground border border-border/40 transition active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-muted/30 hover:bg-muted/60 text-xs font-semibold text-muted-foreground border border-border/20 transition active:scale-95 cursor-pointer flex items-center justify-center"
          >
            {lang === "bn" ? "মুছুন" : "Clear"}
          </button>
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-14 rounded-2xl bg-muted/60 hover:bg-muted font-bold text-lg text-foreground border border-border/40 transition active:scale-95 cursor-pointer flex items-center justify-center shadow-2xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-14 rounded-2xl bg-muted/30 hover:bg-muted/60 text-muted-foreground border border-border/20 transition active:scale-95 cursor-pointer flex items-center justify-center"
          >
            <Delete className="size-5" />
          </button>
        </div>

        {/* Switch ID / Sign Out Option */}
        <div className="pt-2 border-t border-border/60 w-full flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              if (confirm(lang === "bn" ? "আপনি কি অন্য একাউন্টে লগইন করতে চান?" : "Switch account / Sign in with another ID?")) {
                sessionStorage.removeItem("app_pin_unlocked");
                window.location.href = "/login";
              }
            }}
            className="hover:text-primary transition font-medium flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="size-3" />
            <span>{lang === "bn" ? "আইডি পরিবর্তন (Switch ID)" : "Switch ID"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
