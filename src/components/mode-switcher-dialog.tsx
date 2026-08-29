"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Crown, User, Check, ArrowRight, KeyRound } from "lucide-react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { playTapSound, playErrorSound, playSaleSuccessSound } from "@/lib/audio";

interface ModeSwitcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModeSwitcherDialog({ open, onOpenChange }: ModeSwitcherDialogProps) {
  const { lang } = useT();
  const [activeTab, setActiveTab] = useState<"owner" | "employee">("owner");
  const [pinInput, setPinInput] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [currentSessionRole, setCurrentSessionRole] = useState<"owner" | "employee">("owner");
  const [activeEmpSession, setActiveEmpSession] = useState<any>(null);
  const [errorShake, setErrorShake] = useState(false);

  useEffect(() => {
    if (!open) {
      setPinInput("");
      return;
    }

    try {
      const empsRaw = localStorage.getItem("cw_employee_accounts");
      if (empsRaw) {
        const emps = JSON.parse(empsRaw);
        if (Array.isArray(emps)) {
          setEmployees(emps);
          if (emps.length > 0 && !selectedEmpId) {
            setSelectedEmpId(emps[0].id);
          }
        }
      }
    } catch (_) {}

    try {
      const activeEmp = JSON.parse(localStorage.getItem("cw_active_employee_session") || "null");
      setActiveEmpSession(activeEmp);
      if (activeEmp) {
        setCurrentSessionRole("employee");
        setActiveTab("owner");
      } else {
        setCurrentSessionRole("owner");
        setActiveTab("employee");
      }
    } catch (_) {
      setCurrentSessionRole("owner");
    }
  }, [open]);

  const handleVerifyOwnerPin = (pinToTest: string) => {
    const ownerPin = localStorage.getItem("app_pin_code_val") || "1234";
    if (pinToTest.trim() === ownerPin.trim()) {
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
      localStorage.removeItem("cw_active_employee_session");
      localStorage.setItem("cw_active_session_role", "owner");
      window.dispatchEvent(new Event("hz-employee-switched"));
      onOpenChange(false);
      toast.success(lang === "bn" ? "স্বত্বাধিকারী (Owner) মোডে সফলভাবে প্রবেশ করেছেন!" : "Switched to Owner Mode successfully!");
    } else {
      playErrorSound();
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      setPinInput("");
      toast.error(lang === "bn" ? "ভুল মালিক পিন কোড!" : "Incorrect Owner PIN code!");
    }
  };

