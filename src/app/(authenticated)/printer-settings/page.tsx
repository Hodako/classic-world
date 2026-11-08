"use client";

import { useT } from "@/lib/i18n";
import { PosHardwareSettings } from "@/components/pos-hardware-settings";
import { Button } from "@/components/ui/button";
import { Printer, Barcode, FileText, ArrowLeft, Sliders, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function PrinterSettingsPage() {
  const { lang } = useT();

  return (
    <div className="p-3 sm:p-5 max-w-6xl mx-auto space-y-4">
      {/* Top Header */}
      <div className="bg-card border border-border/80 p-3 sm:p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="size-8 rounded-xl">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Printer className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold font-charukola text-foreground">
                {lang === "bn" ? "প্রিন্টার ও প্রিন্টিং সেটিংস" : "Printer & Hardware Settings"}
              </h1>
              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold">
                POS Ready
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-balooda">
              {lang === "bn"
                ? "থার্মাল প্রিন্টার (৫৮মিমি, ৮০মিমি, এ৪), অটো সাইলেন্ট প্রিন্ট, পেজ মার্জিন ও হার্ডওয়্যার কনফিগারেশন"
                : "Thermal receipt printers (58mm, 80mm, A4), silent auto-print, margins & POS hardware"}
            </p>
          </div>
        </div>

        {/* Action Shortcuts */}
        <div className="flex items-center gap-2">
          <Link href="/labels">
            <Button size="sm" variant="outline" className="h-8.5 rounded-xl text-xs font-bold gap-1.5 border-border">
              <Barcode className="size-3.5 text-primary" />
              <span>{lang === "bn" ? "লেবেল প্রিন্টার" : "Label Studio"}</span>
            </Button>
          </Link>
          <Link href="/invoices">
            <Button size="sm" variant="outline" className="h-8.5 rounded-xl text-xs font-bold gap-1.5 border-border">
              <FileText className="size-3.5 text-primary" />
              <span>{lang === "bn" ? "ইনভয়েস সমূহ" : "Invoices"}</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Hardware Settings Component */}
      <PosHardwareSettings lang={lang} />
    </div>
  );
}
