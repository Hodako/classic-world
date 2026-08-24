"use client";

import React, { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AppLogo } from "@/components/app-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  KeyRound,
  ArrowLeft,
  Mail,
  CheckCircle2,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const { lang, setLang } = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error(
        lang === "bn"
          ? "আপনার নিবন্ধিত ইমেইল এড্রেস লিখুন"
          : "Please enter your registered email address"
      );
      return;
    }

    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSent(true);
      toast.success(
        lang === "bn"
          ? "পাসওয়ার্ড রিসেট লিংক আপনার ইমেইলে পাঠানো হয়েছে!"
          : "Password reset link sent to your email!"
      );
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        toast.error(
          lang === "bn"
            ? "এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি"
            : "No user account found with this email"
        );
      } else if (err.code === "auth/invalid-email") {
        toast.error(
          lang === "bn"
            ? "সঠিক ইমেইল এড্রেস প্রদান করুন"
            : "Invalid email address format"
        );
      } else {
        toast.error(err.message || "Failed to send password reset email");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col justify-between bg-slate-50 dark:bg-zinc-950 text-foreground p-4 sm:p-6 lg:p-8">
      {/* Top Bar */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-between">
        <Link
          href="/auth"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          <span>{lang === "bn" ? "লগইন পেইজে ফিরুন" : "Back to Sign In"}</span>
        </Link>

        <div className="flex gap-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-0.5 text-xs shadow-2xs">
          <button
            type="button"
            onClick={() => setLang("bn")}
            className={`px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${
              lang === "bn"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-zinc-900 font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            বাংলা
          </button>
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`px-3 py-1 rounded-full cursor-pointer font-medium transition-all ${
              lang === "en"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-zinc-900 font-bold shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            EN
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md mx-auto my-auto py-6">
        <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-2">
            <AppLogo size="md" alt="Classic World" />
            <h1 className="text-xl sm:text-2xl font-bold font-serif text-slate-900 dark:text-zinc-100 tracking-tight">
              {lang === "bn" ? "পাসওয়ার্ড রিসেট করুন" : "Reset Password"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-xs leading-relaxed">
              {lang === "bn"
                ? "আপনার নিবন্ধিত ইমেইল এড্রেস দিন। আমরা আপনার পাসওয়ার্ড রিসেট করার নিরাপদ লিংক পাঠিয়ে দেব।"
                : "Enter your registered email address to receive a secure password reset link."}
            </p>
          </div>

          {sent ? (
            <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-sm text-emerald-950 dark:text-emerald-200">
                    {lang === "bn"
                      ? "ইমেইল সফলভাবে পাঠানো হয়েছে!"
                      : "Reset Email Dispatched!"}
                  </p>
                  <p className="text-emerald-800 dark:text-emerald-300/90 leading-relaxed">
                    {lang === "bn"
                      ? `${email} ঠিকানায় পাসওয়ার্ড রিসেট লিংক পাঠানো হয়েছে। ইনবক্স এবং স্প্যাম ফোল্ডার চেক করুন।`
                      : `A password recovery link has been sent to ${email}. Please check your inbox and spam folder.`}
                  </p>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
                <Button
                  type="button"
                  onClick={() => setSent(false)}
                  variant="outline"
                  className="w-full h-10 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/50"
                >
                  {lang === "bn"
                    ? "অন্য ইমেইল দিয়ে চেষ্টা করুন"
                    : "Try Another Email"}
                </Button>
                <Link href="/auth" className="block w-full">
                  <Button className="w-full h-10 rounded-xl text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:bg-slate-800">
                    {lang === "bn"
                      ? "লগইন পেইজে ফিরে যান"
                      : "Return to Sign In"}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Mail className="size-3.5 text-slate-400" />
                  <span>
                    {lang === "bn"
                      ? "নিবন্ধিত ইমেইল এড্রেস"
                      : "Registered Email Address"}
                  </span>
                </Label>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. owner@gmail.com"
                  className="h-11 sm:h-12 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm px-3.5 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-slate-400 w-full shadow-2xs"
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full h-11 sm:h-12 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold text-xs sm:text-sm shadow-md hover:bg-slate-800 transition-all active:scale-[0.98] gap-2 cursor-pointer"
              >
                {busy ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="size-4" />
                    <span>
                      {lang === "bn"
                        ? "রিসেট লিংক পাঠান"
                        : "Send Reset Link"}
                    </span>
                  </>
                )}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href="/auth"
                  className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-medium hover:underline"
                >
                  {lang === "bn"
                    ? "পাসওয়ার্ড মনে আছে? লগইন করুন"
                    : "Remember your password? Sign in"}
                </Link>
              </div>
            </form>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-slate-400" />
              <span>{lang === "bn" ? "নিরাপদ এনক্রিপশন" : "Secure Recovery"}</span>
            </span>
            <a
              href="https://wa.me/8801783501427"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1 text-slate-600 dark:text-slate-400"
            >
              <HelpCircle className="size-3.5" />
              <span>{lang === "bn" ? "সহায়তা প্রয়োজন?" : "Need Help?"}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full text-center text-xs text-slate-400 dark:text-zinc-600 py-2">
        <span>© 2026 Classic World. All rights reserved.</span>
      </div>
    </div>
  );
}
