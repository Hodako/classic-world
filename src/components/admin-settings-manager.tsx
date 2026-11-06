"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sliders,
  Lock,
  Store,
  Printer,
  Shield,
  Download,
  Save,
  CheckCircle2,
  RefreshCw,
  Key,
  Database,
  Building,
  Phone,
  Mail,
  MapPin,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getBusinessSettingsFn,
  updateBusinessSettingsFn,
  changeSuperAdminPasswordFn,
} from "@/lib/rpc-admin";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function AdminSettingsManager() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-business-settings"],
    queryFn: getBusinessSettingsFn,
  });

  // Master Admin Password states
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);

  // Business settings state
  const [bizName, setBizName] = useState("Classic World");
  const [ownerName, setOwnerName] = useState("Azizul Hakim");
  const [phone, setPhone] = useState("01700000000");
  const [email, setEmail] = useState("info@classicworld.com");
  const [address, setAddress] = useState("Dhaka, Bangladesh");
  const [defaultPin, setDefaultPin] = useState("1234");
  const [invoiceHeader, setInvoiceHeader] = useState("Classic World Fashion & POS");
  const [invoiceFooter, setInvoiceFooter] = useState("ধন্যবাদ! আবার আসবেন। পরিবর্তনের জন্য মেমো সাথে আনুন।");
  const [invoiceFontSize, setInvoiceFontSize] = useState("22px");
  const [invoiceScale, setInvoiceScale] = useState("100%");
  const [autoPrint, setAutoPrint] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [defaultPrivacyMask, setDefaultPrivacyMask] = useState(true);
  const [bizSaving, setBizSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (settingsQuery.data?.business) {
      const b = settingsQuery.data.business as any;
      setBizName(b.name || "Classic World");
      setOwnerName(b.owner_name || "Azizul Hakim");
      setPhone(b.phone_numbers || "01700000000");
      setEmail(b.emails || "info@classicworld.com");
      setAddress(b.address || "Dhaka, Bangladesh");
      setDefaultPin(b.default_staff_pin || "1234");
      setInvoiceHeader(b.invoice_header || "Classic World Fashion & POS");
      setInvoiceFooter(b.invoice_terms || "ধন্যবাদ! আবার আসবেন। পরিবর্তনের জন্য মেমো সাথে আনুন।");
      setInvoiceFontSize(b.invoice_font_size || "22px");
      setInvoiceScale(b.invoice_scale || "100%");
      setAutoPrint(Boolean(b.auto_print_receipt));
      setSoundEnabled(b.sound_enabled ?? true);
      setDefaultPrivacyMask(b.default_privacy_mask ?? true);
    }
  }, [settingsQuery.data]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass || newPass.length < 6) {
      toast.error("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("নতুন পাসওয়ার্ড ও নিশ্চিতকরণ মিলছে না");
      return;
    }

    setPassBusy(true);
    try {
      await changeSuperAdminPasswordFn({
        currentPassword: currentPass,
        newPassword: newPass,
      });
      toast.success("এডমিন মাস্টার পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে!");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err: any) {
      toast.error(err.message || "পাসওয়ার্ড পরিবর্তনে ব্যর্থ হয়েছে");
    } finally {
      setPassBusy(false);
    }
  };

  const handleSaveBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBizSaving(true);
    try {
      await updateBusinessSettingsFn({
        name: bizName.trim(),
        owner_name: ownerName.trim(),
        phone_numbers: phone.trim(),
        emails: email.trim(),
        address: address.trim(),
        default_staff_pin: defaultPin.trim(),
        invoice_header: invoiceHeader.trim(),
        invoice_terms: invoiceFooter.trim(),
        invoice_font_size: invoiceFontSize,
        invoice_scale: invoiceScale,
        auto_print_receipt: autoPrint,
        sound_enabled: soundEnabled,
        default_privacy_mask: defaultPrivacyMask,
      });
      toast.success("স্টোর সেটিংস সফলভাবে সংরক্ষিত হয়েছে!");
      qc.invalidateQueries({ queryKey: ["admin-business-settings"] });
    } catch (err: any) {
      toast.error(err.message || "সেটিংস সংরক্ষণ ব্যর্থ হয়েছে");
    } finally {
      setBizSaving(false);
    }
  };

  const handleExportFullDatabase = async () => {
    setExporting(true);
    try {
      const collectionsToExport = ["products", "sales", "customers", "expenses", "employees", "divisions", "blogs"];
      const backupData: Record<string, any[]> = {};

      for (const colName of collectionsToExport) {
        try {
          const snap = await getDocs(collection(db, colName));
          backupData[colName] = [];
          snap.forEach((doc) => {
            backupData[colName].push({ id: doc.id, ...doc.data() });
          });
        } catch (_) {
          backupData[colName] = [];
        }
      }

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `classic-world-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("সম্পূর্ণ ডেটাবেস ব্যাকআপ সফলভাবে ডাউনলোড হয়েছে!");
    } catch (err: any) {
      toast.error("ব্যাকআপ তৈরিতে সমস্যা হয়েছে: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* ── Store Identity & POS Settings ── */}
      <Card className="p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
              <Store className="size-5 text-primary" />
              স্টোর ব্র্যান্ডিং ও মূল কনফিগারেশন (Store Settings)
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              দোকানের নাম, যোগাযোগের তথ্য, মেমো ফরম্যাট ও সার্বিক সেটিংস পরিবর্তন করুন
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => settingsQuery.refetch()}
            className="text-xs h-8 rounded-xl gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            <span>রিফ্রেশ</span>
          </Button>
        </div>

        <form onSubmit={handleSaveBusinessSettings} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Building className="size-3.5 text-primary" /> প্রতিষ্ঠানের নাম (Store Name) *
              </Label>
              <Input
                required
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Store className="size-3.5 text-primary" /> স্বত্বাধিকারীর নাম (Owner Name)
              </Label>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Phone className="size-3.5 text-emerald-500" /> যোগাযোগের ফোন নম্বর
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="size-3.5 text-blue-500" /> ইমেইল ঠিকানা
              </Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <MapPin className="size-3.5 text-rose-500" /> শোরুমের পূর্ণ ঠিকানা (Showroom Address)
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="rounded-xl text-xs h-9"
            />
          </div>

          {/* Thermal Receipt Settings */}
          <div className="space-y-3 pt-2 border-t border-border/60">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <Printer className="size-3.5 text-purple-500" /> থার্মাল রসিদ ও প্রিন্টিং কনফিগারেশন
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">রসিদের হেডার টেক্সট</Label>
                <Input
                  value={invoiceHeader}
                  onChange={(e) => setInvoiceHeader(e.target.value)}
                  className="rounded-xl text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">ডিফল্ট স্টাফ লগইন পিন (Default Staff PIN)</Label>
                <Input
                  value={defaultPin}
                  onChange={(e) => setDefaultPin(e.target.value)}
                  className="rounded-xl text-xs h-9 font-mono font-bold"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">রসিদের নিচের শর্তাবলী ও বার্তা (Footer Terms)</Label>
              <Textarea
                rows={2}
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                className="rounded-xl text-xs leading-relaxed"
              />
            </div>

            {/* Toggle Switches */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <Label className="text-xs font-medium cursor-pointer" htmlFor="toggle-autoprint">
                  বিক্রির পর স্বয়ংক্রিয় প্রিন্ট
                </Label>
                <input
                  id="toggle-autoprint"
                  type="checkbox"
                  checked={autoPrint}
                  onChange={(e) => setAutoPrint(e.target.checked)}
                  className="size-4 rounded accent-primary cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <Label className="text-xs font-medium cursor-pointer" htmlFor="toggle-sounds">
                  ক্যাশ ও বাটন সাউন্ড ইফেক্ট
                </Label>
                <input
                  id="toggle-sounds"
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="size-4 rounded accent-primary cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                <Label className="text-xs font-medium cursor-pointer" htmlFor="toggle-privacy">
                  ডিফল্ট ব্যালেন্স লুকানো (Privacy)
                </Label>
                <input
                  id="toggle-privacy"
                  type="checkbox"
                  checked={defaultPrivacyMask}
                  onChange={(e) => setDefaultPrivacyMask(e.target.checked)}
                  className="size-4 rounded accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-border/60">
            <Button
              type="submit"
              disabled={bizSaving}
              className="text-xs h-9 px-6 rounded-xl beveled-button font-bold gap-1.5"
            >
              <Save className="size-3.5" />
              <span>{bizSaving ? "সংরক্ষণ হচ্ছে..." : "স্টোর সেটিংস সংরক্ষণ করুন"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Master Admin Password Change ── */}
      <Card className="p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
            <Lock className="size-5 text-amber-500" />
            এডমিন মাস্টার পাসওয়ার্ড পরিবর্তন (Change Super Admin Password)
          </h3>
          <p className="text-xs text-muted-foreground">
            এই কেন্দ্রীয় অ্যাডমিন প্যানেলে লগইন করার মাস্টার পাসওয়ার্ড ডেটাবেসে পরিবর্তন করুন
          </p>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">বর্তমান পাসওয়ার্ড</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)</Label>
              <Input
                type="password"
                placeholder="নতুন পাসওয়ার্ড"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">নতুন পাসওয়ার্ড নিশ্চিত করুন</Label>
              <Input
                type="password"
                placeholder="আবার লিখুন"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={passBusy}
              className="text-xs h-9 px-6 rounded-xl beveled-button font-bold gap-1.5"
            >
              <Key className="size-3.5" />
              <span>{passBusy ? "আপডেট হচ্ছে..." : "পাসওয়ার্ড আপডেট করুন"}</span>
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Database Backup & Export ── */}
      <Card className="p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-bold flex items-center gap-2 text-foreground">
              <Database className="size-5 text-emerald-500" />
              ডেটাবেস ব্যাকআপ ও এক্সপোর্ট (Full Database Backup)
            </h3>
            <p className="text-xs text-muted-foreground">
              আপনার ক্লাউড ফায়ারস্টোর ডেটাবেসের সকল পণ্য, বিক্রয়, কাস্টমার, খরচ ও ব্লগের একক JSON ব্যাকআপ ডাউনলোড করুন
            </p>
          </div>

          <Button
            onClick={handleExportFullDatabase}
            disabled={exporting}
            className="text-xs h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-1.5"
          >
            <Download className="size-4" />
            <span>{exporting ? "তৈরি হচ্ছে..." : "JSON ব্যাকআপ ডাউনলোড"}</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
