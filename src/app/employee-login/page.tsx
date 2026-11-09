"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, Smartphone, Store, ShieldCheck, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import Link from "next/link";
import { EmployeeDeviceCodeForm } from "@/components/employee-device-link";

function EmployeeLoginForm() {
  const { lang, setLang } = useT();
  const router = useRouter();
  const { login } = useAuth();

  function afterAuth(u: AuthUser | null, token?: string) {
    if (!u) {
      toast.error(lang === "bn" ? "লগইন ব্যর্থ হয়েছে" : "Authentication failed");
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem("app_pin_unlocked", "true");
    }
    login(u, token);
    router.push("/dashboard");
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
              STAFF CODE ACCESS ONLY
            </Badge>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {lang === "bn" ? "কর্মচারী পোর্টাল" : "Employee Portal"}
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {lang === "bn"
              ? "দোকান মালিক কর্তৃক প্রদত্ত ডিভাইস লিংক কোড দিয়ে সরাসরি লগইন করুন"
              : "Sign in using the device pairing code issued by your shop owner"}
          </p>
        </div>

        <Card className="p-5 sm:p-7 rounded-3xl bg-slate-900/85 border-slate-800 backdrop-blur-xl shadow-2xl space-y-4 text-slate-200">
          <EmployeeDeviceCodeForm onLinked={afterAuth} />

          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-3.5 space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-indigo-300">
              <KeyRound className="size-4 text-indigo-400 shrink-0" />
              <span>{lang === "bn" ? "কোড কীভাবে পাবেন?" : "How to get a code?"}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {lang === "bn"
                ? "কর্মচারীদের আলাদা কোনো ইমেইল রেজিস্ট্রেশনের প্রয়োজন নেই। দোকান মালিক তার ড্যাশবোর্ডের 'কর্মচারী হাব' থেকে কোড জেনারেট করে দেবেন।"
                : "Staff members do not need individual email accounts. Ask your shop owner to issue a link code from their Employee Hub."}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 text-center">
            <Link
              href="/auth"
              className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline font-medium inline-flex items-center gap-1.5"
            >
              <Store className="size-3.5" />
              <span>{lang === "bn" ? "দোকান মালিক? মালিক অ্যাকাউন্ট দিয়ে লগইন করুন" : "Store Owner? Sign in to Owner Account"}</span>
            </Link>
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
