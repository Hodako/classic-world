"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  getBusinessSettingsFn,
  updateBusinessSettingsFn,
  removeEmployeeFn,
} from "@/lib/rpc-admin";
import Link from "next/link";
import {
  Trash2,
  Lock,
  Unlock,
  ShieldAlert,
  Database,
  FileSpreadsheet,
  RefreshCw,
  AlertTriangle,
  Printer,
  Store,
  Sparkles,
  ExternalLink,
  Plus,
  Mail,
  UserPlus,
  Users,
  Shield,
  Clock,
  CheckCircle,
} from "lucide-react";
import { getPosPaperConfig, savePosPaperConfig, DEFAULT_POS_CONFIG, type PosPaperSettings } from "@/lib/pos-print";
import { DEFAULT_EMPLOYEE_PERMISSIONS, type PermissionSet } from "@/lib/permissions";
import {
  uploadImageFn,
  verifyOwnerPasswordFn,
  emptyCashboxFn,
  resetProductsFn,
  resetSalesFn,
  resetPurchasesFn,
  resetAllDataFn,
  bulkExportToGoogleSheetsFn,
  resetSomitiFn,
  resetExpensesFn,
  resetPartiesFn,
  changeMyPasswordFn,
  connectGoogleSheetsOAuthFn,
  disconnectGoogleSheetsFn,
  sendEmployeeInvitationFn,
  listEmployeeInvitationsFn,
  cancelEmployeeInvitationFn,
} from "@/lib/rpc";
import { auth } from "@/lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useTheme, type ThemeMode, type AccentColor, type BgStyle } from "@/hooks/use-theme";
import { SpeedLoader } from "@/components/speed-loader";
import { useIsMobile } from "@/hooks/use-mobile";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

const BUSINESS_TYPES = ["retail", "wholesale", "fashion", "grocery", "services"];

type SettingsTab = "profile" | "printing" | "sheets" | "staff" | "appearance" | "security";

