"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Lock, Unlock, KeyRound, Delete, ArrowRight, ShieldAlert, Crown, User, AlertCircle, Clock } from "lucide-react";
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
  const [selectedMode, setSelectedMode] = useState<"owner" | "employee">("owner");

  // Lockout State (60 seconds after 4 wrong attempts)
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockCooldown, setLockCooldown] = useState(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check pin lock configuration
  const checkLockState = useCallback(() => {
    if (typeof window === "undefined") return;

    // Only show PIN lock if the owner has explicitly set and enabled a PIN
    const storedPin = (localStorage.getItem("app_pin_code_val") || "").trim();
    const isExplicitlyEnabled = localStorage.getItem("app_pin_code_enabled") === "true";
    const enabled = isExplicitlyEnabled && storedPin.length >= 4;

    if (enabled) {
      const unlocked = sessionStorage.getItem("app_pin_unlocked") === "true";
      setIsLocked(!unlocked);
    } else {
      setIsLocked(false);
    }
  }, []);

  // Initialize lockout state from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const lockUntilStr = localStorage.getItem("cw_pin_lock_until");
    if (lockUntilStr) {
      const lockUntil = Number(lockUntilStr);
      const remainingSec = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      if (remainingSec > 0) {
        setLockCooldown(remainingSec);
      } else {
        localStorage.removeItem("cw_pin_lock_until");
        localStorage.setItem("cw_pin_failed_attempts", "0");
      }
    }
    const savedAttempts = Number(localStorage.getItem("cw_pin_failed_attempts") || "0");
    setFailedAttempts(savedAttempts);
  }, []);

  // Cooldown countdown interval
  useEffect(() => {
    if (lockCooldown <= 0) {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      return;
    }

    cooldownTimerRef.current = setInterval(() => {
      const lockUntilStr = localStorage.getItem("cw_pin_lock_until");
      if (!lockUntilStr) {
        setLockCooldown(0);
        return;
      }
      const rem = Math.max(0, Math.ceil((Number(lockUntilStr) - Date.now()) / 1000));
      setLockCooldown(rem);
      if (rem <= 0) {
        localStorage.removeItem("cw_pin_lock_until");
        localStorage.setItem("cw_pin_failed_attempts", "0");
        setFailedAttempts(0);
      }
    }, 1000);

    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, [lockCooldown]);

  useEffect(() => {
    checkLockState();

    const handleStorageChange = () => checkLockState();
    window.addEventListener("storage", handleStorageChange);
    const handleLockEvent = () => {
      const storedPin = (localStorage.getItem("app_pin_code_val") || "").trim();
      const isExplicitlyEnabled = localStorage.getItem("app_pin_code_enabled") === "true";
      if (!isExplicitlyEnabled || storedPin.length < 4) {
        toast.info(lang === "bn" ? "প্রথমে সেটিংস বা মেনু থেকে পিন কোড সেট করুন।" : "Please set a PIN code in settings or menu first.");
        return;
      }
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
          const storedPin = (localStorage.getItem("app_pin_code_val") || "").trim();
          const isExplicitlyEnabled = localStorage.getItem("app_pin_code_enabled") === "true";
          const enabled = isExplicitlyEnabled && storedPin.length >= 4;
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

  // Pre-load employee accounts into local cache if not yet cached
  useEffect(() => {
    if (typeof window === "undefined") return;
    const empsRaw = localStorage.getItem("cw_employee_accounts");
    if (!empsRaw) {
      import("@/lib/firestore-service").then(({ fsGetEmployees }) => {
        fsGetEmployees().catch(() => {});
      }).catch(() => {});
    }
  }, []);

  const handleFailedAttempt = () => {
    playErrorSound();
    setErrorShake(true);
    setTimeout(() => {
      setErrorShake(false);
      setPinInput("");
    }, 500);

    const newCount = failedAttempts + 1;
    setFailedAttempts(newCount);
    localStorage.setItem("cw_pin_failed_attempts", String(newCount));

    if (newCount >= 4) {
      const lockUntil = Date.now() + 60 * 1000;
      localStorage.setItem("cw_pin_lock_until", String(lockUntil));
      setLockCooldown(60);
      toast.error(
        lang === "bn"
          ? "৪ বার ভুল পিন দেওয়া হয়েছে! নিরাপত্তা স্বার্থে ৬০ সেকেন্ডের জন্য স্ক্রিন লক করা হলো।"
          : "4 incorrect attempts! Screen locked for 60 seconds for security."
      );
    } else {
      const rem = 4 - newCount;
      toast.error(
        lang === "bn"
          ? `ভুল পিন কোড! আর ${rem} বার চেষ্টা করতে পারবেন।`
          : `Incorrect PIN! ${rem} attempt${rem > 1 ? "s" : ""} remaining before lockout.`
      );
    }
  };

  const handleSuccessfulUnlock = (role: "owner" | "employee", empData?: any) => {
    playSaleSuccessSound();
    sessionStorage.setItem("app_pin_unlocked", "true");

    // Reset failed attempts & lockout
    localStorage.removeItem("cw_pin_lock_until");
    localStorage.setItem("cw_pin_failed_attempts", "0");
    setFailedAttempts(0);
    setLockCooldown(0);

    if (role === "employee" && empData) {
      // Backup owner session if currently in owner mode
      try {
        const curUserRaw = localStorage.getItem("classicworld_auth_profile") || localStorage.getItem("user");
        const curToken = localStorage.getItem("auth_token");
        if (curUserRaw) {
          const parsed = JSON.parse(curUserRaw);
          if (parsed?.role === "owner") {
            localStorage.setItem("cw_owner_backup_profile", curUserRaw);
          }
        }
        if (curToken && !curToken.startsWith("token_emp_")) {
          localStorage.setItem("cw_owner_backup_token", curToken);
        }
      } catch (_) {}

      localStorage.setItem("cw_active_employee_session", JSON.stringify(empData));
      localStorage.setItem("cw_active_session_role", "employee");
      localStorage.setItem("user", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("classicworld_auth_profile", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("cw-auth-profile", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("auth_token", `token_emp_${empData.id}`);
      window.dispatchEvent(new Event("hz-employee-switched"));
      window.dispatchEvent(new Event("storage"));
      setIsLocked(false);
      setPinInput("");
      toast.success(
        lang === "bn"
          ? `কর্মচারী পিন সঠিক হয়েছে! স্বাগতম (${empData.name || empData.full_name || "Staff"})`
          : `Staff PIN verified! Welcome ${empData.name || empData.full_name || "Staff"}`
      );
    } else {
      localStorage.removeItem("cw_active_employee_session");
      localStorage.setItem("cw_active_session_role", "owner");
      try {
        const backupProfile = localStorage.getItem("cw_owner_backup_profile");
        const backupToken = localStorage.getItem("cw_owner_backup_token");
        if (backupProfile) {
          localStorage.setItem("user", backupProfile);
          localStorage.setItem("classicworld_auth_profile", backupProfile);
          localStorage.setItem("cw-auth-profile", backupProfile);
        } else {
          const curUserRaw = localStorage.getItem("classicworld_auth_profile") || localStorage.getItem("user");
          if (curUserRaw) {
            const parsed = JSON.parse(curUserRaw);
            if (parsed?.role === "employee") {
              const ownerRestored = { ...parsed, role: "owner", permissions: undefined };
              localStorage.setItem("user", JSON.stringify(ownerRestored));
              localStorage.setItem("classicworld_auth_profile", JSON.stringify(ownerRestored));
              localStorage.setItem("cw-auth-profile", JSON.stringify(ownerRestored));
            }
          }
        }
        if (backupToken) {
          localStorage.setItem("auth_token", backupToken);
        } else if (localStorage.getItem("auth_token")?.startsWith("token_emp_")) {
          localStorage.setItem("auth_token", "token_owner");
        }
      } catch (_) {}
      window.dispatchEvent(new Event("hz-employee-switched"));
      window.dispatchEvent(new Event("storage"));
      setIsLocked(false);
      setPinInput("");
      toast.success(lang === "bn" ? "মালিক পিন সঠিক হয়েছে! স্বাগতম।" : "Owner PIN verified! Welcome.");
    }
  };

  const verifyPin = async (inputToVerify: string) => {
    if (lockCooldown > 0) return;
    const cleanInput = inputToVerify.trim();
    if (!cleanInput) return;

    const oPin = (localStorage.getItem("app_pin_code_val") || "1234").trim();

    // Query registered employee accounts (from cache or Firestore)
    let matchedEmp: any = null;
    try {
      const empsRaw = localStorage.getItem("cw_employee_accounts");
      if (empsRaw) {
        const emps = JSON.parse(empsRaw);
        if (Array.isArray(emps)) {
          matchedEmp = emps.find(
            (e: any) =>
              String(e.pin || e.plain_password || e.password || "").trim() === cleanInput
          );
        }
      }
    } catch (_) {}

    // Fallback query to Firestore employees if not in local cache
    if (!matchedEmp) {
      try {
        const { fsGetEmployees } = await import("@/lib/firestore-service");
        const emps = await fsGetEmployees();
        if (Array.isArray(emps)) {
          matchedEmp = emps.find(
            (e: any) =>
              String(e.pin || e.plain_password || e.password || "").trim() === cleanInput
          );
        }
      } catch (_) {}
    }

    if (selectedMode === "employee") {
      // STRICT: Default PINs (1234, 0000, etc.) DO NOT WORK for employee mode!
      // An employee account must be explicitly added by the owner with their designated PIN.
      if (matchedEmp) {
        handleSuccessfulUnlock("employee", matchedEmp);
      } else {
        handleFailedAttempt();
      }
    } else {
      // Owner Mode:
      if (cleanInput === oPin) {
        handleSuccessfulUnlock("owner");
      } else {
        handleFailedAttempt();
      }
    }
  };

  // Check if input matches immediately (for seamless unlocking)
  const checkAutoTrigger = (nextVal: string) => {
    const oPin = (localStorage.getItem("app_pin_code_val") || "1234").trim();

    if (selectedMode === "owner") {
      if (nextVal === oPin) {
        verifyPin(nextVal);
        return;
      }
      if (nextVal.length === oPin.length) {
        verifyPin(nextVal);
        return;
      }
    } else {
      // Check if matches an employee
      let emps: any[] = [];
      try {
        emps = JSON.parse(localStorage.getItem("cw_employee_accounts") || "[]");
      } catch (_) {}

      const found = emps.find(
        (e: any) => String(e.pin || e.plain_password || e.password || "").trim() === nextVal
      );
      if (found) {
        verifyPin(nextVal);
        return;
      }

      // If at 4 digits and no employee has longer PIN, or if reaches 6 digits
      const hasLongerPin = emps.some(
        (e: any) => String(e.pin || e.plain_password || e.password || "").trim().length > 4
      );
      if (nextVal.length === 4 && !hasLongerPin) {
        verifyPin(nextVal);
        return;
      }
      if (nextVal.length === 9) {
        verifyPin(nextVal);
        return;
      }
    }
  };

  // Handle number pad inputs
  const handleDigit = (digit: string) => {
    if (lockCooldown > 0) return;
    playTapSound();
    if (pinInput.length < 9) {
      const next = pinInput + digit;
      setPinInput(next);
      if (next.length >= 4) {
        checkAutoTrigger(next);
      }
    }
  };

  const handleDelete = () => {
    if (lockCooldown > 0) return;
    playTapSound();
    setPinInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (lockCooldown > 0) return;
    playTapSound();
    setPinInput("");
  };

  // Listen to physical keyboard typing
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (lockCooldown > 0) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleDelete();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "Enter" && pinInput.length >= 4) {
        e.preventDefault();
        verifyPin(pinInput);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocked, pinInput, lockCooldown]);

  if (!isLocked) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/95 backdrop-blur-2xl p-4 select-none">
      <div className={`w-full max-w-sm flex flex-col items-center justify-center text-center space-y-4 ${errorShake ? "animate-shake" : "animate-in fade-in zoom-in-95 duration-200"}`}>
        
        {/* Lock Header */}
        <div className="space-y-1.5">
          <div className={`mx-auto size-14 rounded-3xl flex items-center justify-center shadow-lg transition-all ${
            lockCooldown > 0
              ? "bg-destructive/15 border border-destructive/30 text-destructive shadow-destructive/20 animate-pulse"
              : "bg-primary/10 border border-primary/25 text-primary shadow-primary/10"
          }`}>
            {lockCooldown > 0 ? (
              <ShieldAlert className="size-7 text-destructive" />
            ) : (
              <Lock className="size-7 text-primary animate-pulse" />
            )}
          </div>
          
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {lockCooldown > 0
              ? (lang === "bn" ? "সিকিউরিটি লক সক্রিয়" : "Security Lockout Active")
              : (lang === "bn" ? "ক্লাসিক ওয়ার্ল্ড সিকিউরিটি গেট" : "Classic World Security Gate")}
          </h2>
          
          <p className="text-xs text-muted-foreground max-w-xs">
            {lockCooldown > 0
              ? (lang === "bn" ? "৪ বার ভুল পিন দেওয়া হয়েছে। অপেক্ষা করুন:" : "Too many incorrect attempts. Please wait:")
              : selectedMode === "employee"
              ? (lang === "bn" ? "দোকান কর্মচারী হিসেবে প্রবেশ করতে পিন কোড দিন" : "Enter Staff PIN to unlock as shop employee")
              : (lang === "bn" ? "দোকান মালিক হিসেবে প্রবেশ করতে পিন কোড দিন" : "Enter Owner PIN to unlock full POS controls")}
          </p>
        </div>

        {/* 60 Seconds Lockout Display */}
        {lockCooldown > 0 ? (
          <div className="w-full max-w-[270px] p-5 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-center space-y-2.5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-destructive">
              <Clock className="size-4 animate-spin" />
              <span>{lang === "bn" ? "অপেক্ষা করুন" : "Countdown Timer"}</span>
            </div>
            <div className="font-mono font-extrabold text-3xl tracking-widest text-destructive">
              00:{lockCooldown < 10 ? `0${lockCooldown}` : lockCooldown}
            </div>
            <p className="text-[11px] opacity-80">
              {lang === "bn"
                ? "সময় শেষ হলে পুনরায় চেষ্টা করার সুযোগ পাবেন।"
                : "You will be able to retry when the timer expires."}
            </p>
          </div>
        ) : (
          <>
            {/* Role Selector Pill */}
            <div className="flex items-center p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-[270px] w-full">
              <button
                type="button"
                onClick={() => {
                  setSelectedMode("owner");
                  setPinInput("");
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedMode === "owner"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Crown className="size-3.5" />
                <span>{lang === "bn" ? "দোকান মালিক" : "Store Owner"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMode("employee");
                  setPinInput("");
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  selectedMode === "employee"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="size-3.5" />
                <span>{lang === "bn" ? "কর্মচারী / স্টাফ" : "Staff Employee"}</span>
              </button>
            </div>

            {/* Dynamic PIN Dots - Only renders typed dots, ZERO glimpse of total length */}
            <div className="h-10 flex items-center justify-center gap-2.5 py-1 min-w-[140px]">
              {pinInput.length === 0 ? (
                <span className="text-xs text-muted-foreground/60 tracking-wider font-mono">
                  {lang === "bn" ? "সিকিউরিটি পিন দিন" : "Enter Security PIN"}
                </span>
              ) : (
                Array.from({ length: pinInput.length }).map((_, i) => (
                  <div
                    key={i}
                    className="size-3.5 rounded-full bg-primary shadow-sm shadow-primary/50 animate-in zoom-in-75 duration-150"
                  />
                ))
              )}
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

            {/* Manual Unlock Button when 4+ digits typed */}
            {pinInput.length >= 4 && (
              <button
                type="button"
                onClick={() => verifyPin(pinInput)}
                className="w-full max-w-[270px] h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
              >
                <Unlock className="size-4" />
                <span>{lang === "bn" ? "আনলক করুন" : "Unlock POS"}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
