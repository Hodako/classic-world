"use client";

import React, { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, Lock, Smartphone, ArrowRight, Store, Mail, User, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import { employeeLoginFn, registerFn, firebaseAuthSyncFn } from "@/lib/rpc";
import { auth, googleProvider } from "@/lib/firebase";
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import Link from "next/link";

function EmployeeLoginForm() {
  const { lang, setLang } = useT();
  const router = useRouter();
  const { login } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");

  // Sign in state
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Sign up state
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  function afterAuth(u: AuthUser | null) {
    if (!u) return;
    login(u);
    router.push("/dashboard");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      toast.error(lang === "bn" ? "ইউজারনেম/মোবাইল নম্বর ও পাসওয়ার্ড দিন" : "Please enter your username/phone and password");
      return;
    }

    setBusy(true);
    try {
      const res = await employeeLoginFn({
        data: {
          username: identifier.trim(),
          password,
        },
      });

      toast.success(lang === "bn" ? "কর্মচারী পোর্টালে সফলভাবে লগইন হয়েছে!" : "Employee signed in successfully!");
      afterAuth(res.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Employee login failed. Check credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const cleanId = email.trim();
    if (!fullName.trim() || !cleanId || !newPassword) {
      toast.error(lang === "bn" ? "সকল তথ্য সঠিকভাবে পূরণ করুন" : "Please fill in all fields");
      return;
    }

    setBusy(true);
    try {
      if (cleanId.includes("@")) {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, cleanId.toLowerCase(), newPassword);
          if (userCred.user) {
            await updateProfile(userCred.user, { displayName: fullName.trim() });
          }
        } catch (fbErr: any) {
          if (fbErr.code !== "auth/email-already-in-use") {
            console.warn("Firebase notice:", fbErr.message);
          }
        }
      }

      const res = await registerFn({
        data: {
          identifier: cleanId,
          password: newPassword,
          fullName: fullName.trim(),
          role: "employee",
        },
      });

      toast.success(lang === "bn" ? "কর্মচারী একাউন্ট সফলভাবে তৈরি হয়েছে!" : "Employee account created successfully!");
      afterAuth(res.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

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

      toast.success(lang === "bn" ? "গুগল দিয়ে সফলভাবে লগইন হয়েছে!" : "Google sign-in successful!");
      afterAuth(data.user as AuthUser);
    } catch (err: any) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        return;
      }
      toast.error(err.message || "Google sign-in failed");
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white relative overflow-hidden">
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-4">
        {/* Top Language & Brand */}
        <div className="flex items-center justify-between">
          <Link href="/auth" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors">
            <Store className="size-4" />
            <span className="text-xs font-semibold">{lang === "bn" ? "দোকান মালিক পোর্টাল" : "Shop Owner Portal"}</span>
          </Link>

          <div className="flex gap-1 rounded-full bg-slate-800/80 border border-slate-700 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setLang("bn")}
              className={`px-2.5 py-0.5 rounded-full transition-all ${
                lang === "bn" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              বাংলা
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-2.5 py-0.5 rounded-full transition-all ${
                lang === "en" ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              EN
            </button>
          </div>
        </div>

        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 shadow-lg shadow-indigo-500/20 backdrop-blur-md mb-0.5">
            <UserCheck className="size-6 text-indigo-400" />
          </div>
          <div className="flex items-center justify-center">
            <Badge variant="outline" className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 text-[11px] px-2.5 py-0.5 rounded-full font-mono">
              STAFF & EMPLOYEE ACCESS
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {lang === "bn" ? "কর্মচারী পোর্টাল" : "Employee Portal"}
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {mode === "signin"
              ? (lang === "bn" ? "দোকান মালিক কর্তৃক প্রদত্ত ইউজারনেম/মোবাইল দিয়ে লগইন করুন" : "Sign in with the employee credentials assigned by your shop owner")
              : (lang === "bn" ? "কর্মচারী হিসেবে নতুন অ্যাকাউন্ট তৈরি করুন" : "Register a new employee account")}
          </p>
        </div>

        <Card className="p-5 sm:p-7 rounded-3xl bg-slate-900/85 border-slate-800 backdrop-blur-xl shadow-2xl space-y-4 text-slate-200">
          {/* Sub-tab: Sign In vs Sign Up */}
          <div className="flex rounded-xl bg-slate-800/80 p-0.5 border border-slate-700 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                mode === "signin" ? "bg-indigo-600 text-white font-bold shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              {lang === "bn" ? "লগইন করুন" : "Sign In"}
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                mode === "signup" ? "bg-indigo-600 text-white font-bold shadow-xs" : "text-slate-400 hover:text-white"
              }`}
            >
              {lang === "bn" ? "নতুন একাউন্ট" : "Sign Up"}
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Smartphone className="size-3.5 text-indigo-400" />
                  {lang === "bn" ? "ইউজারনেম, মোবাইল বা ইমেইল" : "Username, Phone or Email"}
                </Label>
                <Input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={lang === "bn" ? "মোবাইল নম্বর বা ইমেইল" : "Phone or Email"}
                  required
                  className="h-11 sm:h-12 rounded-xl bg-slate-800/90 border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Lock className="size-3.5 text-indigo-400" />
                    {lang === "bn" ? "পাসওয়ার্ড" : "Password"}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    <span>{showPassword ? (lang === "bn" ? "লুকান" : "Hide") : (lang === "bn" ? "দেখান" : "Show")}</span>
                  </button>
                </div>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="h-11 sm:h-12 rounded-xl bg-slate-800/90 border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 sm:h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] gap-2 mt-1 cursor-pointer"
              >
                {busy ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <>
                    <span>{lang === "bn" ? "লগইন করুন" : "Sign In as Employee"}</span>
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="size-3.5 text-indigo-400" />
                  {lang === "bn" ? "পুরো নাম" : "Full Name"}
                </Label>
                <Input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={lang === "bn" ? "পুরো নাম" : "Full name"}
                  required
                  className="h-11 sm:h-12 rounded-xl bg-slate-800/90 border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Smartphone className="size-3.5 text-indigo-400" />
                  {lang === "bn" ? "মোবাইল নম্বর অথবা ইমেইল এড্রেস" : "Phone Number or Email"}
                </Label>
                <Input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={lang === "bn" ? "মোবাইল নম্বর বা ইমেইল" : "Phone or Email"}
                  required
                  className="h-11 sm:h-12 rounded-xl bg-slate-800/90 border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 w-full"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Lock className="size-3.5 text-indigo-400" />
                    {lang === "bn" ? "পাসওয়ার্ড" : "Password"}
                  </Label>
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    {showNewPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    <span>{showNewPassword ? (lang === "bn" ? "লুকান" : "Hide") : (lang === "bn" ? "দেখান" : "Show")}</span>
                  </button>
                </div>
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-11 sm:h-12 rounded-xl bg-slate-800/90 border-slate-700 text-xs sm:text-sm text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 w-full"
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 sm:h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.98] gap-2 mt-1"
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
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="relative text-center">
              <span className="bg-slate-900 px-2 text-[10px] text-slate-500 uppercase tracking-wider relative z-10">
                {lang === "bn" ? "অথবা গুগল দিয়ে লগইন" : "Or Continue With"}
              </span>
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={googleBusy}
              className="w-full h-11 sm:h-12 rounded-xl border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 text-white font-semibold text-xs sm:text-sm gap-2.5 shadow-sm"
            >
              {googleBusy ? (
                <RefreshCw className="size-4 animate-spin text-indigo-400" />
              ) : (
                <svg version="1.1" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4 shrink-0">
                  <path style={{ fill: "#FBBB00" }} d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z"></path>
                  <path style={{ fill: "#518EF8" }} d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z"></path>
                  <path style={{ fill: "#28B446" }} d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z"></path>
                  <path style={{ fill: "#F14336" }} d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z"></path>
                </svg>
              )}
              <span>{lang === "bn" ? "গুগল দিয়ে সাইন ইন করুন" : "Continue with Google"}</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function EmployeeLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-white text-sm">Loading Employee Portal...</div>}>
      <EmployeeLoginForm />
    </Suspense>
  );
}
