"use client";


import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  getBusinessSettingsFn,
  updateBusinessSettingsFn,
  createEmployeeLicenseFn,
  updateEmployeePermissionsFn,
  deleteLicenseFn,
} from "@/lib/rpc-admin";
import { Trash2, Lock, Unlock, ShieldAlert, Database, FileSpreadsheet, Key, RefreshCw, AlertTriangle, LayoutGrid, Printer } from "lucide-react";
import { getPosPaperConfig, savePosPaperConfig, DEFAULT_POS_CONFIG, type PosPaperSettings } from "@/lib/pos-print";
import type { PermissionSet } from "@/lib/permissions";
import { DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/permissions";
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
} from "@/lib/rpc";
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

export default function SettingsPage() {
  const { lang, t } = useT();
  const { user, refresh, updateUser } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, bgStyle, setBgStyle } = useTheme();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const [busy, setBusy] = useState(false);

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
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan({
        x: panStart.x + dx,
        y: panStart.y + dy,
      });
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, panStart]);

  useEffect(() => {
    if (!isTouchDragging) return;
    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchDragStart.x;
      const dy = touch.clientY - touchDragStart.y;
      setPan({
        x: touchPanStart.x + dx,
        y: touchPanStart.y + dy,
      });
    };
    const handleTouchEnd = () => {
      setIsTouchDragging(false);
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isTouchDragging, touchDragStart, touchPanStart]);

  async function handleUpdateMyPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("currentPassword") || "").trim();
    const newPassword = String(fd.get("newPassword") || "").trim();
    const confirmPassword = String(fd.get("confirmPassword") || "").trim();

    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setPwBusy(true);
    try {
      await changeMyPasswordFn({ data: { currentPassword, newPassword } });
      toast.success("Password updated successfully!");
      e.currentTarget.reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPwBusy(false);
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
        toast.success("Customer, Party, and Debt data reset successfully!");
      } else if (resetType === "all") {
        await resetAllDataFn();
        toast.success("All business data reset to factory settings!");
      }
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      setResetType(null);
      setConfirmText("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setResetLoading(false);
    }
  }

  async function saveBusiness(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isOwner) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await updateBusinessSettingsFn({
        data: {
          name: String(fd.get("name") || "Classic World"),
          address: String(fd.get("address") || ""),
          phone_numbers: String(fd.get("phone_numbers") || ""),
          emails: String(fd.get("emails") || ""),
          invoice_page_size: String(fd.get("invoice_page_size") || "80mm"),
          invoice_page_width: String(fd.get("invoice_page_width") || ""),
          invoice_page_height: String(fd.get("invoice_page_height") || ""),
          logo_url: logoUrl || "/logo.svg",
          business_type: String(fd.get("business_type") || "retail"),
          theme: "green",
          employee_limit: Number(fd.get("employee_limit")) || 5,
          invoice_watermark: String(fd.get("invoice_watermark") || ""),
          invoice_watermark_enabled: fd.get("invoice_watermark_enabled") === "true",
          invoice_terms: String(fd.get("invoice_terms") || ""),
          invoice_color: String(fd.get("invoice_color") || "black"),
          invoice_font_size: (() => {
            const raw = String(fd.get("invoice_font_size") || "22px").trim();
            if (!raw) return "22px";
            return raw.toLowerCase().endsWith("px") ? raw : `${raw}px`;
          })(),
          invoice_scale: (() => {
            const raw = String(fd.get("invoice_scale") || "100%").trim();
            if (!raw) return "100%";
            return raw.endsWith("%") ? raw : `${raw}%`;
          })(),
          invoice_line_spacing: (() => {
            const raw = String(fd.get("invoice_line_spacing") || "6px").trim();
            if (!raw) return "6px";
            return raw.toLowerCase().endsWith("px") ? raw : `${raw}px`;
          })(),
        },
      });
      await refresh();
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      toast.success(t("save"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function uploadLogo(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res: any = await uploadImageFn({ data: { base64, fileName: file.name } });
        const url = res?.url || res?.data?.url;
        if (url) {
          updateUser({ logo_url: url });
          setLogoUrl(url);
          await updateBusinessSettingsFn({ data: { logo_url: url } });
          await refresh();
          qc.invalidateQueries({ queryKey: ["business-settings"] });
          toast.success(t("save"));
        } else {
          toast.error("Upload failed");
        }
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    };
    reader.readAsDataURL(file);
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid image file (PNG, JPG, WEBP, GIF, SVG).");
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

  const handleCropSave = () => {
    const img = imageRef.current;
    const viewport = viewportRef.current;
    if (!img || !viewport) return;

    const imgRect = img.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (cropImageType === "image/jpeg" || cropImageType === "image/jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 512);
    }

    const S = 512 / viewportRect.width;
    const dx = (imgRect.left - viewportRect.left) * S;
    const dy = (imgRect.top - viewportRect.top) * S;
    const dw = imgRect.width * S;
    const dh = imgRect.height * S;

    ctx.drawImage(img, dx, dy, dw, dh);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], cropImageName, { type: cropImageType });
      setCropImageSrc(null);
      void uploadLogo(file);
    }, cropImageType);
  };

  if (settings.isLoading && !settings.data) return <SpeedLoader fullScreen={false} />;

  return (
    <div className={`space-y-6 pb-8 ${isMobile ? "max-w-lg" : "max-w-5xl"} mx-auto`}>
      <div>
        <h1 className="text-2xl font-serif font-bold">{t("settings")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
      </div>

      {isOwner && biz && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card className="glass-card p-5 space-y-4">
          <h2 className="font-semibold">Business Profile</h2>
          <form onSubmit={saveBusiness} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Company Name</Label>
              <Input name="name" defaultValue={biz.name} placeholder="Classic World" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "দোকানের ঠিকানা (Shop Address)" : "Shop Address"}</Label>
              <Textarea name="address" defaultValue={biz.address || ""} placeholder={lang === "bn" ? "দোকানের ঠিকানা লিখুন..." : "e.g., House 12, Road 4, Dhanmondi, Dhaka"} className="text-xs min-h-[60px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "দোকানের ফোন নম্বরসমূহ (Phone Numbers)" : "Shop Phone Numbers (Multiple)"}</Label>
              <Input name="phone_numbers" defaultValue={biz.phone_numbers || ""} placeholder={lang === "bn" ? "যেমন: +8801700000000, +8801800000000" : "e.g. +8801700000000, +8801800000000"} className="text-xs" />
              <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "একাধিক নম্বর কমা (,) দিয়ে সেপারেট করুন" : "Separate multiple numbers with comma (,)"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "দোকানের ইমেইলসমূহ (Emails)" : "Shop Emails (Multiple)"}</Label>
              <Input name="emails" defaultValue={biz.emails || user?.email || ""} placeholder={lang === "bn" ? "যেমন: info@shop.com, support@shop.com" : "e.g. info@shop.com, support@shop.com"} className="text-xs" />
              <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "ইনভয়েসে দেখানোর জন্য কমা (,) দিয়ে সেপারেট করুন" : "Separate multiple emails with comma (,)"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logo URL</Label>
              <Input name="logo_url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="/logo.svg" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Upload Logo</Label>
              <Input type="file" accept="image/*" onChange={handleFileChange} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Business Type</Label>
              <select name="business_type" defaultValue={biz.business_type} className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm">
                {BUSINESS_TYPES.map(bt => <option key={bt} value={bt}>{bt}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Employee License Limit</Label>
              <Input name="employee_limit" type="number" min={1} defaultValue={biz.employee_limit} placeholder="5" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("appearance")}</Label>
              <select
                name="theme_mode"
                value={theme}
                onChange={e => setTheme(e.target.value as ThemeMode)}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm"
              >
                <option value="light">{t("theme_light")}</option>
                <option value="dark">{t("theme_dark")}</option>
                <option value="system">{t("theme_system")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("accent_color")}</Label>
              <select
                value={accentColor}
                onChange={e => setAccentColor(e.target.value as AccentColor)}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm capitalize"
              >
                <option value="emerald">emerald (green)</option>
                <option value="indigo">indigo</option>
                <option value="violet">violet</option>
                <option value="blue">blue</option>
                <option value="rose">rose (red)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ইউআই থিম ও ডিজাইন সিস্টেম (UI Design System Preset)" : "UI Design System Preset"}</Label>
              <select
                onChange={e => {
                  const val = e.target.value;
                  const saved = localStorage.getItem("hz_custom_theme");
                  const current = saved ? JSON.parse(saved) : {};
                  let isMat = false;
                  let styleVal = val;
                  if (val === "material") {
                    isMat = true;
                    styleVal = "default";
                  }
                  const updated = { ...current, uiStyle: styleVal, isMaterialUI: isMat };
                  localStorage.setItem("hz_custom_theme", JSON.stringify(updated));
                  window.dispatchEvent(new Event("hz-theme-updated"));
                  toast.success(lang === "bn" ? "থিম ডিজাইন আপডেট হয়েছে!" : "UI Theme preset applied!");
                }}
                defaultValue={(() => {
                  if (typeof window === "undefined") return "default";
                  try {
                    const saved = localStorage.getItem("hz_custom_theme");
                    const cfg = saved ? JSON.parse(saved) : {};
                    if (cfg.isMaterialUI) return "material";
                    return cfg.uiStyle || "default";
                  } catch (e) { return "default"; }
                })()}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs"
              >
                <option value="default">✨ Default Modern Fintech</option>
                <option value="material">🎨 Material UI Mode (Raised & Elevation)</option>
                <option value="glassmorphism">💎 Glassmorphism (Translucent Blur)</option>
                <option value="morphism">⚪ Neumorphism (Soft Morphism)</option>
                <option value="brutalism">⬛ Brutalism (High Contrast & Hard Borders)</option>
                <option value="new-brutalism">🟡 Neo-Brutalism (Modern Pop Art)</option>
                <option value="cyberpunk">⚡ Cyberpunk Neon</option>
                <option value="flowerism">🌸 Flowerism (Blossom Pastel)</option>
                <option value="minimalist">▫️ Minimalist Clean</option>
                <option value="forest">🌲 Nature Forest</option>
                <option value="luxury">👑 Luxury Gold</option>
                <option value="feather">🪶 Feather UI</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ফন্ট সাইজ (UI Base Font Size)" : "UI Base Font Size"}</Label>
              <select
                onChange={e => {
                  const val = e.target.value;
                  const saved = localStorage.getItem("hz_custom_theme");
                  const current = saved ? JSON.parse(saved) : {};
                  const updated = { ...current, fontSize: val };
                  localStorage.setItem("hz_custom_theme", JSON.stringify(updated));
                  window.dispatchEvent(new Event("hz-theme-updated"));
                  toast.success(lang === "bn" ? `ফন্ট সাইজ পরিবর্তন হয়েছে (${val})` : `Font size updated to ${val}`);
                }}
                defaultValue={(() => {
                  if (typeof window === "undefined") return "14px";
                  try {
                    const saved = localStorage.getItem("hz_custom_theme");
                    const cfg = saved ? JSON.parse(saved) : {};
                    return cfg.fontSize || "14px";
                  } catch (e) { return "14px"; }
                })()}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs"
              >
                <option value="11px">11px (Extra Small / Ultra Compact)</option>
                <option value="12px">12px (Small Compact)</option>
                <option value="13px">13px (Medium Small)</option>
                <option value="14px">14px (Default Standard)</option>
                <option value="15px">15px (Large)</option>
                <option value="16px">16px (Extra Large)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "বর্ডার ও এজ স্টাইল (Border Edges Style)" : "Border Corner Edges Style"}</Label>
              <select
                onChange={e => {
                  const val = e.target.value;
                  const saved = localStorage.getItem("hz_custom_theme");
                  const current = saved ? JSON.parse(saved) : {};
                  const updated = { ...current, borderRadius: val };
                  localStorage.setItem("hz_custom_theme", JSON.stringify(updated));
                  window.dispatchEvent(new Event("hz-theme-updated"));
                  toast.success(lang === "bn" ? `এজ বর্ডার স্টাইল আপডেট হয়েছে!` : `Border edges style updated!`);
                }}
                defaultValue={(() => {
                  if (typeof window === "undefined") return "none";
                  try {
                    const saved = localStorage.getItem("hz_custom_theme");
                    const cfg = saved ? JSON.parse(saved) : {};
                    return cfg.borderRadius || "none";
                  } catch (e) { return "none"; }
                })()}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs"
              >
                <option value="none">📐 Sharp Edges (0px Sharp Default)</option>
                <option value="small">🔹 Small Curve (4px)</option>
                <option value="medium">🔷 Medium Curve (8px)</option>
                <option value="large">⚪ Rounded (16px)</option>
                <option value="full">🔘 Full Pill (9999px)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("bg_style")}</Label>
              <select
                value={bgStyle}
                onChange={e => setBgStyle(e.target.value as BgStyle)}
                className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm capitalize"
              >
                <option value="default">default gradient</option>
                <option value="warm">warm glow</option>
                <option value="cool">cool glow</option>
                <option value="clean">solid clean</option>
                <option value="glass">glassmorphism</option>
              </select>
            </div>
            <div className="border-t border-border pt-3 mt-3 space-y-3">
              <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Invoice Customize Settings</h3>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Watermark Text</Label>
                <Input name="invoice_watermark" defaultValue={biz.invoice_watermark || ""} placeholder="PAID" />
              </div>
              <div className="space-y-1 flex items-center justify-between">
                <Label className="text-xs">Enable Watermark</Label>
                <select name="invoice_watermark_enabled" defaultValue={String(biz.invoice_watermark_enabled)} className="h-8 rounded border border-input bg-input px-2 text-xs w-28">
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Terms & Conditions / Footer Notes</Label>
                <textarea name="invoice_terms" defaultValue={biz.invoice_terms || ""} className="w-full min-h-[60px] rounded-md border border-input bg-input p-2 text-xs" placeholder="e.g. No refund after 7 days" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Invoice Print Theme Color</Label>
                <select name="invoice_color" defaultValue={biz.invoice_color || "black"} className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs capitalize">
                  <option value="black">black</option>
                  <option value="emerald">emerald (green)</option>
                  <option value="indigo">indigo</option>
                  <option value="rose">rose (red)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "ইনভয়েস ফন্ট সাইজ (Invoice Print Font Size)" : "Invoice Print Font Size (PDF & Print)"}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs capitalize"
                  >
                    <option value="12px">12px (Small Compact)</option>
                    <option value="14px">14px (Standard Medium)</option>
                    <option value="15px">15px (Default Recommended)</option>
                    <option value="16px">16px (Extra Large HD 16px)</option>
                    <option value="18px">18px (Ultra Large HD 18px)</option>
                    <option value="20px">20px (Super Large 20px)</option>
                    <option value="22px">22px (Max Preset 22px)</option>
                    <option value="24px">24px (Extra Max 24px)</option>
                    <option value="26px">26px (Max Super Size 26px)</option>
                  </select>
                  <Input
                    id="invoice_font_size_custom_input"
                    name="invoice_font_size"
                    value={fontSize}
                    onChange={(e) => setFontSize(e.target.value)}
                    placeholder="Custom e.g. 26px"
                    className="h-9 text-xs"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "ড্রপডাউন থেকে বা ম্যানুয়ালি পছন্দের সাইজ টাইপ করুন (যেমন: 18px, 22px, 26px)" : "Select preset or manually type any custom font size up to 26px (e.g. 18px, 22px, 26px)"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "ইনভয়েস জুম / স্কেল (Invoice Document Zoom & Scale)" : "Invoice Document Scale & Size Zoom"}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={fontScale}
                    onChange={(e) => setFontScale(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs capitalize"
                  >
                    <option value="80%">80% (Compact Small)</option>
                    <option value="100%">100% (Standard Normal)</option>
                    <option value="120%">120% (Medium 1.2x)</option>
                    <option value="150%">150% (Big 1.5x Large)</option>
                    <option value="180%">180% (Extra Big 1.8x)</option>
                    <option value="200%">200% (Double Size 2.0x Giant)</option>
                    <option value="250%">250% (Max Big 2.5x)</option>
                  </select>
                  <Input
                    id="invoice_scale_custom_input"
                    name="invoice_scale"
                    value={fontScale}
                    onChange={(e) => setFontScale(e.target.value)}
                    placeholder="Custom e.g. 150%"
                    className="h-9 text-xs"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "ইনভয়েসের সামগ্রিক আকার বড় বা ছোট করতে স্কেল বেছে নিন (যেমন: 120%, 150%, 200%)" : "Resize or turn invoice big according to document size (e.g. 120%, 150%, 200%)"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "ইনভয়েস ভার্টিকাল স্পেসিং (Invoice Vertical Line Spacing)" : "Invoice Vertical Line Spacing & Padding"}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={lineSpacing}
                    onChange={(e) => setLineSpacing(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs capitalize"
                  >
                    <option value="2px">2px (Compact Tight)</option>
                    <option value="4px">4px (Standard 4px)</option>
                    <option value="6px">6px (Relaxed 6px - Recommended)</option>
                    <option value="8px">8px (Spaced 8px)</option>
                    <option value="10px">10px (Loose 10px)</option>
                    <option value="12px">12px (Extra Loose 12px)</option>
                  </select>
                  <Input
                    id="invoice_line_spacing_custom_input"
                    name="invoice_line_spacing"
                    value={lineSpacing}
                    onChange={(e) => setLineSpacing(e.target.value)}
                    placeholder="Custom e.g. 8px"
                    className="h-9 text-xs"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{lang === "bn" ? "ইনভয়েসের প্রতিটি আইটেম ও লাইনের মাঝে উল্লম্ব ফাঁকা জায়গা পরিবর্তন করুন (যেমন: 6px, 8px, 10px)" : "Adjust vertical gap/padding between invoice items & table rows (e.g. 6px, 8px, 10px)"}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "ইনভয়েস পেপার সাইজ (Invoice Page Size)" : "Invoice Paper Size / Document Format"}</Label>
                <select name="invoice_page_size" defaultValue={biz.invoice_page_size || "80mm"} className="w-full h-9 rounded-md border border-input bg-input px-3 text-xs capitalize">
                  <option value="80mm">80mm POS Thermal Receipt (Receipt Printer)</option>
                  <option value="A4">A4 Full Page Document</option>
                  <option value="A5">A5 Half Sheet</option>
                  <option value="custom">Custom Width & Height</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "কাস্টম প্রস্থ (Width mm/px)" : "Custom Page Width"}</Label>
                  <Input name="invoice_page_width" defaultValue={biz.invoice_page_width || ""} placeholder="e.g. 80mm or 210mm" className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "কাস্টম উচ্চতা (Height mm/px)" : "Custom Page Height"}</Label>
                  <Input name="invoice_page_height" defaultValue={biz.invoice_page_height || ""} placeholder="e.g. auto or 297mm" className="h-8 text-xs mt-1" />
                </div>
              </div>

              {/* POS Thermal Printer Paper & Canvas Customizer */}
              <div className="border-t border-border pt-3 mt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Printer className="size-4 text-primary" />
                  <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                    {lang === "bn" ? "পিওএস থার্মাল প্রিন্টার পেপার সাইজ (POS Paper Settings)" : "POS Thermal Printer & Paper Settings"}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "পেপার প্রস্থ (Paper Width)" : "Paper Width (mm)"}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs mt-1"
                      value={posConfig.widthMm}
                      onChange={(e) => updatePosConfig({ widthMm: Number(e.target.value) || 58 })}
                      placeholder="58"
                    />
                    <p className="text-[9px] text-muted-foreground mt-0.5">{lang === "bn" ? "ডিফল্ট: 58 mm (POS রুল)" : "Default: 58 mm"}</p>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "পেপার উচ্চতা (Paper Height)" : "Paper Height (mm)"}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs mt-1"
                      value={posConfig.heightMm === "auto" ? 40 : posConfig.heightMm}
                      onChange={(e) => updatePosConfig({ heightMm: Number(e.target.value) || 40 })}
                      placeholder="40"
                    />
                    <p className="text-[9px] text-muted-foreground mt-0.5">{lang === "bn" ? "ডিফল্ট: 40 mm" : "Default: 40 mm"}</p>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "ক্যানভাস সাইজ (Canvas Width)" : "Canvas Width (mm)"}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs mt-1"
                      value={posConfig.canvasWidthMm}
                      onChange={(e) => updatePosConfig({ canvasWidthMm: Number(e.target.value) || 82 })}
                      placeholder="82"
                    />
                    <p className="text-[9px] text-muted-foreground mt-0.5">{lang === "bn" ? "ডিফল্ট: 82 mm ক্যানভাস" : "Default: 82 mm"}</p>
                  </div>

                  <div>
                    <Label className="text-[11px] text-muted-foreground">{lang === "bn" ? "দুই পাশের মার্জিন (Side Margin)" : "Side Margin (mm)"}</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs mt-1"
                      value={posConfig.marginMm}
                      onChange={(e) => updatePosConfig({ marginMm: Number(e.target.value) ?? 1 })}
                      placeholder="1"
                    />
                    <p className="text-[9px] text-muted-foreground mt-0.5">{lang === "bn" ? "ডিফল্ট: 1 mm উভয় পাশে" : "Default: 1 mm margin"}</p>
                  </div>
                </div>
              </div>
            </div>
            <Button type="submit" disabled={busy} className="w-full sm:w-auto mt-4">{busy ? "…" : t("save")}</Button>
          </form>
        </Card>

        {/* ── KPI & DASHBOARD CUSTOMIZER ──────────────────────── */}
        <Card className="glass-card p-5 space-y-4 border border-primary/20">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <LayoutGrid className="size-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm sm:text-base">{lang === "bn" ? "কেপিআই এবং ড্যাশবোর্ড কাস্টমাইজেশন" : "KPI & Dashboard Box Customizer"}</h2>
              <p className="text-xs text-muted-foreground">{lang === "bn" ? "ড্যাশবোর্ডের কেপিআই বক্সের আকার (উচ্চতা), শার্পনেস এবং বর্ডার শৈলী পরিবর্তন করুন" : "Customize KPI box heights, corner sharpness, borders, and layouts"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Box Size */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{lang === "bn" ? "কেপিআই বক্সের সাইজ (উচ্চতা)" : "KPI Box Height & Size"}</Label>
              <div className="grid grid-cols-6 gap-1 bg-muted rounded-xl p-1 text-xs">
                {[
                  { id: "xxs", label: "XXS" },
                  { id: "xs", label: "XS" },
                  { id: "small", label: "Small" },
                  { id: "standard", label: "Med" },
                  { id: "large", label: "Large" },
                  { id: "xl", label: "XL" },
                ].map(sz => (
                  <button
                    key={sz.id}
                    type="button"
                    onClick={() => updateKpiConfig({ size: sz.id as any })}
                    className={`py-1.5 rounded-lg text-center text-[11px] font-bold transition-all ${
                      kpiConfig.size === sz.id
                        ? "bg-background text-primary shadow-sm ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Box Sharpness / Corner Curve */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{lang === "bn" ? "কর্নার শার্পনেস (Sharpness / Curve)" : "Corner Sharpness & Curve"}</Label>
              <div className="grid grid-cols-6 gap-1 bg-muted rounded-xl p-1 text-xs">
                {[
                  { id: "none", label: "Sharp" },
                  { id: "sm", label: "Small" },
                  { id: "md", label: "Med" },
                  { id: "lg", label: "Round" },
                  { id: "xl", label: "XL" },
                  { id: "full", label: "Pill" },
                ].map(cr => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => updateKpiConfig({ curve: cr.id as any })}
                    className={`py-1.5 rounded-lg text-center text-[10px] font-bold transition-all ${
                      (kpiConfig.curve || "none") === cr.id
                        ? "bg-background text-primary shadow-sm ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Border Style */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{lang === "bn" ? "বর্ডার স্টাইল" : "Border Style"}</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: "subtle", label: "Subtle" },
                  { id: "bold", label: "Bold" },
                  { id: "pink", label: "Pink" },
                  { id: "emerald", label: "Emerald" },
                  { id: "amber", label: "Gold" },
                  { id: "indigo", label: "Indigo" },
                  { id: "dashed", label: "Dashed" },
                  { id: "none", label: "None" },
                ].map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => updateKpiConfig({ borderStyle: b.id as any })}
                    className={`p-1.5 rounded-xl border text-[10px] font-bold text-center transition-all ${
                      kpiConfig.borderStyle === b.id
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Design Variant */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{lang === "bn" ? "কার্ড ভ্যারিয়েন্ট" : "Card Theme Variant"}</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {[
                  { id: "glass", label: "Glass" },
                  { id: "flat", label: "Flat" },
                  { id: "bordered", label: "Bordered" },
                  { id: "neon", label: "Neon" },
                  { id: "gradient", label: "Gradient" },
                ].map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => updateKpiConfig({ variant: v.id as any })}
                    className={`p-1.5 rounded-xl border text-[10px] font-bold text-center transition-all ${
                      kpiConfig.variant === v.id
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

          {!isUnlocked ? (
            <Card className="glass-card p-5 space-y-4 border-amber-500/20 bg-amber-500/5 relative overflow-hidden flex flex-col justify-between min-h-[350px]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="space-y-4 flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-3 text-amber-500">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Lock className="size-6 animate-pulse" />
                  </div>
                  <h2 className="font-semibold text-lg">Safety & API Settings</h2>
                </div>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  Configure Google Sheets integration, generate employee license keys, and perform data resets. Password verification is required.
                </p>
                <div className="flex items-start gap-2.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 mt-4">
                  <ShieldAlert className="size-4 shrink-0 mt-0.5" />
                  <span>Only the business owner can access safety controls. Access is locked by default.</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full mt-6 border-amber-500/30 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium"
                onClick={() => setIsUnlockDialogOpen(true)}
              >
                Unlock Safety Settings
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="glass-card p-5 space-y-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center gap-2.5 text-emerald-500">
                  <FileSpreadsheet className="size-5" />
                  <h2 className="font-semibold">Google Sheets Integration</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Synchronize your transactions, products, sales, expenses, and purchases to Google Sheets in real-time.
                </p>
                <form onSubmit={saveGoogleSheetsConfig} className="space-y-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Spreadsheet ID</Label>
                    <Input
                      name="google_sheets_spreadsheet_id"
                      defaultValue={biz.google_sheets_spreadsheet_id}
                      placeholder="e.g. 1a2b3c4d5e6f7g..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Service Account Credentials JSON</Label>
                    <Textarea
                      name="google_sheets_credentials_json"
                      defaultValue={biz.google_sheets_credentials_json}
                      placeholder='{ "type": "service_account", ... }'
                      className="font-mono text-xs min-h-[100px] h-[120px] bg-transparent"
                    />
                  </div>
                  <div className="flex gap-2.5 pt-1">
                    <Button type="submit" disabled={isSheetsSaving} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {isSheetsSaving ? "Saving..." : "Save Config"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleBulkExport}
                      disabled={isBulkExporting || !biz.google_sheets_spreadsheet_id || !biz.google_sheets_credentials_json}
                      size="sm"
                      className="border-emerald-600/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    >
                      {isBulkExporting ? (
                        <>
                          <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        "Sync All Existing Data"
                      )}
                    </Button>
                  </div>
                </form>
              </Card>

              <Card className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2.5 text-blue-500">
                  <Key className="size-5" />
                  <h2 className="font-semibold">Employee Licenses</h2>
                </div>
                <p className="text-xs text-muted-foreground">1 license = 1 employee. Share the generated key during their signup/activation.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="bg-blue-600/10 text-blue-600 dark:bg-blue-600/20 dark:text-blue-400 hover:bg-blue-600/20"
                  onClick={async () => {
                    try {
                      const res = await createEmployeeLicenseFn({ data: { permissions: DEFAULT_EMPLOYEE_PERMISSIONS } });
                      toast.success(`Employee key generated: ${res.key}`);
                      qc.invalidateQueries({ queryKey: ["business-settings"] });
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  Generate Employee License
                </Button>
                <div className="divide-y divide-border rounded-md border overflow-hidden bg-background/50 max-h-[200px] overflow-y-auto">
                  {(settings.data?.employeeLicenses ?? []).length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">No license keys generated yet.</div>
                  ) : (
                    (settings.data?.employeeLicenses ?? []).map((l: any) => (
                      <div key={l.id} className="p-2 flex items-center justify-between gap-2 text-xs">
                        <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] truncate">{l.id}</code>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={l.used ? "text-muted-foreground" : "text-emerald-500 font-semibold"}>
                            {l.used ? "Used" : "Open"}
                          </span>
                          {!l.used && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label={t("delete_license")}
                              onClick={async () => {
                                try {
                                  await deleteLicenseFn({ data: { licenseKey: l.id } });
                                  qc.invalidateQueries({ queryKey: ["business-settings"] });
                                  toast.success("License deleted");
                                } catch (err: unknown) {
                                  toast.error(err instanceof Error ? err.message : String(err));
                                }
                              }}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {isOwner && (settings.data?.employees ?? []).length > 0 && (
        <Card className="glass-card p-5 space-y-4">
          <h2 className="font-semibold">Team & Privileges</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(settings.data?.employees ?? []).map((emp: any) => (
            <EmployeePermissions
              key={emp.id}
              employee={emp}
              onSave={async perms => {
                await updateEmployeePermissionsFn({ data: { employeeId: emp.id, permissions: perms } });
                qc.invalidateQueries({ queryKey: ["business-settings"] });
                toast.success(t("save"));
              }}
            />
          ))}
          </div>
        </Card>
      )}

      {isOwner && isUnlocked && (
        <Card className="glass-card p-5 space-y-4 border-red-500/20 bg-red-500/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-2.5 text-red-500">
            <ShieldAlert className="size-5 animate-pulse" />
            <h2 className="font-semibold text-lg">Danger Zone</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Perform administrative resets on specific modules or clear all data. These actions are irreversible and will affect both local and synced spreadsheet data.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cashbox</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all cash inflow/outflow history and reset balance to 0.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("cashbox");
                  setConfirmText("");
                }}
              >
                Reset Cashbox
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Products</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Clear catalog list, categories, stock levels, and item configurations.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("products");
                  setConfirmText("");
                }}
              >
                Reset Products
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales, Profits & Losses</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all invoice histories, returns records, and accumulated profit & loss logs.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("sales");
                  setConfirmText("");
                }}
              >
                Reset Sales & Profits
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Purchases</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all purchase records, stock intakes, and supplier purchases logs.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("purchases");
                  setConfirmText("");
                }}
              >
                Reset Purchases
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Samity / Somiti</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all samity contribution/withdrawal records and reset samity ledger.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("somiti");
                  setConfirmText("");
                }}
              >
                Reset Samity
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expenses</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all business expense history and related category logs.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("expenses");
                  setConfirmText("");
                }}
              >
                Reset Expenses
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-border bg-background/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customers & Debts</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Delete all customer profiles, party details, and outstanding debt history.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600/10 text-red-600 hover:bg-red-600 hover:text-white"
                onClick={() => {
                  setResetType("parties");
                  setConfirmText("");
                }}
              >
                Reset Customers & Debts
              </Button>
            </div>

            <div className="p-3.5 rounded-lg border border-red-500/20 bg-red-500/10 flex flex-col justify-between space-y-3 sm:col-span-2 md:col-span-1">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Factory Reset</h3>
                <p className="text-[11px] text-muted-foreground mt-1">Reset everything. Wipes all data: products, sales, purchases, parties, expenses, cashbox, and more.</p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  setResetType("all");
                  setConfirmText("");
                }}
              >
                Factory Reset All Data
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!isOwner && (
        <Card className="glass-card p-5 text-sm text-muted-foreground max-w-2xl">
          Employee account — contact your business owner for settings changes.
        </Card>
      )}

      {/* Change Password Card for all users */}
      <Card className="glass-card p-5 space-y-4 max-w-md">
        <div className="flex items-center gap-2.5 text-primary">
          <Key className="size-5" />
          <h2 className="font-semibold text-base">Change Account Password</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Update your login password. Your new password must be at least 6 characters long.
        </p>
        <form onSubmit={handleUpdateMyPassword} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Current Password</Label>
            <Input name="currentPassword" type="password" required placeholder="••••••••" className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">New Password</Label>
            <Input name="newPassword" type="password" required placeholder="New password" className="h-9 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Confirm New Password</Label>
            <Input name="confirmPassword" type="password" required placeholder="Confirm new password" className="h-9 text-xs" />
          </div>
          <Button type="submit" disabled={pwBusy} className="w-full mt-2 h-9 text-xs beveled-button">
            {pwBusy ? "Updating..." : "Update Password"}
          </Button>
        </form>
      </Card>

      {/* Password Verification Dialog */}
      <Dialog open={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="size-5 text-amber-500" />
              Verify Owner Password
            </DialogTitle>
            <DialogDescription>
              Please enter your login password to unlock Safety & API settings.
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
              This action is <span className="font-semibold text-red-500">permanent</span>. All selected files and entries will be deleted.
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

function EmployeePermissions({
  employee,
  onSave,
}: {
  employee: { id: string; email: string; full_name: string; permissions: PermissionSet };
  onSave: (p: PermissionSet) => Promise<void>;
}) {
  const [perms, setPerms] = useState<PermissionSet>(employee.permissions || DEFAULT_EMPLOYEE_PERMISSIONS);

  const modules: (keyof PermissionSet)[] = ["dashboard", "products", "sales", "parties", "purchases", "expenses", "cashbox", "settings", "reports"];

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="font-medium text-sm">{employee.full_name || employee.email}</div>
      <div className="grid grid-cols-2 gap-2">
        {modules.map(m => (
          <label key={m} className="flex items-center justify-between text-xs capitalize">
            {m}
            <Switch checked={perms[m]} onCheckedChange={v => setPerms(p => ({ ...p, [m]: v }))} />
          </label>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => onSave(perms)}>Save permissions</Button>
    </div>
  );
}
