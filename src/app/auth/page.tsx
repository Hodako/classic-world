"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { loginFn, registerFn, firebaseAuthSyncFn, employeeLoginFn, uploadImageFn } from "@/lib/rpc";
import { updateBusinessSettingsFn } from "@/lib/rpc-admin";
import type { AuthUser } from "@/hooks/use-auth";
import { auth, googleProvider } from "@/lib/firebase";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { KeyRound, Mail, CheckCircle2, RefreshCw, UserCheck, Shield, Lock, User, ArrowRight, Eye, EyeOff, Smartphone, Sparkles, Store, Image as ImageIcon, HelpCircle } from "lucide-react";

export default function AuthPage() {
  const { user, loading, login } = useAuth();
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Active Main Tab: Owner vs Employee
  const [mainRole, setMainRole] = useState<"owner" | "employee" | "pin">("owner");
  const [quickPin, setQuickPin] = useState("");
  const [quickPinShake, setQuickPinShake] = useState(false);

  // Owner Auth State (Phone or Email)
  const [ownerMode, setOwnerMode] = useState<"signin" | "signup">("signin");
  const [ownerIdentifier, setOwnerIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Post-Signup Onboarding State (Shop Name & Logo)
  const [onboardingUser, setOnboardingUser] = useState<AuthUser | null>(null);
  const [shopName, setShopName] = useState("");
  const [shopLogo, setShopLogo] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Employee Auth State (Phone or Email or Username)
  const [empMode, setEmpMode] = useState<"signin" | "signup">("signin");
  const [empIdentifier, setEmpIdentifier] = useState("");
  const [empFullName, setEmpFullName] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [showEmpPassword, setShowEmpPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("role") === "employee" || params.get("tab") === "employee") {
        setMainRole("employee");
      }
    }
  }, []);

  useEffect(() => {
    if (mounted && !loading) {
      if (user && !onboardingUser) {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, router, mounted, onboardingUser]);

  if ((!mounted || loading) && !onboardingUser) return <SpeedLoader />;
  if (user && !onboardingUser) return <SpeedLoader />;

  
  const handlePinDigit = (digit: string) => {
    if (quickPin.length < 6) {
      const next = quickPin + digit;
      setQuickPin(next);
      if (next.length === 4) {
        verifyQuickPinInput(next);
      }
    }
  };

  const verifyQuickPinInput = async (pinToTest: string) => {
    const ownerPin = (typeof window !== "undefined" ? localStorage.getItem("app_pin_code_val") : null) || "1234";

    if (pinToTest.trim() === ownerPin.trim()) {
      sessionStorage.setItem("app_pin_unlocked", "true");
      localStorage.removeItem("cw_active_employee_session");
      localStorage.setItem("cw_active_session_role", "owner");
      window.dispatchEvent(new Event("hz-employee-switched"));
      toast.success(lang === "bn" ? "মালিক পিন সঠিক হয়েছে!" : "Owner PIN verified!");
      router.replace("/dashboard");
      return;
    }

    try {
      const empsRaw = localStorage.getItem("cw_employee_accounts");
      if (empsRaw) {
        const emps = JSON.parse(empsRaw);
        if (Array.isArray(emps)) {
          const matchedEmp = emps.find((e: any) => String(e.pin || e.password || "").trim() === pinToTest.trim());
          if (matchedEmp) {
            sessionStorage.setItem("app_pin_unlocked", "true");
            localStorage.setItem("cw_active_employee_session", JSON.stringify(matchedEmp));
            localStorage.setItem("cw_active_session_role", "employee");
            window.dispatchEvent(new Event("hz-employee-switched"));
            toast.success(lang === "bn" ? `পিন সঠিক হয়েছে! স্বাগতম (${matchedEmp.name})` : `PIN verified! Welcome ${matchedEmp.name}`);
            router.replace("/dashboard");
            return;
          }
        }
      }
    } catch (_) {}

    try {
      const res = await employeeLoginFn({
        data: {
          username: "employee",
          password: pinToTest.trim(),
        },
      });
      if (res && res.user) {
        sessionStorage.setItem("app_pin_unlocked", "true");
        afterAuth(res.user as AuthUser);
        return;
      }
    } catch (_) {}

    setQuickPinShake(true);
    setTimeout(() => {
      setQuickPinShake(false);
      setQuickPin("");
    }, 500);
    toast.error(lang === "bn" ? "ভুল পিন কোড! ৪-সংখ্যার সঠিক পিন দিন।" : "Incorrect 4-digit PIN! Please try again.");
  };

  function afterAuth(u: AuthUser | null) {
    if (!u) return;
    login(u);
    if (u.role === "owner" && !u.business_name) {
      setOnboardingUser(u);
    } else {
      router.replace("/dashboard");
    }
  }

  async function handleCompleteOnboarding(e: React.FormEvent) {
    e.preventDefault();
    if (!shopName.trim()) {
      toast.error(lang === "bn" ? "দোকানের নাম লিখুন" : "Please enter your shop name");
      return;
    }
    setOnboardingBusy(true);
    try {
      await updateBusinessSettingsFn({
        data: {
          name: shopName.trim(),
          logo_url: shopLogo.trim() || undefined,
          address: shopAddress.trim() || undefined,
        },
      });
      toast.success(lang === "bn" ? "দোকানের প্রোফাইল সেটআপ সম্পন্ন হয়েছে!" : "Shop profile configured!");
      router.replace("/dashboard");
    } catch (err: any) {
      toast.error(err?.message || "Profile update failed");
      router.replace("/dashboard");
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res: any = await uploadImageFn({ data: { base64, fileName: file.name } });
        const url = res?.url || res?.data?.url;
        if (url) {
          setShopLogo(url);
          toast.success(lang === "bn" ? "লোগো আপলোড সম্পন্ন!" : "Logo uploaded!");
        } else {
          toast.error(lang === "bn" ? "লোগো আপলোড ব্যর্থ হয়েছে" : "Upload failed");
        }
      } catch {
        toast.error("Failed to upload logo");
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  // ─── Owner Sign-In (Phone or Email) ───────────────────────────────────────
  async function handleOwnerSignIn(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = ownerIdentifier.trim();
    if (!cleanId || !password) {
      toast.error(lang === "bn" ? "ইমেইল/মোবাইল নম্বর ও পাসওয়ার্ড লিখুন" : "Please enter email/phone and password");
      return;
    }

    setBusy(true);
    try {
      // If user typed an email address, also sync with Firebase Auth if available
      if (cleanId.includes("@")) {
        try {
          await signInWithEmailAndPassword(auth, cleanId.toLowerCase(), password);
        } catch (fbErr: any) {
          if (fbErr.code === "auth/user-not-found" || fbErr.code === "auth/invalid-credential") {
            try {
              await createUserWithEmailAndPassword(auth, cleanId.toLowerCase(), password);
            } catch {}
          }
        }
      }

      const data = await loginFn({ data: { identifier: cleanId, password } });
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  }

  // ─── Owner Sign-Up (Phone or Email) ───────────────────────────────────────
  async function handleOwnerSignUp(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = ownerIdentifier.trim();
    if (!cleanId || !password) {
      toast.error(lang === "bn" ? "ইমেইল বা মোবাইল নম্বর এবং পাসওয়ার্ড প্রদান করুন" : "Please provide email/phone and password");
      return;
    }

    setBusy(true);
    try {
      if (cleanId.includes("@")) {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, cleanId.toLowerCase(), password);
          if (fullName && userCred.user) {
            await updateProfile(userCred.user, { displayName: fullName });
          }
        } catch (fbErr: any) {
          if (fbErr.code !== "auth/email-already-in-use") {
            console.warn("Firebase Auth notice:", fbErr.message);
          }
        }
      }

      const data = await registerFn({
        data: {
          identifier: cleanId,
          password,
          fullName,
          role: "owner",
        },
      });

      toast.success(lang === "bn" ? "দোকান মালিক অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!" : "Shop Owner account created successfully!");
      const u = data.user as AuthUser;
      login(u);
      setOnboardingUser(u);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  // ─── Employee Sign-In (Phone, Username or Email) ──────────────────────────
  async function handleEmployeeSignIn(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = empIdentifier.trim();
    if (!cleanId || !empPassword) {
      toast.error(lang === "bn" ? "ইউজারনেম/মোবাইল নম্বর ও পাসওয়ার্ড লিখুন" : "Please enter username/phone and password");
      return;
    }

    setBusy(true);
    try {
      // First try employee login
      const data = await employeeLoginFn({
        data: {
          username: cleanId,
          password: empPassword,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারী হিসেবে সফলভাবে লগইন হয়েছে!" : "Employee signed in successfully!");
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      // Fallback to standard login if account is registered via general auth
      try {
        const data = await loginFn({ data: { identifier: cleanId, password: empPassword } });
        afterAuth(data.user as AuthUser);
        return;
      } catch {}
      toast.error(err instanceof Error ? err.message : "Employee login failed. Please check credentials.");
    } finally {
      setBusy(false);
    }
  }

  // ─── Employee Sign-Up (Phone or Email for Staff) ──────────────────────────
  async function handleEmployeeSignUp(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = empIdentifier.trim();
    if (!cleanId || !empPassword || !empFullName.trim()) {
      toast.error(lang === "bn" ? "সকল তথ্য সঠিকভাবে পূরণ করুন" : "Please fill in all fields");
      return;
    }

    setBusy(true);
    try {
      if (cleanId.includes("@")) {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, cleanId.toLowerCase(), empPassword);
          if (empFullName && userCred.user) {
            await updateProfile(userCred.user, { displayName: empFullName });
          }
        } catch (fbErr: any) {
          if (fbErr.code !== "auth/email-already-in-use") {
            console.warn("Firebase notice:", fbErr.message);
          }
        }
      }

      const data = await registerFn({
        data: {
          identifier: cleanId,
          password: empPassword,
          fullName: empFullName,
          role: "employee",
        },
      });

      toast.success(lang === "bn" ? "কর্মচারী অ্যাকাউন্ট তৈরি হয়েছে! লগইন সফল।" : "Employee account created! Signed in successfully.");
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Employee registration failed");
    } finally {
      setBusy(false);
    }
  }

  // ─── Google Sign-In (For Both Owner & Employee) ───────────────────────────
  async function handleGoogleSignIn() {
    setGoogleBusy(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (!fbUser || !fbUser.email) {
        throw new Error("Unable to retrieve email from Google Account");
      }

      const data = await firebaseAuthSyncFn({
        data: {
          email: fbUser.email,
          fullName: fbUser.displayName || undefined,
          photoUrl: fbUser.photoURL || undefined,
          firebaseUid: fbUser.uid,
        },
      });

      toast.success(lang === "bn" ? "গুগল দিয়ে সফলভাবে সাইন ইন হয়েছে!" : "Google sign-in successful!");
      afterAuth(data.user as AuthUser);
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        return;
      }
      toast.error(err.message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] w-full grid grid-cols-1 md:grid-cols-12 bg-background text-foreground select-none">
      {/* ─── Left Panel: Hero Showcase (Desktop only) ────────────────────────── */}
      <div
        className="hidden md:flex md:col-span-6 lg:col-span-7 relative flex-col justify-between p-8 lg:p-12 text-white select-none overflow-hidden bg-cover bg-center h-full min-h-screen"
        style={{ backgroundImage: `linear-gradient(rgba(9, 9, 11, 0.75), rgba(9, 9, 11, 0.88)), url('/login_illustration.jpg')` }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top brand */}
        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <AppLogo size="md" alt="Dream IT" />
          <span className="font-serif text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-indigo-300 bg-clip-text text-transparent">
            Dream IT POS
          </span>
        </div>

        {/* Middle description */}
        <div className="space-y-4 lg:space-y-6 relative z-10 max-w-lg my-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="size-3.5 text-emerald-400" />
            <span>{lang === "bn" ? "যেকোনো ব্যবসার আস্থার প্রতীক" : "Smart POS & Business ERP"}</span>
          </div>

          <h2 className="text-3xl lg:text-4xl font-bold font-serif leading-tight text-white">
            {lang === "bn"
              ? `"Dream IT" ইনভেন্টরি, সেলস ও একাউন্টিং বিলিং সফটওয়্যার`
              : `"Dream IT" POS & Billing Software Solution`}
          </h2>

          <p className="text-sm text-zinc-300 leading-relaxed max-w-md">
            {lang === "bn"
              ? "স্টক মূল্যায়ন, ক্যাশ ফ্লো, কাস্টম ইনভয়েস, মোবাইল ও ইমেইল লগইন, কর্মচারী এক্সেস এবং বিক্রয় ট্র্যাকিং সহজতর করার নির্ভরযোগ্য মাধ্যম।"
              : "Next-generation inventory valuation, cashbox ledger, phone & email authentication, staff management, and analytics."}
          </p>
        </div>

        {/* Single Official Attribution Footer (PC Left Panel Only) */}
        <div className="space-y-2 relative z-10 text-xs text-zinc-400 border-t border-white/10 pt-4 font-balooda shrink-0">
          <p className="text-[11px] text-zinc-400">
            © 2026 Dream IT POS & Billing Software. All rights reserved.
          </p>
          <div className="pt-0.5 flex items-center gap-2">
            <a
              href="https://wa.me/8801783501427"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all border border-emerald-500/30 cursor-pointer"
              title="Customer Support"
            >
              <HelpCircle className="size-3.5 text-emerald-400" />
              <span>{lang === "bn" ? "হেল্প ও সাপোর্ট" : "Help & Support"}</span>
            </a>
          </div>
        </div>
      </div>

      {/* ─── Right Panel: Clean Form Widget ──────────────────────────────────── */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex flex-col justify-between p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-zinc-950 min-h-[100dvh] overflow-y-auto">
        {/* Top Header Row */}
        <div className="flex items-center justify-between pb-3 shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <AppLogo size="sm" alt="Dream IT" />
            <span className="font-serif text-lg font-bold">Dream IT</span>
          </div>

          <div className="flex gap-1 rounded-full bg-white dark:bg-zinc-900 border border-border/80 p-0.5 text-xs ml-auto shadow-2xs">
            <button
              type="button"
              onClick={() => setLang("bn")}
              className={`px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${
                lang === "bn" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${
                lang === "en" ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Center: Main Form Card */}
        <div className="w-full max-w-md mx-auto my-auto py-2 sm:py-4">
          <div className="p-5 sm:p-7 rounded-3xl bg-card border border-border shadow-xl space-y-5">
            {/* Top Primary Tab: Shop Owner vs Employee */}
            <div className="grid grid-cols-3 p-1 bg-muted/80 rounded-2xl border border-border/80 text-[11px] sm:text-xs font-semibold gap-1">
              <button
                type="button"
                onClick={() => setMainRole("owner")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  mainRole === "owner"
                    ? "bg-card text-[#F7931A] dark:text-[#F7931A] shadow-sm font-bold border border-[#F7931A]/35"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Shield className="size-3.5 text-[#F7931A] shrink-0" />
                <span className="truncate">{lang === "bn" ? "দোকান মালিক" : "Owner"}</span>
              </button>

              <button
                type="button"
                onClick={() => setMainRole("employee")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  mainRole === "employee"
                    ? "bg-card text-emerald-600 dark:text-[#CCFF00] shadow-sm font-bold border border-emerald-500/30 dark:border-[#CCFF00]/40"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <UserCheck className="size-3.5 text-emerald-500 dark:text-[#CCFF00] shrink-0" />
                <span className="truncate">{lang === "bn" ? "কর্মচারী" : "Staff"}</span>
              </button>

              <button
                type="button"
                onClick={() => setMainRole("pin")}
                className={`py-2 rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  mainRole === "pin"
                    ? "bg-card text-[#F7931A] dark:text-[#F7931A] shadow-sm font-bold border border-[#F7931A]/35"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Lock className="size-3.5 text-[#F7931A] shrink-0" />
                <span className="truncate">{lang === "bn" ? "পিন আনলক" : "Quick PIN"}</span>
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* 1. EMPLOYEE AUTHENTICATION VIEW                                      */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {mainRole === "pin" ? (
              <div className={`space-y-4 text-center ${quickPinShake ? "animate-shake" : ""}`}>
                <div className="space-y-1">
                  <div className="mx-auto size-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 shadow-sm">
                    <Lock className="size-6 text-amber-600" />
                  </div>
                  <h1 className="text-lg sm:text-xl font-serif font-bold text-foreground">
                    {lang === "bn" ? "৪-সংখ্যার সিকিউরিটি পিন দিন" : "Quick PIN Unlock"}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {lang === "bn" ? "মালিক বা কর্মচারীর পিন প্রবেশ করিয়ে সরাসরি আনলক করুন" : "Enter owner or staff 4-digit PIN to directly access POS"}
                  </p>
                </div>

                {/* PIN Dots Indicator */}
                <div className="flex items-center justify-center gap-3 py-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`size-4 rounded-full border-2 transition-all duration-150 ${
                        i < quickPin.length
                          ? "bg-amber-500 border-amber-500 scale-110 shadow-xs shadow-amber-500/50"
                          : "border-muted-foreground/30 bg-muted/20"
                      }`}
                    />
                  ))}
                </div>

                {/* Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mx-auto pt-1">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => handlePinDigit(digit)}
                      className="h-12 rounded-xl bg-card border border-border/80 text-foreground font-bold text-lg hover:bg-amber-500/10 hover:border-amber-500/40 active:scale-95 transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setQuickPin("")}
                    className="h-12 rounded-xl bg-muted/40 text-muted-foreground font-semibold text-xs hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    {lang === "bn" ? "মুছুন" : "Clear"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePinDigit("0")}
                    className="h-12 rounded-xl bg-card border border-border/80 text-foreground font-bold text-lg hover:bg-amber-500/10 hover:border-amber-500/40 active:scale-95 transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                    >
                      0
                    </button>

                  <button
                    type="button"
                    onClick={() => setQuickPin((p) => p.slice(0, -1))}
                    className="h-12 rounded-xl bg-muted/40 text-muted-foreground font-semibold text-xs hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                </div>
              </div>
            ) : mainRole === "employee" ? (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h1 className="text-lg sm:text-xl font-serif font-bold text-foreground">
                    {empMode === "signin"
                      ? (lang === "bn" ? "কর্মচারী লগইন (মোবাইল / ইমেইল)" : "Employee Sign In")
                      : (lang === "bn" ? "কর্মচারী সাইন আপ (মোবাইল / ইমেইল)" : "Employee Sign Up")}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {empMode === "signin"
                      ? (lang === "bn" ? "মোবাইল নম্বর, ইমেইল বা ইউজারনেম দিয়ে লগইন করুন" : "Sign in with phone number, email, or username")
                      : (lang === "bn" ? "মোবাইল নম্বর বা ইমেইল দিয়ে নতুন একাউন্ট খুলুন" : "Create employee account with phone or email")}
                  </p>
                </div>

                {/* Sub-tab: Sign In vs Sign Up for Employee */}
                <div className="flex rounded-xl bg-muted/60 p-0.5 border border-border text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setEmpMode("signin")}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                      empMode === "signin" ? "bg-background text-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lang === "bn" ? "লগইন করুন" : "Sign In"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmpMode("signup")}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                      empMode === "signup" ? "bg-background text-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lang === "bn" ? "নতুন একাউন্ট" : "Sign Up"}
                  </button>
                </div>

                {/* Form: Employee Sign In */}
                {empMode === "signin" ? (
                  <form onSubmit={handleEmployeeSignIn} className="space-y-3.5 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Smartphone className="size-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{lang === "bn" ? "মোবাইল নম্বর / ইমেইল / ইউজারনেম" : "Phone, Email or Username"}</span>
                      </Label>
                      <Input
                        type="text"
                        required
                        value={empIdentifier}
                        onChange={(e) => setEmpIdentifier(e.target.value)}
                        placeholder={lang === "bn" ? "মোবাইল নম্বর বা ইমেইল" : "Phone or Email"}
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Lock className="size-3.5 text-slate-400 dark:text-zinc-500" />
                          <span>{t("password")}</span>
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowEmpPassword(!showEmpPassword)}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          {showEmpPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          <span>{showEmpPassword ? (lang === "bn" ? "লুকান" : "Hide") : (lang === "bn" ? "দেখান" : "Show")}</span>
                        </button>
                      </div>
                      <Input
                        type={showEmpPassword ? "text" : "password"}
                        required
                        value={empPassword}
                        onChange={(e) => setEmpPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded accent-emerald-600 cursor-pointer" />
                        <span>Remember me</span>
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline font-semibold"
                      >
                        {lang === "bn" ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot password?"}
                      </Link>
                    </div>

                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-full h-11 sm:h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] gap-2 mt-1 cursor-pointer"
                    >
                      {busy ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <>
                          <span>{lang === "bn" ? "কর্মচারী হিসেবে প্রবেশ করুন" : "Sign In as Employee"}</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </form>
                ) : (
                  /* Form: Employee Sign Up */
                  <form onSubmit={handleEmployeeSignUp} className="space-y-3.5 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <User className="size-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{lang === "bn" ? "পুরো নাম" : "Full Name"}</span>
                      </Label>
                      <Input
                        type="text"
                        required
                        value={empFullName}
                        onChange={(e) => setEmpFullName(e.target.value)}
                        placeholder={lang === "bn" ? "পুরো নাম" : "Full name"}
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Smartphone className="size-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{lang === "bn" ? "মোবাইল নম্বর অথবা ইমেইল" : "Phone Number or Email"}</span>
                      </Label>
                      <Input
                        type="text"
                        required
                        value={empIdentifier}
                        onChange={(e) => setEmpIdentifier(e.target.value)}
                        placeholder={lang === "bn" ? "মোবাইল নম্বর বা ইমেইল" : "Phone or Email"}
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Lock className="size-3.5 text-slate-400 dark:text-zinc-500" />
                          <span>{t("password")}</span>
                        </Label>
                        <button
                          type="button"
                          onClick={() => setShowEmpPassword(!showEmpPassword)}
                          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        >
                          {showEmpPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          <span>{showEmpPassword ? (lang === "bn" ? "লুকান" : "Hide") : (lang === "bn" ? "দেখান" : "Show")}</span>
                        </button>
                      </div>
                      <Input
                        type={showEmpPassword ? "text" : "password"}
                        required
                        minLength={6}
                        value={empPassword}
                        onChange={(e) => setEmpPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={busy}
                      className="w-full h-11 sm:h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] gap-2 mt-1 cursor-pointer"
                    >
                      {busy ? (
                        <RefreshCw className="size-4 animate-spin" />
                      ) : (
                        <>
                          <span>{lang === "bn" ? "কর্মচারী অ্যাকাউন্ট তৈরি করুন" : "Create Employee Account"}</span>
                          <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </form>
                )}

                {/* Google Sign-in for Employee */}
                <div className="space-y-3 pt-1 border-t border-border">
                  <div className="relative text-center">
                    <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-wider relative z-10">
                      {lang === "bn" ? "অথবা গুগল দিয়ে লগইন" : "Or Continue With"}
                    </span>
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={googleBusy}
                    className="w-full h-11 sm:h-12 rounded-xl border-border bg-background hover:bg-muted font-semibold text-xs sm:text-sm gap-2.5 shadow-2xs cursor-pointer"
                  >
                    {googleBusy ? (
                      <RefreshCw className="size-4 animate-spin text-primary" />
                    ) : (
                      <svg version="1.1" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4 shrink-0">
                        <path style={{ fill: "#FBBB00" }} d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z"></path>
                        <path style={{ fill: "#518EF8" }} d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z"></path>
                        <path style={{ fill: "#28B446" }} d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z"></path>
                        <path style={{ fill: "#F14336" }} d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z"></path>
                      </svg>
                    )}
                    <span>{lang === "bn" ? "গুগল দিয়ে লগইন করুন (Google Auth)" : "Continue with Google"}</span>
                  </Button>
                </div>
              </div>
            ) : (
              /* ══════════════════════════════════════════════════════════════════════ */
              /* 2. SHOP OWNER AUTHENTICATION VIEW                                    */
              /* ══════════════════════════════════════════════════════════════════════ */
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h1 className="text-lg sm:text-xl font-serif font-bold text-foreground">
                    {ownerMode === "signin"
                      ? (lang === "bn" ? "দোকান মালিক লগইন (মোবাইল / ইমেইল)" : "Shop Owner Sign In")
                      : (lang === "bn" ? "দোকান মালিক সাইন আপ (মোবাইল / ইমেইল)" : "Shop Owner Sign Up")}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {ownerMode === "signin"
                      ? (lang === "bn" ? "মোবাইল নম্বর অথবা ইমেইল দিয়ে প্রবেশ করুন" : "Login with your phone number or email address")
                      : (lang === "bn" ? "মোবাইল নম্বর বা ইমেইল দিয়ে নতুন শপ একাউন্ট খুলুন" : "Create a new shop account with phone or email")}
                  </p>
                </div>

                {/* Sub-tab: Owner Sign In vs Sign Up */}
                <div className="flex rounded-xl bg-muted/60 p-0.5 border border-border text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setOwnerMode("signin")}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                      ownerMode === "signin" ? "bg-background text-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("sign_in")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOwnerMode("signup")}
                    className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
                      ownerMode === "signup" ? "bg-background text-foreground font-bold shadow-xs" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("sign_up")}
                  </button>
                </div>

                <form onSubmit={ownerMode === "signin" ? handleOwnerSignIn : handleOwnerSignUp} className="space-y-3.5 pt-1">
                  {/* Full Name on Signup */}
                  {ownerMode === "signup" && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <User className="size-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{t("full_name")}</span>
                      </Label>
                      <Input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder={lang === "bn" ? "পুরো নাম" : "Full name"}
                        className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                      />
                    </div>
                  )}

                  {/* Phone or Email */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Smartphone className="size-3.5 text-slate-400 dark:text-zinc-500" />
                      <span>{lang === "bn" ? "মোবাইল নম্বর অথবা ইমেইল এড্রেস" : "Phone Number or Email Address"}</span>
                    </Label>
                    <Input
                      type="text"
                      required
                      value={ownerIdentifier}
                      onChange={(e) => setOwnerIdentifier(e.target.value)}
                      placeholder={lang === "bn" ? "মোবাইল নম্বর বা ইমেইল" : "Phone or Email"}
                      className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                    />
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Lock className="size-3.5 text-slate-400 dark:text-zinc-500" />
                        <span>{t("password")}</span>
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                        <span>{showPassword ? (lang === "bn" ? "লুকান" : "Hide") : (lang === "bn" ? "দেখান" : "Show")}</span>
                      </button>
                    </div>
                    <Input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={ownerMode === "signup" ? 6 : undefined}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 dark:focus-visible:ring-zinc-600 focus-visible:border-transparent w-full shadow-2xs"
                    />
                  </div>

                  {/* Remember Me / Forgot Password */}
                  {ownerMode === "signin" && (
                    <div className="flex items-center justify-between text-xs pt-0.5">
                      <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded accent-[#F7931A] cursor-pointer" />
                        <span>Remember me</span>
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline font-semibold"
                      >
                        {lang === "bn" ? "পাসওয়ার্ড ভুলে গেছেন?" : "Forgot password?"}
                      </Link>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full h-11 sm:h-12 rounded-xl bg-[#F7931A] hover:bg-[#e08416] text-white font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 transition-all active:scale-[0.98] gap-2 mt-1 cursor-pointer"
                  >
                    {busy ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <>
                        <span>{ownerMode === "signin" ? t("sign_in") : t("create_account")}</span>
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>

                {/* Google Sign-in */}
                <div className="space-y-3 pt-1 border-t border-border">
                  <div className="relative text-center">
                    <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-wider relative z-10">
                      {lang === "bn" ? "অথবা গুগল দিয়ে লগইন" : "Or Continue With"}
                    </span>
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogleSignIn}
                    disabled={googleBusy}
                    className="w-full h-11 sm:h-12 rounded-xl border-border bg-background hover:bg-muted font-semibold text-xs sm:text-sm gap-2.5 shadow-2xs cursor-pointer"
                  >
                    {googleBusy ? (
                      <RefreshCw className="size-4 animate-spin text-primary" />
                    ) : (
                      <svg version="1.1" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4 shrink-0">
                        <path style={{ fill: "#FBBB00" }} d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z"></path>
                        <path style={{ fill: "#518EF8" }} d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z"></path>
                        <path style={{ fill: "#28B446" }} d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z"></path>
                        <path style={{ fill: "#F14336" }} d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z"></path>
                      </svg>
                    )}
                    <span>{lang === "bn" ? "গুগল দিয়ে লগইন করুন (Google Auth)" : "Continue with Google"}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Clean, minimal copyright (Mobile view only) */}
        <div className="text-center text-[11px] text-muted-foreground py-2 md:hidden">
          <span>© 2026 Dream IT POS. All rights reserved.</span>
        </div>
      </div>

      {/* ─── POST-SIGNUP SHOP ONBOARDING MODAL ─────────────────────────────────── */}
      <Dialog open={!!onboardingUser} onOpenChange={() => {}}>
        <DialogContent
          className="max-w-md rounded-3xl p-5 sm:p-6 bg-white border border-slate-200 shadow-2xl text-slate-900"
          style={{ backgroundColor: "#FFFFFF" }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Store className="size-6 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900">
                  {lang === "bn" ? "দোকানের প্রোফাইল সেটআপ" : "Setup Shop Profile"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {lang === "bn"
                    ? "আপনার ইনভয়েস ও অ্যাকাউন্টের জন্য দোকানের বিবরণ দিন।"
                    : "Enter your shop details for invoices and billing."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCompleteOnboarding} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {lang === "bn" ? "দোকানের নাম *" : "Shop Name *"}
              </Label>
              <Input
                type="text"
                required
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: ড্রিম ফ্যাশন / ভাই ভাই ট্রেডার্স" : "e.g. Dream Fashion / My Store"}
                className="h-11 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-xs sm:text-sm px-3.5 placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                <span>{lang === "bn" ? "দোকানের লোগো (ঐচ্ছিক)" : "Shop Logo (Optional)"}</span>
                {logoUploading && <span className="text-[10px] text-emerald-600 animate-pulse">Uploading...</span>}
              </Label>
              <div className="flex items-center gap-3">
                {shopLogo ? (
                  <div className="relative size-12 rounded-xl border border-slate-200 p-1 bg-slate-50 shrink-0">
                    <img src={shopLogo} alt="Logo" className="w-full h-full object-contain rounded-lg" />
                  </div>
                ) : (
                  <div className="size-12 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-emerald-600 file:text-white cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {lang === "bn" ? "দোকানের ঠিকানা (ঐচ্ছিক)" : "Shop Address (Optional)"}
              </Label>
              <Input
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder={lang === "bn" ? "যেমন: ধানমন্ডি, ঢাকা" : "e.g. Dhanmondi, Dhaka"}
                className="h-11 rounded-xl bg-slate-50 border-slate-200 text-slate-900 text-xs sm:text-sm px-3.5 placeholder:text-slate-400"
              />
            </div>

            <DialogFooter className="flex flex-row gap-2 pt-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.replace("/dashboard")}
                className="flex-1 sm:flex-initial h-10 rounded-xl text-xs text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer"
              >
                {lang === "bn" ? "পরে করব" : "Skip"}
              </Button>
              <Button
                type="submit"
                disabled={onboardingBusy || !shopName.trim()}
                className="flex-1 sm:flex-initial h-10 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                {onboardingBusy ? (
                  <RefreshCw className="size-4 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="size-4 mr-1.5" />
                )}
                <span>{lang === "bn" ? "শুরু করুন" : "Get Started"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
