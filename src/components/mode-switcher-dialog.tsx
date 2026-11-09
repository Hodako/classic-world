"use client";

import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Lock, Crown, User, Check, ArrowRight, KeyRound, Users, ShieldAlert } from "lucide-react";
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

    // Also refresh employees from Firestore so latest staff PINs are available
    import("@/lib/firestore-service")
      .then(({ fsGetEmployees }) => fsGetEmployees())
      .then((emps) => {
        if (Array.isArray(emps) && emps.length > 0) {
          setEmployees(emps);
          setSelectedEmpId((prev) => prev || emps[0].id);
        }
      })
      .catch(() => {});

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

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmpId) || employees[0] || null;
  }, [employees, selectedEmpId]);

  const handleVerifyEmployeePin = (pinToTest: string) => {
    if (!selectedEmployee) {
      toast.error(lang === "bn" ? "প্রথমে কর্মচারী নির্বাচন করুন!" : "Please select an employee first!");
      return;
    }

    const cleanInput = pinToTest.trim();
    const correctPin = String(
      selectedEmployee.pin ||
      selectedEmployee.plain_password ||
      selectedEmployee.password ||
      "1234"
    ).trim();

    if (cleanInput === correctPin) {
      playSaleSuccessSound();
      sessionStorage.setItem("app_pin_unlocked", "true");
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

      const empData = selectedEmployee;
      localStorage.setItem("cw_active_employee_session", JSON.stringify(empData));
      localStorage.setItem("cw_active_session_role", "employee");
      localStorage.setItem("user", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("classicworld_auth_profile", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("cw-auth-profile", JSON.stringify({ ...empData, role: "employee" }));
      localStorage.setItem("auth_token", `token_emp_${empData.id}`);
      window.dispatchEvent(new Event("hz-employee-switched"));
      window.dispatchEvent(new Event("storage"));
      onOpenChange(false);
      toast.success(
        lang === "bn"
          ? `কর্মচারী (${empData.name || empData.full_name || "Staff"}) মোডে প্রবেশ সফল হয়েছে!`
          : `Switched to Employee (${empData.name || empData.full_name || "Staff"}) Mode!`
      );
    } else {
      playErrorSound();
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      setPinInput("");
      toast.error(
        lang === "bn"
          ? `'${selectedEmployee.name || selectedEmployee.full_name || "কর্মচারী"}' এর পিন কোড সঠিক নয়!`
          : `Incorrect PIN for ${selectedEmployee.name || selectedEmployee.full_name || "Staff"}!`
      );
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
              ? "মালিক বা কর্মচারীর সিকিউরিটি পিন দিয়ে সরাসরি মোড পরিবর্তন করুন"
              : "Enter Owner PIN or individual Employee PIN to switch access role"}
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
          {/* Employee Selection List (if switching to Employee Mode) */}
          {activeTab === "employee" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5 text-amber-500" />
                  <span>{lang === "bn" ? "কর্মচারী নির্বাচন করুন:" : "Select Employee to Switch:"}</span>
                </span>
                <span className="text-[10px] lowercase font-normal">{employees.length} {lang === "bn" ? "জন কর্মী" : "staff"}</span>
              </div>

              {employees.length === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-1">
                  <ShieldAlert className="size-5 text-amber-500 mx-auto" />
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {lang === "bn" ? "কোনো কর্মচারী যুক্ত নেই" : "No Employee Accounts Found"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "bn" ? "সেটিংস বা এমপ্লয়ি পেজ থেকে আগে কর্মচারী যুক্ত করুন।" : "Please add employees in Settings or Employee page first."}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                  {employees.map((emp) => {
                    const isSelected = emp.id === (selectedEmployee?.id || emp.id);
                    const empName = emp.name || emp.full_name || "Employee";
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          playTapSound();
                          setSelectedEmpId(emp.id);
                          setPinInput("");
                        }}
                        className={`w-full p-2.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "bg-amber-500/15 border-amber-500/50 shadow-2xs"
                            : "bg-muted/30 border-border/60 hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`size-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            {empName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate text-foreground">{empName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{emp.designation || "Staff"}</p>
                          </div>
                        </div>
                        {isSelected ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px] px-2 py-0.5 font-bold">
                              {lang === "bn" ? "নির্বাচিত ✓" : "Selected ✓"}
                            </Badge>
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">লগইন করুন →</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* PIN Input field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>
                {activeTab === "owner"
                  ? (lang === "bn" ? "মালিক সিকিউরিটি পিন দিন" : "Enter Owner PIN")
                  : (lang === "bn" ? `'${selectedEmployee?.name || selectedEmployee?.full_name || "কর্মচারী"}' এর পিন কোড দিন` : `Enter PIN for ${selectedEmployee?.name || selectedEmployee?.full_name || "Staff"}`)}
              </span>
            </label>
            <div className={`relative ${errorShake ? "animate-shake" : ""}`}>
              <Input
                type="password"
                maxLength={9}
                autoFocus
                placeholder="******"
                value={pinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setPinInput(val);
                  if (val.length >= 4) {
                    if (activeTab === "owner") {
                      const oPin = (localStorage.getItem("app_pin_code_val") || "1234").trim();
                      if (val === oPin) {
                        handleVerifyOwnerPin(val);
                      }
                    } else if (selectedEmployee) {
                      const correctPin = String(
                        selectedEmployee.pin ||
                        selectedEmployee.plain_password ||
                        selectedEmployee.password ||
                        "1234"
                      ).trim();
                      if (val === correctPin) {
                        handleVerifyEmployeePin(val);
                      }
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
