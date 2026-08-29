"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Unlock, KeyRound, Delete, ArrowRight, ShieldCheck, UserCheck, Crown, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { playTapSound, playErrorSound, playSaleSuccessSound } from "@/lib/audio";
import { clearAuthProfile } from "@/lib/local-cache";

export function PinLockModal() {
  const { lang } = useT();
  const { user } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [errorShake, setErrorShake] = useState(false);
  const [ownerPin, setOwnerPin] = useState("1234");
  const [employeePin, setEmployeePin] = useState("0000");
  const [selectedMode, setSelectedMode] = useState<"owner" | "employee">("owner");

  // Check pin lock configuration
  const checkLockState = useCallback(() => {
    if (typeof window === "undefined") return;
    
    // In Classic World, PIN protection is active on startup by default unless explicitly turned off
    const enabled = localStorage.getItem("app_pin_code_enabled") !== "false";
    const oPin = localStorage.getItem("app_pin_code_val") || "1234";
    const ePin = localStorage.getItem("app_employee_pin_code_val") || "0000";
    setOwnerPin(oPin);
    setEmployeePin(ePin);

    if (enabled) {
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
          const enabled = localStorage.getItem("app_pin_code_enabled") !== "false";
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
      if (next.length === 4) {
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
    const oPin = localStorage.getItem("app_pin_code_val") || "1234";
    const ePin = localStorage.getItem("app_employee_pin_code_val") || "0000";

    // Check custom employee accounts if defined
    let matchedEmployee: any = null;
    try {
      const empsRaw = localStorage.getItem("cw_employee_accounts");
      if (empsRaw) {
        const emps = JSON.parse(empsRaw);
        if (Array.isArray(emps)) {
          matchedEmployee = emps.find((e: any) => String(e.pin).trim() === inputToVerify.trim());
        }
      }
    } catch (_) {}

    if (inputToVerify.trim() === oPin.trim()) {
      // Unlocked as Owner
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
      localStorage.removeItem("cw_active_employee_session");
      localStorage.setItem("cw_active_session_role", "owner");
      window.dispatchEvent(new Event("hz-employee-switched"));
      setIsLocked(false);
      setPinInput("");
      toast.success(lang === "bn" ? "স্বত্বাধিকারী (Owner) মোডে স্বাগতম!" : "Unlocked in Owner Mode!");
    } else if (inputToVerify.trim() === ePin.trim() || matchedEmployee) {
      // Unlocked as Employee
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
      const empSession = matchedEmployee || { id: "default-emp", name: "Staff / কর্মচারী", pin: ePin, permissions: { sales: true, products: true, customers: true } };
      localStorage.setItem("cw_active_employee_session", JSON.stringify(empSession));
      localStorage.setItem("cw_active_session_role", "employee");
      window.dispatchEvent(new Event("hz-employee-switched"));
      setIsLocked(false);
      setPinInput("");
      toast.success(
        lang === "bn"
          ? `কর্মচারী (${empSession.name}) মোডে স্বাগতম!`
          : `Unlocked in Employee (${empSession.name}) Mode!`
      );
    } else {
      playErrorSound();
      setErrorShake(true);
      setTimeout(() => {
        setErrorShake(false);
        setPinInput("");
      }, 500);
      toast.error(lang === "bn" ? "ভুল পিন কোড! মালিক বা কর্মচারী পিন দিন।" : "Incorrect PIN code! Enter Owner or Employee PIN.");
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
  }, [isLocked, pinInput]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-2xl p-4 select-none">
      <div className={`w-full max-w-sm flex flex-col items-center justify-center text-center space-y-5 ${errorShake ? "animate-shake" : "animate-in fade-in zoom-in-95 duration-200"}`}>
        {/* Lock Header */}
        <div className="space-y-1.5">
          <div className="mx-auto size-16 rounded-3xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-lg shadow-primary/10">
            <Lock className="size-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {lang === "bn" ? "ক্লাসিক ওয়ার্ল্ড সিকিউরিটি গেট" : "Classic World Security Gate"}
          </h2>
          <p className="text-xs text-muted-foreground max-w-xs">
            {lang === "bn"
              ? "প্রবেশ করতে মালিক পিন (১২৩৪) অথবা কর্মচারী পিন (০০০০) দিন"
              : "Enter Owner PIN (1234) or Employee PIN (0000) to unlock"}
          </p>
        </div>

        {/* PIN Dots Indicator */}
        <div className="flex items-center justify-center gap-3 py-1">
          {Array.from({ length: 4 }).map((_, i) => (
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
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[270px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-card border border-border/80 text-foreground font-bold text-xl hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all shadow-xs flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-2xl bg-muted/40 text-muted-foreground font-semibold text-xs hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {lang === "bn" ? "ক্লিয়ার" : "Clear"}
          </button>

          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-13 rounded-2xl bg-card border border-border/80 text-foreground font-bold text-xl hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all shadow-xs flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="h-13 rounded-2xl bg-muted/40 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="size-5" />
          </button>
        </div>

        {/* Hints / Info */}
        <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-[11px] text-muted-foreground flex items-center justify-between w-full max-w-[270px]">
          <span className="flex items-center gap-1 font-medium">
            <Crown className="size-3 text-indigo-500" />
            <span>Owner PIN: <b>••••</b></span>
          </span>
          <span className="flex items-center gap-1 font-medium">
            <User className="size-3 text-amber-500" />
            <span>Staff PIN: <b>••••</b></span>
          </span>
        </div>
      </div>
    </div>
  );
}
