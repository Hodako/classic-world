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
  disconnectGoogleSheetsFn,
  getBusinessSettingsFn,
  updateBusinessSettingsFn,
  removeEmployeeFn,
  updateEmployeePermissionsFn,
} from "@/lib/rpc-admin";
import Link from "next/link";
import {
  Trash2,
  Lock,
  Unlock,
  Crown,
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
  Shield,
  Clock,
  CheckCircle,
  GripVertical,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  ArrowUpDown,
  LayoutGrid,
  Users,
  Eye,
  EyeOff,
  Key,
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
  toggleGoogleSheetsSyncFn,
  resetSomitiFn,
  resetExpensesFn,
  resetPartiesFn,
  changeMyPasswordFn,
  connectGoogleSheetsOAuthFn,
  sendEmployeeInvitationFn,
  listEmployeeInvitationsFn,
  cancelEmployeeInvitationFn,
  generateEmployeeLicenseKeyFn,
  listLicensesFn,
  revokeLicenseFn,
  getRecycleBinFn,
  restoreFromRecycleBinFn,
  permanentDeleteRecycleBinFn,
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

type SettingsTab = "profile" | "kpis" | "printing" | "sheets" | "staff" | "recycle_bin" | "appearance" | "security";

export default function SettingsPage() {
  const { lang, t } = useT();
  const { user, refresh } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, bgStyle, setBgStyle } = useTheme();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  
  const settings = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const biz = settings.data?.business || (settings.data as any) || {};
  const isOwner = user?.role === "owner" || (user as any)?.role !== "employee";
  const hasDangerZoneAccess = isOwner || isUnlocked;

  // Store Logo State
  const [logoUrl, setLogoUrl] = useState<string>(() => biz?.logo_url || "/logo.png");
  useEffect(() => {
    if (biz?.logo_url) setLogoUrl(biz.logo_url);
  }, [biz?.logo_url]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // KPI Configuration & Ordering State
  const DEFAULT_KPI_ORDER = [
    "total_sales",
    "cash_sale",
    "sell_kpi",
    "online_sell",
    "owner_wallet",
    "purchases",
    "profit",
    "loss",
    "expense",
    "due",
    "cashbox",
    "somiti",
  ];

  const normalizeKpiOrderList = (order?: string[]) => {
    const defaultList = [...DEFAULT_KPI_ORDER];
    if (!order || !Array.isArray(order) || order.length === 0) return defaultList;
    const list = order
      .filter(k => k !== "credit_sale")
      .map(k => (k === "bkash_bank" ? "sell_kpi" : k === "owners_wallet" ? "owner_wallet" : k));
    for (const key of defaultList) {
      if (!list.includes(key)) list.push(key);
    }
    return list.filter(k => defaultList.includes(k));
  };

  const [kpiConfig, setKpiConfig] = useState<{
    align: string;
    size: string;
    columns: number;
    variant: string;
    shadow: string;
    borderStyle: string;
    curve: string;
    bentoGrid: boolean;
    order: string[];
    hiddenKpis?: string[];
  }>({
    align: "left",
    size: "small",
    columns: 2,
    variant: "glass",
    shadow: "glow",
    borderStyle: "subtle",
    curve: "none",
    bentoGrid: true,
    order: DEFAULT_KPI_ORDER,
    hiddenKpis: [],
  });

  const [draggedKpiIdx, setDraggedKpiIdx] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hz_kpi_config");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setKpiConfig(prev => ({
            ...prev,
            ...parsed,
            order: parsed.order ? normalizeKpiOrderList(parsed.order) : prev.order,
          }));
        } catch (_) {}
      }
    }
  }, []);

  const updateKpiConfig = (newSettings: Partial<typeof kpiConfig>) => {
    setKpiConfig(prev => {
      const updated = {
        ...prev,
        ...newSettings,
        order: newSettings.order ? normalizeKpiOrderList(newSettings.order) : prev.order,
      };
      localStorage.setItem("hz_kpi_config", JSON.stringify(updated));
      window.dispatchEvent(new Event("hz-kpi-config-updated"));
      try {
        updateBusinessSettingsFn({ data: { kpi_config: updated } });
      } catch (_) {}
      return updated;
    });
  };

  const moveKpiPosition = (fromIdx: number, toIdx: number) => {
    const currentOrder = normalizeKpiOrderList(kpiConfig.order);
    if (toIdx < 0 || toIdx >= currentOrder.length) return;
    const list = [...currentOrder];
    const [movedItem] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, movedItem);
    updateKpiConfig({ order: list });
    toast.success(lang === "bn" ? "KPI পজিশন সফলভাবে পরিবর্তন করা হয়েছে" : "KPI position updated");
  };

  const handleKpiDragStart = (idx: number) => setDraggedKpiIdx(idx);
  const handleKpiDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedKpiIdx === null || draggedKpiIdx === idx) return;
    const currentOrder = normalizeKpiOrderList(kpiConfig.order);
    const list = [...currentOrder];
    const item = list[draggedKpiIdx];
    list.splice(draggedKpiIdx, 1);
    list.splice(idx, 0, item);
    setDraggedKpiIdx(idx);
    setKpiConfig(prev => ({ ...prev, order: list }));
  };
  const handleKpiDragEnd = () => {
    setDraggedKpiIdx(null);
    localStorage.setItem("hz_kpi_config", JSON.stringify(kpiConfig));
    window.dispatchEvent(new Event("hz-kpi-config-updated"));
    try {
      updateBusinessSettingsFn({ data: { kpi_config: kpiConfig } });
    } catch (_) {}
    toast.success(lang === "bn" ? "KPI পজিশন সফলভাবে সাজানো হয়েছে!" : "KPI layout order updated!");
  };

  const resetKpiToDefault = () => {
    updateKpiConfig({ order: DEFAULT_KPI_ORDER });
    toast.success(lang === "bn" ? "KPI ক্রম ডিফল্ট আকারে রিসেট করা হয়েছে" : "KPI layout reset to default");
  };

  const updatePosConfig = (updates: any) => {
    setPosConfig(prev => ({ ...prev, ...updates }));
    toast.success(lang === "bn" ? "প্রিন্টার পেপার সাইজ সংরক্ষিত হয়েছে!" : "POS Printer Paper Settings Saved!");
  };

  const invitations = { data: [] as any[] };

  // (biz already declared)
  // (isOwner already declared)
  // (hasDangerZoneAccess already declared)

  // Invoice & POS Formatting State
  const [fontSize, setFontSize] = useState("22px");
  const [fontScale, setFontScale] = useState("100%");
  const [lineSpacing, setLineSpacing] = useState("6px");
  const [posConfig, setPosConfig] = useState<{ widthMm: number; paperType: string }>({ widthMm: 80, paperType: "receipt" });

  // PIN Lock & Password States
  const [pinLockEnabled, setPinLockEnabled] = useState(false);
  const [pinCodeVal, setPinCodeVal] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("app_pin_code_val") || "1234";
    return "1234";
  });
  const [employeePinVal, setEmployeePinVal] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("app_employee_pin_code_val") || "0000";
    return "0000";
  });
  const [pinTimeoutVal, setPinTimeoutVal] = useState("10");
  const [pwBusy, setPwBusy] = useState(false);

  // Sheets Sync States
  const [isSheetsSaving, setIsSheetsSaving] = useState(false);
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  // Employee Permissions State
  const [editingPermissionsEmp, setEditingPermissionsEmp] = useState<any>(null);
  const [empPermissions, setEmpPermissions] = useState<any>({});
  const [isUpdatingPerms, setIsUpdatingPerms] = useState(false);


  const [busy, setBusy] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  // Employee License Key Generator State
  const [empLicName, setEmpLicName] = useState("");
  const [empLicAllowedPages, setEmpLicAllowedPages] = useState<string[]>([
    "/dashboard", "/sales", "/products", "/invoices"
  ]);
  const [empLicAllowedKpis, setEmpLicAllowedKpis] = useState<string[]>([
    "sell_kpi", "total_sales", "cash_sale"
  ]);
  const [empLicPermissions, setEmpLicPermissions] = useState<PermissionSet>({
    dashboard: true,
    sales: true,
    products: true,
    parties: false,
    purchases: false,
    expenses: false,
    reports: false,
    settings: false,
    cashbox: false,
    danger_zone: false,
  });
  const [empLicNote, setEmpLicNote] = useState("");
  const [empLicBusy, setEmpLicBusy] = useState(false);

  const employeeLicenses = useQuery({
    queryKey: ["employee-licenses-list"],
    queryFn: () => listLicensesFn({ data: { type: "employee" } }),
  });

  const recycleBinQuery = useQuery({
    queryKey: ["user-recycle-bin"],
    queryFn: () => getRecycleBinFn(),
  });

  const handleGenerateEmpLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empLicName.trim()) {
      toast.error(lang === "bn" ? "কর্মচারীর নাম দিন" : "Please enter employee name");
      return;
    }
    setEmpLicBusy(true);
    try {
      const res = await generateEmployeeLicenseKeyFn({
        data: {
          employeeName: empLicName.trim(),
          allowedPages: empLicAllowedPages,
          allowedKpis: empLicAllowedKpis,
          permissions: empLicPermissions,
          note: empLicNote.trim(),
        },
      });
      toast.success(lang === "bn" ? `কর্মচারী লাইসেন্স তৈরি হয়েছে: ${res.key}` : `Employee license generated: ${res.key}`);
      setEmpLicName("");
      setEmpLicNote("");
      employeeLicenses.refetch();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setEmpLicBusy(false);
    }
  };

  const handleRevokeEmpLicense = async (key: string) => {
    if (!confirm(lang === "bn" ? `আপনি কি লাইসেন্স "${key}" বাতিল করতে চান?` : `Revoke license "${key}"?`)) return;
    try {
      await revokeLicenseFn({ data: { key } });
      toast.success(lang === "bn" ? "লাইসেন্স বাতিল করা হয়েছে" : "License revoked");
      employeeLicenses.refetch();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  // Danger Zone & Reset State
  const [resetType, setResetType] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);
  // (isUnlocked already declared)

  // Logo Cropper State
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ width: 256, height: 256 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const isGoogleUser = !!(auth.currentUser?.providerData?.some(p => p.providerId === "google.com") || user?.email?.endsWith("@gmail.com"));

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    }
  };
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ width: img.naturalWidth || 256, height: img.naturalHeight || 256 });
  };
  const handleCropSave = async () => {
    if (!cropImageSrc) return;
    try {
      await updateBusinessSettingsFn({ data: { logo_url: cropImageSrc } });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      setCropImageSrc(null);
      toast.success(lang === "bn" ? "লোগো সফলভাবে আপডেট হয়েছে!" : "Logo updated successfully!");
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  // Multi-ID Employee PIN Accounts State
  const [employeeAccounts, setEmployeeAccounts] = useState<any[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("cw_employee_accounts") || "[]");
    } catch {
      return [];
    }
  });

  const [newEmpAccountName, setNewEmpAccountName] = useState("");
  const [newEmpAccountRole, setNewEmpAccountRole] = useState("Sales Staff");
  const [newEmpAccountPin, setNewEmpAccountPin] = useState("");
  const [newEmpAccountPages, setNewEmpAccountPages] = useState<string[]>([
    "/dashboard", "/sales", "/products", "/invoices"
  ]);
  const [newEmpAccountKpis, setNewEmpAccountKpis] = useState<string[]>([
    "sell_kpi", "total_sales", "cash_sale"
  ]);

  const saveEmployeeAccounts = (accounts: any[]) => {
    setEmployeeAccounts(accounts);
    localStorage.setItem("cw_employee_accounts", JSON.stringify(accounts));
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("hz-employee-switched"));
  };

  const handleCreateEmpAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmpAccountName.trim() || !newEmpAccountPin.trim()) {
      toast.error(lang === "bn" ? "কর্মচারীর নাম ও ৪ সংখ্যার পিন দিন" : "Please enter name and PIN");
      return;
    }
    if (newEmpAccountPin.trim().length < 4) {
      toast.error(lang === "bn" ? "পিন কোড অন্তত ৪ সংখ্যা হতে হবে" : "PIN must be at least 4 digits");
      return;
    }
    const newAcc = {
      id: `emp_${Date.now()}`,
      name: newEmpAccountName.trim(),
      role: newEmpAccountRole,
      pin: newEmpAccountPin.trim(),
      allowedPages: newEmpAccountPages,
      allowedKpis: newEmpAccountKpis,
      created_at: new Date().toISOString(),
    };
    const updated = [...employeeAccounts, newAcc];
    saveEmployeeAccounts(updated);
    toast.success(lang === "bn" ? `কর্মচারী ${newEmpAccountName} ও পিন কোড সংরক্ষিত হয়েছে!` : `Employee account & PIN saved!`);
    setNewEmpAccountName("");
    setNewEmpAccountPin("");
  };

  const handleDeleteEmpAccount = (id: string, name: string) => {
    if (!confirm(lang === "bn" ? `আপনি কি কর্মচারী "${name}" মুছে ফেলতে চান?` : `Delete employee account "${name}"?`)) return;
    const updated = employeeAccounts.filter(a => a.id !== id);
    saveEmployeeAccounts(updated);
    toast.success(lang === "bn" ? "কর্মচারী একাউন্ট মুছে ফেলা হয়েছে" : "Employee account deleted");
  };

  const handleUpdateEmpAccountPin = (id: string, newPin: string) => {
    if (!newPin || newPin.length < 4) return;
    const updated = employeeAccounts.map(a => a.id === id ? { ...a, pin: newPin } : a);
    saveEmployeeAccounts(updated);
    toast.success(lang === "bn" ? "পিন কোড পরিবর্তন হয়েছে" : "PIN code updated");
  };

  const handleRestoreRecycleItem = async (id: string, label: string) => {
    try {
      await restoreFromRecycleBinFn({ data: { id } });
      toast.success(lang === "bn" ? `"${label}" সফলভাবে ফিরিয়ে আনা হয়েছে!` : `Restored "${label}" successfully!`);
      recycleBinQuery.refetch();
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };

  const handlePermanentDeleteRecycleItem = async (id: string) => {
    if (!confirm(lang === "bn" ? "স্থায়ীভাবে ডিলিট করতে চান? এটি আর ফিরিয়ে আনা যাবে না।" : "Permanently delete item? This cannot be undone.")) return;
    try {
      await permanentDeleteRecycleBinFn({ data: { id } });
      toast.success(lang === "bn" ? "স্থায়ীভাবে মুছে ফেলা হয়েছে" : "Item permanently deleted");
      recycleBinQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || String(err));
    }
  };


  // KPI Reordering & Configuration Constants
  // (DEFAULT_KPI_ORDER already declared at top)


  const KPI_METADATA: Record<
    string,
    { nameEn: string; nameBn: string; descEn: string; descBn: string; badge: string; color: string; bg: string }
  > = {
    total_sales: {
      nameEn: "Total Sales",
      nameBn: "মোট বিক্রি",
      descEn: "Combined total of all sales orders",
      descBn: "সকল ক্যাশ, বাকি ও অনলাইন বিক্রির মোট যোগফল",
      badge: "Total",
      color: "text-blue-500",
      bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
    },
    cash_sale: {
      nameEn: "Cash Sale",
      nameBn: "নগদ বিক্রি",
      descEn: "Instant cash payments received",
      descBn: "নগদে সংগৃহীত মোট বিক্রয়",
      badge: "Cash",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    },
    sell_kpi: {
      nameEn: "Sell (Collection)",
      nameBn: "বিক্রয় ও আদায়",
      descEn: "Total sales with bKash, bank & online collection breakdown",
      descBn: "মোট বিক্রয় ও বিকাশ, ব্যাংক ও অনলাইন পেন্ডিং হিসাব",
      badge: "Sell",
      color: "text-pink-600",
      bg: "bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400",
    },
    credit_sale: {
      nameEn: "Credit Sale",
      nameBn: "বাকি বিক্রি",
      descEn: "Sales made on customer store credit",
      descBn: "বাকিতে করা বিক্রয়",
      badge: "Credit",
      color: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    },
    online_sell: {
      nameEn: "Online Sale",
      nameBn: "অনলাইন বিক্রি",
      descEn: "Web orders & courier deliveries",
      descBn: "কুরিয়ার ও অনলাইন অর্ডারের হিসাব",
      badge: "Online",
      color: "text-purple-500",
      bg: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
    },
    owner_wallet: {
      nameEn: "Owner's Expense",
      nameBn: "মালিকের খরচ",
      descEn: "Owner's personal withdrawals and family expenses",
      descBn: "মালিকের ব্যক্তিগত ও পরিবার খরচের মোট হিসাব",
      badge: "Owner",
      color: "text-amber-600",
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    },
    purchases: {
      nameEn: "Purchases (BUY)",
      nameBn: "পণ্য ক্রয় (BUY)",
      descEn: "Total spent on restock & buying stock",
      descBn: "দোকানের জন্য পাইকারি মাল কেনার খরচ",
      badge: "Buy",
      color: "text-indigo-500",
      bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400",
    },
    profit: {
      nameEn: "Total Profit",
      nameBn: "মোট লাভ",
      descEn: "Net gross profit earned from sales",
      descBn: "পণ্য বিক্রির পর অর্জিত মোট নিট লাভ",
      badge: "Profit",
      color: "text-emerald-600",
      bg: "bg-emerald-600/10 border-emerald-600/30 text-emerald-600 dark:text-emerald-400",
    },
    loss: {
      nameEn: "Total Loss",
      nameBn: "লোকসান",
      descEn: "Loss incurred from discounts or damages",
      descBn: "ছাড় বা লস জনিত মোট ক্ষতি",
      badge: "Loss",
      color: "text-rose-500",
      bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
    },
    expense: {
      nameEn: "Shop Expenses",
      nameBn: "দোকান খরচ",
      descEn: "Daily operational & shop expenses",
      descBn: "দোকানের দৈনন্দিন খরচ ও বিল",
      badge: "Expense",
      color: "text-red-500",
      bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    },
    due: {
      nameEn: "Customer Dues",
      nameBn: "ক্রেতার বাকি",
      descEn: "Outstanding money owed by parties",
      descBn: "কাস্টমার ও পার্টির কাছে বকেয়া পাওনা",
      badge: "Due",
      color: "text-orange-500",
      bg: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
    },
    cashbox: {
      nameEn: "Cashbox Balance",
      nameBn: "ক্যাশবক্স ব্যালেন্স",
      descEn: "Live drawer balance and cash reserve",
      descBn: "ক্যাশ ড্রয়ারের বর্তমান নগদ টাকা ও ব্যালেন্স",
      badge: "Cashbox",
      color: "text-teal-500",
      bg: "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
    },
    somiti: {
      nameEn: "Samity (Savings)",
      nameBn: "সমিতি ও সঞ্চয়",
      descEn: "Samity monthly deposits and installments",
      descBn: "সমিতিতে জমা ও সঞ্চয়ের নিট হিসাব",
      badge: "Samity",
      color: "text-cyan-500",
      bg: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
    },
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
      toast.success(lang === "bn" ? "নিরাপত্তা ও ডেঞ্জার জোন আনলক হয়েছে!" : "Safety settings unlocked successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Incorrect password or access denied.");
    } finally {
      setUnlockLoading(false);
    }
  }

  async function handleVerifyWithGoogle() {
    setUnlockLoading(true);
    try {
      let googleEmail = auth.currentUser?.email;
      
      // If we have an active non-anonymous Firebase Google session, verify directly or prompt popup
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        googleEmail = result.user?.email || googleEmail;
      } catch (popupErr: any) {
        // If popup was closed by user but auth.currentUser exists and is authenticated
        if (auth.currentUser?.email && (popupErr?.code === "auth/popup-closed-by-user" || popupErr?.code === "auth/cancelled-popup-request")) {
          googleEmail = auth.currentUser.email;
        } else {
          throw popupErr;
        }
      }

      if (!googleEmail) {
        googleEmail = settings.data?.email || undefined;
      }

      if (!googleEmail) throw new Error("Could not retrieve Google account email.");
      await verifyOwnerPasswordFn({ data: { googleVerifiedEmail: googleEmail } });
      setIsUnlocked(true);
      setIsUnlockDialogOpen(false);
      setUnlockPassword("");
      toast.success(lang === "bn" ? "গুগল ভেরিফিকেশনের মাধ্যমে ডেঞ্জার জোন আনলক হয়েছে!" : "Danger Zone unlocked via Google verification!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Google authentication failed.");
    } finally {
      setUnlockLoading(false);
    }
  }

  function openPermissionsModal(emp: any) {
    setEditingPermissionsEmp(emp);
    setEmpPermissions(emp.permissions || DEFAULT_EMPLOYEE_PERMISSIONS);
  }

  async function handleSaveEmployeePermissions() {
    if (!editingPermissionsEmp) return;
    setIsUpdatingPerms(true);
    try {
      await updateEmployeePermissionsFn({
        data: {
          employeeId: editingPermissionsEmp.id,
          permissions: empPermissions,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারীর পারমিশন সফলভাবে সংরক্ষিত হয়েছে!" : "Employee permissions updated successfully!");
      setEditingPermissionsEmp(null);
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update permissions");
    } finally {
      setIsUpdatingPerms(false);
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

  async function handleResetAction() {
    if (!resetType || !hasDangerZoneAccess) return;
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
    { id: "kpis", label: lang === "bn" ? "কেপিআই দৃশ্যমানতা" : "KPI Visibility", icon: LayoutGrid },
    { id: "printing", label: lang === "bn" ? "প্রিন্ট ও ইনভয়েস" : "POS & Printing", icon: Printer },
    { id: "sheets", label: lang === "bn" ? "গুগল শিট ও ক্লাউড" : "Google Sheets & Cloud", icon: FileSpreadsheet },
    { id: "staff", label: lang === "bn" ? "কর্মচারী ও পিন কোড" : "Staff & Employee PINs", icon: Users, count: activeEmployees.length + employeeAccounts.length + (employeeLicenses.data?.length ?? 0) },
    { id: "recycle_bin", label: lang === "bn" ? "রিসাইকেল বিন (৭ দিন)" : "7-Day Recycle Bin", icon: RotateCcw, count: recycleBinQuery.data?.length },
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

      {(isOwner || hasDangerZoneAccess) && biz && (
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
                      <Input name="name" defaultValue={biz.name} placeholder="Classic World POS" className="h-10 rounded-xl text-xs" />
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

          {/* ── TAB: DASHBOARD KPI VISIBILITY & METRICS CONTROL ───────────────── */}
          {settingsTab === "kpis" && (
            <div className="space-y-6">
              <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
                  <div className="flex items-center gap-2.5 text-primary">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                      <LayoutGrid className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-foreground">
                        {lang === "bn" ? "ড্যাশবোর্ড কেপিআই দৃশ্যমানতা ও লেআউট নিয়ন্ত্রণ" : "Dashboard KPI Visibility, Layout & Sequence"}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lang === "bn"
                          ? "যে কোনো কেপিআই কার্ড প্রদর্শন বা গোপন করুন এবং পছন্দের ক্রমানুসারে সাজান"
                          : "Toggle visibility, card styles, and reorder KPI summary cards across your dashboard"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateKpiConfig({ hiddenKpis: [] });
                        toast.success(lang === "bn" ? "সকল কেপিআই দৃশ্যমান করা হয়েছে!" : "All KPIs are now visible!");
                      }}
                      className="h-8 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    >
                      <Eye className="size-3.5" />
                      <span>{lang === "bn" ? "সব দেখান" : "Show All"}</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const sensitive = ["profit", "loss", "somiti", "owner_wallet"];
                        updateKpiConfig({ hiddenKpis: sensitive });
                        toast.success(lang === "bn" ? "গোপনীয় লাভ, ক্ষতি ও সমিতি লুকানো হয়েছে!" : "Hidden Profit, Loss & Samity KPIs!");
                      }}
                      className="h-8 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    >
                      <EyeOff className="size-3.5" />
                      <span>{lang === "bn" ? "লাভ ও সমিতি লুকান" : "Hide Profit & Samity"}</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetKpiToDefault}
                      className="h-8 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="size-3.5" />
                      <span>{lang === "bn" ? "ডিফল্ট রিসেট" : "Reset Default"}</span>
                    </Button>
                  </div>
                </div>

                {/* Visual Customizer Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/25 p-3.5 rounded-2xl border border-border/60">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "গ্রিড কলাম সংখ্যা" : "Grid Columns"}</Label>
                    <select
                      value={kpiConfig.columns}
                      onChange={e => updateKpiConfig({ columns: parseInt(e.target.value) })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs font-medium"
                    >
                      <option value={1}>1 {lang === "bn" ? "কলাম" : "Column"}</option>
                      <option value={2}>2 {lang === "bn" ? "কলাম" : "Columns"}</option>
                      <option value={3}>3 {lang === "bn" ? "কলাম" : "Columns"}</option>
                      <option value={4}>4 {lang === "bn" ? "কলাম" : "Columns"}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কার্ড সাইজ" : "Card Size"}</Label>
                    <select
                      value={kpiConfig.size}
                      onChange={e => updateKpiConfig({ size: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs font-medium"
                    >
                      <option value="small">{lang === "bn" ? "কম্প্যাক্ট (Compact)" : "Compact"}</option>
                      <option value="medium">{lang === "bn" ? "স্ট্যান্ডার্ড (Standard)" : "Standard"}</option>
                      <option value="large">{lang === "bn" ? "বড় (Large)" : "Large"}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কার্ড সারফেস" : "Surface Style"}</Label>
                    <select
                      value={kpiConfig.variant}
                      onChange={e => updateKpiConfig({ variant: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs font-medium"
                    >
                      <option value="solid">{lang === "bn" ? "সলিড (Solid)" : "Solid"}</option>
                      <option value="glass">{lang === "bn" ? "গ্লাস (Glass)" : "Glass / Frosted"}</option>
                      <option value="outline">{lang === "bn" ? "আউটলাইন (Outline)" : "Outlined"}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কর্নার কার্ভ" : "Corner Curvature"}</Label>
                    <select
                      value={kpiConfig.curve}
                      onChange={e => updateKpiConfig({ curve: e.target.value })}
                      className="w-full h-9 rounded-xl border border-input bg-input px-2 text-xs font-medium"
                    >
                      <option value="none">{lang === "bn" ? "রাউন্ডেড (Rounded)" : "Rounded"}</option>
                      <option value="soft">{lang === "bn" ? "সফট (Soft)" : "Soft"}</option>
                      <option value="pill">{lang === "bn" ? "পিল (Pill)" : "Pill"}</option>
                    </select>
                  </div>
                </div>

                {/* 13 KPI Cards Grid with Instant Toggle Switches & Reordering */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <ArrowUpDown className="size-3.5 text-primary" />
                      <span>{lang === "bn" ? "কেপিআই কার্ডসমূহ ও অবস্থান ক্রম (↑ / ↓ কি বা বাটন)" : "KPI Cards & Sequence (↑ / ↓ Arrow Keys or Drag)"}</span>
                    </h3>
                    <span className="text-[11px] text-muted-foreground">
                      {lang === "bn" ? "মোট ১১টি মেট্রিক কার্ড" : "11 Total Metric Cards"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {normalizeKpiOrderList(kpiConfig.order).map((kpiKey, idx, arr) => {
                      const meta = KPI_METADATA[kpiKey] || {
                        nameEn: kpiKey,
                        nameBn: kpiKey,
                        descEn: "",
                        descBn: "",
                        badge: "KPI",
                        color: "text-primary",
                        bg: "bg-primary/10 border-primary/20 text-primary",
                      };
                      const isHidden = (kpiConfig.hiddenKpis || []).includes(kpiKey);
                      const isBeingDragged = draggedKpiIdx === idx;

                      return (
                        <div
                          key={kpiKey}
                          tabIndex={0}
                          role="listitem"
                          aria-label={`${meta.nameEn}, position ${idx + 1} of ${arr.length}`}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              if (idx > 0) moveKpiPosition(idx, idx - 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              if (idx < arr.length - 1) moveKpiPosition(idx, idx + 1);
                            }
                          }}
                          draggable
                          onDragStart={() => handleKpiDragStart(idx)}
                          onDragOver={(e) => handleKpiDragOver(e, idx)}
                          onDragEnd={handleKpiDragEnd}
                          className={`group p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 select-none ${
                            isBeingDragged
                              ? "opacity-50 border-primary bg-primary/15 scale-[0.98]"
                              : isHidden
                              ? "bg-muted/20 border-border/60 opacity-65"
                              : "bg-card border-border/80 shadow-xs hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="p-1 text-muted-foreground group-hover:text-primary transition-colors cursor-grab active:cursor-grabbing shrink-0">
                              <GripVertical className="size-4" />
                            </div>

                            <span className="flex items-center justify-center size-6 rounded-lg bg-muted text-[11px] font-bold font-mono text-muted-foreground shrink-0">
                              {idx + 1}
                            </span>

                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${meta.bg}`}>
                                  {meta.badge}
                                </span>
                                <p className="text-xs font-bold truncate text-foreground">
                                  {lang === "bn" ? meta.nameBn : meta.nameEn}
                                </p>
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {lang === "bn" ? meta.descBn : meta.descEn}
                              </p>
                              <div>
                                <span className={`text-[9px] font-bold ${isHidden ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                                  {isHidden ? (lang === "bn" ? "● লুকানো (মাস্ক)" : "● Hidden (Masked)") : (lang === "bn" ? "● দৃশ্যমান" : "● Visible")}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1.5">
                            <Switch
                              checked={!isHidden}
                              onCheckedChange={(checked) => {
                                const hidden = kpiConfig.hiddenKpis || [];
                                const updated = !checked
                                  ? (hidden.includes(kpiKey) ? hidden : [...hidden, kpiKey])
                                  : hidden.filter(k => k !== kpiKey);
                                updateKpiConfig({ hiddenKpis: updated });
                                toast.success(
                                  !checked
                                    ? (lang === "bn" ? `"${meta.nameBn}" লুকানো হয়েছে` : `Hidden "${meta.nameEn}"`)
                                    : (lang === "bn" ? `"${meta.nameBn}" দৃশ্যমান করা হয়েছে` : `Showing "${meta.nameEn}"`)
                                );
                              }}
                            />

                            <div className="flex flex-col gap-0.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={idx === 0}
                                onClick={() => moveKpiPosition(idx, idx - 1)}
                                className="size-5 p-0 text-muted-foreground hover:text-foreground rounded disabled:opacity-20 cursor-pointer"
                                title={lang === "bn" ? "উপরে নিন" : "Move Up"}
                              >
                                <ChevronUp className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={idx === arr.length - 1}
                                onClick={() => moveKpiPosition(idx, idx + 1)}
                                className="size-5 p-0 text-muted-foreground hover:text-foreground rounded disabled:opacity-20 cursor-pointer"
                                title={lang === "bn" ? "নিচে নিন" : "Move Down"}
                              >
                                <ChevronDown className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                    <p className="font-bold text-xs" style={{ fontSize }}>{biz.name || "Classic World Shop"}</p>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 bg-muted/60 px-2.5 py-1 rounded-xl border border-border/60">
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {lang === "bn" ? "অটো-সিঙ্ক:" : "Auto-Sync:"}
                        </span>
                        <Switch
                          checked={biz.google_sheets_sync_enabled !== false}
                          onCheckedChange={async (val) => {
                            try {
                              await toggleGoogleSheetsSyncFn({ data: { enabled: val } });
                              qc.invalidateQueries({ queryKey: ["business-settings"] });
                              toast.success(
                                val
                                  ? (lang === "bn" ? "অটো-সিঙ্ক চালু করা হয়েছে" : "Auto-Sync enabled")
                                  : (lang === "bn" ? "অটো-সিঙ্ক বন্ধ করা হয়েছে" : "Auto-Sync disabled")
                              );
                            } catch (e: any) {
                              toast.error(e.message || "Failed to toggle auto-sync");
                            }
                          }}
                        />
                        <span className={`text-[11px] font-bold ${
                          biz.google_sheets_sync_enabled !== false ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                        }`}>
                          {biz.google_sheets_sync_enabled !== false ? "ON" : "OFF"}
                        </span>
                      </div>
                      {biz.google_sheets_spreadsheet_id && (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-semibold">
                          {lang === "bn" ? "🟢 সক্রিয়" : "🟢 Active"}
                        </Badge>
                      )}
                    </div>
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

          {/* ── TAB 4: STAFF EMPLOYEE PINs ──────────────────── */}
          {settingsTab === "staff" && (
            <div className="space-y-6">
              {/* Multi-ID Employee Accounts with Distinct PIN Passwords */}
              <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5 text-primary">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                      <Lock className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-foreground">
                        {lang === "bn" ? "একই জিমেইলে একাধিক কর্মচারী আইডি ও পিন পাসওয়ার্ড" : "Employee ID Accounts & Distinct PIN Passwords"}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {lang === "bn"
                          ? "মালিক ও কর্মচারী একই জিমেইল বা ডিভাইসে লগইন থাকলেও, প্রত্যেকে নিজের আলাদা ৪ সংখ্যার পিন কোড দিয়ে ঢুকতে পারবে। মালিক সব কর্মচারীর পিন ও এক্সেস নিয়ন্ত্রণ করতে পারবেন।"
                          : "Even if owner and employees share the same Google account, each employee uses their own distinct PIN to unlock and access the POS with specific permissions."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Add New Employee Account with PIN Form */}
                <form onSubmit={handleCreateEmpAccount} className="p-4 rounded-2xl bg-muted/25 border border-border/60 space-y-4">
                  <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <UserPlus className="size-4 text-primary" />
                    <span>{lang === "bn" ? "নতুন কর্মচারী যোগ করুন এবং ৪ সংখ্যার পিন সেট করুন" : "Add Employee & Set Security PIN"}</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারীর নাম *" : "Staff Name *"}</Label>
                      <Input
                        required
                        value={newEmpAccountName}
                        onChange={e => setNewEmpAccountName(e.target.value)}
                        placeholder={lang === "bn" ? "যেমন: মোহাম্মদ রহিম" : "e.g. Shakil Ahmed"}
                        className="h-10 rounded-xl text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{lang === "bn" ? "পদবি / রোল" : "Designation / Role"}</Label>
                      <select
                        value={newEmpAccountRole}
                        onChange={e => setNewEmpAccountRole(e.target.value)}
                        className="w-full h-10 rounded-xl border border-input bg-input px-3 text-xs"
                      >
                        <option value="Sales Staff">Sales Staff (বিক্রয় কর্মী)</option>
                        <option value="Cashier">Cashier (ক্যাশিয়ার)</option>
                        <option value="Store Manager">Store Manager (ম্যানেজার)</option>
                        <option value="Stock Manager">Stock Manager (স্টক অফিসার)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{lang === "bn" ? "৪ সংখ্যার সিকিউরিটি পিন *" : "4-Digit Security PIN *"}</Label>
                      <Input
                        required
                        type="password"
                        maxLength={6}
                        value={newEmpAccountPin}
                        onChange={e => setNewEmpAccountPin(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="e.g. 5678"
                        className="h-10 rounded-xl text-xs font-mono font-bold tracking-widest text-center"
                      />
                    </div>
                  </div>

                  {/* Allowed Pages Checkboxes */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <Label className="text-xs font-bold text-foreground">
                      {lang === "bn" ? "এই কর্মচারীর জন্য অনুমোদিত পেজসমূহ (Allowed Pages):" : "Permitted Navigation Pages:"}
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { to: "/dashboard", label: "Dashboard (ড্যাশবোর্ড)" },
                        { to: "/sales", label: "Sales & POS (বিক্রয়)" },
                        { to: "/products", label: "Products (পণ্য)" },
                        { to: "/invoices", label: "Invoices (চালান)" },
                        { to: "/dues", label: "Dues (বকেয়া)" },
                        { to: "/customers", label: "Customers (গ্রাহক)" },
                        { to: "/purchases", label: "Purchases (ক্রয়)" },
                        { to: "/expenses", label: "Expenses (খরচ)" },
                        { to: "/owners-wallet", label: "Owner Wallet ⚠️ (মালিকের খরচ)" },
                        { to: "/cash-management", label: "Cashbox ⚠️ (ক্যাশবক্স)" },
                        { to: "/sms", label: "SMS (এসএমএস)" },
                        { to: "/somiti", label: "Somiti ⚠️ (সমিতি)" },
                      ].map((pageItem) => {
                        const isChecked = newEmpAccountPages.includes(pageItem.to);
                        return (
                          <button
                            key={pageItem.to}
                            type="button"
                            onClick={() => {
                              setNewEmpAccountPages(prev =>
                                isChecked ? prev.filter(p => p !== pageItem.to) : [...prev, pageItem.to]
                              );
                            }}
                            className={`p-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? "bg-primary/10 border-primary/40 text-primary"
                                : "bg-card border-border/70 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className="truncate">{pageItem.label}</span>
                            <span>{isChecked ? "✓" : "+"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Allowed KPIs Checkboxes */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <Label className="text-xs font-bold text-foreground">
                      {lang === "bn" ? "এই কর্মচারীর জন্য অনুমোদিত ড্যাশবোর্ড KPI (Allowed KPIs):" : "Permitted Dashboard KPIs:"}
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: "sell_kpi", label: "Sell KPI (বিক্রয়)" },
                        { id: "total_sales", label: "Total Sales (মোট বিক্রি)" },
                        { id: "cash_sale", label: "Cash Sale (নগদ)" },
                        { id: "credit_sale", label: "Credit Sale (বাকি)" },
                        { id: "due", label: "Dues (বকেয়া)" },
                        { id: "cashbox", label: "Cashbox (ক্যাশবাক্স)" },
                        { id: "profit", label: "Profit (লাভ - গোপনীয়)" },
                        { id: "somiti", label: "Somiti (সমিতি - গোপনীয়)" },
                      ].map((kpiItem) => {
                        const isChecked = newEmpAccountKpis.includes(kpiItem.id);
                        return (
                          <button
                            key={kpiItem.id}
                            type="button"
                            onClick={() => {
                              setNewEmpAccountKpis(prev =>
                                isChecked ? prev.filter(k => k !== kpiItem.id) : [...prev, kpiItem.id]
                              );
                            }}
                            className={`p-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                              isChecked
                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                : "bg-card border-border/70 text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <span className="truncate">{kpiItem.label}</span>
                            <span>{isChecked ? "✓" : "+"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs gap-2 cursor-pointer shadow-sm"
                  >
                    <Plus className="size-4" />
                    <span>{lang === "bn" ? "কর্মচারী একাউন্ট ও পিন সংরক্ষণ করুন" : "Save Employee Account & PIN"}</span>
                  </Button>
                </form>

                {/* List of Configured Employee PIN Accounts */}
                <div className="space-y-3 pt-3 border-t border-border/60">
                  <h3 className="text-xs font-bold text-foreground flex items-center justify-between">
                    <span>{lang === "bn" ? "সংরক্ষিত কর্মচারী পিন একাউন্টসমূহ" : "Active Employee PIN Accounts"} ({employeeAccounts.length})</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      {lang === "bn" ? "মালিক এখান থেকে যে কারো পিন পরিবর্তন করতে পারবেন" : "Owner can view, edit, or reset staff PINs"}
                    </span>
                  </h3>

                  {employeeAccounts.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-border/80 rounded-2xl">
                      <Lock className="size-6 text-muted-foreground/40 mx-auto mb-1.5" />
                      <p className="text-xs text-muted-foreground">
                        {lang === "bn" ? "এখনও কোন কর্মচারী পিন একাউন্ট তৈরি করা হয়নি।" : "No employee PIN accounts configured yet."}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {employeeAccounts.map((emp) => (
                        <div
                          key={emp.id}
                          className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs flex flex-col justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-foreground truncate">{emp.name}</span>
                              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 font-semibold">
                                {emp.role || "Staff"}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-2 text-xs bg-muted/40 p-2 rounded-xl border border-border/60">
                              <span className="text-muted-foreground">{lang === "bn" ? "পিন কোড:" : "PIN Code:"}</span>
                              <span className="font-mono font-bold tracking-widest text-primary bg-background px-2 py-0.5 rounded border border-border/80">
                                {emp.pin}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const newP = prompt(lang === "bn" ? `কর্মচারী ${emp.name} এর নতুন ৪ সংখ্যার পিন দিন:` : `Enter new PIN for ${emp.name}:`, emp.pin);
                                  if (newP && newP.length >= 4) {
                                    handleUpdateEmpAccountPin(emp.id, newP);
                                  }
                                }}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold ml-auto cursor-pointer"
                              >
                                {lang === "bn" ? "পিন পরিবর্তন" : "Change PIN"}
                              </button>
                            </div>

                            <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1">
                              <div>{lang === "bn" ? "অনুমোদিত পেজ:" : "Allowed Pages:"} <span className="font-semibold text-foreground">{(emp.allowedPages || []).length} টি</span></div>
                              <div>{lang === "bn" ? "অনুমোদিত KPI:" : "Allowed KPIs:"} <span className="font-semibold text-foreground">{(emp.allowedKpis || []).length} টি</span></div>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteEmpAccount(emp.id, emp.name)}
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 rounded-lg px-2 cursor-pointer font-semibold"
                            >
                              <Trash2 className="size-3.5 mr-1" />
                              {lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB: 7-DAY RECYCLE BIN & UNDO SYSTEM ───────────────────────── */}
          {settingsTab === "recycle_bin" && (
            <div className="space-y-6">
              <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold flex items-center gap-2 text-rose-500">
                      <RotateCcw className="size-5" />
                      <span>{lang === "bn" ? "৭ দিনের রিসাইকেল বিন ও রিস্টোর" : "7-Day Recycle Bin & Undo System"}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {lang === "bn"
                        ? "ভুলবশত মুছে ফেলা যে কোন পণ্য, বিক্রি, খরচ, সমিতি বা পার্টির তথ্য ৭ দিন পর্যন্ত এখানে সংরক্ষিত থাকে। ১ ক্লিকেই পুনরুদ্ধার করতে পারবেন।"
                        : "Any deleted products, sales, expenses, somiti, or party ledgers are safely kept for 7 days. Restore any item with 1 click."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => recycleBinQuery.refetch()}
                    className="rounded-xl text-xs h-8 cursor-pointer"
                  >
                    <RefreshCw className="size-3 mr-1" />
                    {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
                  </Button>
                </div>
              </Card>

              {recycleBinQuery.isLoading ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {lang === "bn" ? "রিসাইকেল বিন লোড হচ্ছে..." : "Loading recycle bin..."}
                </div>
              ) : !recycleBinQuery.data || recycleBinQuery.data.length === 0 ? (
                <Card className="p-12 text-center rounded-3xl bg-card border-dashed border-border/80">
                  <RotateCcw className="size-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-semibold text-foreground">
                    {lang === "bn" ? "রিসাইকেল বিন সম্পূর্ণ খালি" : "Recycle Bin is Empty"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "bn"
                      ? "বিগত ৭ দিনের মধ্যে কোন তথ্য মুছে ফেলা হয়নি।"
                      : "No items have been deleted in the past 7 days."}
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {recycleBinQuery.data.map((item: any) => {
                    const deletedDate = item.deleted_at ? new Date(item.deleted_at).toLocaleString() : "Recently";
                    const expiresDate = item.expires_at ? new Date(item.expires_at).toLocaleDateString() : "7 days";

                    return (
                      <Card key={item.id} className="p-4 rounded-2xl bg-card border-border/80 shadow-xs space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider text-rose-500 border-rose-500/30 bg-rose-500/10">
                              {item.collection_name}
                            </Badge>
                            <h4 className="text-xs font-bold text-foreground mt-1.5 truncate">
                              {item.label || item.original_id}
                            </h4>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              {lang === "bn" ? "মুছেছেন: " : "Deleted by: "} {item.deleted_by || "User"}
                            </p>
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground space-y-0.5 pt-1 border-t border-border/40">
                          <div>{lang === "bn" ? "মুছার তারিখ: " : "Deleted At: "} <span className="font-semibold text-foreground">{deletedDate}</span></div>
                          <div>{lang === "bn" ? "অটো-পার্জ হবে: " : "Auto-purges on: "} <span className="font-semibold text-amber-500">{expiresDate}</span></div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRestoreRecycleItem(item.id, item.label || item.original_id)}
                            className="h-8 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex-1 cursor-pointer"
                          >
                            <RotateCcw className="size-3.5 mr-1.5" />
                            {lang === "bn" ? "পূর্বাবস্থায় ফিরিয়ে আনুন (Undo)" : "Undo / Restore"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handlePermanentDeleteRecycleItem(item.id)}
                            className="h-8 text-xs text-destructive hover:bg-destructive/10 rounded-xl px-2.5 cursor-pointer"
                            title="Permanently Delete"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 5: APPEARANCE & THEMES ───────────────────────────────────── */}
          {settingsTab === "appearance" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <Card className="lg:col-span-12 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-6">
                <div className="border-b border-border/60 pb-3">
                  <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <span>{lang === "bn" ? "থিম ও ডিসপ্লে মোড" : "Theme Mode & System Colors"}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize UI dark/light theme mode and system accent colors</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">System Accent Color</Label>
                    <div className="flex flex-wrap gap-2">
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
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Background Texture</Label>
                    <div className="grid grid-cols-2 gap-2">
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
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB 6: SECURITY & DATA RESETS ────────────────────────────────── */}
          {settingsTab === "security" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Screen Security & Admin PIN Code Lock */}
              <Card className="lg:col-span-12 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-primary/10 text-primary">
                      <Lock className="size-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-base text-foreground">
                        {lang === "bn" ? "স্ক্রিন সিকিউরিটি ও অ্যাডমিন পিন কোড লক" : "Screen Security & Admin PIN Lock"}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lang === "bn" ? "সাইটে প্রবেশের সময় ৪ সংখ্যার পিন কোড সক্রিয় করুন (Classic World PIN Lock)" : "Require a 4-digit PIN code to enter and access this website"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pinLockEnabled}
                    onCheckedChange={(checked) => {
                      setPinLockEnabled(checked);
                      localStorage.setItem("app_pin_code_enabled", checked ? "true" : "false");
                      if (checked && !pinCodeVal) {
                        setPinCodeVal("1234");
                        localStorage.setItem("app_pin_code_val", "1234");
                      }
                      window.dispatchEvent(new Event("storage"));
                      toast.success(checked ? (lang === "bn" ? "পিন লক সক্রিয় করা হয়েছে!" : "PIN Lock enabled!") : (lang === "bn" ? "পিন লক নিষ্ক্রিয় করা হয়েছে" : "PIN Lock disabled"));
                    }}
                  />
                </div>

                {pinLockEnabled && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <Crown className="size-3.5" />
                          <span>{lang === "bn" ? "মালিক পিন কোড (Owner PIN)" : "Owner PIN Code"}</span>
                        </Label>
                        <Input
                          type="password"
                          maxLength={6}
                          value={pinCodeVal}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            setPinCodeVal(val);
                            localStorage.setItem("app_pin_code_val", val);
                            window.dispatchEvent(new Event("storage"));
                          }}
                          placeholder="1234"
                          className="h-10 rounded-xl text-base font-mono tracking-widest text-center font-bold"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                          <Users className="size-3.5" />
                          <span>{lang === "bn" ? "কর্মচারী পিন কোড (Employee PIN)" : "Employee PIN Code"}</span>
                        </Label>
                        <Input
                          type="password"
                          maxLength={6}
                          value={employeePinVal}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, "");
                            setEmployeePinVal(val);
                            localStorage.setItem("app_employee_pin_code_val", val);
                            window.dispatchEvent(new Event("storage"));
                          }}
                          placeholder="0000"
                          className="h-10 rounded-xl text-base font-mono tracking-widest text-center font-bold"
                        />
                      </div>


                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">{lang === "bn" ? "অটো-লক সময়সীমা (নিষ্ক্রিয় থাকলে)" : "Auto-Lock Inactivity Timeout"}</Label>
                        <select
                          value={pinTimeoutVal}
                          onChange={(e) => {
                            setPinTimeoutVal(e.target.value);
                            localStorage.setItem("app_pin_timeout", e.target.value);
                            window.dispatchEvent(new Event("storage"));
                            toast.success(lang === "bn" ? "অটো-লক সময়সীমা আপডেট হয়েছে" : "Auto-lock timeout updated");
                          }}
                          className="h-10 w-full rounded-xl border border-input bg-background px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="1">{lang === "bn" ? "১ মিনিট নিষ্ক্রিয় থাকলে" : "1 minute of inactivity"}</option>
                          <option value="5">{lang === "bn" ? "৫ মিনিট নিষ্ক্রিয় থাকলে" : "5 minutes of inactivity"}</option>
                          <option value="10">{lang === "bn" ? "১০ মিনিট (ডিফল্ট)" : "10 minutes (Default)"}</option>
                          <option value="30">{lang === "bn" ? "৩০ মিনিট নিষ্ক্রিয় থাকলে" : "30 minutes of inactivity"}</option>
                          <option value="0">{lang === "bn" ? "কখনই অটো-লক হবে না (শুধু ম্যানুয়াল)" : "Never (Manual lock only)"}</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-4 rounded-xl text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                        onClick={() => {
                          sessionStorage.removeItem("app_pin_unlocked");
                          window.dispatchEvent(new Event("app_lock_screen"));
                          toast.info(lang === "bn" ? "স্ক্রিন লক করা হয়েছে" : "Screen locked!");
                        }}
                      >
                        <Lock className="size-3.5" />
                        {lang === "bn" ? "এখনই স্ক্রিন লক করুন" : "Lock Screen Now"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Change Password */}
              <Card className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-4">
                <div className="flex items-center gap-2 text-primary border-b border-border/60 pb-3">
                  <Shield className="size-5" />
                  <h2 className="font-bold text-base text-foreground">
                    {isGoogleUser
                      ? (lang === "bn" ? "অ্যাকাউন্ট পাসওয়ার্ড সেট করুন" : "Set Account Password")
                      : (lang === "bn" ? "অ্যাকাউন্ট পাসওয়ার্ড পরিবর্তন" : "Change Account Password")}
                  </h2>
                </div>
                <form onSubmit={handleUpdateMyPassword} className="space-y-3.5">
                  {!isGoogleUser ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{lang === "bn" ? "বর্তমান পাসওয়ার্ড" : "Current Password"}</Label>
                      <Input name="currentPassword" type="password" required placeholder="••••••••" className="h-10 rounded-xl text-xs" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-primary/5 border border-primary/20 text-[11px] text-primary flex items-center gap-2">
                      <Shield className="size-4 shrink-0" />
                      <span>{lang === "bn" ? "আপনি গুগল দিয়ে যুক্ত আছেন। প্রয়োজনে অতিরিক্ত পাসওয়ার্ড সেট করতে পারেন।" : "You signed in with Google. You can set a password for direct password login."}</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{isGoogleUser ? (lang === "bn" ? "পাসওয়ার্ড" : "New Password") : (lang === "bn" ? "নতুন পাসওয়ার্ড" : "New Password")}</Label>
                    <Input name="newPassword" type="password" required placeholder="Min 6 characters" className="h-10 rounded-xl text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পাসওয়ার্ড নিশ্চিত করুন" : "Confirm New Password"}</Label>
                    <Input name="confirmPassword" type="password" required placeholder="Re-enter password" className="h-10 rounded-xl text-xs" />
                  </div>
                  <Button type="submit" disabled={pwBusy} className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xs mt-2 shadow-sm">
                    {pwBusy
                      ? (lang === "bn" ? "সংরক্ষণ করা হচ্ছে..." : "Updating...")
                      : isGoogleUser
                      ? (lang === "bn" ? "পাসওয়ার্ড সেট করুন" : "Set Password")
                      : (lang === "bn" ? "পাসওয়ার্ড আপডেট করুন" : "Update Password")}
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
                        <div>
                          <h2 className="font-bold text-base text-foreground">
                            {lang === "bn" ? "অ্যাডমিনিস্ট্রেটিভ রিসেট কন্ট্রোল" : "Administrative Reset Controls"}
                          </h2>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md mt-0.5">
                            {isGoogleUser ? "Google Re-Authentication" : "Password Protected"}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {isGoogleUser
                          ? (lang === "bn"
                              ? "আপনার ব্যবসার ডাটা যাতে ভুলবশত মুছে না যায়, তাই ডেঞ্জার জোনে প্রবেশের জন্য গুগল দিয়ে পরিচয় নিশ্চিত করতে হবে।"
                              : "To protect your business data against accidental deletion, dangerous reset operations require verifying your Google account.")
                          : (lang === "bn"
                              ? "আপনার ব্যবসার ডাটা যাতে ভুলবশত মুছে না যায়, তাই ডেঞ্জার জোনে প্রবেশের জন্য পাসওয়ার্ড দিয়ে পরিচয় নিশ্চিত করতে হবে।"
                              : "To protect your business data against accidental deletion, dangerous reset operations require your owner password.")}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                        <ShieldAlert className="size-4 shrink-0" />
                        <span>
                          {isGoogleUser
                            ? (lang === "bn" ? "গুগল একাউন্ট দিয়ে যাচাই করে সরাসরি ডেঞ্জার জোন আনলক করুন।" : "Owner authentication via Google required to access reset actions.")
                            : (lang === "bn" ? "দোকান মালিকের অথেন্টিকেশন দ্বারা যাচাই করে আনলক করুন।" : "Owner authentication required to access reset actions.")}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      {isGoogleUser ? (
                        <Button
                          type="button"
                          onClick={handleVerifyWithGoogle}
                          disabled={unlockLoading}
                          className="w-full h-11 rounded-xl bg-white hover:bg-gray-100 text-gray-900 border border-gray-300 font-bold text-xs gap-2.5 shadow-sm cursor-pointer"
                        >
                          {unlockLoading ? (
                            <RefreshCw className="size-4 animate-spin text-primary" />
                          ) : (
                            <svg className="size-4" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                          )}
                          <span>{lang === "bn" ? "গুগল দিয়ে ডেঞ্জার জোন আনলক করুন" : "Continue with Google to Unlock Danger Zone"}</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full h-11 rounded-xl border-amber-500/30 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold cursor-pointer"
                          onClick={() => setIsUnlockDialogOpen(true)}
                        >
                          {lang === "bn" ? "ডেঞ্জার জোন আনলক করুন" : "Unlock Danger Zone"}
                        </Button>
                      )}
                    </div>
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

      {!isOwner && !hasDangerZoneAccess && (
        <Card className="p-6 rounded-3xl bg-card border border-border/80 shadow-xs text-sm text-muted-foreground max-w-xl">
          {lang === "bn"
            ? "কর্মচারী একাউন্ট — সেটিংস পরিবর্তনের জন্য আপনার দোকান মালিকের সাথে যোগাযোগ করুন।"
            : "Staff employee account — please contact your shop owner to update business settings."}
        </Card>
      )}

      {/* Employee Permissions Management Modal */}
      <Dialog open={editingPermissionsEmp !== null} onOpenChange={open => !open && setEditingPermissionsEmp(null)}>
        <DialogContent className="max-w-lg font-hind">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold font-balooda">
              <Shield className="size-5 text-primary" />
              <span>{lang === "bn" ? "কর্মচারী পারমিশন ও এক্সেস নিয়ন্ত্রণ" : "Staff Permissions & Access Control"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editingPermissionsEmp?.full_name || editingPermissionsEmp?.email} {lang === "bn" ? "এর জন্য কোন কোন পেজ ও ফিচার উন্মুক্ত থাকবে তা নির্ধারণ করুন।" : "Configure which modules and tools this employee is allowed to access."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2 max-h-[60vh] overflow-y-auto pr-1">
            {[
              { id: "dashboard", label: lang === "bn" ? "ড্যাশবোর্ড ও লাইভ হিসেব" : "Dashboard & Live KPIs", desc: "View store performance metrics" },
              { id: "products", label: lang === "bn" ? "পণ্য ও স্টক ব্যবস্থাপনা" : "Products & Inventory", desc: "Create, edit, and view product catalog" },
              { id: "sales", label: lang === "bn" ? "বিক্রয় ও ইনভয়েস" : "Sales & Invoicing", desc: "Make sales, view orders, and print invoices" },
              { id: "parties", label: lang === "bn" ? "ক্রেতা ও বাকির হিসেব" : "Customers & Dues", desc: "Manage customer profiles and collect dues" },
              { id: "purchases", label: lang === "bn" ? "ক্রয় ও সাপ্লায়ার" : "Purchases & Stock In", desc: "Log purchase orders and restocks" },
              { id: "expenses", label: lang === "bn" ? "খরচ ও সমিতি" : "Expenses & Samity", desc: "Record daily operational costs" },
              { id: "cashbox", label: lang === "bn" ? "ক্যাশ ম্যানেজমেন্ট" : "Cashbox Management", desc: "Manage cash inflow, outflow, and balances" },
              { id: "settings", label: lang === "bn" ? "দোকান সেটিংস" : "Shop Settings", desc: "Manage shop details and print configurations" },
              { id: "reports", label: lang === "bn" ? "রিপোর্ট ও ট্র্যাকিং" : "Reports & Tracking", desc: "Detailed business analytics and history" },
              {
                id: "danger_zone",
                label: lang === "bn" ? "⚠️ ডেঞ্জার জোন ও ডাটা রিসেট" : "⚠️ Danger Zone & Data Reset",
                desc: lang === "bn" ? "সতর্কতা: এই কর্মচারীকে ডেঞ্জার জোন আনলক ও ডাটা রিসেট করার পূর্ণ এক্সেস প্রদান করুন।" : "Caution: Grants permission to unlock Danger Zone and reset store data.",
                isDanger: true
              },
            ].map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                  item.isDanger
                    ? "bg-red-500/5 border-red-500/30"
                    : "bg-muted/30 border-border/80"
                }`}
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <p className={`text-xs font-bold font-balooda ${item.isDanger ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                    {item.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={Boolean((empPermissions as any)[item.id])}
                  onCheckedChange={(val) => {
                    setEmpPermissions((prev: any) => ({
                      ...prev,
                      [item.id]: val,
                    }));
                  }}
                />
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingPermissionsEmp(null)}
              disabled={isUpdatingPerms}
              className="rounded-xl text-xs"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={handleSaveEmployeePermissions}
              disabled={isUpdatingPerms}
              className="rounded-xl bg-primary text-primary-foreground text-xs font-bold gap-2"
            >
              {isUpdatingPerms ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{lang === "bn" ? "পারমিশন সংরক্ষণ করুন" : "Save Permissions"}</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password & Google Verification Dialog */}
      <Dialog open={isUnlockDialogOpen} onOpenChange={setIsUnlockDialogOpen}>
        <DialogContent className="max-w-md font-hind">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold font-balooda">
              <Unlock className="size-5 text-amber-500" />
              <span>{lang === "bn" ? "ডেঞ্জার জোন আনলক করুন" : "Unlock Danger Zone"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isGoogleUser
                ? (lang === "bn"
                    ? "দোকানের ডাটা নিরাপত্তা নিশ্চিত করতে গুগল দিয়ে পরিচয় নিশ্চিত করুন।"
                    : "Verify your identity using your Google account to unlock administrative controls.")
                : (lang === "bn"
                    ? "দোকানের ডাটা নিরাপত্তা নিশ্চিত করতে অ্যাকাউন্ট পাসওয়ার্ড দিয়ে পরিচয় নিশ্চিত করুন।"
                    : "Verify your identity using your account password to unlock administrative controls.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Google Re-authentication */}
            <div className={`space-y-2 p-3.5 rounded-2xl ${isGoogleUser ? "bg-amber-500/10 border border-amber-500/30" : "bg-muted/40 border border-border/80"}`}>
              <p className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>{lang === "bn" ? "গুগল সাইন-ইন দিয়ে দ্রুত আনলক করুন:" : "Quick Unlock with Google:"}</span>
                {isGoogleUser && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">Recommended</Badge>}
              </p>
              <Button
                type="button"
                onClick={handleVerifyWithGoogle}
                disabled={unlockLoading}
                className="w-full h-10 rounded-xl bg-white hover:bg-gray-50 text-gray-900 border border-gray-300 font-bold text-xs gap-2.5 shadow-xs cursor-pointer"
              >
                {unlockLoading ? (
                  <RefreshCw className="size-3.5 animate-spin text-primary" />
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 10.22 1 12 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{lang === "bn" ? "গুগল দিয়ে আনলক করুন" : "Continue with Google to Unlock"}</span>
              </Button>
            </div>

            {!isGoogleUser && (
              <>
                <div className="relative flex items-center justify-center">
                  <span className="bg-background px-2 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                    {lang === "bn" ? "অথবা পাসওয়ার্ড দিন" : "Or use password"}
                  </span>
                </div>

                <form onSubmit={handleVerifyPassword} className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{lang === "bn" ? "পাসওয়ার্ড" : "Account Password"}</Label>
                    <Input
                      type="password"
                      value={unlockPassword}
                      onChange={e => setUnlockPassword(e.target.value)}
                      placeholder={lang === "bn" ? "পাসওয়ার্ড লিখুন..." : "Enter password"}
                      className="h-10 rounded-xl text-xs"
                    />
                  </div>
                  <DialogFooter className="gap-2 sm:gap-0 pt-2">
                    <Button type="button" variant="outline" onClick={() => setIsUnlockDialogOpen(false)} disabled={unlockLoading} className="rounded-xl text-xs">
                      {lang === "bn" ? "বাতিল" : "Cancel"}
                    </Button>
                    <Button type="submit" disabled={unlockLoading || !unlockPassword.trim()} className="rounded-xl bg-primary text-primary-foreground font-bold text-xs">
                      {unlockLoading ? "Verifying..." : (lang === "bn" ? "পাসওয়ার্ড দিয়ে আনলক" : "Verify & Unlock")}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </div>
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


