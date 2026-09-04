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
  updateEmployeePermissionsFn,
} from "@/lib/rpc-admin";
import {
  getRecycleBinFn,
  restoreRecycleItemFn,
  permanentDeleteRecycleItemFn,
  emptyRecycleBinFn,
  getCommandHistoryFn,
  undoCommandFn,
  createAssetTransferKeyFn,
  inspectAssetTransferKeyFn,
  applyAssetTransferKeyFn,
  listMyTransferKeysFn,
  deleteTransferKeyFn,
} from "@/lib/rpc";
import Link from "next/link";
import {
  Trash2,
  RotateCcw,
  History as HistoryIcon,
  Undo2,
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
  Shield,
  Clock,
  CheckCircle,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  LayoutGrid,
  Users,
  Eye,
  EyeOff,
  ArrowRightLeft,
  KeyRound,
  Copy,
  Check,
  Share2,
  Download,
  Package,
  ShoppingBag,
  Receipt,
  DollarSign,
  Wallet,
  Banknote,
  ShoppingCart,
  Send,
  UserCheck,
  Smartphone,
  CheckCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
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

type SettingsTab = "profile" | "transfer" | "printing" | "sheets" | "staff" | "appearance" | "security" | "history";

export default function SettingsPage() {
  const { lang, t } = useT();
  const { user, refresh } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, bgStyle, setBgStyle } = useTheme();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  
  const settings = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const invitations = useQuery({ queryKey: ["employee-invitations"], queryFn: listEmployeeInvitationsFn });
  const recycleBin = useQuery({ queryKey: ["recycle_bin"], queryFn: getRecycleBinFn, enabled: !!user });
  const commandHistory = useQuery({ queryKey: ["command_history"], queryFn: getCommandHistoryFn, enabled: !!user });
  const [historySubTab, setHistorySubTab] = useState<"recycle" | "commands">("recycle");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");

  // Transfer Keys State
  const myTransferKeys = useQuery({ queryKey: ["my-transfer-keys"], queryFn: listMyTransferKeysFn, enabled: !!user });
  const [exportName, setExportName] = useState("");
  const [exportExpiry, setExportExpiry] = useState("24");
  const [exportPin, setExportPin] = useState("");
  const [exportOptions, setExportOptions] = useState({
    shopProfile: true,
    products: true,
    customers: true,
    parties: true,
    sales: true,
    expenses: true,
    somiti: false,
    kpiPrefs: true,
  });
  const [createdKeyResult, setCreatedKeyResult] = useState<any | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Import Key State
  const [importKeyInput, setImportKeyInput] = useState("");
  const [importPinInput, setImportPinInput] = useState("");
  const [inspectedPackage, setInspectedPackage] = useState<any | null>(null);
  const [inspectingKey, setInspectingKey] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [applyingKey, setApplyingKey] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  // Invite Employee Form State
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteDesignation, setInviteDesignation] = useState("Sales Staff");
  const [inviteSending, setInviteSending] = useState(false);

  async function handleCreateTransferKey(e: React.FormEvent) {
    e.preventDefault();
    setGeneratingKey(true);
    try {
      const res = await createAssetTransferKeyFn({
        data: {
          name: exportName.trim() || undefined,
          expiresInHours: Number(exportExpiry) || 24,
          pinCode: exportPin.trim() || undefined,
          options: exportOptions,
        },
      });
      setCreatedKeyResult(res);
      toast.success(lang === "bn" ? "এক্সপোর্ট কি সফলভাবে তৈরি হয়েছে!" : "Export key generated successfully!");
      qc.invalidateQueries({ queryKey: ["my-transfer-keys"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate export key");
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleInspectKey(e: React.FormEvent) {
    e.preventDefault();
    if (!importKeyInput.trim()) {
      toast.error(lang === "bn" ? "এক্সপোর্ট কি লিখুন" : "Please enter an export key");
      return;
    }
    setInspectingKey(true);
    try {
      const res = await inspectAssetTransferKeyFn({
        data: {
          key: importKeyInput.trim().toUpperCase(),
          pinCode: importPinInput.trim() || undefined,
        },
      });
      setInspectedPackage(res);
      if (res.requiresPin) {
        toast.info(lang === "bn" ? "এই কি-টির জন্য সিকিউরিটি পিন প্রয়োজন।" : "This key requires a Security PIN.");
      } else {
        toast.success(lang === "bn" ? "প্যাকেজ তথ্য সফলভাবে লোড হয়েছে!" : "Package inspected successfully!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Invalid or expired key");
      setInspectedPackage(null);
    } finally {
      setInspectingKey(false);
    }
  }

  async function handleApplyTransferKey() {
    if (!importKeyInput.trim()) return;
    if (importMode === "replace") {
      if (!confirm(lang === "bn" ? "সতর্কতা: 'ডাটাবেজ প্রতিস্থাপন' মোডে বর্তমান ডাটা মুছে নতুন ডাটা যুক্ত হবে। আপনি কি নিশ্চিত?" : "Warning: 'Replace Database' mode will overwrite existing data. Are you sure?")) {
        return;
      }
    }
    setApplyingKey(true);
    try {
      await applyAssetTransferKeyFn({
        data: {
          key: importKeyInput.trim().toUpperCase(),
          pinCode: importPinInput.trim() || undefined,
          mode: importMode,
        },
      });
      toast.success(lang === "bn" ? "অ্যাসেট সফলভাবে ইমপোর্ট ও ট্রান্সফার করা হয়েছে!" : "Assets successfully imported & applied!");
      setInspectedPackage(null);
      setImportKeyInput("");
      setImportPinInput("");
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["my-transfer-keys"] });
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to apply transfer key");
    } finally {
      setApplyingKey(false);
    }
  }

  async function handleDeleteKey(keyToDelete: string) {
    if (!confirm(lang === "bn" ? "আপনি কি এই এক্সপোর্ট কি-টি বাতিল/ডিলিট করতে চান?" : "Are you sure you want to revoke this transfer key?")) return;
    setDeletingKey(keyToDelete);
    try {
      await deleteTransferKeyFn({ data: { key: keyToDelete } });
      toast.success(lang === "bn" ? "এক্সপোর্ট কি সফলভাবে বাতিল করা হয়েছে!" : "Transfer key revoked!");
      qc.invalidateQueries({ queryKey: ["my-transfer-keys"] });
      if (createdKeyResult?.key === keyToDelete) {
        setCreatedKeyResult(null);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke key");
    } finally {
      setDeletingKey(null);
    }
  }

  // KPI Reordering & Configuration Constants
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

  const KPI_METADATA: Record<
    string,
    { nameEn: string; nameBn: string; descEn: string; descBn: string; badge: string; color: string; bg: string }
  > = {
    total_sales: {
      nameEn: "Total Sales",
      nameBn: "আজকের মোট বিক্রয়",
      descEn: "Combined total of all sales orders",
      descBn: "সকল ক্যাশ, বাকি ও অনলাইন বিক্রির মোট যোগফল",
      badge: "Total",
      color: "text-blue-500",
      bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
    },
    cash_sale: {
      nameEn: "Cash Sale",
      nameBn: "নগদ বিক্রয়",
      descEn: "Instant cash payments received",
      descBn: "নগদে সংগৃহীত মোট বিক্রয়",
      badge: "Cash",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
    },
    sell_kpi: {
      nameEn: "Sell",
      nameBn: "বিক্রয়",
      descEn: "Total sales with bKash, bank & online pending payments breakdown",
      descBn: "মোট বিক্রয় ও বিকাশ, ব্যাংক ও অনলাইন পেন্ডিং হিসাব",
      badge: "Sell",
      color: "text-pink-600",
      bg: "bg-pink-500/10 border-pink-500/30 text-pink-600 dark:text-pink-400",
    },
    credit_sale: {
      nameEn: "Credit Sale",
      nameBn: "বাকি বিক্রয়",
      descEn: "Sales made on store credit / dues",
      descBn: "বাকিতে করা বিক্রয়",
      badge: "Credit",
      color: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    },
    online_sell: {
      nameEn: "Online Sale",
      nameBn: "অনলাইন বিক্রয়",
      descEn: "Web orders & courier deliveries",
      descBn: "কুরিয়ার ও অনলাইন অর্ডারের হিসাব",
      badge: "Online",
      color: "text-purple-500",
      bg: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
    },
    owner_wallet: {
      nameEn: "Owner's Expense",
      nameBn: "মালিকের খরচ (ওয়ালেট)",
      descEn: "Owner's personal & family withdrawals",
      descBn: "মালিকের ব্যক্তিগত ও পরিবার খরচের মোট হিসাব",
      badge: "Owner",
      color: "text-amber-600",
      bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
    },
    purchases: {
      nameEn: "Purchases (BUY)",
      nameBn: "মাল ক্রয় (BUY)",
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
      nameBn: "মোট ক্ষতি",
      descEn: "Loss incurred from discounts or returns",
      descBn: "ছাড় বা লস জনিত মোট ক্ষতি",
      badge: "Loss",
      color: "text-rose-500",
      bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400",
    },
    expense: {
      nameEn: "Total Expenses",
      nameBn: "মোট খরচ",
      descEn: "Daily operational & shop expenses",
      descBn: "দোকানের দৈনন্দিন খরচ ও বিল",
      badge: "Expense",
      color: "text-red-500",
      bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
    },
    due: {
      nameEn: "Customer Due",
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
      descEn: "Real-time physical money inside cashbox",
      descBn: "ক্যাশবক্সে উপস্থিত মোট নগদ টাকা",
      badge: "Cashbox",
      color: "text-teal-500",
      bg: "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
    },
    somiti: {
      nameEn: "Samity Savings",
      nameBn: "সমিতি ও সঞ্চয়",
      descEn: "Total deposits saved in samity funds",
      descBn: "সমিতিতে জমা ও সঞ্চয়ের মোট ব্যালেন্স",
      badge: "Samity",
      color: "text-cyan-500",
      bg: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
    },
  };

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

  // KPI Configuration state
  const [kpiConfig, setKpiConfig] = useState<{
    align: string;
    size: string;
    columns: number;
    variant: string;
    shadow: string;
    borderStyle: string;
    curve: string;
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
    order: DEFAULT_KPI_ORDER,
    hiddenKpis: [],
  });

  const [draggedKpiIdx, setDraggedKpiIdx] = useState<number | null>(null);

  // Admin PIN Code Lock State
  const [pinLockEnabled, setPinLockEnabled] = useState(false);
  const [pinCodeVal, setPinCodeVal] = useState("1234");
  const [pinTimeoutVal, setPinTimeoutVal] = useState("10");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPinLockEnabled(localStorage.getItem("app_pin_code_enabled") === "true");
      setPinCodeVal(localStorage.getItem("app_pin_code_val") || "1234");
      setPinTimeoutVal(localStorage.getItem("app_pin_timeout") || "10");
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("hz_kpi_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setKpiConfig(prev => ({
          ...prev,
          ...parsed,
          order: normalizeKpiOrderList(parsed.order),
          hiddenKpis: parsed.hiddenKpis || [],
        }));
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
      const updated = {
        ...prev,
        ...newSettings,
        order: newSettings.order ? normalizeKpiOrderList(newSettings.order) : prev.order,
      };
      localStorage.setItem("hz_kpi_config", JSON.stringify(updated));
      window.dispatchEvent(new Event("hz-kpi-config-updated"));
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

  const handleKpiDragStart = (idx: number) => {
    setDraggedKpiIdx(idx);
  };

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
    toast.success(lang === "bn" ? "KPI পজিশন সফলভাবে সাজানো হয়েছে!" : "KPI layout order updated!");
  };

  const resetKpiToDefault = () => {
    updateKpiConfig({ order: DEFAULT_KPI_ORDER });
    toast.success(lang === "bn" ? "KPI ক্রম ডিফল্ট আকারে রিসেট করা হয়েছে" : "KPI layout reset to default");
  };

  // Safety settings states
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Employee permissions editing state
  const [editingPermissionsEmp, setEditingPermissionsEmp] = useState<any | null>(null);
  const [empPermissions, setEmpPermissions] = useState<PermissionSet>(DEFAULT_EMPLOYEE_PERMISSIONS);
  const [isUpdatingPerms, setIsUpdatingPerms] = useState(false);

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
  const hasDangerZoneAccess = isOwner || settings.data?.permissions?.danger_zone === true;
  const isGoogleUser = Boolean(
    settings.data?.provider === "google" ||
    settings.data?.auth_provider === "google" ||
    settings.data?.firebase_uid ||
    (typeof window !== "undefined" && auth?.currentUser?.providerData?.some(p => p.providerId === "google.com")) ||
    (!settings.data?.has_password && !settings.data?.password && !settings.data?.plain_password)
  );

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
    { id: "transfer", label: lang === "bn" ? "অ্যাসেট ট্রান্সফার ও কি" : "Transfer Assets & Keys", icon: ArrowRightLeft, count: (myTransferKeys.data || []).length },
    { id: "printing", label: lang === "bn" ? "প্রিন্ট ও ইনভয়েস" : "POS & Printing", icon: Printer },
    { id: "sheets", label: lang === "bn" ? "গুগল শিট ও ক্লাউড" : "Google Sheets & Cloud", icon: FileSpreadsheet },
    { id: "staff", label: lang === "bn" ? "কর্মচারী ও আমন্ত্রণ" : "Staff & Invitations", icon: Users, count: activeEmployees.length + pendingInvites.length },
    { id: "appearance", label: lang === "bn" ? "থিম ও ডিসপ্লে" : "Appearance & Themes", icon: Sparkles },
    { id: "security", label: lang === "bn" ? "নিরাপত্তা ও রিসেট" : "Security & Reset", icon: ShieldAlert },
    { id: "history", label: lang === "bn" ? "ইতিহাস ও রিসাইকেল বিন" : "History & Recycle Bin", icon: HistoryIcon, count: (Array.isArray(recycleBin.data) ? recycleBin.data : []).length },
  ];

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Store className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                <span>{lang === "bn" ? "সিস্টেম সেটিংস ও কনফিগারেশন" : "System Settings & Business Hub"}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {lang === "bn"
                  ? "দোকানের প্রোফাইল, প্রিন্টার ফরম্যাট, ডাটা ট্রান্সফার কি, কর্মচারী আমন্ত্রণ এবং নিরাপত্তা পরিচালনা করুন"
                  : "Manage shop branding, thermal printing, asset transfer keys, employee invitations, and security"}
              </p>
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2.5 self-start sm:self-auto">
          <Button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "sale" } }));
            }}
            className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-2 shadow-xs cursor-pointer transition-all hover:scale-[1.02] active:scale-95"
            title={lang === "bn" ? "যেকোনো তারিখ ও সময়ের এন্ট্রি ডায়ালগ খুলুন [Alt+C]" : "Open Custom Entry Dialog with Date [Alt+C]"}
          >
            <Sparkles className="size-4 animate-pulse" />
            <span>{lang === "bn" ? "⚡ কাস্টম এন্ট্রি ডায়ালগ" : "⚡ Custom Entry Dialog"}</span>
            <kbd className="hidden md:inline-flex text-[10px] px-1.5 py-0.5 bg-black/20 rounded font-mono leading-none">
              Alt+C
            </kbd>
          </Button>
        </div>
      </div>

      {/* Top Secondary Div: Custom Entry Quick Launch Hub (PC & Tablet Only - hidden on phone) */}
      <div className="hidden md:block p-4 sm:p-5 rounded-2xl bg-card border border-border/80 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="size-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-foreground">
                  {lang === "bn" ? "কাস্টম এন্ট্রি ও দ্রুত শর্টকাট" : "Custom Entry & Quick Actions"}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <Calendar className="size-3" />
                  {lang === "bn" ? "তারিখ নির্বাচন সমর্থিত" : "Custom Date Supported"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {lang === "bn"
                  ? "যেকোনো পেছনের বা বর্তমান তারিখ ও সময় নির্বাচন করে সরাসরি সেল, খরচ, ক্রয় ও ক্যাশ এন্ট্রি করুন"
                  : "Record backdated or forward-dated sales, expenses, purchases, and cashbox transactions"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-lg border border-border/50 self-start sm:self-auto">
            <span>{lang === "bn" ? "পিসি শর্টকাট:" : "PC Hotkey:"}</span>
            <kbd className="font-mono font-bold text-foreground bg-background px-1 py-0.2 rounded border border-border text-[10px]">Alt + C</kbd>
            <span className="opacity-60">|</span>
            <kbd className="font-mono font-bold text-foreground bg-background px-1 py-0.2 rounded border border-border text-[10px]">Alt + 1..6</kbd>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-1">
          {/* 1. Custom Sale (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "sale" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "তারিখসহ বিক্রি এন্ট্রি [Alt+1]" : "Custom Sale with Date [Alt+1]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <ShoppingBag className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "কাস্টম বিক্রি" : "Custom Sale"}
            </span>
            <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "তারিখসহ" : "With Date"}
            </span>
          </button>

          {/* 2. Custom Expense (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "expense" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "তারিখসহ খরচ এন্ট্রি [Alt+2]" : "Custom Expense with Date [Alt+2]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <Receipt className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "কাস্টম খরচ" : "Custom Expense"}
            </span>
            <span className="text-[9px] font-medium text-rose-600 dark:text-rose-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "তারিখসহ" : "With Date"}
            </span>
          </button>

          {/* 3. Custom Purchase / Restock (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "purchase" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "তারিখসহ ক্রয় এন্ট্রি [Alt+3]" : "Custom Purchase with Date [Alt+3]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <ShoppingCart className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "কাস্টম ক্রয়" : "Custom Buy"}
            </span>
            <span className="text-[9px] font-medium text-indigo-600 dark:text-indigo-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "তারিখসহ" : "With Date"}
            </span>
          </button>

          {/* 4. Cash Deposit / Add Money (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "deposit" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-emerald-500/10 hover:border-emerald-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "ক্যাশবক্সে টাকা জমা (তারিখসহ) [Alt+4]" : "Cash Deposit with Date [Alt+4]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <ArrowDownLeft className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "টাকা জমা" : "Deposit"}
            </span>
            <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "ক্যাশবক্স" : "Cashbox"}
            </span>
          </button>

          {/* 5. Cash Withdraw (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "withdraw" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-amber-500/10 hover:border-amber-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "ক্যাশবক্স থেকে টাকা উত্তোলন (তারিখসহ) [Alt+5]" : "Cash Withdraw with Date [Alt+5]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <ArrowUpRight className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "টাকা উত্তোলন" : "Withdraw"}
            </span>
            <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "ক্যাশবক্স" : "Cashbox"}
            </span>
          </button>

          {/* 6. Due Collection (with date) */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_custom_entry", { detail: { initialType: "due_collection" } }));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-cyan-500/10 hover:border-cyan-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "তারিখসহ বাকি আদায় [Alt+6]" : "Due Collection with Date [Alt+6]"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <Banknote className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "বাকি আদায়" : "Due Collect"}
            </span>
            <span className="text-[9px] font-medium text-cyan-600 dark:text-cyan-400 mt-0.5 flex items-center gap-0.5">
              <Calendar className="size-2.5" />
              {lang === "bn" ? "তারিখসহ" : "With Date"}
            </span>
          </button>

          {/* 7. Switch ID / Profile */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open_mode_switcher"));
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-purple-500/10 hover:border-purple-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "মোড ও প্রোফাইল পরিবর্তন" : "Switch Profile & Mode"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <Users className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "প্রোফাইল সুইচ" : "Switch ID"}
            </span>
            <span className="text-[9px] font-medium text-purple-600 dark:text-purple-400 mt-0.5">
              {lang === "bn" ? "আইডি বদল" : "Multi-ID"}
            </span>
          </button>

          {/* 8. Transfer Assets */}
          <button
            type="button"
            onClick={() => setSettingsTab("transfer")}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-muted/40 hover:bg-amber-500/10 hover:border-amber-500/30 border border-border/60 transition-all text-center group cursor-pointer active:scale-95 shadow-2xs"
            title={lang === "bn" ? "অ্যাসেট ট্রান্সফার কি তৈরি করুন" : "Transfer Assets & Keys"}
          >
            <div className="size-8 sm:size-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform flex items-center justify-center mb-1.5 shadow-2xs">
              <ArrowRightLeft className="size-4" />
            </div>
            <span className="text-[11px] font-bold text-foreground truncate w-full">
              {lang === "bn" ? "অ্যাসেট ট্রান্সফার" : "Transfer Key"}
            </span>
            <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mt-0.5">
              {lang === "bn" ? "ডাটা কি" : "Data Key"}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Tab Selector (Compact & Direct for Phones) */}
      <div className="md:hidden w-full space-y-1.5">
        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Store className="size-3.5 text-primary" />
          <span>{lang === "bn" ? "সেটিংস বিভাগ নির্বাচন" : "Settings Section"}</span>
        </label>
        <div className="relative">
          <select
            value={settingsTab}
            onChange={(e) => setSettingsTab(e.target.value as SettingsTab)}
            aria-label={lang === "bn" ? "সেটিংস বিভাগ" : "Settings Section"}
            className="w-full h-11 px-3.5 pr-10 rounded-xl bg-card border border-border/80 text-xs font-bold text-foreground appearance-none shadow-xs focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
          >
            {navTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label} {tab.count !== undefined && tab.count > 0 ? `(${tab.count})` : ""}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
            <ChevronDown className="size-4" />
          </div>
        </div>
      </div>

      {/* Modern Desktop & Mobile Horizontal Scrollable Segmented Tab Bar */}
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

          {/* ── TAB: TRANSFER ASSETS & EXPORT KEYS ───────────────────────────── */}
          {settingsTab === "transfer" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Generate Export Key */}
              <Card className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <Share2 className="size-5 text-[#F7931A]" />
                      <span>{lang === "bn" ? "অ্যাসেট এক্সপোর্ট ও শেয়ার কি তৈরি" : "Create Asset Export & Share Key"}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "bn"
                        ? "আপনার প্রোডাক্ট, কাস্টমার, সেলস ও সেটিংস অন্য অ্যাকাউন্টে ট্রান্সফার করতে একটি সিকিউর কি তৈরি করুন"
                        : "Generate an export package and share key to transfer your store data to another user account"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs border-[#F7931A]/30 text-[#F7931A] bg-[#F7931A]/10 font-bold">
                    EXPORT
                  </Badge>
                </div>

                <form onSubmit={handleCreateTransferKey} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-foreground">
                      {lang === "bn" ? "প্যাকেজের নাম (ঐচ্ছিক)" : "Package Name (Optional)"}
                    </Label>
                    <Input
                      type="text"
                      value={exportName}
                      onChange={(e) => setExportName(e.target.value)}
                      placeholder={lang === "bn" ? "যেমন: ঢাকা ব্রাঞ্চ ডাটা ট্রান্সফার" : "e.g. Branch Store Migration"}
                      className="h-10 rounded-xl bg-muted/30 border-border/80 text-xs sm:text-sm"
                    />
                  </div>

                  {/* Checklist of elements to export */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-foreground">
                        {lang === "bn" ? "কোন কোন ডাটা ট্রান্সফার করবেন নির্বাচন করুন:" : "Select Data Elements to Transfer:"}
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setExportOptions({
                            shopProfile: true,
                            products: true,
                            customers: true,
                            parties: true,
                            sales: true,
                            expenses: true,
                            somiti: true,
                            kpiPrefs: true,
                          });
                        }}
                        className="text-[11px] text-primary cursor-pointer hover:underline font-semibold"
                      >
                        {lang === "bn" ? "সব নির্বাচন করুন" : "Select All"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {/* Products */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.products}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, products: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Package className="size-3.5 text-blue-500" />
                            <span>{lang === "bn" ? "প্রোডাক্ট ক্যাটালগ ও স্টক" : "Products & Stock"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "বারকোড, ক্রয়/বিক্রয় মূল্য ও ক্যাটাগরি" : "Barcodes, prices, categories & stock"}
                          </p>
                        </div>
                      </label>

                      {/* Customers */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.customers}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, customers: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Users className="size-3.5 text-emerald-500" />
                            <span>{lang === "bn" ? "কাস্টমার ও বকেয়া হিসাব" : "Customers & Dues"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "নাম, মোবাইল ও কাস্টমার বকেয়া" : "Customer names, phones & dues"}
                          </p>
                        </div>
                      </label>

                      {/* Parties / Suppliers */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.parties}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, parties: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Store className="size-3.5 text-purple-500" />
                            <span>{lang === "bn" ? "পার্টি ও সরবরাহকারী" : "Parties & Vendors"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "সাপ্লায়ার প্রোফাইল ও ব্যালেন্স" : "Suppliers & balances"}
                          </p>
                        </div>
                      </label>

                      {/* Sales History */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.sales}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, sales: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <ShoppingBag className="size-3.5 text-pink-500" />
                            <span>{lang === "bn" ? "বিক্রয় ও মেমো ইতিহাস" : "Sales & Invoices"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "পূর্বের মেমো ও ইনভয়েস রেকর্ড" : "Recent invoices & sales orders"}
                          </p>
                        </div>
                      </label>

                      {/* Expenses */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.expenses}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, expenses: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Receipt className="size-3.5 text-rose-500" />
                            <span>{lang === "bn" ? "দোকান খরচ" : "Expenses"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "দৈনিক দোকান খরচের খাতা" : "Overhead & operating expenses"}
                          </p>
                        </div>
                      </label>

                      {/* Shop Profile & Settings */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.shopProfile}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, shopProfile: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Store className="size-3.5 text-amber-500" />
                            <span>{lang === "bn" ? "দোকান প্রোফাইল ও সেটিংস" : "Shop Profile & Info"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "দোকানের নাম, ঠিকানা, লোগো ও শর্ত" : "Store name, logo, address & terms"}
                          </p>
                        </div>
                      </label>

                      {/* KPI Preferences */}
                      <label className="flex items-center gap-3 p-3 rounded-xl border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportOptions.kpiPrefs}
                          onChange={(e) => setExportOptions((prev) => ({ ...prev, kpiPrefs: e.target.checked }))}
                          className="size-4 rounded accent-[#F7931A] cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-indigo-500" />
                            <span>{lang === "bn" ? "ড্যাশবোর্ড কেপিআই বিন্যাস" : "KPI Preferences"}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {lang === "bn" ? "কাস্টম ড্যাশবোর্ড কার্ডের ক্রম" : "Card arrangement & order"}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Security PIN & Expiration */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">
                        {lang === "bn" ? "মেয়াদকাল" : "Expiration Time"}
                      </Label>
                      <select
                        value={exportExpiry}
                        onChange={(e) => setExportExpiry(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl bg-muted/30 border border-border/80 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="1">1 {lang === "bn" ? "ঘণ্টা" : "Hour"}</option>
                        <option value="24">24 {lang === "bn" ? "ঘণ্টা (১ দিন)" : "Hours (1 Day)"}</option>
                        <option value="168">7 {lang === "bn" ? "দিন" : "Days"}</option>
                        <option value="720">30 {lang === "bn" ? "দিন" : "Days"}</option>
                        <option value="0">{lang === "bn" ? "আজীবন (No Expiry)" : "Never Expire"}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">
                        {lang === "bn" ? "সিকিউরিটি পিন (ঐচ্ছিক)" : "Security PIN (Optional)"}
                      </Label>
                      <Input
                        type="password"
                        value={exportPin}
                        onChange={(e) => setExportPin(e.target.value)}
                        placeholder="e.g. 1234"
                        className="h-10 rounded-xl bg-muted/30 border-border/80 text-xs sm:text-sm"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={generatingKey}
                    className="w-full h-11 rounded-xl bg-[#F7931A] hover:bg-[#e08416] text-white font-bold text-xs sm:text-sm shadow-md shadow-amber-500/20 gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  >
                    {generatingKey ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <>
                        <KeyRound className="size-4" />
                        <span>{lang === "bn" ? "এক্সপোর্ট কি তৈরি করুন" : "Generate Transfer Key"}</span>
                      </>
                    )}
                  </Button>
                </form>

                {/* Generated Key Success Box */}
                {createdKeyResult && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-[#F7931A]/30 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCheck className="size-4 text-[#F7931A]" />
                        <span className="text-xs font-bold text-foreground">
                          {lang === "bn" ? "আপনার ট্রান্সফার কি প্রস্তুত!" : "Transfer Key Ready!"}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-background">
                        {createdKeyResult.expires_at ? `Expires: ${new Date(createdKeyResult.expires_at).toLocaleDateString()}` : "No Expiry"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-background border border-[#F7931A]/40">
                      <code className="text-sm sm:text-base font-mono font-extrabold text-[#F7931A] tracking-wider flex-1 truncate">
                        {createdKeyResult.key}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(createdKeyResult.key);
                          setCopiedKey(true);
                          toast.success(lang === "bn" ? "কি কপি করা হয়েছে!" : "Key copied to clipboard!");
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="h-8 px-2.5 text-xs font-bold gap-1 text-foreground hover:bg-muted cursor-pointer"
                      >
                        {copiedKey ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                        <span>{copiedKey ? (lang === "bn" ? "কপি হয়েছে" : "Copied") : (lang === "bn" ? "কপি করুন" : "Copy")}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              {/* Right Column: Claim & Import Assets from Key */}
              <div className="lg:col-span-5 space-y-6">
                <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                        <Download className="size-5 text-emerald-500" />
                        <span>{lang === "bn" ? "কি দিয়ে ডাটা ইমপোর্ট করুন" : "Import & Apply Transfer Key"}</span>
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lang === "bn"
                          ? "অন্য অ্যাকাউন্ট থেকে প্রাপ্ত এক্সপোর্ট কি এখানে দিয়ে ডাটা লোড করুন"
                          : "Enter an export key received from another user to import store assets"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-bold">
                      IMPORT
                    </Badge>
                  </div>

                  <form onSubmit={handleInspectKey} className="space-y-3.5">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-foreground">
                        {lang === "bn" ? "এক্সপোর্ট কি লিখুন" : "Enter Transfer Key"}
                      </Label>
                      <Input
                        type="text"
                        required
                        value={importKeyInput}
                        onChange={(e) => setImportKeyInput(e.target.value.toUpperCase())}
                        placeholder="e.g. TRX-7A92-K4B8"
                        className="h-10 rounded-xl font-mono text-xs sm:text-sm uppercase tracking-wider bg-muted/30 border-border/80"
                      />
                    </div>

                    {inspectedPackage?.requiresPin && (
                      <div className="space-y-1.5 animate-in fade-in duration-150">
                        <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Lock className="size-3.5 text-amber-500" />
                          <span>{lang === "bn" ? "সিকিউরিটি পিন কোড" : "Security PIN Code"}</span>
                        </Label>
                        <Input
                          type="password"
                          required
                          value={importPinInput}
                          onChange={(e) => setImportPinInput(e.target.value)}
                          placeholder="Enter PIN"
                          className="h-10 rounded-xl bg-muted/30 border-border/80 text-xs sm:text-sm"
                        />
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={inspectingKey}
                      variant="outline"
                      className="w-full h-10 rounded-xl text-xs font-bold gap-2 cursor-pointer"
                    >
                      {inspectingKey ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Sparkles className="size-3.5 text-primary" />
                          <span>{lang === "bn" ? "প্যাকেজ যাচাই করুন" : "Inspect Package"}</span>
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Inspected Package Details & Import Trigger */}
                  {inspectedPackage && !inspectedPackage.requiresPin && inspectedPackage.summary && (
                    <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <span className="text-xs font-bold text-foreground">
                          {inspectedPackage.name || "Store Package"}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {inspectedPackage.key}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {inspectedPackage.summary.products_count !== undefined && (
                          <div className="p-2 rounded-lg bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "পণ্য সংখ্যা" : "Products"}</span>
                            <span className="font-bold text-foreground">{inspectedPackage.summary.products_count} Items</span>
                          </div>
                        )}
                        {inspectedPackage.summary.customers_count !== undefined && (
                          <div className="p-2 rounded-lg bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "কাস্টমার" : "Customers"}</span>
                            <span className="font-bold text-foreground">{inspectedPackage.summary.customers_count} People</span>
                          </div>
                        )}
                        {inspectedPackage.summary.sales_count !== undefined && (
                          <div className="p-2 rounded-lg bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "বিক্রয় মেমো" : "Sales Records"}</span>
                            <span className="font-bold text-foreground">{inspectedPackage.summary.sales_count} Orders</span>
                          </div>
                        )}
                        {inspectedPackage.summary.parties_count !== undefined && (
                          <div className="p-2 rounded-lg bg-card border border-border/60">
                            <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "পার্টি ও সাপ্লায়ার" : "Parties"}</span>
                            <span className="font-bold text-foreground">{inspectedPackage.summary.parties_count} Vendors</span>
                          </div>
                        )}
                      </div>

                      {/* Import Mode: Merge vs Replace */}
                      <div className="space-y-1.5 pt-1">
                        <Label className="text-xs font-semibold text-foreground">
                          {lang === "bn" ? "ইমপোর্ট পদ্ধতি:" : "Import Strategy:"}
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setImportMode("merge")}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              importMode === "merge"
                                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                                : "bg-muted/30 border-border text-muted-foreground"
                            }`}
                          >
                            {lang === "bn" ? "বিদ্যমান ডাটার সাথে যোগ" : "Merge Data"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportMode("replace")}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              importMode === "replace"
                                ? "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400"
                                : "bg-muted/30 border-border text-muted-foreground"
                            }`}
                          >
                            {lang === "bn" ? "ডাটাবেজ প্রতিস্থাপন" : "Replace All"}
                          </button>
                        </div>
                      </div>

                      <Button
                        type="button"
                        disabled={applyingKey}
                        onClick={handleApplyTransferKey}
                        className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-500/20 gap-2 cursor-pointer transition-all active:scale-[0.98]"
                      >
                        {applyingKey ? (
                          <RefreshCw className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Check className="size-4" />
                            <span>{lang === "bn" ? "অ্যাসেট ইমপোর্ট ও যুক্ত করুন" : "Apply & Import Assets Now"}</span>
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Active Generated Keys Ledger */}
                <Card className="p-5 rounded-3xl bg-card border-border/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <KeyRound className="size-3.5 text-primary" />
                      <span>{lang === "bn" ? "সক্রিয় এক্সপোর্ট কি-সমূহ" : "Active Export Keys"}</span>
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {(myTransferKeys.data || []).length}
                    </Badge>
                  </div>

                  {(myTransferKeys.data || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      {lang === "bn" ? "কোন সক্রিয় এক্সপোর্ট কি নেই" : "No active export keys generated yet"}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {(myTransferKeys.data || []).map((k: any) => (
                        <div key={k.id || k.key} className="p-2.5 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <code className="text-xs font-mono font-bold text-primary">{k.key}</code>
                              {k.hasPin && <Lock className="size-3 text-amber-500" />}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {k.name} • {new Date(k.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(k.key);
                                toast.success(lang === "bn" ? "কি কপি করা হয়েছে!" : "Copied!");
                              }}
                              className="size-7 p-0 cursor-pointer"
                            >
                              <Copy className="size-3 text-muted-foreground" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={deletingKey === k.key}
                              onClick={() => handleDeleteKey(k.key)}
                              className="size-7 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
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
                          className="p-3.5 rounded-2xl bg-muted/40 border border-border/80 flex flex-col justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-foreground truncate">
                                {emp.full_name || emp.email.split("@")[0]}
                              </span>
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 px-1.5 py-0 h-4">
                                Active
                              </Badge>
                              {emp.permissions?.danger_zone && (
                                <Badge variant="outline" className="text-[10px] bg-red-500/10 text-red-600 border-red-500/30 px-1.5 py-0 h-4 font-bold">
                                  Danger Zone
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{emp.email}</p>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openPermissionsModal(emp)}
                              className="h-8 px-2.5 rounded-xl border-primary/30 hover:bg-primary/10 text-primary text-xs font-semibold gap-1.5 cursor-pointer"
                              title="Manage Access & Permissions"
                            >
                              <Shield className="size-3.5" />
                              <span>{lang === "bn" ? "পারমিশন কন্ট্রোল" : "Access & Permissions"}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveEmployee(emp.id)}
                              className="h-8 px-2 text-destructive hover:bg-destructive/10 rounded-xl shrink-0 cursor-pointer"
                              title="Remove Staff Access"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
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

              {/* KPI Configuration & Drag-and-Drop Card Position Manager */}
              <Card className="lg:col-span-12 p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                      <LayoutGrid className="size-5 text-primary" />
                      <span>{lang === "bn" ? "ড্যাশবোর্ড কেপিআই কার্ড লেআউট ও পজিশন নিয়ন্ত্রণ" : "Dashboard KPI Summary Cards & Positioning"}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "bn"
                        ? "কার্ডগুলো ড্র্যাগ-অ্যান্ড-ড্রপ করে বা তীর চিহ্নে ক্লিক করে ড্যাশবোর্ডে পছন্দের ক্রমানুসারে সাজান"
                        : "Drag and drop or use arrows to change KPI card sequence and positions on your dashboard"}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetKpiToDefault}
                    className="h-8 rounded-xl text-xs font-semibold gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <RotateCcw className="size-3.5" />
                    <span>{lang === "bn" ? "ডিফল্ট ক্রম রিসেট" : "Reset Default Order"}</span>
                  </Button>
                </div>

                {/* Grid Visual & Sizing Controls */}
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
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কার্ড স্টাইল" : "Surface Style"}</Label>
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

                {/* Drag and Drop KPI Position Reorder List */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <ArrowUpDown className="size-3.5 text-primary" />
                      <span>{lang === "bn" ? "কেপিআই কার্ডের অবস্থান ক্রম (↑ / ↓ কি বা বাটন)" : "KPI Card Sequence (↑ / ↓ Arrow Keys or Buttons)"}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {lang === "bn" ? "মোট ১৩টি কেপিআই কার্ড • অ্যারো বাটন বা কীবোর্ডের ↑/↓ চাপুন" : "13 Metric Cards • Use buttons or keyboard ↑/↓"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
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
                          className={`group flex items-center justify-between gap-2.5 p-3 rounded-2xl border transition-all select-none cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${
                            isBeingDragged
                              ? "opacity-50 border-primary bg-primary/15 shadow-md scale-[0.98]"
                              : "bg-card/90 hover:bg-card border-border/80 hover:border-primary/50 shadow-xs hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="p-1 text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                              <GripVertical className="size-4" />
                            </div>

                            <span className="flex items-center justify-center size-6 rounded-lg bg-muted text-[11px] font-bold font-mono text-muted-foreground shrink-0">
                              {idx + 1}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-bold truncate text-foreground">
                                  {lang === "bn" ? meta.nameBn : meta.nameEn}
                                </p>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${meta.bg}`}>
                                  {meta.badge}
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                {lang === "bn" ? meta.descBn : meta.descEn}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* KPI Visibility Toggle */}
                            {(() => {
                              const isHidden = (kpiConfig.hiddenKpis || []).includes(kpiKey);
                              return (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const hidden = kpiConfig.hiddenKpis || [];
                                    const updated = isHidden ? hidden.filter(k => k !== kpiKey) : [...hidden, kpiKey];
                                    updateKpiConfig({ hiddenKpis: updated });
                                  }}
                                  className={`size-7 p-0 rounded-lg cursor-pointer ${
                                    isHidden
                                      ? "text-rose-500 hover:text-rose-600 bg-rose-500/10"
                                      : "text-emerald-600 hover:text-emerald-700 bg-emerald-500/10"
                                  }`}
                                  title={
                                    isHidden
                                      ? (lang === "bn" ? "কেপিআইটি লুকানো আছে (ক্লিক করে প্রদর্শন করুন)" : "Hidden (Click to show)")
                                      : (lang === "bn" ? "কেপিআইটি প্রদর্শিত হচ্ছে (ক্লিক করে লুকান)" : "Visible (Click to hide)")
                                  }
                                >
                                  {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                                </Button>
                              );
                            })()}

                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={idx === 0}
                              onClick={() => moveKpiPosition(idx, idx - 1)}
                              className="size-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30 cursor-pointer"
                              title={lang === "bn" ? "উপরে নিন" : "Move Up"}
                            >
                              <ChevronUp className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={idx === normalizeKpiOrderList(kpiConfig.order).length - 1}
                              onClick={() => moveKpiPosition(idx, idx + 1)}
                              className="size-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30 cursor-pointer"
                              title={lang === "bn" ? "নিচে নিন" : "Move Down"}
                            >
                              <ChevronDown className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── TAB 6: SECURITY & DATA RESETS ────────────────────────────────── */}

          {/* ── TAB 7: HISTORY & RECYCLE BIN (UNDO & RESTORE) ─────────────── */}
          {settingsTab === "history" && (
            <div className="space-y-6">
              <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div>
                    <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                      <HistoryIcon className="size-5 text-primary" />
                      <span>{lang === "bn" ? "কমান্ড ইতিহাস ও রিসাইকেল বিন (Undo / Restore)" : "Command History & Recycle Bin"}</span>
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "bn"
                        ? "ভুলবশত ডিলিট হওয়া যেকোনো আইটেম সহজে পুনরুদ্ধার করুন এবং সাম্প্রতিক কমান্ডগুলো আনডু করুন"
                        : "Easily restore deleted inventory/sales from the Recycle Bin and undo recent command actions"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {historySubTab === "recycle" && (Array.isArray(recycleBin.data) ? recycleBin.data : []).length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 cursor-pointer"
                        onClick={async () => {
                          if (!confirm(lang === "bn" ? "আপনি কি রিসাইকেল বিনের সকল ডাটা সম্পূর্ণ খালি করতে চান?" : "Are you sure you want to permanently empty the Recycle Bin?")) return;
                          try {
                            await emptyRecycleBinFn();
                            toast.success(lang === "bn" ? "রিসাইকেল বিন খালি করা হয়েছে" : "Recycle bin emptied");
                            qc.invalidateQueries({ queryKey: ["recycle_bin"] });
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to empty bin");
                          }
                        }}
                      >
                        <Trash2 className="size-3.5 mr-1" />
                        {lang === "bn" ? "বিন খালি করুন" : "Empty Bin"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold cursor-pointer"
                      onClick={() => {
                        qc.invalidateQueries({ queryKey: ["recycle_bin"] });
                        qc.invalidateQueries({ queryKey: ["command_history"] });
                        toast.success(lang === "bn" ? "রিফ্রেশ হয়েছে" : "Refreshed");
                      }}
                    >
                      <RotateCcw className="size-3.5 mr-1" />
                      {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
                    </Button>
                  </div>
                </div>

                {/* Sub Tab Selector */}
                <div className="flex gap-2 p-1 bg-muted/60 rounded-xl max-w-md">
                  <button
                    type="button"
                    onClick={() => setHistorySubTab("recycle")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      historySubTab === "recycle"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Trash2 className="size-3.5" />
                    <span>{lang === "bn" ? "রিসাইকেল বিন" : "Recycle Bin"}</span>
                    {(Array.isArray(recycleBin.data) ? recycleBin.data : []).length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {(Array.isArray(recycleBin.data) ? recycleBin.data : []).length}
                      </Badge>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySubTab("commands")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      historySubTab === "commands"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <HistoryIcon className="size-3.5" />
                    <span>{lang === "bn" ? "কমান্ড ইতিহাস (Undo)" : "Command History (Undo)"}</span>
                    {(Array.isArray(commandHistory.data) ? commandHistory.data : []).length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {(Array.isArray(commandHistory.data) ? commandHistory.data : []).length}
                      </Badge>
                    )}
                  </button>
                </div>

                {/* Sub-Tab 1: RECYCLE BIN */}
                {historySubTab === "recycle" && (
                  <div className="space-y-3">
                    {recycleBin.isLoading ? (
                      <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                        {lang === "bn" ? "রিসাইকেল বিন লোড হচ্ছে..." : "Loading recycle bin..."}
                      </div>
                    ) : (Array.isArray(recycleBin.data) ? recycleBin.data : []).length === 0 ? (
                      <div className="py-12 text-center space-y-2 border border-dashed border-border/80 rounded-2xl bg-muted/20">
                        <Trash2 className="size-8 text-muted-foreground/40 mx-auto" />
                        <p className="text-sm font-semibold text-foreground">
                          {lang === "bn" ? "রিসাইকেল বিন সম্পূর্ণ খালি" : "Recycle Bin is Empty"}
                        </p>
                        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                          {lang === "bn"
                            ? "দোকান থেকে কোনো প্রোডাক্ট, সেলস বা খরচ ডিলিট করলে তা এখানে সংরক্ষিত থাকবে যাতে যেকোনো সময় আনডু করা যায়।"
                            : "Deleted products, sales, expenses, and records will appear here so you can restore them anytime."}
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(Array.isArray(recycleBin.data) ? recycleBin.data : []).map((item: any) => (
                          <div
                            key={item.id}
                            className="p-4 rounded-2xl bg-muted/30 border border-border/70 flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="capitalize text-[10px] py-0 px-1.5 font-bold">
                                    {item.entity_type}
                                  </Badge>
                                  <span className="text-xs font-bold text-foreground line-clamp-1">{item.title}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {lang === "bn" ? "মুছে ফেলার সময়: " : "Deleted: "}
                                  {new Date(item.deleted_at).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/40 cursor-pointer"
                                onClick={async () => {
                                  if (!confirm(lang === "bn" ? "স্থায়ীভাবে মুছে ফেলতে চান?" : "Delete permanently?")) return;
                                  try {
                                    await permanentDeleteRecycleItemFn({ data: { id: item.id } });
                                    toast.success(lang === "bn" ? "স্থায়ীভাবে ডিলিট করা হয়েছে" : "Permanently deleted");
                                    qc.invalidateQueries({ queryKey: ["recycle_bin"] });
                                  } catch (err: any) {
                                    toast.error(err?.message || "Failed to delete");
                                  }
                                }}
                              >
                                <Trash2 className="size-3.5 mr-1" />
                                {lang === "bn" ? "মুছুন" : "Delete"}
                              </Button>

                              <Button
                                type="button"
                                size="sm"
                                disabled={restoringId === item.id}
                                className="h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs gap-1.5"
                                onClick={async () => {
                                  setRestoringId(item.id);
                                  try {
                                    await restoreRecycleItemFn({ data: { id: item.id } });
                                    toast.success(lang === "bn" ? "আইটেম সফলভাবে পুনরুদ্ধার করা হয়েছে!" : "Item restored successfully!");
                                    qc.invalidateQueries({ queryKey: ["recycle_bin"] });
                                    qc.invalidateQueries({ queryKey: ["products"] });
                                    qc.invalidateQueries({ queryKey: ["sales"] });
                                    qc.invalidateQueries({ queryKey: ["expenses"] });
                                    qc.invalidateQueries({ queryKey: ["purchases"] });
                                    qc.invalidateQueries({ queryKey: ["cashbox"] });
                                    qc.invalidateQueries({ queryKey: ["returns"] });
                                    qc.invalidateQueries({ queryKey: ["parties"] });
                                  } catch (err: any) {
                                    toast.error(err?.message || "Failed to restore");
                                  } finally {
                                    setRestoringId(null);
                                  }
                                }}
                              >
                                <RotateCcw className={`size-3.5 ${restoringId === item.id ? "animate-spin" : ""}`} />
                                <span>{lang === "bn" ? "পুনরুদ্ধার করুন (Undo)" : "Restore Item"}</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Tab 2: COMMAND & ACTION HISTORY */}
                {historySubTab === "commands" && (
                  <div className="space-y-3">
                    {commandHistory.isLoading ? (
                      <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                        {lang === "bn" ? "কমান্ড ইতিহাস লোড হচ্ছে..." : "Loading command history..."}
                      </div>
                    ) : (Array.isArray(commandHistory.data) ? commandHistory.data : []).length === 0 ? (
                      <div className="py-12 text-center space-y-2 border border-dashed border-border/80 rounded-2xl bg-muted/20">
                        <HistoryIcon className="size-8 text-muted-foreground/40 mx-auto" />
                        <p className="text-sm font-semibold text-foreground">
                          {lang === "bn" ? "কোন সাম্প্রতিক কমান্ড ইতিহাস নেই" : "No Recent Commands"}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-card overflow-hidden">
                        {(Array.isArray(commandHistory.data) ? commandHistory.data : []).map((cmd: any) => (
                          <div key={cmd.id + cmd.action} className="p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                  cmd.action.startsWith("SALE")
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : cmd.action.startsWith("EXPENSE")
                                    ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                                    : cmd.action.startsWith("ITEM_DELETED")
                                    ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                    : "bg-primary/10 text-primary border border-primary/20"
                                }`}>
                                  {cmd.action.replace("_", " ")}
                                </span>
                                <p className="text-xs font-bold text-foreground truncate">{cmd.title}</p>
                              </div>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(cmd.timestamp).toLocaleString(lang === "bn" ? "bn-BD" : "en-US")}
                                {cmd.amount > 0 && ` • ৳${Number(cmd.amount).toLocaleString()}`}
                              </p>
                            </div>

                            {cmd.canUndo && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={undoingId === cmd.id}
                                className="h-8 px-3 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/10 cursor-pointer shrink-0"
                                onClick={async () => {
                                  if (!confirm(lang === "bn" ? `আপনি কি "${cmd.title}" কমান্ডটি আনডু করতে চান?` : `Do you want to undo "${cmd.title}"?`)) return;
                                  setUndoingId(cmd.id);
                                  try {
                                    await undoCommandFn({ data: { id: cmd.id, undoType: cmd.undoType, recycleId: cmd.recycleId } });
                                    toast.success(lang === "bn" ? "কমান্ড সফলভাবে আনডু করা হয়েছে!" : "Command undone successfully!");
                                    qc.invalidateQueries({ queryKey: ["command_history"] });
                                    qc.invalidateQueries({ queryKey: ["recycle_bin"] });
                                    qc.invalidateQueries({ queryKey: ["sales"] });
                                    qc.invalidateQueries({ queryKey: ["products"] });
                                    qc.invalidateQueries({ queryKey: ["expenses"] });
                                    qc.invalidateQueries({ queryKey: ["purchases"] });
                                    qc.invalidateQueries({ queryKey: ["cashbox"] });
                                  } catch (err: any) {
                                    toast.error(err?.message || "Failed to undo command");
                                  } finally {
                                    setUndoingId(null);
                                  }
                                }}
                              >
                                <Undo2 className={`size-3.5 ${undoingId === cmd.id ? "animate-spin" : ""}`} />
                                <span>{lang === "bn" ? "আনডু" : "Undo"}</span>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}

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
                        {lang === "bn" ? "সাইটে প্রবেশের সময় ৪ সংখ্যার পিন কোড সক্রিয় করুন" : "Require a 4-digit PIN code to enter and access this website"}
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
                        <Label className="text-xs font-semibold">{lang === "bn" ? "৪ সংখ্যার পিন কোড সেট করুন" : "Set 4-Digit PIN Code"}</Label>
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
                          placeholder="e.g. 1234"
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
                    setEmpPermissions(prev => ({
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
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
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