export default function SettingsPage() {
  const { lang, t } = useT();
  const { user, refresh } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, bgStyle, setBgStyle } = useTheme();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  
  const settings = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const invitations = useQuery({ queryKey: ["employee-invitations"], queryFn: listEmployeeInvitationsFn });

  const [busy, setBusy] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  // Invite Employee Form State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteDesignation, setInviteDesignation] = useState("Sales Staff");
  const [inviteSending, setInviteSending] = useState(false);

  // KPI Configuration state
  const [kpiConfig, setKpiConfig] = useState({
    align: "left",
    size: "small",
    columns: 2,
    variant: "glass",
    shadow: "glow",
    borderStyle: "subtle",
    curve: "none",
  });

  useEffect(() => {
    const saved = localStorage.getItem("hz_kpi_config");
    if (saved) {
      try {
        setKpiConfig(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // POS Thermal Printer Paper Configuration state
  const [posConfig, setPosConfig] = useState<PosPaperSettings>(DEFAULT_POS_CONFIG);

  useEffect(() => {
    setPosConfig(getPosPaperConfig());
  }, []);

  const updatePosConfig = (updates: Partial<PosPaperSettings>) => {
    const updated = savePosPaperConfig(updates);
    setPosConfig(updated);
    toast.success(lang === "bn" ? "প্রিন্টার পেপার সাইজ সংরক্ষিত হয়েছে!" : "POS Printer Paper Settings Saved!");
  };

  const updateKpiConfig = (newSettings: Partial<typeof kpiConfig>) => {
    setKpiConfig(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem("hz_kpi_config", JSON.stringify(updated));
      window.dispatchEvent(new Event("hz-kpi-config-updated"));
      toast.success(t("save") || "Saved!");
      return updated;
    });
  };

  // Safety settings states
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Sheets sync states
  const [isSheetsSaving, setIsSheetsSaving] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  // Reset states
  const [resetType, setResetType] = useState<"cashbox" | "products" | "sales" | "purchases" | "somiti" | "expenses" | "parties" | "all" | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const [pwBusy, setPwBusy] = useState(false);

  const biz = settings.data?.business;
  const isOwner = settings.data?.role === "owner";

  const [logoUrl, setLogoUrl] = useState("");
  const [fontSize, setFontSize] = useState("22px");
  const [fontScale, setFontScale] = useState("100%");
  const [lineSpacing, setLineSpacing] = useState("6px");

  useEffect(() => {
    if (biz?.logo_url) {
      setLogoUrl(biz.logo_url);
    }
    if (biz?.invoice_font_size) {
      setFontSize(biz.invoice_font_size);
    }
    if (biz?.invoice_scale) {
      setFontScale(biz.invoice_scale);
    }
    if (biz?.invoice_line_spacing) {
      setLineSpacing(biz.invoice_line_spacing);
    }
  }, [biz?.logo_url, biz?.invoice_font_size, biz?.invoice_scale, biz?.invoice_line_spacing]);

  // Cropper states
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropImageName, setCropImageName] = useState<string>("");
  const [cropImageType, setCropImageType] = useState<string>("image/png");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ width: 256, height: 256 });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const [touchDragStart, setTouchDragStart] = useState({ x: 0, y: 0 });
  const [touchPanStart, setTouchPanStart] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;

    let w = 256;
    let h = 256;
    if (natW > natH) {
      w = (natW / natH) * 256;
    } else {
      h = (natH / natW) * 256;
    }

    setImgSize({ width: w, height: h });
    setPan({ x: (256 - w) / 2, y: (256 - h) / 2 });
    setZoom(1);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ x: pan.x, y: pan.y });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsTouchDragging(true);
    setTouchDragStart({ x: touch.clientX, y: touch.clientY });
    setTouchPanStart({ x: pan.x, y: pan.y });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan({ x: panStart.x + dx, y: panStart.y + dy });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchDragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchDragStart.x;
      const dy = touch.clientY - touchDragStart.y;
      setPan({ x: touchPanStart.x + dx, y: touchPanStart.y + dy });
    };

    const handleTouchEnd = () => {
      setIsTouchDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    if (isTouchDragging) {
      window.addEventListener("touchmove", handleTouchMove);
      window.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, dragStart, panStart, isTouchDragging, touchDragStart, touchPanStart]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setCropImageName(file.name);
    setCropImageType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !imageRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 256, 256);

    const img = imageRef.current;
    const renderedWidth = imgSize.width * zoom;
    const renderedHeight = imgSize.height * zoom;
    const drawX = pan.x;
    const drawY = pan.y;

    ctx.drawImage(img, drawX, drawY, renderedWidth, renderedHeight);

    const dataUrl = canvas.toDataURL(cropImageType || "image/png");
    const loadId = toast.loading("Uploading cropped logo...");
    try {
      const res: any = await uploadImageFn({ data: { base64: dataUrl, fileName: cropImageName || "logo.png" } });
      const url = res?.url || res?.data?.url;
      if (url) {
        setLogoUrl(url);
        await updateBusinessSettingsFn({
          data: { logo_url: url },
        });
        qc.invalidateQueries({ queryKey: ["business-settings"] });
        toast.success("Logo uploaded and updated successfully!", { id: loadId });
      } else {
        toast.error("Upload failed", { id: loadId });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image", { id: loadId });
    } finally {
      setCropImageSrc(null);
    }
  };

  async function saveBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await updateBusinessSettingsFn({
        data: {
          name: String(fd.get("name") || "").trim(),
          address: String(fd.get("address") || "").trim(),
          phone_numbers: String(fd.get("phone_numbers") || "").trim(),
          emails: String(fd.get("emails") || "").trim(),
          business_type: String(fd.get("business_type") || "retail").trim(),
          invoice_terms: String(fd.get("invoice_terms") || "").trim(),
          invoice_watermark: String(fd.get("invoice_watermark") || "").trim(),
          invoice_watermark_enabled: fd.get("invoice_watermark_enabled") === "on",
          logo_url: logoUrl || biz?.logo_url || "/logo.png",
        },
      });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      toast.success(lang === "bn" ? "দোকান প্রোফাইল সংরক্ষিত হয়েছে!" : "Business profile saved successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveInvoiceStyling(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner) return;
    setBusy(true);
    try {
      await updateBusinessSettingsFn({
        data: {
          invoice_font_size: fontSize,
          invoice_scale: fontScale,
          invoice_line_spacing: lineSpacing,
        },
      });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      toast.success(lang === "bn" ? "ইনভয়েস সেটিংস সংরক্ষিত হয়েছে!" : "Invoice settings saved successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUnlockLoading(true);
    try {
      await verifyOwnerPasswordFn({ data: { password: unlockPassword } });
      setIsUnlocked(true);
      setIsUnlockDialogOpen(false);
      setUnlockPassword("");
      toast.success("Safety settings unlocked successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Incorrect owner password.");
    } finally {
      setUnlockLoading(false);
    }
  }

  // Google OAuth Connect for Sheets
  async function handleConnectGoogleOAuth() {
    if (!isOwner) return;
    setIsSheetsSaving(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/spreadsheets");
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      const email = result.user?.email || undefined;

      if (!token) {
        const idToken = await result.user.getIdToken();
        await connectGoogleSheetsOAuthFn({
          data: {
            accessToken: idToken,
            googleEmail: email,
          },
        });
      } else {
        await connectGoogleSheetsOAuthFn({
          data: {
            accessToken: token,
            googleEmail: email,
          },
        });
      }

      toast.success(
        lang === "bn"
          ? "গুগল শিট সফলভাবে সংযুক্ত এবং সিঙ্ক হয়েছে!"
          : "Google Sheets successfully connected & synced with your Google account!"
      );
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to connect Google account for Sheets");
    } finally {
      setIsSheetsSaving(false);
    }
  }

  async function handleDisconnectGoogleSheets() {
    if (!isOwner) return;
    setIsSheetsSaving(true);
    try {
      await disconnectGoogleSheetsFn();
      toast.success(lang === "bn" ? "গুগল শিট সংযোগ বিচ্ছিন্ন করা হয়েছে" : "Google Sheets disconnected");
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to disconnect Google Sheets");
    } finally {
      setIsSheetsSaving(false);
    }
  }

  async function saveGoogleSheetsConfig(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner) return;
    const fd = new FormData(e.currentTarget);
    setIsSheetsSaving(true);
    try {
      await updateBusinessSettingsFn({
        data: {
          google_sheets_spreadsheet_id: String(fd.get("google_sheets_spreadsheet_id") || "").trim(),
          google_sheets_credentials_json: String(fd.get("google_sheets_credentials_json") || "").trim(),
        },
      });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      toast.success("Google Sheets config saved successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSheetsSaving(false);
    }
  }

  async function handleBulkExport() {
    if (!isOwner) return;
    setIsBulkExporting(true);
    try {
      await bulkExportToGoogleSheetsFn();
      toast.success("Successfully synchronized all data to Google Sheets!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBulkExporting(false);
    }
  }

  // Handle Sending Staff Invitation by Email
  async function handleSendStaffInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    if (!inviteEmail.trim()) {
      toast.error("Please enter employee email");
      return;
    }

    setInviteSending(true);
    try {
      await sendEmployeeInvitationFn({
        data: {
          email: inviteEmail.trim(),
          fullName: inviteName.trim() || undefined,
          designation: inviteDesignation,
          permissions: DEFAULT_EMPLOYEE_PERMISSIONS,
        },
      });
      toast.success(
        lang === "bn"
          ? `${inviteEmail} ঠিকানায় আমন্ত্রণ সফলভাবে পাঠানো হয়েছে!`
          : `Staff invitation successfully sent to ${inviteEmail}!`
      );
      setInviteEmail("");
      setInviteName("");
      qc.invalidateQueries({ queryKey: ["employee-invitations"] });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to send employee invitation");
    } finally {
      setInviteSending(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    try {
      await cancelEmployeeInvitationFn({ data: { invitationId } });
      toast.success("Invitation cancelled");
      qc.invalidateQueries({ queryKey: ["employee-invitations"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to cancel invitation");
    }
  }

  async function handleRemoveEmployee(employeeId: string) {
    if (!confirm("Are you sure you want to remove this employee from your shop?")) return;
    try {
      await removeEmployeeFn({ data: { employeeId } });
      toast.success("Staff access removed");
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove employee");
    }
  }

  async function handleResetAction() {
    if (!resetType || !isOwner) return;
    if (confirmText !== "CONFIRM") {
      toast.error("Please type CONFIRM to authorize the reset.");
      return;
    }
    setResetLoading(true);
    try {
      if (resetType === "cashbox") {
        await emptyCashboxFn();
        toast.success("Cashbox entries emptied successfully!");
      } else if (resetType === "products") {
        await resetProductsFn();
        toast.success("Products data reset successfully!");
      } else if (resetType === "sales") {
        await resetSalesFn();
        toast.success("Sales and Returns data reset successfully!");
      } else if (resetType === "purchases") {
        await resetPurchasesFn();
        toast.success("Purchases data reset successfully!");
      } else if (resetType === "somiti") {
        await resetSomitiFn();
        toast.success("Samity data reset successfully!");
      } else if (resetType === "expenses") {
        await resetExpensesFn();
        toast.success("Expenses data reset successfully!");
      } else if (resetType === "parties") {
        await resetPartiesFn();
        toast.success("Parties and Customer debts reset successfully!");
      } else if (resetType === "all") {
        await resetAllDataFn();
        toast.success("Factory Reset Complete: All business records cleared.");
      }
      setResetType(null);
      setConfirmText("");
      qc.invalidateQueries();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setResetLoading(false);
    }
  }

  async function handleUpdateMyPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("currentPassword") || "").trim();
    const newPassword = String(fd.get("newPassword") || "").trim();
    const confirmPassword = String(fd.get("confirmPassword") || "").trim();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setPwBusy(true);
    try {
      await changeMyPasswordFn({
        data: {
          currentPassword,
          newPassword,
        },
      });
      toast.success("Password changed successfully!");
      (e.target as HTMLFormElement).reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  }

  if (settings.isLoading) {
    return <SpeedLoader fullScreen={false} />;
  }

  const pendingInvites = (invitations.data || []).filter((inv: any) => inv.status === "pending");
  const activeEmployees = settings.data?.employees || [];

  const navTabs: { id: SettingsTab; label: string; icon: any; count?: number }[] = [
    { id: "profile", label: lang === "bn" ? "দোকান প্রোফাইল" : "Shop Profile", icon: Store },
    { id: "printing", label: lang === "bn" ? "প্রিন্ট ও ইনভয়েস" : "POS & Printing", icon: Printer },
    { id: "sheets", label: lang === "bn" ? "গুগল শিট ও ক্লাউড" : "Google Sheets & Cloud", icon: FileSpreadsheet },
    { id: "staff", label: lang === "bn" ? "কর্মচারী ও আমন্ত্রণ" : "Staff & Invitations", icon: Users, count: activeEmployees.length + pendingInvites.length },
    { id: "appearance", label: lang === "bn" ? "থিম ও ডিসপ্লে" : "Appearance & Themes", icon: Sparkles },
    { id: "security", label: lang === "bn" ? "নিরাপত্তা ও রিসেট" : "Security & Reset", icon: ShieldAlert },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
            <Store className="size-6 text-primary" />
            <span>{lang === "bn" ? "সিস্টেম সেটিংস ও কনফিগারেশন" : "System Settings & Business Hub"}</span>
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {lang === "bn"
              ? "দোকানের প্রোফাইল, প্রিন্টার ফরম্যাট, গুগল শিট ব্যাকআপ, কর্মচারী আমন্ত্রণ এবং নিরাপত্তা পরিচালনা করুন"
              : "Manage shop branding, thermal printing, Google Sheets sync, employee invitations, and database resets"}
          </p>
        </div>
      </div>

      {/* Modern Desktop Segmented Tab Bar */}
      <div className="flex items-center gap-1.5 p-1.5 bg-muted/60 dark:bg-muted/30 border border-border/80 rounded-2xl overflow-x-auto scrollbar-none shadow-xs">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <Icon className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {tab.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {isOwner && biz && (
        <div className="space-y-6">
          {/* ── TAB 1: SHOP PROFILE & BRANDING ──────────────────────────────── */}
          {settingsTab === "profile" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <Card className="lg:col-span-8 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Store className="size-4 text-primary" />
                      <span>{lang === "bn" ? "দোকানের মূল তথ্য" : "Business Profile & Contact"}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "bn" ? "দোকানের নাম, ঠিকানা এবং যোগাযোগের তথ্য পরিচালনা করুন" : "Manage company identity, phone numbers, and official address"}
                    </p>
                  </div>
                </div>

                <form onSubmit={saveBusiness} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Company / Shop Name</Label>
                      <Input name="name" defaultValue={biz.name} placeholder="Dream IT POS" className="h-10 rounded-xl text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Business Category</Label>
                      <select name="business_type" defaultValue={biz.business_type} className="w-full h-10 rounded-xl border border-input bg-input px-3 text-xs capitalize">
                        {BUSINESS_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Official Phone Number(s)</Label>
                      <Input name="phone_numbers" defaultValue={biz.phone_numbers} placeholder="+8801700000000" className="h-10 rounded-xl text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Official Email</Label>
                      <Input name="emails" defaultValue={biz.emails} placeholder="support@shop.com" className="h-10 rounded-xl text-xs" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Store Address</Label>
                    <Input name="address" defaultValue={biz.address} placeholder="Road #1, Block #A, Dhaka" className="h-10 rounded-xl text-xs" />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Invoice Terms & Policy (Shown on Printed Receipts)</Label>
                    <Textarea
                      name="invoice_terms"
                      defaultValue={biz.invoice_terms}
                      placeholder="e.g. Sold items can be exchanged within 7 days with original invoice."
                      className="text-xs min-h-[70px] rounded-xl"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border/80">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold">Invoice Background Watermark</Label>
                      <p className="text-[11px] text-muted-foreground">Print store watermark on PDF & Thermal receipts</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        name="invoice_watermark"
                        defaultValue={biz.invoice_watermark}
                        placeholder="e.g. PAID / ORIGINAL"
                        className="h-8 w-36 text-xs rounded-lg uppercase"
                      />
                      <Switch name="invoice_watermark_enabled" defaultChecked={biz.invoice_watermark_enabled} />
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button type="submit" disabled={busy} className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm">
                      {busy ? "Saving..." : "Save Business Profile"}
                    </Button>
                  </div>
                </form>
              </Card>

              {/* Shop Logo & Cropper Preview */}
              <Card className="lg:col-span-4 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4 flex flex-col items-center text-center">
                <div className="w-full border-b border-border/60 pb-3 text-left">
                  <h3 className="font-bold text-sm text-foreground">Official Store Logo</h3>
                  <p className="text-xs text-muted-foreground">Uploaded square logo appears on POS receipts and invoices</p>
                </div>

                <div className="size-36 rounded-2xl border border-border/80 bg-muted/40 p-2 flex items-center justify-center overflow-hidden shadow-inner relative group">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Store Logo" className="max-h-full max-w-full object-contain rounded-lg" />
                  ) : (
                    <Store className="size-12 text-muted-foreground/50" />
                  )}
                </div>

                <div className="w-full space-y-2">
                  <label className="block w-full">
                    <span className="sr-only">Choose Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="block w-full text-xs text-muted-foreground file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                    />
                  </label>
                  <p className="text-[10px] text-muted-foreground">Supports PNG, JPG, WEBP. Drag and zoom in the cropper modal.</p>
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB 2: POS PRINTING & INVOICE CUSTOMIZATION ───────────────────── */}
          {settingsTab === "printing" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <Card className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5 text-primary">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                      <Printer className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">POS Thermal Printer & Paper Size</h2>
                      <p className="text-xs text-muted-foreground">Configure receipt paper width, thermal margins, and typography</p>
                    </div>
                  </div>
                </div>

                {/* Paper Size Selector */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Receipt Paper Size</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { width: 58, label: "58 mm", desc: "Small POS" },
                      { width: 80, label: "80 mm", desc: "Standard POS (Recommended)" },
                      { width: 210, label: "A4 Page", desc: "Standard PDF Invoice" },
                    ].map((p) => {
                      const isSelected = posConfig.widthMm === p.width;
                      return (
                        <button
                          key={p.width}
                          type="button"
                          onClick={() => updatePosConfig({ widthMm: p.width })}
                          className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "bg-primary/10 border-primary text-primary shadow-xs"
                              : "bg-muted/30 border-border/80 text-foreground hover:bg-muted/60"
                          }`}
                        >
                          <p className="font-bold text-xs">{p.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Typography Controls */}
                <form onSubmit={saveInvoiceStyling} className="space-y-4 pt-2 border-t border-border/60">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Store Title Size</Label>
                      <select
                        value={fontSize}
                        onChange={e => setFontSize(e.target.value)}
                        className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                      >
                        <option value="18px">18px (Compact)</option>
                        <option value="20px">20px (Normal)</option>
                        <option value="22px">22px (Default)</option>
                        <option value="26px">26px (Large)</option>
                        <option value="30px">30px (Extra Large)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Receipt Scale</Label>
                      <select
                        value={fontScale}
                        onChange={e => setFontScale(e.target.value)}
                        className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                      >
                        <option value="90%">90% (Dense)</option>
                        <option value="100%">100% (Normal)</option>
                        <option value="110%">110% (Spacious)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Line Spacing</Label>
                      <select
                        value={lineSpacing}
                        onChange={e => setLineSpacing(e.target.value)}
                        className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                      >
                        <option value="4px">4px (Tight)</option>
                        <option value="6px">6px (Standard)</option>
                        <option value="8px">8px (Relaxed)</option>
                      </select>
                    </div>
                  </div>

                  <Button type="submit" disabled={busy} className="h-9 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm">
                    {busy ? "Saving..." : "Save Print Formatting"}
                  </Button>
                </form>
              </Card>

              {/* Receipt Preview */}
              <Card className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  <span>Live Receipt Preview ({posConfig.widthMm}mm)</span>
                </h3>
                
                <div className="p-4 rounded-2xl bg-white text-black font-mono text-[11px] border border-border shadow-xs space-y-2">
                  <div className="text-center space-y-0.5">
                    <p className="font-bold text-xs" style={{ fontSize }}>{biz.name || "Dream IT Shop"}</p>
                    <p className="text-[10px] text-gray-600">{biz.address || "Road #1, Dhaka"}</p>
                    <p className="text-[10px] text-gray-600">Mob: {biz.phone_numbers || "+8801700000000"}</p>
                  </div>
                  <div className="border-b border-dashed border-gray-400 my-1" />
                  <div className="flex justify-between text-[10px]">
                    <span>Inv: #INV-2026-001</span>
                    <span>Date: 23/08/2026</span>
                  </div>
                  <div className="border-b border-dashed border-gray-400 my-1" />
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span>1x Premium T-Shirt</span>
                      <span className="font-bold">৳850</span>
                    </div>
                    <div className="flex justify-between">
                      <span>2x Casual Denim Pants</span>
                      <span className="font-bold">৳2,400</span>
                    </div>
                  </div>
                  <div className="border-b border-dashed border-gray-400 my-1" />
                  <div className="flex justify-between font-bold text-xs">
                    <span>Total Amount:</span>
                    <span>৳3,250</span>
                  </div>
                  <div className="text-center text-[9px] text-gray-500 pt-1">
                    {biz.invoice_terms || "Thank you for shopping with us!"}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB 3: GOOGLE SHEETS & CLOUD SYNC ────────────────────────────── */}
          {settingsTab === "sheets" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <Card className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <FileSpreadsheet className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-foreground">
                          {lang === "bn" ? "গুগল শিট অটোমেটিক সিঙ্ক" : "Google Sheets Real-Time Sync"}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {lang === "bn" ? "গুগল অ্যাকাউন্টের মাধ্যমে ১-ক্লিকে শিট সংযুক্ত করুন" : "One-click connect with your Google account using Google OAuth"}
                        </p>
                      </div>
                    </div>
                    {biz.google_sheets_spreadsheet_id && (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-semibold">
                        {lang === "bn" ? "🟢 সক্রিয়" : "🟢 Active"}
                      </Badge>
                    )}
                  </div>

                  {/* Google OAuth One-Click Integration Box */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <svg className="size-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span className="font-bold text-xs sm:text-sm text-foreground">
                            {lang === "bn" ? "গুগল অ্যাকাউন্ট সাইন-ইন (Google OAuth)" : "Google Account Sign-In (OAuth)"}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {biz.google_sheets_connected_email
                            ? `Connected as ${biz.google_sheets_connected_email}`
                            : (lang === "bn"
                                ? "কোনো জটিল কি (JSON Key) ছাড়াই সরাসরি আপনার গুগল অ্যাকাউন্টের সাথে শিট তৈরি ও ব্যাকআপ করুন।"
                                : "Automatically creates and connects a Google Spreadsheet to your Google account.")}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {biz.google_sheets_connected_email || biz.has_google_auth ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={isSheetsSaving}
                            onClick={handleDisconnectGoogleSheets}
                            className="rounded-xl text-xs h-9 px-3"
                          >
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            disabled={isSheetsSaving}
                            onClick={handleConnectGoogleOAuth}
                            className="rounded-xl text-xs font-bold h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-2"
                          >
                            {isSheetsSaving ? (
                              <>
                                <RefreshCw className="size-3.5 animate-spin" />
                                <span>Connecting...</span>
                              </>
                            ) : (
                              <>
                                <svg className="size-3.5 fill-current" viewBox="0 0 24 24">
                                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                </svg>
                                <span>Connect with Google</span>
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {biz.google_sheets_spreadsheet_id && (
                      <div className="pt-2 border-t border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-foreground font-medium truncate">
                          <span className="text-muted-foreground">Spreadsheet ID:</span>
                          <span className="font-mono text-[11px] bg-background/80 px-2 py-0.5 rounded-md border border-border/60 truncate max-w-[200px]">
                            {biz.google_sheets_spreadsheet_id}
                          </span>
                        </div>
                        <a
                          href={`https://docs.google.com/spreadsheets/d/${biz.google_sheets_spreadsheet_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline shrink-0"
                        >
                          <span>Open in Google Sheets</span>
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Sync Controls & One-Click Export */}
                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      onClick={handleBulkExport}
                      disabled={isBulkExporting || !biz.google_sheets_spreadsheet_id}
                      className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2 flex-1 shadow-sm"
                    >
                      {isBulkExporting ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin" />
                          <span>Syncing Database to Google Sheets...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="size-3.5" />
                          <span>Sync All Existing Data Now</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Manual Configuration Fallback */}
                  <details className="text-xs group border border-border/60 rounded-2xl p-3 bg-muted/20">
                    <summary className="font-semibold cursor-pointer text-muted-foreground group-open:text-foreground flex items-center justify-between">
                      <span>Advanced: Manual Service Account Key (JSON)</span>
                      <span className="text-[10px] text-muted-foreground">Click to toggle</span>
                    </summary>
                    <form onSubmit={saveGoogleSheetsConfig} className="space-y-3 pt-3 mt-2 border-t border-border/40">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Custom Spreadsheet ID</Label>
                        <Input
                          name="google_sheets_spreadsheet_id"
                          defaultValue={biz.google_sheets_spreadsheet_id}
                          placeholder="1a2b3c4d5e6f7g..."
                          className="font-mono text-xs h-9 rounded-xl"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Service Account JSON</Label>
                        <Textarea
                          name="google_sheets_credentials_json"
                          defaultValue={biz.google_sheets_credentials_json}
                          placeholder='{ "type": "service_account", ... }'
                          className="font-mono text-xs min-h-[90px] rounded-xl"
                        />
                      </div>
                      <Button type="submit" disabled={isSheetsSaving} size="sm" className="rounded-xl h-8 px-4 text-xs font-semibold">
                        Save Manual Config
                      </Button>
                    </form>
                  </details>
                </Card>

                {/* Sync Status Info Card */}
                <Card className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                  <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Database className="size-4 text-primary" />
                    <span>Real-Time Sync Modules</span>
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    When Google Sheets is active, every transaction creates live rows in separate tabs in your spreadsheet automatically:
                  </p>

                  <div className="space-y-2 text-xs">
                    {[
                      { name: "Sales Tab", desc: "Customer invoices, sell prices, profits, and dues" },
                      { name: "Products Tab", desc: "Product catalog, stock levels, buy & sell prices" },
                      { name: "Purchases Tab", desc: "Stock restocks, supplier purchases & unit costs" },
                      { name: "Expenses Tab", desc: "Daily operational expenses and categorized notes" },
                      { name: "Cashbox Tab", desc: "Inflow / outflow cash transactions & running balance" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-xl bg-muted/40 border border-border/60">
                        <div className="size-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                        <div>
                          <span className="font-bold text-foreground">{item.name}:</span>{" "}
                          <span className="text-muted-foreground">{item.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* ── TAB 4: EMPLOYEE INVITATIONS & STAFF ACCESS ──────────────────── */}
          {settingsTab === "staff" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Send Employee Invitation Form */}
                <Card className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2.5 text-primary">
                      <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                        <UserPlus className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-foreground">
                          {lang === "bn" ? "নতুন কর্মচারী আমন্ত্রণ" : "Invite Employee by Email"}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {lang === "bn"
                            ? "কর্মচারীর ইমেইল দিয়ে আমন্ত্রণ পাঠান। তিনি লগইন করলেই একাউন্টে নোটিফিকেশন পাবেন।"
                            : "Enter staff email. When they log in or create an account, they get a joining popup."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <form onSubmit={handleSendStaffInvitation} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Employee Email Address *</Label>
                      <Input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="employee@gmail.com"
                        className="h-10 rounded-xl text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Full Name (Optional)</Label>
                        <Input
                          value={inviteName}
                          onChange={e => setInviteName(e.target.value)}
                          placeholder="e.g. Shakil Ahmed"
                          className="h-10 rounded-xl text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Role / Designation</Label>
                        <select
                          value={inviteDesignation}
                          onChange={e => setInviteDesignation(e.target.value)}
                          className="w-full h-10 rounded-xl border border-input bg-input px-3 text-xs"
                        >
                          <option value="Sales Staff">Sales Staff</option>
                          <option value="Cashier">Cashier</option>
                          <option value="Store Manager">Store Manager</option>
                          <option value="Inventory Officer">Inventory Officer</option>
                        </select>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={inviteSending || !inviteEmail.trim()}
                      className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xs gap-2 shadow-sm mt-2"
                    >
                      {inviteSending ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin" />
                          <span>Sending Invitation...</span>
                        </>
                      ) : (
                        <>
                          <Mail className="size-3.5" />
                          <span>{lang === "bn" ? "আমন্ত্রণ পাঠান" : "Send Staff Invitation"}</span>
                        </>
                      )}
                    </Button>
                  </form>
                </Card>

                {/* Pending Email Invitations */}
                <Card className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-amber-500" />
                      <h3 className="font-bold text-sm text-foreground">
                        {lang === "bn" ? "অপেক্ষারত আমন্ত্রণসমূহ" : "Pending Email Invitations"}
                      </h3>
                    </div>
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                      {pendingInvites.length} Pending
                    </Badge>
                  </div>

                  {pendingInvites.length > 0 ? (
                    <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                      {pendingInvites.map((inv: any) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 rounded-2xl bg-muted/40 border border-border/80 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <p className="font-bold text-foreground truncate">{inv.employee_email}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{inv.designation || "Staff"}</span>
                              {inv.created_at && <span>• {new Date(inv.created_at).toLocaleDateString()}</span>}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvitation(inv.id)}
                            className="h-8 px-2.5 rounded-xl text-destructive hover:bg-destructive/10 text-xs font-semibold shrink-0"
                          >
                            Revoke
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 space-y-1.5 border border-dashed border-border/80 rounded-2xl">
                      <Mail className="size-6 text-muted-foreground mx-auto opacity-50" />
                      <p className="text-xs text-muted-foreground">No pending invitations.</p>
                    </div>
                  )}
                </Card>
              </div>

              {/* Active Staff Members Table */}
              <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5 text-primary">
                    <Users className="size-5" />
                    <div>
                      <h3 className="font-bold text-sm text-foreground">
                        {lang === "bn" ? "সক্রিয় কর্মচারীবৃন্দ" : "Active Staff Members"}
                      </h3>
                      <p className="text-xs text-muted-foreground">Employees with access to this shop</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                    {activeEmployees.length} Active Staff
                  </Badge>
                </div>

                {activeEmployees.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeEmployees.map((emp: any) => (
                      <div
                        key={emp.id}
                        className="p-3.5 rounded-2xl bg-muted/40 border border-border/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground truncate">
                              {emp.full_name || emp.email.split("@")[0]}
                            </span>
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 px-1.5 py-0 h-4">
                              Active
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{emp.email}</p>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveEmployee(emp.id)}
                          className="h-8 px-2 text-destructive hover:bg-destructive/10 rounded-xl shrink-0"
                          title="Remove Staff Access"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-1.5 border border-dashed border-border/80 rounded-2xl">
                    <Users className="size-7 text-muted-foreground mx-auto opacity-50" />
                    <p className="text-xs text-muted-foreground">No active employees joined yet.</p>
                    <p className="text-[11px] text-muted-foreground">Send an invitation above to add your team members.</p>
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ── TAB 5: APPEARANCE & THEMES ───────────────────────────────────── */}
          {settingsTab === "appearance" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <Card className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="border-b border-border/60 pb-3">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span>{lang === "bn" ? "থিম ও ডিসপ্লে মোড" : "Theme Mode & Colors"}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize UI theme mode and system accent colors</p>
                </div>

                {/* Theme Mode */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Theme Mode</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["light", "dark", "system"] as ThemeMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTheme(mode)}
                        className={`p-3 rounded-2xl border text-center font-bold text-xs capitalize transition-all cursor-pointer ${
                          theme === mode
                            ? "bg-primary/10 border-primary text-primary shadow-xs"
                            : "bg-muted/30 border-border/80 text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accent Colors */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold">System Accent Color</Label>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      { id: "emerald", label: "Emerald", color: "#10b981" },
                      { id: "violet", label: "Violet", color: "#8b5cf6" },
                      { id: "rose", label: "Rose", color: "#f43f5e" },
                      { id: "cyan", label: "Cyan", color: "#06b6d4" },
                      { id: "amber", label: "Amber", color: "#f59e0b" },
                    ].map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setAccentColor(acc.id as AccentColor)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          accentColor === acc.id
                            ? "border-primary bg-primary/10 text-primary shadow-xs"
                            : "border-border/80 bg-muted/20 text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span className="size-3.5 rounded-full" style={{ backgroundColor: acc.color }} />
                        <span>{acc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Pattern */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold">Background Texture</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["clean", "mesh", "dots", "grid"] as BgStyle[]).map(bg => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setBgStyle(bg)}
                        className={`p-2.5 rounded-xl border text-center text-xs capitalize font-semibold transition-all cursor-pointer ${
                          bgStyle === bg
                            ? "bg-primary/10 border-primary text-primary shadow-xs"
                            : "bg-muted/30 border-border/80 text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* KPI Configuration */}
              <Card className="lg:col-span-6 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="border-b border-border/60 pb-3">
                  <h2 className="text-base font-bold text-foreground">Dashboard KPI Summary Cards</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize metric card grid layout and visual styling</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Grid Columns</Label>
                    <select
                      value={kpiConfig.columns}
                      onChange={e => updateKpiConfig({ columns: parseInt(e.target.value) })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                    >
                      <option value={1}>1 Column</option>
                      <option value={2}>2 Columns</option>
                      <option value={3}>3 Columns</option>
                      <option value={4}>4 Columns</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Card Size</Label>
                    <select
                      value={kpiConfig.size}
                      onChange={e => updateKpiConfig({ size: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                    >
                      <option value="small">Compact</option>
                      <option value="medium">Standard</option>
                      <option value="large">Spacious</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Surface Style</Label>
                    <select
                      value={kpiConfig.variant}
                      onChange={e => updateKpiConfig({ variant: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                    >
                      <option value="solid">Solid</option>
                      <option value="glass">Glass / Frosted</option>
                      <option value="outline">Outlined</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Corner Curvature</Label>
                    <select
                      value={kpiConfig.curve}
                      onChange={e => updateKpiConfig({ curve: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs"
                    >
                      <option value="none">Rounded</option>
                      <option value="soft">Soft</option>
                      <option value="pill">Pill</option>
                    </select>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB 6: SECURITY & DATA RESETS ────────────────────────────────── */}
          {settingsTab === "security" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Change Password */}
              <Card className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-primary border-b border-border/60 pb-3">
                  <Shield className="size-5" />
                  <h2 className="font-bold text-base text-foreground">Change Account Password</h2>
                </div>
                <form onSubmit={handleUpdateMyPassword} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Current Password</Label>
                    <Input name="currentPassword" type="password" required placeholder="••••••••" className="h-10 rounded-xl text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">New Password</Label>
                    <Input name="newPassword" type="password" required placeholder="Min 6 characters" className="h-10 rounded-xl text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Confirm New Password</Label>
                    <Input name="confirmPassword" type="password" required placeholder="Re-enter password" className="h-10 rounded-xl text-xs" />
                  </div>
                  <Button type="submit" disabled={pwBusy} className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xs mt-2 shadow-sm">
                    {pwBusy ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </Card>

              {/* Danger Zone & Reset */}
              <div className="lg:col-span-7">
                {!isUnlocked ? (
                  <Card className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/20 shadow-xs space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-amber-500">
                        <div className="p-2 bg-amber-500/10 rounded-xl">
                          <Lock className="size-6 animate-pulse" />
                        </div>
                        <h2 className="font-bold text-base text-foreground">Administrative Reset Controls</h2>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        To protect your business data against accidental deletion, dangerous reset operations require your owner password.
                      </p>
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                        <ShieldAlert className="size-4 shrink-0" />
                        <span>Owner authentication required to access reset actions.</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 rounded-xl border-amber-500/30 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold cursor-pointer"
                      onClick={() => setIsUnlockDialogOpen(true)}
                    >
                      Unlock Danger Zone
                    </Button>
                  </Card>
                ) : (
                  <Card className="p-5 sm:p-6 rounded-3xl bg-red-500/5 border border-red-500/20 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 text-red-500 border-b border-red-500/20 pb-3">
                      <ShieldAlert className="size-5 animate-pulse" />
                      <h2 className="font-bold text-base text-foreground">Danger Zone: Selective Data Resets</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {[
                        { type: "cashbox", title: "Cashbox", desc: "Clear all cash ledger history" },
                        { type: "products", title: "Products", desc: "Clear catalog & inventory items" },
                        { type: "sales", title: "Sales & Invoices", desc: "Clear sales, returns, and profits" },
                        { type: "purchases", title: "Purchases", desc: "Clear purchase intake records" },
                        { type: "somiti", title: "Samity", desc: "Clear samity ledger records" },
                        { type: "expenses", title: "Expenses", desc: "Clear all expense entries" },
                        { type: "parties", title: "Customers & Debts", desc: "Clear customer dues & profiles" },
                        { type: "all", title: "Factory Reset", desc: "Wipe all business data completely" },
                      ].map((item) => (
                        <div key={item.type} className="p-3 rounded-xl bg-card border border-border/80 flex flex-col justify-between space-y-2">
                          <div>
                            <p className="font-bold text-xs text-foreground">{item.title}</p>
                            <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                          </div>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="w-full h-7.5 rounded-lg text-xs font-semibold cursor-pointer"
                            onClick={() => {
                              setResetType(item.type as any);
                              setConfirmText("");
                            }}
                          >
                            Reset {item.title}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isOwner && (
        <Card className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs text-sm text-muted-foreground max-w-xl">
          {lang === "bn"
            ? "কর্মচারী একাউন্ট — সেটিংস পরিবর্তনের জন্য আপনার দোকান মালিকের সাথে যোগাযোগ করুন।"
            : "Staff employee account — please contact your shop owner to update business settings."}
        </Card>
      )}

      {/* Password Verification Dialog */}
      <Dialog open={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="size-5 text-amber-500" />
              Verify Owner Password
            </DialogTitle>
            <DialogDescription>
              Please enter your login password to unlock Safety & Reset settings.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVerifyPassword} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Password</Label>
              <Input
                type="password"
                required
                value={unlockPassword}
                onChange={e => setUnlockPassword(e.target.value)}
                placeholder="Enter owner password"
                className="text-sm"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIsUnlockDialogOpen(false)} disabled={unlockLoading}>
                Cancel
              </Button>
              <Button type="submit" disabled={unlockLoading}>
                {unlockLoading ? "Verifying..." : "Verify & Unlock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Double Confirmation Reset Dialog */}
      <Dialog open={resetType !== null} onOpenChange={open => !open && setResetType(null)}>
        <DialogContent className="max-w-md border-red-500/20 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-5" />
              Confirm Data Reset
            </DialogTitle>
            <DialogDescription className="text-xs">
              This action is <span className="font-semibold text-red-500">permanent</span>. All selected entries will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-xs text-muted-foreground leading-relaxed">
              You are about to reset:{" "}
              <span className="font-bold text-foreground capitalize">
                {resetType === "all"
                  ? "All Business Data (Factory Reset)"
                  : resetType === "sales"
                  ? "Sales, Returns, Profits & Losses"
                  : resetType === "somiti"
                  ? "Samity (Somiti) Entries"
                  : resetType === "expenses"
                  ? "Expenses"
                  : resetType === "parties"
                  ? "Customers, Parties & Debts"
                  : resetType}
              </span>.
              This will erase all related database records for your business.
            </div>
            <div className="space-y-2 bg-red-500/5 p-3 rounded-lg border border-red-500/10 text-[11px] text-red-700 dark:text-red-400">
              Please type <strong className="font-mono bg-red-500/20 px-1 py-0.5 rounded text-xs select-all text-red-600 dark:text-red-300">CONFIRM</strong> in the box below to authorize the deletion.
            </div>
            <div className="space-y-1">
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="Type CONFIRM here"
                className="text-sm text-center font-bold tracking-wider"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setResetType(null)} disabled={resetLoading}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={confirmText !== "CONFIRM" || resetLoading}
                onClick={handleResetAction}
              >
                {resetLoading ? "Deleting..." : "Erase Data"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crop Business Logo Dialog */}
      <Dialog open={cropImageSrc !== null} onOpenChange={open => !open && setCropImageSrc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Business Logo</DialogTitle>
            <DialogDescription className="text-xs">
              Drag the logo to pan and use the slider to zoom so it fits inside the square.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center">
            <div
              ref={viewportRef}
              className="w-64 h-64 relative overflow-hidden bg-muted border rounded-lg cursor-move select-none shadow-inner"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              {cropImageSrc && (
                <img
                  ref={imageRef}
                  src={cropImageSrc}
                  alt="Crop preview"
                  className="absolute max-w-none pointer-events-none origin-center"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    width: `${imgSize.width}px`,
                    height: `${imgSize.height}px`,
                  }}
                  onLoad={handleImageLoad}
                />
              )}
            </div>
            
            <div className="w-full max-w-xs mt-6 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground font-medium">
                <span>Zoom</span>
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <input
                type="range"
                min="1"
                max="4"
                step="0.05"
                value={zoom}
                onChange={e => setZoom(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCropImageSrc(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleCropSave}>
              Crop & Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
