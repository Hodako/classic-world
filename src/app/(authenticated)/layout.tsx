"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SpeedLoader } from "@/components/speed-loader";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, PhoneCall, MessageCircle, LogOut, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { lang } = useT();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return <SpeedLoader />;
  }

  // Account Frozen / Banned Screen
  if (user.status === "frozen" || user.status === "banned" || user.status === "suspended") {
    const adminWhatsapp = user.admin_whatsapp || "8801700000000";
    const cleanNumber = adminWhatsapp.replace(/[^0-9]/g, "");
    const waText = encodeURIComponent(
      `Hello Admin, my account for shop "${user.business_name || "My Shop"}" (${user.email}) is currently frozen. I have purchased / renewed my subscription. Please unfreeze my account.`
    );
    const waUrl = `https://wa.me/${cleanNumber.startsWith("88") ? cleanNumber : `880${cleanNumber}`}?text=${waText}`;

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-background/95 backdrop-blur-md">
        <Card className="glass-card w-full max-w-lg p-6 sm:p-8 space-y-6 border-red-500/30 shadow-2xl text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 size-36 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 size-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="mx-auto size-16 sm:size-20 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500 shadow-inner">
            <Lock className="size-8 sm:size-10 animate-bounce" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              {lang === "bn" ? "একাউন্ট স্থগিত করা হয়েছে" : "Account Suspended / Frozen"}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {lang === "bn"
                ? `আপনার শপ "${user.business_name}" এর একাউন্ট সাময়িকভাবে স্থগিত করা হয়েছে।`
                : `Your account for "${user.business_name}" is temporarily frozen.`}
            </p>
          </div>

          {/* Freeze Reason Box */}
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-500 uppercase tracking-wider">
              <ShieldAlert className="size-4 shrink-0" />
              {lang === "bn" ? "স্থগিতের কারণ / সাবস্ক্রিপশন" : "Reason / Subscription Status"}
            </div>
            <p className="text-sm text-foreground font-medium">
              {user.frozen_reason || (lang === "bn" ? "সাবস্ক্রিপশন ফি বা অ্যাকাউন্টের তথ্যের জন্য যোগাযোগ প্রয়োজন।" : "Subscription renewal required. Please contact admin to unfreeze.")}
            </p>
            {user.subscription_expires_at && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-red-500/10">
                {lang === "bn" ? "মেয়াদ উত্তীর্ণের তারিখ:" : "Subscription Expired:"} {new Date(user.subscription_expires_at).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Contact Admin Options */}
          <div className="space-y-3 pt-2">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg hover:shadow-emerald-500/25 transition-all text-sm sm:text-base cursor-pointer"
            >
              <MessageCircle className="size-5 fill-current" />
              {lang === "bn" ? "হোয়াটসঅ্যাপে আনফ্রিজ রিকোয়েস্ট পাঠান" : "Request Unfreeze via WhatsApp"}
            </a>

            <div className="flex gap-2">
              <a
                href={`tel:${adminWhatsapp}`}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-muted/60 hover:bg-muted border border-border text-foreground font-medium text-xs sm:text-sm transition-all"
              >
                <PhoneCall className="size-4 text-primary" />
                {lang === "bn" ? "অ্যাডমিনকে কল করুন" : "Call Admin"}
              </a>
              <Button
                variant="outline"
                onClick={() => logout()}
                className="flex-1 gap-2 rounded-xl text-xs sm:text-sm"
              >
                <LogOut className="size-4" />
                {lang === "bn" ? "লগআউট" : "Logout"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}