  const handleVerifyEmployeePin = (pinToTest: string) => {
    const defaultEmpPin = localStorage.getItem("app_employee_pin_code_val") || "0000";
    let targetEmployee = employees.find(e => e.id === selectedEmpId);
    if (!targetEmployee) {
      targetEmployee = employees.find(e => String(e.pin).trim() === pinToTest.trim());
    }

    if (pinToTest.trim() === defaultEmpPin.trim() || (targetEmployee && String(targetEmployee.pin).trim() === pinToTest.trim())) {
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
      const empData = targetEmployee || { id: "default-emp", name: "Staff / কর্মচারী", pin: defaultEmpPin, permissions: { sales: true, products: true, customers: true } };
      localStorage.setItem("cw_active_employee_session", JSON.stringify(empData));
      localStorage.setItem("cw_active_session_role", "employee");
      window.dispatchEvent(new Event("hz-employee-switched"));
      onOpenChange(false);
      toast.success(
        lang === "bn"
          ? `কর্মচারী (${empData.name}) মোডে প্রবেশ সফল হয়েছে!`
          : `Switched to Employee (${empData.name}) Mode!`
      );
    } else {
      playErrorSound();
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      setPinInput("");
      toast.error(lang === "bn" ? "ভুল কর্মচারী পিন কোড!" : "Incorrect Employee PIN code!");
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinInput || pinInput.length < 4) {
      toast.error(lang === "bn" ? "কমপক্ষে ৪ সংখ্যার পিন দিন" : "Please enter a 4-digit PIN");
      return;
    }

    if (activeTab === "owner") {
      handleVerifyOwnerPin(pinInput);
    } else {
      handleVerifyEmployeePin(pinInput);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 sm:p-6 rounded-3xl border-border/80 shadow-2xl bg-card">
        <DialogHeader className="text-center space-y-1.5 pb-2 border-b border-border/60">
          <div className="mx-auto size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
            <Lock className="size-6" />
          </div>
          <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
            {lang === "bn" ? "ইউজার মোড পরিবর্তন" : "Quick Switch Role (PIN Required)"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {lang === "bn"
              ? "মালিক বা কর্মচারীর ৪ সংখ্যার সিকিউরিটি পিন দিয়ে মোড পরিবর্তন করুন"
              : "Enter Owner PIN or Employee PIN to switch access role"}
          </DialogDescription>
        </DialogHeader>

        {/* Current Active Status Indicator */}
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-xs">
          <span className="text-muted-foreground">{lang === "bn" ? "বর্তমান অবস্থা:" : "Current Mode:"}</span>
          <span className={`font-bold flex items-center gap-1.5 ${
            currentSessionRole === "owner" ? "text-indigo-600 dark:text-indigo-400" : "text-amber-600 dark:text-amber-400"
          }`}>
            {currentSessionRole === "owner" ? (
              <>
                <Crown className="size-3.5 text-indigo-500" />
                <span>{lang === "bn" ? "স্বত্বাধিকারী (Owner)" : "Owner (Admin)"}</span>
              </>
            ) : (
              <>
                <User className="size-3.5 text-amber-500" />
                <span>{lang === "bn" ? `কর্মচারী (${activeEmpSession?.name || "Staff"})` : `Employee (${activeEmpSession?.name || "Staff"})`}</span>
              </>
            )}
          </span>
        </div>

        {/* Minimalist Mode Selector Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted/50 rounded-2xl border border-border/60">
          <button
            type="button"
            onClick={() => {
              playTapSound();
              setActiveTab("owner");
              setPinInput("");
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "owner"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Crown className={`size-4 ${activeTab === "owner" ? "text-indigo-600 dark:text-indigo-400" : ""}`} />
            <span>{lang === "bn" ? "মালিক মোড (Owner)" : "Owner Mode"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playTapSound();
              setActiveTab("employee");
              setPinInput("");
            }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === "employee"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className={`size-4 ${activeTab === "employee" ? "text-amber-600 dark:text-amber-400" : ""}`} />
            <span>{lang === "bn" ? "কর্মচারী মোড (Staff)" : "Employee Mode"}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* PIN Input field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>{activeTab === "owner" ? (lang === "bn" ? "মালিক পিন কোড দিন" : "Enter Owner PIN") : (lang === "bn" ? "কর্মচারী পিন কোড দিন" : "Enter Employee PIN")}</span>
              <span className="text-[10px] font-normal lowercase font-mono">{activeTab === "owner" ? "(Default: 1234)" : "(Default: 0000)"}</span>
            </label>
            <div className={`relative ${errorShake ? "animate-shake" : ""}`}>
              <Input
                type="password"
                maxLength={6}
                autoFocus
                placeholder="••••"
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setPinInput(val);
                  if (val.length === 4) {
                    if (activeTab === "owner") {
                      handleVerifyOwnerPin(val);
                    } else {
                      handleVerifyEmployeePin(val);
                    }
                  }
                }}
                className="h-12 text-center text-xl tracking-widest font-mono rounded-2xl bg-muted/40 border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                <KeyRound className="size-4 opacity-50" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl text-xs font-semibold cursor-pointer"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={pinInput.length < 4}
              className="h-10 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
            >
              <span>{lang === "bn" ? "মোড পরিবর্তন করুন" : "Switch Mode"}</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
