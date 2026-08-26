"use client";

import { useCachedQuery } from "@/hooks/use-cached-query";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Wallet, AlertCircle, Receipt, ShoppingBag, ShoppingCart,
  Package, PlusCircle, ArrowUpRight, ArrowDownRight, CreditCard, PiggyBank,
  DollarSign, Banknote, Users, Search, ChevronDown, ChevronUp, ArrowUpDown,
  Trash2, Plus, Calendar, BarChart3, LineChart as LineChartIcon, AreaChart as AreaChartIcon, CheckSquare, Square,
  Palette, Sparkles, LayoutGrid, SlidersHorizontal, Layers, Eye, EyeOff,
  Truck, PackageCheck, CheckCircle2, XCircle, Clock, GripVertical, RotateCcw
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { getExpenses, getSales, getWithdrawals, getProducts, getParties, getReminders, getAllPayments, getAllPartyReceivables, getAllPartyPayables, getAllPayableSettlements, getPurchases, getSomiti } from "@/lib/queries";
import type { Reminder } from "@/lib/queries";
import { cashboxBalance } from "@/lib/cashbox-utils";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, resolvePermissions } from "@/lib/permissions";
import { ProductSearchSelect } from "@/components/product-search";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createReminderFn, toggleReminderFn, deleteReminderFn, approveCourierPaymentFn, cancelCourierOrderFn } from "@/lib/rpc";
import { SaleDialog } from "@/components/sale-dialog";
import { playTapSound } from "@/lib/audio";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from "recharts";

// ── helpers ──────────────────────────────────────────────────────────────
function startOf(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function dayLabel(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupAllDataByDay(sales: any[], expenses: any[], days: number) {
  const result: Record<string, { date: string; sales: number; profit: number; expenses: number; rawDate: string }> = {};
  
  // Initialize date buckets for each day
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en-CA"); // "YYYY-MM-DD"
    const displayLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    result[key] = { date: displayLabel, sales: 0, profit: 0, expenses: 0, rawDate: key };
  }

  // Populate sales and profit
  for (const s of sales || []) {
    if (s.returned) continue;
    if (!s.created_at) continue;
    const sDate = new Date(s.created_at);
    const key = sDate.toLocaleDateString("en-CA");
    if (result[key]) {
      const saleVal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1);
      result[key].sales += saleVal;
      result[key].profit += Number(s.profit) || 0;
    }
  }

  // Populate expenses
  for (const e of expenses || []) {
    if (!e.created_at) continue;
    const eDate = new Date(e.created_at);
    const key = eDate.toLocaleDateString("en-CA");
    if (result[key]) {
      result[key].expenses += Number(e.amount) || 0;
    }
  }

  return Object.values(result);
}

// ── Bento Grid KPICard ─────────────────────────────────────────────────────────────
function KPICard({
  label, value, sub, icon: Icon, imageUrl, trend, trendUp, color, onClick, className, imageClassName,
  align = "left", size = "small", variant = "glass", shadowStyle = "glow", borderStyle = "subtle", curve = "none", isBentoHero = false, isDesktop = false, hotkey,
  isPrivacyProtected = false, isRevealed = true,
}: {
  label: string; value: string; sub?: string;
  icon?: React.ElementType; imageUrl?: string; trend?: string; trendUp?: boolean; color: string;
  onClick?: () => void; className?: string; imageClassName?: string;
  align?: "left" | "center" | "right";
  size?: "xxs" | "xs" | "small" | "standard" | "large" | "xl";
  variant?: "glass" | "flat" | "bordered" | "neon" | "gradient";
  shadowStyle?: "none" | "soft" | "deep" | "glow" | "neon";
  borderStyle?: "subtle" | "bold" | "pink" | "emerald" | "amber" | "indigo" | "dashed" | "none";
  curve?: "none" | "sm" | "md" | "lg" | "xl" | "full";
  isBentoHero?: boolean;
  isDesktop?: boolean;
  hotkey?: string | number;
  isPrivacyProtected?: boolean;
  isRevealed?: boolean;
}) {
  const { lang } = useT();
  const alignClass = align === "center" ? "text-center items-center" : align === "right" ? "text-right items-end" : "text-left items-start";
  
  const sizePadding =
    size === "xxs"
      ? "px-2 py-1.5 min-h-[44px] gap-1"
      : size === "xs"
        ? "px-2.5 py-2 min-h-[52px] gap-1"
        : size === "small"
          ? "px-3 py-2.5 min-h-[64px] gap-1.5"
          : size === "large"
            ? "px-4 py-3 min-h-[84px] gap-2"
            : size === "xl"
              ? "px-5 py-4 min-h-[100px] gap-2.5"
              : "px-3.5 py-2.5 min-h-[70px] gap-1.5";

  const labelSize =
    size === "xxs"
      ? "text-[9px]"
      : size === "xs"
        ? "text-[10px]"
        : size === "small"
          ? "text-[11px] sm:text-xs"
          : size === "large"
            ? "text-xs sm:text-sm font-semibold"
            : size === "xl"
              ? "text-xs sm:text-sm font-bold"
              : "text-[11px] sm:text-xs";

  const valSize =
    size === "xxs"
      ? "text-xs font-bold truncate w-full"
      : size === "xs"
        ? "text-xs sm:text-sm font-bold truncate w-full"
        : size === "small"
          ? "text-sm sm:text-base font-bold truncate w-full"
          : size === "large"
            ? "text-base min-[360px]:text-lg sm:text-xl font-extrabold truncate w-full"
            : size === "xl"
              ? "text-lg min-[360px]:text-xl sm:text-2xl font-black truncate w-full"
              : "text-sm sm:text-base font-bold truncate w-full";

  const iconImgSize =
    size === "xxs"
      ? "size-4 sm:size-5"
      : size === "xs"
        ? "size-5 sm:size-6"
        : size === "small"
          ? "size-6 sm:size-7"
          : size === "large"
            ? "size-8 sm:size-9"
            : size === "xl"
              ? "size-10 sm:size-11"
              : "size-6 sm:size-7";

  const subSize = size === "xxs" || size === "xs" || size === "small" ? "text-[9px]" : "text-[9px] sm:text-[10px]";

  const getCurveClass = () => {
    switch (curve) {
      case "none": return "rounded-none";
      case "sm": return "rounded-xs";
      case "md": return "rounded-xs";
      case "lg": return "rounded-xs";
      case "xl": return "rounded-xs";
      case "full": return "rounded-sm";
      default: return "rounded-none";
    }
  };

  // PC version high-contrast outline & custom border style
  const getBorderClass = () => {
    switch (borderStyle) {
      case "bold": return "border-2 border-primary md:border-2 md:border-primary shadow-sm";
      case "pink": return "border-2 border-[#E2136E] shadow-[0_0_15px_rgba(226,19,110,0.22)]";
      case "emerald": return "border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.22)]";
      case "amber": return "border-2 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.22)]";
      case "indigo": return "border-2 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.22)]";
      case "dashed": return "border-2 border-dashed border-primary/70";
      case "none": return "border-0";
      default: return "border border-border/80 md:border-2 md:border-border/90";
    }
  };

  const getCardTheme = () => {
    let shadowClass = "";
    if (shadowStyle === "none") shadowClass = "shadow-none";
    else if (shadowStyle === "soft") shadowClass = "shadow-sm hover:shadow-md";
    else if (shadowStyle === "deep") shadowClass = "shadow-lg hover:shadow-2xl";
    else if (shadowStyle === "glow") shadowClass = "shadow-[0_8px_25px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_25px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.15)]";
    else if (shadowStyle === "neon") shadowClass = "shadow-[0_0_20px_rgba(59,130,246,0.25)] hover:shadow-[0_0_30px_rgba(59,130,246,0.45)]";

    const customBorder = getBorderClass();

    if (variant === "flat") {
      return {
        bg: `bg-card ${customBorder}`,
        shadow: shadowClass,
      };
    }
    if (variant === "bordered") {
      return {
        bg: `bg-card/95 backdrop-blur-md ${customBorder}`,
        shadow: shadowClass,
      };
    }
    if (variant === "neon") {
      return {
        bg: `bg-zinc-950/90 dark:bg-zinc-950/95 backdrop-blur-xl ${customBorder} text-white`,
        shadow: "shadow-[0_0_25px_rgba(16,185,129,0.22)] hover:shadow-[0_0_35px_rgba(16,185,129,0.42)]",
      };
    }
    if (variant === "gradient") {
      return {
        bg: `bg-gradient-to-br from-primary/10 via-card to-primary/5 ${customBorder}`,
        shadow: shadowClass,
      };
    }
    // Default: Glassmorphic Fintech Bento
    switch (color) {
      case "bg-emerald-500":
        return {
          bg: `bg-gradient-to-br from-white/95 via-emerald-50/40 to-emerald-500/10 dark:from-zinc-900/95 dark:via-emerald-950/30 dark:to-emerald-500/10 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_22px_rgba(16,185,129,0.12)] hover:shadow-[0_10px_30px_rgba(16,185,129,0.22)]",
        };
      case "bg-rose-500":
        return {
          bg: `bg-gradient-to-br from-white/95 via-rose-50/40 to-rose-500/10 dark:from-zinc-900/95 dark:via-rose-950/30 dark:to-rose-500/10 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_22px_rgba(244,63,94,0.12)] hover:shadow-[0_10px_30px_rgba(244,63,94,0.22)]",
        };
      case "bg-indigo-500":
      case "bg-indigo-600":
        return {
          bg: `bg-gradient-to-br from-white/95 via-indigo-50/40 to-indigo-500/10 dark:from-zinc-900/95 dark:via-indigo-950/30 dark:to-indigo-500/10 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_22px_rgba(99,102,241,0.12)] hover:shadow-[0_10px_30px_rgba(99,102,241,0.22)]",
        };
      case "bg-amber-500":
      case "bg-amber-600":
        return {
          bg: `bg-gradient-to-br from-white/95 via-amber-50/40 to-amber-500/10 dark:from-zinc-900/95 dark:via-amber-950/30 dark:to-amber-500/10 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_22px_rgba(245,158,11,0.12)] hover:shadow-[0_10px_30px_rgba(245,158,11,0.22)]",
        };
      case "bg-sky-500":
        return {
          bg: `bg-gradient-to-br from-white/95 via-sky-50/40 to-sky-500/10 dark:from-zinc-900/95 dark:via-sky-950/30 dark:to-sky-500/10 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_22px_rgba(14,165,233,0.12)] hover:shadow-[0_10px_30px_rgba(14,165,233,0.22)]",
        };
      default:
        return {
          bg: `bg-gradient-to-br from-white/95 to-zinc-100/60 dark:from-zinc-900/95 dark:to-zinc-950/85 backdrop-blur-md ${customBorder}`,
          shadow: shadowStyle === "none" ? "shadow-none" : "shadow-[0_6px_20px_rgba(0,0,0,0.05)]",
        };
    }
  };

  const themeStyle = getCardTheme();

  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Card
      onClick={onClick}
      className={`group flex flex-col justify-between transition-all duration-200 relative overflow-hidden beveled-kpi ${sizePadding} ${alignClass} ${className || ""} ${themeStyle.bg} ${
        isDesktop
          ? "hover:shadow-xl hover:-translate-y-0.5"
          : "hover:shadow-md"
      } ${getCurveClass()} ${
        onClick ? "cursor-pointer hover:border-primary/60 active:opacity-90" : ""
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/90 dark:via-white/25 to-transparent pointer-events-none z-20" />

      <div className={`flex items-center justify-between w-full ${align === "right" ? "flex-row-reverse" : ""}`}>
        <div className="flex items-center gap-1.5 min-w-0 mr-2">
          <span className={`${labelSize} font-bold text-muted-foreground truncate tracking-tight`}>{label}</span>
        </div>
        {imageUrl && !imgFailed ? (
          <div className="flex items-center justify-center shrink-0">
            <img
              src={imageUrl}
              onError={() => setImgFailed(true)}
              className={`${iconImgSize} object-contain ${imageClassName || ""}`}
              alt={label}
            />
          </div>
        ) : Icon ? (
          <div className="flex items-center justify-center shrink-0 p-1 rounded-xl bg-primary/10 border border-primary/20">
            <Icon className={`${iconImgSize} text-primary`} />
          </div>
        ) : null}
      </div>

      <div className={`flex flex-col w-full ${align === "center" ? "items-center" : align === "right" ? "items-end" : "items-start"} mt-1 min-w-0 z-10`}>
        {isPrivacyProtected && !isRevealed ? (
          <div className="flex items-center gap-1.5 select-none py-0.5 animate-in fade-in duration-200">
            <span className="font-mono tracking-widest text-foreground/80 font-black text-sm sm:text-base">••••••</span>
            <span className="p-1 rounded-full bg-primary/10 text-primary flex items-center justify-center border border-primary/25 shadow-2xs">
              <Eye className="size-3.5 text-primary animate-pulse" />
            </span>
          </div>
        ) : (
          <div className={`${valSize} font-bold tracking-tight text-foreground flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200`} title={value}>
            <span>{value}</span>
            {isPrivacyProtected && (
              <span className="inline-flex items-center p-1 rounded-full bg-muted/60 text-muted-foreground/80">
                <Eye className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              </span>
            )}
          </div>
        )}
        {sub && <div className={`${subSize} text-muted-foreground mt-0.5 truncate w-full`} title={sub}>{sub}</div>}
      </div>

      {trend && (
        <div className={`flex items-center gap-1 ${subSize} font-medium ${trendUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"} mt-0.5 truncate w-full z-10`} title={trend}>
          {trendUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
          <span>{trend}</span>
        </div>
      )}
    </Card>
  );
}

// ── custom tooltip ────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-2.5 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-1.5">
          <div className="size-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">৳{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── main dashboard ────────────────────────────────────────────────────────
export default function Dashboard() {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const perms = resolvePermissions(user?.role ?? "employee", user?.permissions);
  const isMobile = useIsMobile();
  
  // Data queries
  const sales = useCachedQuery(["sales"], getSales);
  const expenses = useCachedQuery(["expenses"], getExpenses);
  const withdrawals = useCachedQuery(["withdrawals"], getWithdrawals);
  const cashbox = useCashboxQuery();
  const products = useCachedQuery(["products"], getProducts);
  const parties = useCachedQuery(["parties"], getParties);
  const purchases = useCachedQuery(["purchases"], getPurchases);
  const somiti = useCachedQuery(["somiti"], getSomiti);
  const allPayments = useCachedQuery(["all-payments"], getAllPayments);
  const allReceivables = useCachedQuery(["all-party-receivables"], getAllPartyReceivables);
  const allPayables = useCachedQuery(["all-party-payables"], getAllPartyPayables);
  const allSettlements = useCachedQuery(["all-payable-settlements"], getAllPayableSettlements);
  const { data: reminders = [] } = useCachedQuery(["reminders"], getReminders);

  const allSales      = sales.data ?? [];
  const allExpenses   = expenses.data ?? [];
  const allWithdrawals = withdrawals.data ?? [];
  const allCashbox    = cashbox.data ?? [];
  const allParties    = parties.data ?? [];

  const getPartyOutstanding = (partyId: string) => {
    const saleDues = allSales.filter(s => s.party_id === partyId && !s.returned).reduce((sum, s) => sum + (Number(s.due_amount) || 0), 0);
    const manualDues = (allReceivables.data ?? []).filter(r => r.party_id === partyId).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const payments = (allPayments.data ?? []).filter(p => p.party_id === partyId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    return Math.max((saleDues + manualDues) - payments, 0);
  };

  const [dateFilter, setDateFilter] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [showFilter, setShowFilter] = useState(false);

  // Fintech-Style Privacy Mask for Sensitive Balance & Profit KPIs
  const [revealedKpis, setRevealedKpis] = useState<{ profit: boolean; somiti: boolean }>({
    profit: false,
    somiti: false,
  });

  const handlePrivacyKpiClick = (e: React.MouseEvent, key: "profit" | "somiti", path: string) => {
    e.preventDefault();
    e.stopPropagation();
    playTapSound();

    if (!revealedKpis[key]) {
      setRevealedKpis(prev => ({ ...prev, [key]: true }));
      const hasShown = typeof sessionStorage !== "undefined" && sessionStorage.getItem(`kpi_hint_${key}`);
      if (!hasShown) {
        try {
          sessionStorage.setItem(`kpi_hint_${key}`, "true");
        } catch (_) {}
        toast.info(
          lang === "bn"
            ? (key === "profit" ? "লাভের পরিমাণ দৃশ্যমান হয়েছে" : "সমিতি জমার পরিমাণ দৃশ্যমান হয়েছে")
            : "Amount revealed",
          { duration: 900 }
        );
      }
    } else {
      router.push(path);
    }
  };

  const dateRangeLabel = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) {
      return t("today");
    }
    if (dateFilter.from && dateFilter.to) {
      if (dateFilter.from === dateFilter.to) {
        return dateFilter.from;
      }
      return `${dateFilter.from} - ${dateFilter.to}`;
    }
    if (dateFilter.from) {
      return `>= ${dateFilter.from}`;
    }
    if (dateFilter.to) {
      return `<= ${dateFilter.to}`;
    }
    return t("today");
  }, [dateFilter, t]);

  // Custom Chart State
  const [chartMetric, setChartMetric] = useState<"sales" | "profit" | "expenses">("sales");
  const [chartType, setChartType] = useState<"area" | "bar" | "line">("area");
  const [chartRange, setChartRange] = useState<7 | 14 | 30>(7);

  // Custom Reminder State & Logic variables
  const [newReminderTitle, setNewReminderTitle] = useState("");
  const [newReminderDate, setNewReminderDate] = useState("");
  const [reminderBusy, setReminderBusy] = useState(false);
  const [logicType, setLogicType] = useState<"none" | "low_stock" | "product_stock" | "party_due">("none");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockThreshold, setStockThreshold] = useState("5");
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [duesThreshold, setDuesThreshold] = useState("1000");
  const [showPopup, setShowPopup] = useState(false);

  // Quick Sell Dialog state
  const [saleOpen, setSaleOpen] = useState(false);
  const [salePresetType, setSalePresetType] = useState<"cash" | "credit" | "online">("cash");

  // Recent Activity Limit state
  const [activityLimit, setActivityLimit] = useState(5);

  // Best Selling Limit state
  const [bestSellingLimit, setBestSellingLimit] = useState(5);

  // Helper to ensure all KPIs exist in kpi order
  const DEFAULT_KPI_ORDER = [
    "total_sales",
    "cash_sale",
    "credit_sale",
    "online_sell",
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
    { nameEn: string; nameBn: string; badge: string; bg: string }
  > = {
    total_sales: { nameEn: "Total Sales", nameBn: "আজকের মোট বিক্রয়", badge: "Total", bg: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400" },
    cash_sale: { nameEn: "Cash Sale", nameBn: "নগদ বিক্রয়", badge: "Cash", bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400" },
    credit_sale: { nameEn: "Credit Sale", nameBn: "বাকি বিক্রয়", badge: "Credit", bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" },
    online_sell: { nameEn: "Online Sale", nameBn: "অনলাইন বিক্রয়", badge: "Online", bg: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400" },
    purchases: { nameEn: "Purchases (BUY)", nameBn: "মাল ক্রয় (BUY)", badge: "Buy", bg: "bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400" },
    profit: { nameEn: "Total Profit", nameBn: "মোট লাভ", badge: "Profit", bg: "bg-emerald-600/10 border-emerald-600/30 text-emerald-600 dark:text-emerald-400" },
    loss: { nameEn: "Total Loss", nameBn: "মোট ক্ষতি", badge: "Loss", bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400" },
    expense: { nameEn: "Total Expenses", nameBn: "মোট খরচ", badge: "Expense", bg: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400" },
    due: { nameEn: "Customer Due", nameBn: "ক্রেতার বাকি", badge: "Due", bg: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400" },
    cashbox: { nameEn: "Cashbox Balance", nameBn: "ক্যাশবক্স ব্যালেন্স", badge: "Cashbox", bg: "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400" },
    somiti: { nameEn: "Samity Savings", nameBn: "সমিতি ও সঞ্চয়", badge: "Samity", bg: "bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400" },
  };

  const normalizeKpiOrder = (order?: string[]) => {
    const defaultList = [...DEFAULT_KPI_ORDER];
    if (!order || !Array.isArray(order) || order.length === 0) return defaultList;
    const list = [...order];
    for (const key of defaultList) {
      if (!list.includes(key)) list.push(key);
    }
    return list.filter(k => defaultList.includes(k));
  };

  // KPI Configuration state
  const [kpiConfig, setKpiConfig] = useState({
    align: "left",
    size: "small",
    columns: 2,
    variant: "glass",
    shadow: "glow",
    borderStyle: "subtle",
    curve: "none",
    bentoGrid: true,
    order: DEFAULT_KPI_ORDER,
  });

  const [draggedKpiIdx, setDraggedKpiIdx] = useState<number | null>(null);

  const [bentoCustomizerOpen, setBentoCustomizerOpen] = useState(false);

  const updateKpiConfig = (newSettings: Partial<typeof kpiConfig>) => {
    setKpiConfig(prev => {
      const updated = {
        ...prev,
        ...newSettings,
        order: newSettings.order ? normalizeKpiOrder(newSettings.order) : prev.order,
      };
      localStorage.setItem("hz_kpi_config", JSON.stringify(updated));
      window.dispatchEvent(new Event("hz-kpi-config-updated"));
      return updated;
    });
  };

  const moveKpiPosition = (fromIdx: number, toIdx: number) => {
    const currentOrder = normalizeKpiOrder(kpiConfig.order);
    if (toIdx < 0 || toIdx >= currentOrder.length) return;
    const list = [...currentOrder];
    const [movedItem] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, movedItem);
    updateKpiConfig({ order: list });
    toast.success(lang === "bn" ? "KPI পজিশন সফলভাবে সাজানো হয়েছে" : "KPI position updated");
  };

  const handleKpiDragStart = (idx: number) => {
    setDraggedKpiIdx(idx);
  };

  const handleKpiDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedKpiIdx === null || draggedKpiIdx === idx) return;
    const currentOrder = normalizeKpiOrder(kpiConfig.order);
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
    toast.success(lang === "bn" ? "KPI পজিশন সফলভাবে সাজানো হয়েছে!" : "KPI positions updated!");
  };

  const resetKpiToDefault = () => {
    updateKpiConfig({ order: DEFAULT_KPI_ORDER });
    toast.success(lang === "bn" ? "KPI ক্রম ডিফল্টে রিসেট করা হয়েছে" : "KPI order reset to default");
  };

  const sizesList = ["xxs", "xs", "small", "standard", "large", "xl"] as const;
  const increaseKpiSize = () => {
    const currentIdx = sizesList.indexOf((kpiConfig.size as any) || "standard");
    if (currentIdx < sizesList.length - 1) {
      updateKpiConfig({ size: sizesList[currentIdx + 1] });
    }
  };
  const decreaseKpiSize = () => {
    const currentIdx = sizesList.indexOf((kpiConfig.size as any) || "standard");
    if (currentIdx > 0) {
      updateKpiConfig({ size: sizesList[currentIdx - 1] });
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("hz_kpi_config");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setKpiConfig(prev => ({
          ...prev,
          ...parsed,
          order: normalizeKpiOrder(parsed.order)
        }));
      } catch (e) {
        console.error("Failed to parse kpi config", e);
      }
    }
    const handleUpdate = () => {
      const savedNew = localStorage.getItem("hz_kpi_config");
      if (savedNew) {
        try {
          const parsed = JSON.parse(savedNew);
          setKpiConfig(prev => ({
            ...prev,
            ...parsed,
            order: normalizeKpiOrder(parsed.order)
          }));
        } catch (e) {
          console.error(e);
        }
      }
    };
    window.addEventListener("hz-kpi-config-updated", handleUpdate);
    return () => window.removeEventListener("hz-kpi-config-updated", handleUpdate);
  }, []);

  // Collapsible sections on mobile
  const [collapsed, setCollapsed] = useState({
    kpis: false,
    graphs: false,
    reminders: false,
    recent: false,
    pie: false,
  });

  // Widget ordering state
  const [widgetOrder, setWidgetOrder] = useState<string[]>([
    'kpis', 'valuations', 'graphs', 'pie', 'reminders', 'quickLinks', 'bestSelling', 'recent'
  ]);

  const loadWidgetOrder = () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("hz_dashboard_widget_order");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.includes('pie')) {
            const idx = parsed.indexOf('graphs');
            if (idx !== -1) {
              parsed.splice(idx + 1, 0, 'pie');
            } else {
              parsed.push('pie');
            }
          }
          setWidgetOrder(parsed);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      setWidgetOrder(['kpis', 'valuations', 'graphs', 'pie', 'reminders', 'quickLinks', 'bestSelling', 'recent']);
    }
  };

  useEffect(() => {
    loadWidgetOrder();
    
    const handleOrderUpdate = () => {
      loadWidgetOrder();
    };

    window.addEventListener("hz-dashboard-order-updated", handleOrderUpdate);
    return () => {
      window.removeEventListener("hz-dashboard-order-updated", handleOrderUpdate);
    };
  }, []);

  const handleProfitClick = () => {
    setChartMetric("profit");
    setCollapsed(prev => ({ ...prev, graphs: false }));
    setTimeout(() => {
      const el = document.getElementById("analytics-chart-mobile") || document.getElementById("analytics-chart-desktop");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dashboardDateFilter');
      if (saved) {
        const parsed = JSON.parse(saved);
        setDateFilter(parsed);
      }
    } catch {}
  }, []);

  const applyFilter = (from: string, to: string) => {
    setDateFilter({ from, to });
    try {
      localStorage.setItem('dashboardDateFilter', JSON.stringify({ from, to }));
    } catch {}
  };

  const clearFilter = () => {
    setDateFilter({ from: '', to: '' });
    try {
      localStorage.removeItem('dashboardDateFilter');
    } catch {}
  };

  const setPresetRange = (preset: "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "all") => {
    if (preset === "all") {
      clearFilter();
      return;
    }
    const now = new Date();
    let from = "";
    let to = "";

    const toStr = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    if (preset === "today") {
      const todayStr = toStr(now);
      from = todayStr;
      to = todayStr;
    } else if (preset === "yesterday") {
      const yDate = new Date(now);
      yDate.setDate(yDate.getDate() - 1);
      const yStr = toStr(yDate);
      from = yStr;
      to = yStr;
    } else if (preset === "this_week") {
      const firstDay = new Date(now);
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      firstDay.setDate(diff);
      from = toStr(firstDay);
      to = toStr(now);
    } else if (preset === "this_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      from = toStr(firstDay);
      to = toStr(now);
    } else if (preset === "last_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      from = toStr(firstDay);
      to = toStr(lastDay);
    }

    applyFilter(from, to);
  };

  // Desktop keyboard hotkeys (1-9) for quick KPI navigation & fast action opening
  useEffect(() => {
    if (isMobile) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable || target.tagName === "SELECT")) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (saleOpen || showFilter || showPopup || bentoCustomizerOpen) {
        return;
      }

      const keyIndex = parseInt(e.key, 10);
      if (!isNaN(keyIndex) && keyIndex >= 1 && keyIndex <= kpiConfig.order.length) {
        e.preventDefault();
        const targetKpiKey = kpiConfig.order[keyIndex - 1];
        if (targetKpiKey === "credit_sale") {
          playTapSound();
          setSalePresetType("credit");
          setSaleOpen(true);
        } else if (targetKpiKey === "cash_sale") {
          playTapSound();
          setSalePresetType("cash");
          setSaleOpen(true);
        } else if (targetKpiKey === "online_sell") {
          playTapSound();
          setSalePresetType("online");
          setSaleOpen(true);
        } else if (targetKpiKey === "purchases" && canAccess(perms, "purchases")) {
          playTapSound();
          router.push("/purchases");
        } else if (targetKpiKey === "profit") {
          playTapSound();
          router.push("/profits");
        } else if (targetKpiKey === "loss") {
          playTapSound();
          router.push("/losses");
        } else if (targetKpiKey === "expense" && canAccess(perms, "expenses")) {
          playTapSound();
          router.push("/expenses");
        } else if (targetKpiKey === "due" && canAccess(perms, "parties")) {
          playTapSound();
          router.push("/dues");
        } else if (targetKpiKey === "cashbox" && canAccess(perms, "cashbox")) {
          playTapSound();
          router.push("/cash-management/cashbox");
        } else if (targetKpiKey === "somiti" && canAccess(perms, "expenses")) {
          playTapSound();
          router.push("/somiti");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, saleOpen, showFilter, showPopup, bentoCustomizerOpen, kpiConfig.order, perms, router]);

  const today = todayStart();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Robust date boundary matcher supporting ISO strings, Firestore Timestamps, and Date objects
  const isDateInRange = (dateInput: any) => {
    if (!dateInput) return false;
    let d: Date;
    if (typeof dateInput?.toDate === "function") {
      d = dateInput.toDate();
    } else if (dateInput?.seconds !== undefined) {
      d = new Date(dateInput.seconds * 1000);
    } else if (typeof dateInput === "string" || typeof dateInput === "number") {
      d = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return false;

    // Default to today if no custom filter set
    if (!dateFilter.from && !dateFilter.to) {
      return d >= today && d < tomorrow;
    }

    if (dateFilter.from) {
      const fromBoundary = new Date(`${dateFilter.from}T00:00:00`);
      if (d < fromBoundary) return false;
    }

    if (dateFilter.to) {
      const toBoundary = new Date(`${dateFilter.to}T23:59:59.999`);
      if (d > toBoundary) return false;
    }

    return true;
  };

  // Compute filtered data based on date filter
  const filteredSales = allSales.filter(s => !s.returned && isDateInRange(s.created_at));
  const filteredExpenses = allExpenses.filter(e => isDateInRange(e.created_at));
  const filteredCashbox = allCashbox.filter(c => isDateInRange(c.created_at));
  const filteredPurchases = (purchases.data ?? []).filter(p => isDateInRange(p.created_at));

  // KPIs
  const totalSalesToday = filteredSales.reduce((a, s) => {
    if (s.returned) return a;
    const lineTotal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0);
    return a + Math.max(lineTotal, 0);
  }, 0);

  const cashToday = filteredSales
    .filter(s => s.type === "cash" || (s.type as string) === "nagad" || (s.type as string) === "hand_cash" || (s.type as string) === "pos")
    .reduce((a, s) => {
      const lineTotal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0);
      const paid = Number(s.paid_amount);
      return a + (!isNaN(paid) && paid > 0 ? paid : lineTotal);
    }, 0);

  const bkashToday   = filteredSales.filter(s => s.type === "bkash").reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0)), 0);
  const bankToday    = filteredSales.filter(s => (s.type as string) === "bank").reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0)), 0);
  const creditToday  = filteredSales.filter(s => s.type === "credit").reduce((a, s) => {
    const lineTotal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0);
    const due = Number(s.due_amount);
    return a + (!isNaN(due) && due > 0 ? due : lineTotal);
  }, 0);
  const onlineToday  = filteredSales.filter(s => s.type === "online").reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0)), 0);
  const onlinePendingToday = filteredSales.filter(s => s.type === "online" && (s as any).courier_status !== "collected" && (s as any).courier_status !== "cancelled").reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0)), 0);
  const onlineCollectedToday = filteredSales.filter(s => s.type === "online" && (s as any).courier_status === "collected").reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1) - (Number(s.discount) || 0)), 0);
  const cashboxDepositedToday = cashToday + bkashToday + bankToday + onlineCollectedToday;
  const purchasesToday = filteredPurchases.reduce((a, p) => a + (Number(p.total) || 0), 0);
  const validFilteredSales = filteredSales.filter(s => !s.returned && (s as any).courier_status !== "cancelled");
  const calcSaleProfit = (s: any) => {
    if (s.profit !== undefined && s.profit !== null && !isNaN(Number(s.profit))) {
      return Number(s.profit);
    }
    const sell = Number(s.sell_price) || 0;
    const buy = Number(s.buy_price) || 0;
    const qty = Number(s.qty) || 1;
    const discount = Number(s.discount) || 0;
    return (sell - buy) * qty - discount;
  };
  const profitToday  = validFilteredSales.reduce((a, s) => a + calcSaleProfit(s), 0);
  
  // loss today
  const lossToday = validFilteredSales.filter(s => calcSaleProfit(s) < 0).reduce((a, s) => a + Math.abs(calcSaleProfit(s)), 0);
  
  const totalDues = allParties.reduce((sum, p) => {
    if (p.archived) return sum;
    return sum + getPartyOutstanding(p.id);
  }, 0);

  const expenseToday = filteredExpenses.reduce((a, e) => a + Number(e.amount), 0);

  // Cashbox balance is a running total across ALL time or up to the filtered period
  const cashboxTotal = useMemo(() => {
    if (dateFilter.to || dateFilter.from) {
      const maxDate = dateFilter.to ? new Date(dateFilter.to + "T23:59:59") : new Date(dateFilter.from + "T23:59:59");
      const filtered = allCashbox.filter(c => new Date(c.created_at) <= maxDate);
      return cashboxBalance(filtered);
    }
    return cashboxBalance(allCashbox);
  }, [allCashbox, dateFilter]);

  const somitiTotal = useMemo(() => {
    const allS = somiti.data ?? [];
    if (dateFilter.to || dateFilter.from) {
      const maxDate = dateFilter.to ? new Date(dateFilter.to + "T23:59:59") : new Date(dateFilter.from + "T23:59:59");
      const filtered = allS.filter(s => new Date(s.created_at) <= maxDate);
      return filtered.reduce((sum, s) => sum + (s.kind === "deposit" ? Number(s.amount) : -Number(s.amount)), 0);
    }
    return allS.reduce((sum, s) => sum + (s.kind === "deposit" ? Number(s.amount) : -Number(s.amount)), 0);
  }, [somiti.data, dateFilter]);

  // Stock Valuation
  const totalStockCostValuation = (products.data ?? []).filter(p => !p.archived).reduce((sum, p) => sum + (p.buy_price * p.stock), 0);
  const totalStockSaleValuation = (products.data ?? []).filter(p => !p.archived).reduce((sum, p) => sum + (p.sell_price * p.stock), 0);

  // Critical Stock List
  const lowStockProducts = (products.data ?? []).filter(p => !p.archived && p.stock <= (p.min_stock ?? 5));

  // Demanding Products
  const productQtyMap: Record<string, number> = {};
  filteredSales.forEach(s => {
    productQtyMap[s.product_name] = (productQtyMap[s.product_name] ?? 0) + s.qty;
  });
  const allDemandedProducts = Object.entries(productQtyMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  const topDemandedProducts = allDemandedProducts.slice(0, bestSellingLimit);

  // Custom graph data
  const customGraphData = groupAllDataByDay(allSales, allExpenses, chartRange);

  // Payment method breakdown for pie
  const salesForPie = filteredSales.length > 0 ? filteredSales : allSales;
  let pieCashTotal = 0;
  let pieBkashTotal = 0;
  let pieCreditTotal = 0;
  let pieOnlineTotal = 0;

  for (const s of salesForPie) {
    if (s.returned) continue;
    const totalVal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1);
    const paid = Number(s.paid_amount) || 0;
    const due = Number(s.due_amount) || 0;

    if (s.type === "bkash") {
      pieBkashTotal += totalVal;
    } else if (s.type === "online") {
      pieOnlineTotal += totalVal;
    } else if (s.type === "credit") {
      pieCreditTotal += due > 0 ? due : totalVal;
      if (paid > 0) {
        pieCashTotal += paid;
      }
    } else {
      pieCashTotal += totalVal;
    }
  }

  const pieData = [
    { name: lang === "bn" ? "নগদ (Cash)" : "Cash", value: pieCashTotal, color: "#6366f1" },
    { name: lang === "bn" ? "বিকাশ (bKash)" : "bKash", value: pieBkashTotal, color: "#e11d48" },
    { name: lang === "bn" ? "বাকী (Credit)" : "Credit Due", value: pieCreditTotal, color: "#f59e0b" },
    { name: lang === "bn" ? "অনলাইন (Online)" : "Online", value: pieOnlineTotal, color: "#10b981" },
  ].filter(d => d.value > 0);

  // Recent sales sorted
  const sortedRecentSales = useMemo(() => {
    return [...filteredSales]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [filteredSales]);

  // Paginated / limited list for recent sales
  const recentSalesToShow = useMemo(() => {
    return sortedRecentSales.slice(0, activityLimit);
  }, [sortedRecentSales, activityLimit]);


  // Due alerts calculation
  const dueAlertParties = allParties.map(p => {
    const outstanding = getPartyOutstanding(p.id);
    return { ...p, outstanding };
  }).filter(p => p.outstanding > 0).slice(0, 4);

  // ── Smart Logic Reminders calculations ──────────────────────────────
  const isReminderActive = (r: Reminder) => {
    if (r.completed) return false;
    if (!r.logic_type || r.logic_type === "none") {
      const todayStr = new Date().toISOString().slice(0, 10);
      return r.due_date <= todayStr;
    }
    if (r.logic_type === "product_stock") {
      const prod = (products.data ?? []).find(p => p.id === r.logic_config?.product_id);
      const limit = r.logic_config?.min_stock ?? 5;
      return Boolean(prod && prod.stock <= limit);
    }
    if (r.logic_type === "party_due") {
      const party = allParties.find(p => p.id === r.logic_config?.party_id);
      const maxDue = r.logic_config?.max_due ?? 1000;
      if (party) {
        const outstanding = getPartyOutstanding(party.id);
        return outstanding >= maxDue;
      }
      return false;
    }
    if (r.logic_type === "low_stock") {
      const criticals = (products.data ?? []).filter(p => !p.archived && p.stock <= (p.min_stock ?? 5));
      return criticals.length > 0;
    }
    return false;
  };

  const activeRemindersList = useMemo(() => {
    const list: { id: string; title: string; type: string; isLogic: boolean }[] = [];

    reminders.forEach(r => {
      if (r.completed) return;
      
      if (!r.logic_type || r.logic_type === "none") {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (r.due_date <= todayStr) {
          list.push({ id: r.id, title: r.title, type: lang === "bn" ? "সাধারণ সতর্কতা" : "General Alert", isLogic: false });
        }
      } else if (r.logic_type === "product_stock") {
        const prod = (products.data ?? []).find(p => p.id === r.logic_config?.product_id);
        const limit = r.logic_config?.min_stock ?? 5;
        if (prod && prod.stock <= limit) {
          list.push({
            id: r.id,
            title: lang === "bn" 
              ? `${r.title}: ${prod.name} এর স্টক মাত্র ${prod.stock} টি আছে (সর্বনিম্ন স্টক সীমা: ${limit})`
              : `${r.title}: ${prod.name} stock is only ${prod.stock} (Min limit: ${limit})`,
            type: lang === "bn" ? "পণ্য স্টক সতর্কতা" : "Product Stock Alarm",
            isLogic: true
          });
        }
      } else if (r.logic_type === "party_due") {
        const party = allParties.find(p => p.id === r.logic_config?.party_id);
        const maxDue = r.logic_config?.max_due ?? 1000;
        
        if (party) {
          const outstanding = getPartyOutstanding(party.id);
          if (outstanding >= maxDue) {
            list.push({
              id: r.id,
              title: lang === "bn"
                ? `${r.title}: ${party.name} এর বকেয়া ${fmtMoney(outstanding)} টাকা (বকেয়া সীমা: ${fmtMoney(maxDue)})`
                : `${r.title}: ${party.name} owes ${fmtMoney(outstanding)} (Dues limit: ${fmtMoney(maxDue)})`,
              type: lang === "bn" ? "পার্টির বকেয়া সতর্কতা" : "Customer Dues Alarm",
              isLogic: true
            });
          }
        }
      } else if (r.logic_type === "low_stock") {
        const criticals = (products.data ?? []).filter(p => !p.archived && p.stock <= (p.min_stock ?? 5));
        if (criticals.length > 0) {
          list.push({
            id: r.id,
            title: lang === "bn"
              ? `${r.title}: ${criticals.length} টি পণ্য সংকটপূর্ণ স্টকে রয়েছে`
              : `${r.title}: ${criticals.length} products are critical stock`,
            type: lang === "bn" ? "সংকট স্টক সতর্কতা" : "Global Low Stock Alarm",
            isLogic: true
          });
        }
      }
    });

    return list;
  }, [reminders, products.data, allParties, allSales, lang]);

  // Request notifications and show popup modal once per session
  useEffect(() => {
    if (activeRemindersList.length > 0) {
      const shown = sessionStorage.getItem("remindersPopupShown");
      if (!shown) {
        sessionStorage.setItem("remindersPopupShown", "true");
        setShowPopup(true);
        
        // Push notification on phone/browser
        if ("Notification" in window) {
          Notification.requestPermission().then(perm => {
            if (perm === "granted") {
              const firstAlert = activeRemindersList[0];
              new Notification(lang === "bn" ? "রিমাইন্ডার সতর্কতা" : "Reminder Alert", {
                body: firstAlert.title,
                icon: "/logo.png",
              });
            }
          });
        }
      }
    }
  }, [activeRemindersList, lang]);

  // Custom Reminders Handlers
  async function handleAddReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!newReminderTitle.trim()) return;
    setReminderBusy(true);
    try {
      await createReminderFn({
        data: {
          title: newReminderTitle.trim(),
          due_date: newReminderDate || new Date().toISOString().slice(0, 10),
          logic_type: logicType,
          logic_config: {
            product_id: selectedProductId || null,
            min_stock: Number(stockThreshold) || 0,
            party_id: selectedPartyId || null,
            max_due: Number(duesThreshold) || 0,
          }
        },
      });
      setNewReminderTitle("");
      setNewReminderDate("");
      setLogicType("none");
      setSelectedProductId("");
      setSelectedPartyId("");
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success(t("save"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setReminderBusy(false);
    }
  }

  async function handleToggleReminder(id: string, completed: boolean) {
    try {
      await toggleReminderFn({ data: { id, completed } });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteReminder(id: string) {
    try {
      await deleteReminderFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success(t("delete"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  const ChartComponent: any = chartType === "bar" ? BarChart : chartType === "line" ? LineChart : AreaChart;
  const ChartDataElement: any = chartType === "bar" ? Bar : chartType === "line" ? Line : Area;

  const getMetricColor = () => {
    if (chartMetric === "profit") return "#10b981";
    if (chartMetric === "expenses") return "#ef4444";
    return "#6366f1";
  };

  // Reusable Reminder Add Form
  function renderReminderForm() {
    return (
      <div className="space-y-2 border-t border-border/50 pt-2 text-xs">
        <div className="text-[10px] text-muted-foreground font-semibold uppercase">{t("custom_reminder")}</div>
        
        {/* Logic Type selector */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">{lang === "bn" ? "রিমাইন্ডার ধরন" : "Logic Type"}</Label>
            <select
              value={logicType}
              onChange={e => setLogicType(e.target.value as any)}
              className="w-full h-8 rounded border border-input bg-background px-2 text-[11px]"
            >
              <option value="none">{lang === "bn" ? "সাধারণ / তারিখ ভিত্তিক" : "General / Date-based"}</option>
              <option value="low_stock">{lang === "bn" ? "সংকট স্টক (সব পণ্য)" : "Global Low Stock Alert"}</option>
              <option value="product_stock">{lang === "bn" ? "নির্দিষ্ট পণ্যের স্টক এলার্ট" : "Specific Product Stock Alert"}</option>
              <option value="party_due">{lang === "bn" ? "পার্টির বকেয়া এলার্ট" : "Customer Dues Alert"}</option>
            </select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[9px] text-muted-foreground">{t("due_date")}</Label>
            <Input type="date" className="h-8 text-xs w-full" value={newReminderDate} onChange={e => setNewReminderDate(e.target.value)} />
          </div>
        </div>

        {/* Product Stock parameters */}
        {logicType === "product_stock" && (
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">{lang === "bn" ? "পণ্য নির্বাচন করুন" : "Select Product"}</Label>
              <ProductSearchSelect
                products={products.data ?? []}
                value={selectedProductId}
                onChange={setSelectedProductId}
                placeholder={lang === "bn" ? "পণ্য বাছাই করুন..." : "Choose product..."}
              />
            </div>
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">{lang === "bn" ? "সংকট সীমা (সংখ্যা)" : "Stock Limit"}</Label>
              <Input type="number" className="h-8 text-xs" value={stockThreshold} onChange={e => setStockThreshold(e.target.value)} />
            </div>
          </div>
        )}

        {/* Customer Dues parameters */}
        {logicType === "party_due" && (
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">{lang === "bn" ? "পার্টি নির্বাচন করুন" : "Select Party"}</Label>
              <select
                value={selectedPartyId}
                onChange={e => setSelectedPartyId(e.target.value)}
                className="w-full h-8 rounded border border-input bg-background px-2 text-[11px]"
                required
              >
                <option value="">{lang === "bn" ? "পার্টি বাছাই করুন..." : "Choose party..."}</option>
                {allParties.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <Label className="text-[9px] text-muted-foreground">{lang === "bn" ? "সর্বোচ্চ বকেয়া সীমা" : "Max Dues Limit"}</Label>
              <Input type="number" className="h-8 text-xs" value={duesThreshold} onChange={e => setDuesThreshold(e.target.value)} />
            </div>
          </div>
        )}

        {/* Submit Form */}
        <form onSubmit={handleAddReminder} className="flex gap-1.5 pt-1">
          <Input
            required
            className="h-8 text-xs flex-1"
            placeholder={
              logicType === "none"
                ? (lang === "bn" ? "রিমাইন্ডার টাইটেল..." : "Reminder Title...")
                : (lang === "bn" ? "এলার্ট টাইটেল (যেমন: স্টক সতর্কতা)" : "Alert Title (e.g. Stock Alert)")
            }
            value={newReminderTitle}
            onChange={e => setNewReminderTitle(e.target.value)}
          />
          <Button type="submit" disabled={reminderBusy} size="sm" className="h-8 px-3">
            <Plus className="size-4" />
          </Button>
        </form>
      </div>
    );
  }

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "kpis":
        const isHeroCard = (id: string) => kpiConfig.bentoGrid && (id === "total_sales" || id === "cash_sale" || id === "profit" || id === "cashbox");
        const allowPurchases = perms ? canAccess(perms, "purchases") : true;
        const allowSomiti = perms ? canAccess(perms, "expenses") : true;

        // Define all cards dynamically in a map with Bento Grid & Custom Style options
        const kpiCardsMap: Record<string, React.ReactNode> = {
          total_sales: (
            <Link
              href="/sales"
              key="total_sales"
              className={`hidden sm:block cursor-pointer ${isHeroCard("total_sales") ? "sm:col-span-2" : ""}`}
              onClick={() => playTapSound()}
            >
              <KPICard
                label={lang === "bn" ? "আজকের মোট বিক্রি" : "Today's Total Sales"}
                value={fmtMoney(totalSalesToday)}
                sub={dateRangeLabel}
                imageUrl="/icons/sell_icon.png"
                icon={ShoppingBag}
                color="bg-indigo-600"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("total_sales")}
              />
            </Link>
          ),
          credit_sale: (
            <KPICard
              key="credit_sale"
              label={t("credit_sale")}
              value={fmtMoney(creditToday)}
              sub={dateRangeLabel}
              imageUrl="/icons/credit_sale_icon.png"
              icon={CreditCard}
              color="bg-amber-500"
              onClick={() => {
                playTapSound();
                setSalePresetType("credit");
                setSaleOpen(true);
              }}
              align={kpiConfig.align as any}
              size={kpiConfig.size as any}
              variant={(kpiConfig.variant || "glass") as any}
              shadowStyle={(kpiConfig.shadow || "glow") as any}
              borderStyle={(kpiConfig.borderStyle || "subtle") as any}
              curve={(kpiConfig.curve || "none") as any}
              isBentoHero={isHeroCard("credit_sale")}
            />
          ),
          cash_sale: (
            <KPICard
              key="cash_sale"
              label={t("cash_sale")}
              value={fmtMoney(cashToday)}
              sub={dateRangeLabel}
              imageUrl="/icons/sell_icon.png"
              icon={ShoppingBag}
              color="bg-indigo-500"
              onClick={() => {
                playTapSound();
                setSalePresetType("cash");
                setSaleOpen(true);
              }}
              align={kpiConfig.align as any}
              size={kpiConfig.size as any}
              variant={(kpiConfig.variant || "glass") as any}
              shadowStyle={(kpiConfig.shadow || "glow") as any}
              borderStyle={(kpiConfig.borderStyle || "subtle") as any}
              curve={(kpiConfig.curve || "none") as any}
              isBentoHero={isHeroCard("cash_sale")}
            />
          ),
          online_sell: (
            <div className={`block ${isHeroCard("online_sell") ? "sm:col-span-2" : ""}`} key="online_sell">
              <KPICard
                label={t("online_sell")}
                value={fmtMoney(onlineToday)}
                sub={lang === "bn" ? `পেন্ডিং: ${fmtMoney(onlinePendingToday)}` : `Pending: ${fmtMoney(onlinePendingToday)}`}
                imageUrl="/icons/online_sale_icon.png"
                icon={Truck}
                color="bg-purple-600"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("online_sell")}
                onClick={() => {
                  playTapSound();
                  setSalePresetType("online");
                  setSaleOpen(true);
                }}
              />
            </div>
          ),
          purchases: allowPurchases ? (
            <Link href="/purchases" className={`block ${isHeroCard("purchases") ? "sm:col-span-2" : ""}`} key="purchases" onClick={() => playTapSound()}>
              <KPICard
                label={lang === "bn" ? "পণ্য ক্রয়" : "Purchases"}
                value={fmtMoney(purchasesToday)}
                sub={dateRangeLabel}
                imageUrl="https://img.icons8.com/fluency/48/buy.png"
                icon={ShoppingCart}
                color="bg-teal-500"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("purchases")}
              />
            </Link>
          ) : <div key="purchases" className="hidden" />,
          profit: (
            <div
              className={`block cursor-pointer ${isHeroCard("profit") ? "sm:col-span-2" : ""}`}
              key="profit"
              onClick={(e) => handlePrivacyKpiClick(e, "profit", "/profits")}
            >
              <KPICard
                label={t("profit")}
                value={fmtMoney(profitToday)}
                sub={dateRangeLabel}
                imageUrl="/icons/profit_icon.png"
                icon={TrendingUp}
                color="bg-emerald-500"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("profit")}
                isPrivacyProtected={true}
                isRevealed={revealedKpis.profit}
              />
            </div>
          ),
          loss: (
            <Link href="/losses" className={`block ${isHeroCard("loss") ? "sm:col-span-2" : ""}`} key="loss" onClick={() => playTapSound()}>
              <KPICard
                label={lang === "bn" ? "লোকসান" : "Loss"}
                value={fmtMoney(lossToday)}
                sub={dateRangeLabel}
                imageUrl="https://img.icons8.com/color/48/depreciation.png"
                icon={TrendingDown}
                color="bg-rose-500"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("loss")}
              />
            </Link>
          ),
          expense: canAccess(perms, "expenses") ? (
            <Link href="/expenses" className={`block ${isHeroCard("expense") ? "sm:col-span-2" : ""}`} key="expense" onClick={() => playTapSound()}>
              <KPICard
                label={t("expense")}
                value={fmtMoney(expenseToday)}
                sub={dateRangeLabel}
                imageUrl="https://img.icons8.com/color/48/tax.png"
                icon={Receipt}
                color="bg-orange-500"
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("expense")}
              />
            </Link>
          ) : <div key="expense" className="hidden" />,
          due: canAccess(perms, "parties") ? (
            <Link href="/dues" className={`block ${isHeroCard("due") ? "sm:col-span-2" : ""}`} key="due" onClick={() => playTapSound()}>
              <KPICard
                label={t("due")}
                value={fmtMoney(totalDues)}
                sub={dateRangeLabel}
                imageUrl="https://img.icons8.com/color/48/loan.png"
                icon={Banknote}
                color="bg-amber-600"
                trendUp={false}
                className="h-full w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={isHeroCard("due")}
              />
            </Link>
          ) : <div key="due" className="hidden" />,
          cashbox: canAccess(perms, "cashbox") ? (
            <Link href="/cash-management/cashbox" className="block w-full" key="cashbox" onClick={() => playTapSound()}>
              <KPICard
                label={t("cashbox")}
                value={fmtMoney(cashboxTotal)}
                sub={dateRangeLabel}
                imageUrl="/icons/cashbox_icon.png"
                icon={Banknote}
                color="bg-emerald-600"
                trendUp={cashboxTotal >= 0}
                trend={t("balance")}
                className="w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={false}
              />
            </Link>
          ) : <div key="cashbox" className="hidden" />,
          somiti: allowSomiti ? (
            <div
              className="block w-full cursor-pointer"
              key="somiti"
              onClick={(e) => handlePrivacyKpiClick(e, "somiti", "/somiti")}
            >
              <KPICard
                label={lang === "bn" ? "সমিতি (Samity)" : "Samity"}
                value={fmtMoney(somitiTotal)}
                sub={dateRangeLabel}
                imageUrl="/icons/samity_icon.png"
                icon={PiggyBank}
                color="bg-purple-600"
                trendUp={somitiTotal >= 0}
                trend={lang === "bn" ? "নিট জমা" : "Net Balance"}
                className="w-full"
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
                variant={(kpiConfig.variant || "glass") as any}
                shadowStyle={(kpiConfig.shadow || "glow") as any}
                borderStyle={(kpiConfig.borderStyle || "subtle") as any}
                curve={(kpiConfig.curve || "none") as any}
                isBentoHero={false}
                isPrivacyProtected={true}
                isRevealed={revealedKpis.somiti}
              />
            </div>
          ) : <div key="somiti" className="hidden" />,
        };

        const gridColsClass = kpiConfig.columns === 1 ? "grid-cols-1" : kpiConfig.columns === 3 ? "grid-cols-3" : kpiConfig.columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2";

        return (
          <Card key="kpis" className="p-4 border border-border/80 space-y-3 bg-card/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-2xl shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <LayoutGrid className="size-4 text-primary animate-pulse" />
                {t("key_metrics")}
              </span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => { playTapSound(); setCollapsed(prev => ({ ...prev, kpis: !prev.kpis })); }}>
                {collapsed.kpis ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>

            {!collapsed.kpis && (
              <div className="space-y-2.5">
                <div className={`grid gap-2.5 ${gridColsClass}`}>
                  {kpiConfig.order.map(key => kpiCardsMap[key])}
                </div>
              </div>
            )}
          </Card>
        );

      case "valuations":
        return (
          <Card key="valuations" className="p-3.5 border border-border space-y-2 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:shadow-md transition-all">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "পণ্য স্টক মূল্য (ইনভেন্টরি)" : "Stock & Inventory Valuation"}</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-gradient-to-br from-white via-teal-50/20 to-teal-500/5 dark:from-zinc-900 dark:via-teal-950/10 dark:to-teal-500/5 border border-teal-500/15 rounded-lg flex items-center justify-between gap-1.5 shadow-[0_2px_8px_rgba(20,184,166,0.04)]">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-muted-foreground">{t("inventory_val_cost")}</div>
                  <div className="font-bold text-xs min-[360px]:text-sm mt-0.5 text-foreground">{fmtMoney(totalStockCostValuation)}</div>
                </div>
                <img src="https://img.icons8.com/bubbles/100/buy.png" className="size-8 object-contain shrink-0" alt="buy" />
              </div>
              <div className="p-2.5 bg-gradient-to-br from-white via-pink-50/20 to-pink-500/5 dark:from-zinc-900 dark:via-pink-950/10 dark:to-pink-500/5 border border-pink-500/15 rounded-lg flex items-center justify-between gap-1.5 shadow-[0_2px_8px_rgba(236,72,153,0.04)]">
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] text-muted-foreground">{t("inventory_val_sale")}</div>
                  <div className="font-bold text-xs min-[360px]:text-sm mt-0.5 text-foreground">{fmtMoney(totalStockSaleValuation)}</div>
                </div>
                <Package className="size-5 text-muted-foreground shrink-0" />
              </div>
            </div>
          </Card>
        );

      case "graphs":
        return (
          <Card key="graphs" id="analytics-chart-mobile" className="p-3.5 space-y-3 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("custom_graphs")}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setCollapsed(prev => ({ ...prev, graphs: !prev.graphs }))}>
                {collapsed.graphs ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>

            {!collapsed.graphs && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartMetric("sales")} className={`px-2 py-0.5 rounded ${chartMetric === "sales" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "বিক্রি" : "Sales"}</button>
                    <button onClick={() => setChartMetric("profit")} className={`px-2 py-0.5 rounded ${chartMetric === "profit" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "লাভ" : "Profit"}</button>
                    <button onClick={() => setChartMetric("expenses")} className={`px-2 py-0.5 rounded ${chartMetric === "expenses" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "খরচ" : "Expenses"}</button>
                  </div>
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartType("area")} className={`p-1 rounded ${chartType === "area" ? "bg-background shadow" : ""}`} title="Area Chart"><AreaChartIcon className="size-3" /></button>
                    <button onClick={() => setChartType("bar")} className={`p-1 rounded ${chartType === "bar" ? "bg-background shadow" : ""}`} title="Bar Chart"><BarChart3 className="size-3" /></button>
                    <button onClick={() => setChartType("line")} className={`p-1 rounded ${chartType === "line" ? "bg-background shadow" : ""}`} title="Line Chart"><LineChartIcon className="size-3" /></button>
                  </div>
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartRange(7)} className={`px-1.5 py-0.5 rounded ${chartRange === 7 ? "bg-background shadow" : ""}`}>7d</button>
                    <button onClick={() => setChartRange(14)} className={`px-1.5 py-0.5 rounded ${chartRange === 14 ? "bg-background shadow" : ""}`}>14d</button>
                    <button onClick={() => setChartRange(30)} className={`px-1.5 py-0.5 rounded ${chartRange === 30 ? "bg-background shadow" : ""}`}>30d</button>
                  </div>
                </div>

                <div className="w-full h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ChartComponent data={customGraphData}>
                      <defs>
                        <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                      <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                      <YAxis tick={{ fontSize: 8 }} tickFormatter={v => `৳${v}`} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      {chartType === "area" && (
                        <Area
                          type="monotone"
                          dataKey={chartMetric}
                          stroke={getMetricColor()}
                          fill={chartMetric === "profit" ? "url(#gProfit)" : chartMetric === "expenses" ? "url(#gExpense)" : "url(#gSales)"}
                          strokeWidth={2}
                          name={t(chartMetric)}
                        />
                      )}
                      {chartType === "bar" && (
                        <Bar
                          dataKey={chartMetric}
                          fill={getMetricColor()}
                          radius={[4, 4, 0, 0]}
                          name={t(chartMetric)}
                        />
                      )}
                      {chartType === "line" && (
                        <Line
                          type="monotone"
                          dataKey={chartMetric}
                          stroke={getMetricColor()}
                          strokeWidth={2}
                          dot={{ r: 2 }}
                          activeDot={{ r: 4 }}
                          name={t(chartMetric)}
                        />
                      )}
                    </ChartComponent>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </Card>
        );

      case "pie":
        return (
          <Card key="pie" className="p-3.5 space-y-3 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payment_method_breakdown")}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => { playTapSound(); setCollapsed(prev => ({ ...prev, pie: !prev.pie })); }}>
                {collapsed.pie ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>

            {!collapsed.pie && (
              <div className="space-y-2">
                {pieData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">{t("no_activity")}</div>
                ) : (
                  <>
                    <div className="w-full h-[140px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={55} dataKey="value" paddingAngle={3}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => `৳${Number(v).toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-dashed">
                      {pieData.map(d => (
                        <div key={d.name} className="flex flex-col items-center p-1.5 bg-secondary/30 rounded-xl text-center min-w-0">
                          <span className="text-[9px] text-muted-foreground truncate max-w-full flex items-center gap-1 font-semibold">
                            <span className="size-2 rounded-full shrink-0" style={{ background: d.color }} />
                            {d.name}
                          </span>
                          <span className="text-xs font-bold mt-0.5 text-foreground truncate max-w-full font-serif">{fmtMoney(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );

      case "reminders":
        return (
          <Card key="reminders" className="p-3.5 space-y-3 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm rounded-2xl shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("reminders")}</span>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setCollapsed(prev => ({ ...prev, reminders: !prev.reminders }))}>
                {collapsed.reminders ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>

            {!collapsed.reminders && (
              <div className="space-y-3">
                {renderReminderForm()}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2">
                  {reminders.length === 0 && <p className="text-[10px] text-muted-foreground italic text-center py-2">No custom tasks</p>}
                  {reminders.map(r => (
                    <div key={r.id} className={`flex items-center justify-between p-2 border rounded text-xs transition-colors ${
                      isReminderActive(r) ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border"
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {(!r.logic_type || r.logic_type === "none") ? (
                          <button type="button" onClick={() => handleToggleReminder(r.id, !r.completed)}>
                            {r.completed ? <CheckSquare className="size-4 text-primary shrink-0" /> : <Square className="size-4 text-muted-foreground shrink-0" />}
                          </button>
                        ) : (
                          <span className="inline-block text-[8px] font-bold px-1 py-0.2 rounded bg-primary/15 text-primary uppercase shrink-0">
                            {lang === "bn" ? "অটো" : "Auto"}
                          </span>
                        )}
                        <span className={`truncate ${r.completed ? "line-through text-muted-foreground" : "font-medium"}`}>{r.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground text-[10px]">
                        <span>{r.due_date}</span>
                        <button type="button" className="text-destructive hover:scale-105 active:scale-95" onClick={() => handleDeleteReminder(r.id)}><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );

      case "quickLinks":
        return (
          <div key="quickLinks" className="grid grid-cols-3 gap-2">
            {[
              { to: "/products", icon: Package, label: t("products"), perm: "products" as const },
              { to: "/sales", icon: ShoppingBag, label: t("sales"), perm: "sales" as const },
              { to: "/customers", icon: Users, label: t("customers"), perm: "parties" as const },
            ].filter(item => canAccess(perms, item.perm)).map(({ to, icon: Icon, label }) => (
              <Link key={to} href={to} className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 hover:bg-accent shadow-[0_4px_12px_rgba(0,0,0,0.02)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition-colors">
                <Icon className="size-4 text-primary" />
                <span className="text-[10px] font-medium text-center">{label}</span>
              </Link>
            ))}
          </div>
        );

      case "bestSelling":
        return topDemandedProducts.length > 0 ? (
          <Card key="bestSelling" className="p-3.5 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)] hover:shadow-md transition-all">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">{t("best_selling")} ({t("qty")})</h2>
            <div className="space-y-1.5">
              {topDemandedProducts.map((p, i) => (
                <div key={p.name} className="flex justify-between items-center text-xs p-1 px-2 bg-secondary/40 rounded">
                  <span className="truncate">{i+1}. {p.name}</span>
                  <span className="font-bold">{p.value} {lang === "bn" ? "টি" : "units"}</span>
                </div>
              ))}
            </div>
            {allDemandedProducts.length > topDemandedProducts.length && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] h-7 hover:bg-accent border border-dashed border-border/60 mt-2 active:scale-95 transition-all"
                onClick={() => {
                  playTapSound();
                  setBestSellingLimit(prev => prev + 5);
                }}
              >
                {lang === "bn" ? "আরও দেখুন ↓" : "View More ↓"}
              </Button>
            )}
          </Card>
        ) : null;

      case "recent":
        return (
          <div key="recent" className="space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("recent_activity")}</h2>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => setCollapsed(prev => ({ ...prev, recent: !prev.recent }))}>
                {collapsed.recent ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </Button>
            </div>
            {!collapsed.recent && (
              <div className="space-y-2">
                <Card className="divide-y divide-border overflow-hidden bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 border border-border/80 shadow-[0_6px_20px_rgba(0,0,0,0.03)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
                  {recentSalesToShow.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">{t("no_activity")}</div>}
                  {recentSalesToShow.map(s => (
                    <div key={s.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{s.product_name}</div>
                        <div className="text-[10px] text-muted-foreground">{s.type === "cash" ? t("cash") : s.type === "online" ? t("online_sell") : t("credit")} · {fmtDateTime(s.created_at)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">{fmtMoney(Number(s.sell_price) * s.qty)}</div>
                        <div className="text-[10px] text-muted-foreground">{s.qty} {lang === "bn" ? "টি" : "pcs"}</div>
                      </div>
                    </div>
                  ))}
                </Card>
                {sortedRecentSales.length > recentSalesToShow.length && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-8 hover:bg-accent border border-dashed border-border/60"
                    onClick={() => setActivityLimit(prev => prev + 5)}
                  >
                    {lang === "bn" ? "আরও লোড করুন ↓" : "Load More ↓"}
                  </Button>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const renderDesktopWidget = (widgetId: string) => {
    switch (widgetId) {
      case "kpis":
        const renderDesktopCard = (key: string, index: number) => {
          const hotkey = index + 1 <= 9 ? index + 1 : undefined;
          switch (key) {
            case "total_sales":
              return (
                <Link
                  href="/sales"
                  key="total_sales"
                  className="block cursor-pointer h-full"
                  onClick={() => playTapSound()}
                >
                  <KPICard
                    label={lang === "bn" ? "আজকের মোট বিক্রি" : "Today's Total Sales"}
                    value={fmtMoney(totalSalesToday)}
                    sub={dateRangeLabel}
                    imageUrl="/icons/sell_icon.png"
                    icon={ShoppingBag}
                    color="bg-indigo-600"
                    isDesktop={true}
                    hotkey={hotkey}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              );
            case "credit_sale":
              return (
                <KPICard
                  key="credit_sale"
                  label={t("credit_sale")}
                  value={fmtMoney(creditToday)}
                  sub={dateRangeLabel}
                  imageUrl="/icons/credit_sale_icon.png"
                  icon={CreditCard}
                  color="bg-amber-500"
                  isDesktop={true}
                  hotkey={hotkey}
                  onClick={() => {
                    playTapSound();
                    setSalePresetType("credit");
                    setSaleOpen(true);
                  }}
                  align={kpiConfig.align as any}
                  size={kpiConfig.size as any}
                />
              );
            case "cash_sale":
              return (
                <KPICard
                  key="cash_sale"
                  label={t("cash_sale")}
                  value={fmtMoney(cashToday)}
                  sub={dateRangeLabel}
                  imageUrl="/icons/sell_icon.png"
                  icon={ShoppingBag}
                  color="bg-indigo-500"
                  isDesktop={true}
                  hotkey={hotkey}
                  onClick={() => {
                    playTapSound();
                    setSalePresetType("cash");
                    setSaleOpen(true);
                  }}
                  align={kpiConfig.align as any}
                  size={kpiConfig.size as any}
                />
              );
            case "online_sell":
              return (
                <KPICard
                  key="online_sell"
                  label={t("online_sell")}
                  value={fmtMoney(onlineToday)}
                  sub={lang === "bn" ? `পেন্ডিং: ${fmtMoney(onlinePendingToday)}` : `Pending: ${fmtMoney(onlinePendingToday)}`}
                  imageUrl="/icons/online_sale_icon.png"
                  icon={Truck}
                  color="bg-purple-600"
                  isDesktop={true}
                  hotkey={hotkey}
                  className="h-full"
                  align={kpiConfig.align as any}
                  size={kpiConfig.size as any}
                  onClick={() => {
                    playTapSound();
                    setSalePresetType("online");
                    setSaleOpen(true);
                  }}
                />
              );
            case "purchases":
              return canAccess(perms, "purchases") ? (
                <Link href="/purchases" className="block" key="purchases" onClick={() => playTapSound()}>
                  <KPICard
                    label={lang === "bn" ? "পণ্য ক্রয়" : "Purchases"}
                    value={fmtMoney(purchasesToday)}
                    sub={dateRangeLabel}
                    icon={ShoppingCart}
                    color="bg-teal-500"
                    isDesktop={true}
                    hotkey={hotkey}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              ) : <div key="purchases" className="hidden" />;
            case "profit":
              return (
                <div
                  className="block cursor-pointer"
                  key="profit"
                  onClick={(e) => handlePrivacyKpiClick(e, "profit", "/profits")}
                >
                  <KPICard
                    label={t("profit")}
                    value={fmtMoney(profitToday)}
                    sub={!revealedKpis.profit ? (lang === "bn" ? "ট্যাপ করে দেখুন" : "Tap to reveal") : (dateRangeLabel + (lang === "bn" ? " • বিস্তারিত দেখতে ট্যাপ করুন" : " • Tap to open"))}
                    icon={TrendingUp}
                    color="bg-emerald-500"
                    isDesktop={true}
                    hotkey={hotkey}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                    isPrivacyProtected={true}
                    isRevealed={revealedKpis.profit}
                  />
                </div>
              );
            case "loss":
              return (
                <Link href="/losses" className="block" key="loss" onClick={() => playTapSound()}>
                  <KPICard
                    label={lang === "bn" ? "লোকসান" : "Loss"}
                    value={fmtMoney(lossToday)}
                    sub={dateRangeLabel}
                    icon={TrendingDown}
                    color="bg-rose-500"
                    isDesktop={true}
                    hotkey={hotkey}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              );
            case "expense":
              return canAccess(perms, "expenses") ? (
                <Link href="/expenses" className="block" key="expense" onClick={() => playTapSound()}>
                  <KPICard
                    label={t("expense")}
                    value={fmtMoney(expenseToday)}
                    sub={dateRangeLabel}
                    icon={Receipt}
                    color="bg-orange-500"
                    isDesktop={true}
                    hotkey={hotkey}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              ) : <div key="expense" className="hidden" />;
            case "due":
              return canAccess(perms, "parties") ? (
                <Link href="/dues" className="block" key="due" onClick={() => playTapSound()}>
                  <KPICard
                    label={t("due")}
                    value={fmtMoney(totalDues)}
                    sub={dateRangeLabel}
                    icon={Banknote}
                    color="bg-amber-600"
                    isDesktop={true}
                    hotkey={hotkey}
                    trendUp={false}
                    className="h-full"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              ) : <div key="due" className="hidden" />;
            case "cashbox":
              return canAccess(perms, "cashbox") ? (
                <Link href="/cash-management/cashbox" className="block" key="cashbox" onClick={() => playTapSound()}>
                  <KPICard
                    label={t("cashbox")}
                    value={fmtMoney(cashboxTotal)}
                    sub={dateRangeLabel}
                    icon={Wallet}
                    color="bg-indigo-600"
                    isDesktop={true}
                    hotkey={hotkey}
                    trendUp={cashboxTotal >= 0}
                    trend={t("balance")}
                    className="h-full justify-between"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                  />
                </Link>
              ) : <div key="cashbox" className="hidden" />;
            case "somiti":
              return canAccess(perms, "expenses") ? (
                <div
                  className="block cursor-pointer"
                  key="somiti"
                  onClick={(e) => handlePrivacyKpiClick(e, "somiti", "/somiti")}
                >
                  <KPICard
                    label={lang === "bn" ? "সমিতি (Samity)" : "Samity"}
                    value={fmtMoney(somitiTotal)}
                    sub={!revealedKpis.somiti ? (lang === "bn" ? "ট্যাপ করে দেখুন" : "Tap to reveal") : (dateRangeLabel + (lang === "bn" ? " • বিস্তারিত দেখতে ট্যাপ করুন" : " • Tap to open"))}
                    icon={PiggyBank}
                    color="bg-purple-600"
                    isDesktop={true}
                    hotkey={hotkey}
                    trendUp={somitiTotal >= 0}
                    trend={lang === "bn" ? "নিট জমা" : "Net Balance"}
                    className="h-full justify-between"
                    align={kpiConfig.align as any}
                    size={kpiConfig.size as any}
                    isPrivacyProtected={true}
                    isRevealed={revealedKpis.somiti}
                  />
                </div>
              ) : <div key="somiti" className="hidden" />;
            default:
              return null;
          }
        };

        return (
          <div key="kpis" className="space-y-6 col-span-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {kpiConfig.order.map((key, idx) => renderDesktopCard(key, idx))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <KPICard
                label={t("inventory_val_cost")}
                value={fmtMoney(totalStockCostValuation)}
                sub={lang === "bn" ? "কেনা মূল্যের হিসাব" : "Cost Worth of Stock"}
                icon={Package}
                color="bg-teal-500"
                isDesktop={true}
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
              />
              <KPICard
                label={t("inventory_val_sale")}
                value={fmtMoney(totalStockSaleValuation)}
                sub={lang === "bn" ? "বিক্রি মূল্যের হিসাব" : "Selling Worth of Stock"}
                icon={ShoppingBag}
                color="bg-pink-500"
                isDesktop={true}
                align={kpiConfig.align as any}
                size={kpiConfig.size as any}
              />
            </div>
          </div>
        );

      case "graphs":
        return (
          <div key="graphs" className="grid grid-cols-3 gap-4 col-span-3">
            <Card id="analytics-chart-desktop" className="col-span-2 p-5 space-y-4 bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.28)] hover:shadow-lg transition-all border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{t("custom_graphs")}</h2>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartMetric("sales")} className={`px-2 py-0.5 rounded ${chartMetric === "sales" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "বিক্রি" : "Sales"}</button>
                    <button onClick={() => setChartMetric("profit")} className={`px-2 py-0.5 rounded ${chartMetric === "profit" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "লাভ" : "Profit"}</button>
                    <button onClick={() => setChartMetric("expenses")} className={`px-2 py-0.5 rounded ${chartMetric === "expenses" ? "bg-background shadow font-medium" : ""}`}>{lang === "bn" ? "খরচ" : "Expenses"}</button>
                  </div>
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartType("area")} className={`p-1 rounded ${chartType === "area" ? "bg-background shadow" : ""}`} title="Area Chart"><AreaChartIcon className="size-3.5" /></button>
                    <button onClick={() => setChartType("bar")} className={`p-1 rounded ${chartType === "bar" ? "bg-background shadow" : ""}`} title="Bar Chart"><BarChart3 className="size-3.5" /></button>
                    <button onClick={() => setChartType("line")} className={`p-1 rounded ${chartType === "line" ? "bg-background shadow" : ""}`} title="Line Chart"><LineChartIcon className="size-3.5" /></button>
                  </div>
                  <div className="flex bg-muted rounded p-0.5">
                    <button onClick={() => setChartRange(7)} className={`px-2 py-0.5 rounded ${chartRange === 7 ? "bg-background shadow" : ""}`}>7 Days</button>
                    <button onClick={() => setChartRange(14)} className={`px-2 py-0.5 rounded ${chartRange === 14 ? "bg-background shadow" : ""}`}>14 Days</button>
                    <button onClick={() => setChartRange(30)} className={`px-2 py-0.5 rounded ${chartRange === 30 ? "bg-background shadow" : ""}`}>30 Days</button>
                  </div>
                </div>
              </div>

              <div className="w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ChartComponent data={customGraphData}>
                    <defs>
                      <linearGradient id="dSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="dProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="dExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `৳${v}`} width={50} />
                    <Tooltip content={<ChartTooltip />} />
                    {chartType === "area" && (
                      <Area
                        type="monotone"
                        dataKey={chartMetric}
                        stroke={getMetricColor()}
                        fill={chartMetric === "profit" ? "url(#dProfit)" : chartMetric === "expenses" ? "url(#dExpense)" : "url(#dSales)"}
                        strokeWidth={2}
                        name={t(chartMetric)}
                      />
                    )}
                    {chartType === "bar" && (
                      <Bar
                        dataKey={chartMetric}
                        fill={getMetricColor()}
                        radius={[4, 4, 0, 0]}
                        name={t(chartMetric)}
                      />
                    )}
                    {chartType === "line" && (
                      <Line
                        type="monotone"
                        dataKey={chartMetric}
                        stroke={getMetricColor()}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        name={t(chartMetric)}
                      />
                    )}
                  </ChartComponent>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5 flex flex-col justify-between bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.28)] hover:shadow-lg transition-all border border-border/80">
              <div>
                <h2 className="text-sm font-semibold mb-4">{t("payment_method_breakdown")}</h2>
                {pieData.length === 0 ? (
                  <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">{t("no_activity")}</div>
                ) : (
                  <>
                    <div className="w-full h-[150px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={3}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => `৳${Number(v).toLocaleString()}`} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 mt-3 pt-2 border-t border-border/60">
                      {pieData.map(d => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="size-2.5 rounded-full shadow-xs" style={{ background: d.color }} />
                            {d.name}
                          </span>
                          <span className="font-bold font-serif">{fmtMoney(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        );

      case "reminders":
        return (
          <div key="reminders" className="col-span-1">
            <Card className="p-5 space-y-4 h-full bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.28)] hover:shadow-lg transition-all border border-border/80">
              <div className="flex items-center justify-between border-b pb-2">
                <h2 className="text-sm font-semibold flex items-center gap-1.5">
                  <Calendar className="size-4 text-primary" /> {t("reminders")}
                </h2>
              </div>
              <div className="space-y-3">
                {renderReminderForm()}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pt-2">
                  {reminders.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-2">No custom tasks</p>}
                  {reminders.map(r => (
                    <div key={r.id} className={`flex items-center justify-between p-2.5 border rounded text-xs transition-colors ${
                      isReminderActive(r) ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border"
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {(!r.logic_type || r.logic_type === "none") ? (
                          <button type="button" onClick={() => handleToggleReminder(r.id, !r.completed)}>
                            {r.completed ? <CheckSquare className="size-4 text-primary shrink-0" /> : <Square className="size-4 text-muted-foreground shrink-0" />}
                          </button>
                        ) : (
                          <span className="inline-block text-[8px] font-bold px-1.5 py-0.2 rounded bg-primary/10 text-primary uppercase shrink-0">
                            {lang === "bn" ? "অটো" : "Auto"}
                          </span>
                        )}
                        <span className={`truncate ${r.completed ? "line-through text-muted-foreground" : "font-medium"}`}>{r.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-muted-foreground text-[10px]">
                        <span>{r.due_date}</span>
                        <button type="button" className="text-destructive hover:scale-105 active:scale-95" onClick={() => handleDeleteReminder(r.id)}><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        );

      case "bestSelling":
        return (
          <div key="bestSelling" className="col-span-1">
            <Card className="p-5 h-full bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.28)] hover:shadow-lg transition-all border border-border/80 flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-semibold mb-4">{t("best_selling")} ({lang === "bn" ? "পরিমাণ" : "Qty"})</h2>
                {topDemandedProducts.length === 0 ? (
                  <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">{t("no_activity")}</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={topDemandedProducts} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${v} ${lang === "bn" ? "টি" : "u"}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                        <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ${lang === "bn" ? "টি" : "units"}`, lang === "bn" ? "বিক্রির পরিমাণ" : "Sales quantity"]} />
                        <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name={lang === "bn" ? "বিক্রির পরিমাণ" : "Sales quantity"} />
                      </BarChart>
                    </ResponsiveContainer>
                    {allDemandedProducts.length > topDemandedProducts.length && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-8 hover:bg-accent border border-dashed border-border/60 mt-4 active:scale-95 transition-all"
                        onClick={() => {
                          playTapSound();
                          setBestSellingLimit(prev => prev + 5);
                        }}
                      >
                        {lang === "bn" ? "আরও দেখুন ↓" : "View More ↓"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </Card>
          </div>
        );

      case "recent":
        return (
          <div key="recent" className="col-span-1">
            <Card className="p-5 flex flex-col justify-between h-full bg-gradient-to-br from-white to-zinc-50/40 dark:from-zinc-900/90 dark:to-zinc-950/90 backdrop-blur-sm beveled-card shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.28)] hover:shadow-lg transition-all border border-border/80">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">{t("recent_activity")}</h2>
                  <Link href="/sales" className="text-xs text-primary hover:underline">{t("view")} all →</Link>
                </div>
                {recentSalesToShow.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">{t("no_activity")}</div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                      {recentSalesToShow.map(s => (
                        <div key={s.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{s.product_name}</div>
                            <div className="text-[10px] text-muted-foreground">{s.type === "cash" ? t("cash") : s.type === "online" ? t("online_sell") : t("credit")} · {fmtDateTime(s.created_at)}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold">{fmtMoney(Number(s.sell_price) * s.qty)}</div>
                            <div className="text-[10px] text-muted-foreground">{s.qty} {lang === "bn" ? "টি" : "pcs"}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  // ── Mobile Layout ─────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold font-serif">{t("dashboard")}</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <Button
            variant={showFilter ? "default" : "outline"}
            size="icon"
            className="size-8"
            onClick={() => setShowFilter(!showFilter)}
            aria-label="Toggle filter"
          >
            <ArrowUpDown className="size-4" />
          </Button>
        </div>

        {/* Date Filter Dropdown on Phone */}
        {showFilter && (
          <Card className="p-3 bg-card border border-border space-y-2.5 rounded-2xl shadow-sm">
            {/* Quick Preset Pills in Phone Filter Dropdown */}
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === "bn" ? "তারিখ ফিল্টার" : "Date Filter Presets"}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant={!dateFilter.from && !dateFilter.to ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-bold"
                onClick={() => clearFilter()}
              >
                {lang === "bn" ? "সব সময়" : "All Time"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-medium"
                onClick={() => setPresetRange("today")}
              >
                {lang === "bn" ? "আজ" : "Today"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-medium"
                onClick={() => setPresetRange("yesterday")}
              >
                {lang === "bn" ? "গতকাল" : "Yesterday"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-medium"
                onClick={() => setPresetRange("this_week")}
              >
                {lang === "bn" ? "এই সপ্তাহ" : "This Week"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-semibold bg-primary/10 border-primary/30 text-primary"
                onClick={() => setPresetRange("this_month")}
              >
                {lang === "bn" ? "এই মাস" : "This Month"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 rounded-lg font-medium"
                onClick={() => setPresetRange("last_month")}
              >
                {lang === "bn" ? "গত মাস" : "Last Month"}
              </Button>
            </div>

            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">{lang === "bn" ? "শুরুর তারিখ" : "Date from"}</label>
                  <Input type="date" className="h-8 text-xs rounded-lg" value={dateFilter.from} onChange={e => applyFilter(e.target.value, dateFilter.to)} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">{lang === "bn" ? "শেষ তারিখ" : "Date to"}</label>
                  <Input type="date" className="h-8 text-xs rounded-lg" value={dateFilter.to} onChange={e => applyFilter(dateFilter.from, e.target.value)} />
                </div>
              </div>
              <div className="flex gap-1.5 pt-0.5">
                <Button onClick={() => applyFilter(dateFilter.from, dateFilter.to)} variant="default" size="sm" className="h-7 text-xs flex-1 rounded-lg font-bold">
                  {lang === "bn" ? "প্রয়োগ করুন" : "Apply"}
                </Button>
                <Button onClick={clearFilter} variant="outline" size="sm" className="h-7 text-xs flex-1 rounded-lg font-medium">
                  {lang === "bn" ? "রিসেট" : "Reset"}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Widgets loop ordered dynamically */}
        {widgetOrder.map(widgetId => renderWidget(widgetId))}

        {/* Reminders Startup Popup Modal */}
        {showPopup && activeRemindersList.length > 0 && (
          <Dialog open={showPopup} onOpenChange={setShowPopup}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto z-[10000]">
              <DialogHeader>
                <DialogTitle className="text-destructive flex items-center gap-1.5 text-base font-bold">
                  <AlertCircle className="size-5" />
                  {lang === "bn" ? "সতর্কতা ও রিমাইন্ডার" : "Alerts & Reminders"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground">
                  {lang === "bn"
                    ? "নিম্নলিখিত সতর্কতা বা রিমাইন্ডারগুলি আপনার দৃষ্টি আকর্ষণ করছে:"
                    : "The following alerts or reminders require your attention:"}
                </p>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                  {activeRemindersList.map(item => (
                    <div key={item.id} className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-xs flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-destructive/10 text-destructive uppercase tracking-wider">
                          {item.type}
                        </span>
                        <p className="font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">{item.title}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!item.isLogic && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[9px] px-2"
                            onClick={async () => {
                              await handleToggleReminder(item.id, true);
                            }}
                          >
                            {lang === "bn" ? "ঠিক আছে" : "Done"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                          onClick={async () => {
                            await handleDeleteReminder(item.id);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter className="pt-2 border-t">
                  <Button size="sm" onClick={() => setShowPopup(false)} className="w-full sm:w-auto">
                    {lang === "bn" ? "বন্ধ করুন" : "Close"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}

        <SaleDialog
          open={saleOpen}
          onOpenChange={setSaleOpen}
          presetType={salePresetType}
        />
      </div>
    );
  }

  // ── Desktop Layout (No secondary header card, presets beside filter icon) ─────────────────
  return (
    <div className="space-y-5">
      {/* Top Action & Filter Bar on PC */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card/60 border border-border/80 p-2.5 rounded-2xl shadow-xs backdrop-blur-md">
        {/* Presets directly beside the filter icon on PC */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={showFilter ? "default" : "outline"}
            size="sm"
            className="h-8 px-2.5 gap-1.5 rounded-xl font-semibold border-border cursor-pointer"
            onClick={() => setShowFilter(!showFilter)}
            title={lang === "bn" ? "কাস্টম তারিখ ফিল্টার" : "Custom Date Filter"}
          >
            <Calendar className="size-3.5 text-primary" />
            <span className="text-xs">{lang === "bn" ? "ফিল্টার" : "Filter"}</span>
          </Button>

          <div className="h-4 w-px bg-border mx-0.5 hidden sm:block" />

          {/* Preset Buttons beside filter icon */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={`h-8 text-xs px-2.5 rounded-xl font-bold transition-all cursor-pointer ${!dateFilter.from && !dateFilter.to ? "bg-primary text-primary-foreground border-primary shadow-xs" : "bg-card hover:bg-muted"}`}
            onClick={() => clearFilter()}
          >
            {lang === "bn" ? "সব সময়" : "All Time"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl font-semibold bg-card hover:bg-muted cursor-pointer"
            onClick={() => setPresetRange("today")}
          >
            {lang === "bn" ? "আজ" : "Today"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl font-semibold bg-card hover:bg-muted cursor-pointer"
            onClick={() => setPresetRange("yesterday")}
          >
            {lang === "bn" ? "গতকাল" : "Yesterday"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl font-semibold bg-card hover:bg-muted cursor-pointer"
            onClick={() => setPresetRange("this_week")}
          >
            {lang === "bn" ? "এই সপ্তাহ" : "This Week"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl font-semibold bg-card hover:bg-muted cursor-pointer"
            onClick={() => setPresetRange("this_month")}
          >
            {lang === "bn" ? "এই মাস" : "This Month"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs px-2.5 rounded-xl font-semibold bg-card hover:bg-muted cursor-pointer"
            onClick={() => setPresetRange("last_month")}
          >
            {lang === "bn" ? "গত মাস" : "Last Month"}
          </Button>
        </div>

        {/* Primary New Sale button */}
        <div className="flex items-center gap-2">
          <Button
            onClick={() => { playTapSound(); setSaleOpen(true); }}
            size="sm"
            className="h-8.5 px-4 gap-1.5 rounded-xl bg-primary text-primary-foreground font-bold shadow-md hover:bg-primary/90 cursor-pointer"
          >
            <ShoppingBag className="size-4" />
            <span>{t("new_sale")}</span>
            <span className="text-[10px] font-mono opacity-80 ml-0.5 hidden sm:inline">[Space]</span>
          </Button>
        </div>
      </div>

      {/* Expandable Custom Date Range Selector on PC */}
      {showFilter && (
        <Card className="p-3.5 border border-border/80 bg-card rounded-2xl shadow-sm">
          <div className="flex flex-wrap items-end gap-3 max-w-2xl">
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                {lang === "bn" ? "শুরুর তারিখ" : "Start Date"}
              </label>
              <Input type="date" className="h-8.5 text-xs rounded-xl" value={dateFilter.from} onChange={e => applyFilter(e.target.value, dateFilter.to)} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                {lang === "bn" ? "শেষ তারিখ" : "End Date"}
              </label>
              <Input type="date" className="h-8.5 text-xs rounded-xl" value={dateFilter.to} onChange={e => applyFilter(dateFilter.from, e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => applyFilter(dateFilter.from, dateFilter.to)} variant="default" size="sm" className="h-8.5 text-xs px-3 rounded-xl font-bold">
                {lang === "bn" ? "প্রয়োগ" : "Apply"}
              </Button>
              <Button onClick={clearFilter} variant="outline" size="sm" className="h-8.5 text-xs px-3 rounded-xl font-medium">
                {lang === "bn" ? "রিসেট" : "Reset"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Render Desktop widgets dynamically in custom order */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {widgetOrder.filter(id => id !== 'valuations' && id !== 'quickLinks').map(widgetId => renderDesktopWidget(widgetId))}
      </div>

      {/* Reminders Startup Popup Modal */}
      {showPopup && activeRemindersList.length > 0 && (
        <Dialog open={showPopup} onOpenChange={setShowPopup}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto z-[10000]">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-1.5 text-base font-bold">
                <AlertCircle className="size-5" />
                {lang === "bn" ? "সতর্কতা ও রিমাইন্ডার" : "Alerts & Reminders"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                {lang === "bn"
                  ? "নিম্নলিখিত সতর্কতা বা রিমাইন্ডারগুলি আপনার দৃষ্টি আকর্ষণ করছে:"
                  : "The following alerts or reminders require your attention:"}
              </p>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {activeRemindersList.map(item => (
                  <div key={item.id} className="p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-xs flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded bg-destructive/10 text-destructive uppercase tracking-wider">
                        {item.type}
                      </span>
                      <p className="font-semibold leading-relaxed text-zinc-900 dark:text-zinc-100">{item.title}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!item.isLogic && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[9px] px-2"
                          onClick={async () => {
                            await handleToggleReminder(item.id, true);
                          }}
                        >
                          {lang === "bn" ? "ঠিক আছে" : "Done"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          await handleDeleteReminder(item.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <DialogFooter className="pt-2 border-t">
                <Button size="sm" onClick={() => setShowPopup(false)} className="w-full sm:w-auto">
                  {lang === "bn" ? "বন্ধ করুন" : "Close"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <SaleDialog
        open={saleOpen}
        onOpenChange={setSaleOpen}
        presetType={salePresetType}
      />

      {/* ── KPI STYLE CUSTOMIZER MODAL ───────────────────────── */}
      <Dialog open={bentoCustomizerOpen} onOpenChange={setBentoCustomizerOpen}>
        <DialogContent className="max-w-md bg-card border-border rounded-3xl p-5 shadow-2xl space-y-4">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50">
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Palette className="size-4" />
              </div>
              <span>{lang === "bn" ? "কেপিআই ডিজাইন কাস্টমাইজেশন" : "KPI Design Customizer"}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1 max-h-[70vh] overflow-y-auto pr-1">
            {/* Bento Grid Mode Toggle */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  <span>{lang === "bn" ? "হিরো কার্ড লেআউট" : "Hero Card Spans"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {lang === "bn" ? "প্রধান কেপিআই কার্ডগুলি বড় আকৃতি ও বিশেষ হাইলাইট পাবে" : "Enlarge primary metrics with hero card spans"}
                </div>
              </div>
              <Button
                size="sm"
                variant={kpiConfig.bentoGrid ? "default" : "outline"}
                className="h-7 px-3 text-xs font-bold"
                onClick={() => updateKpiConfig({ bentoGrid: !kpiConfig.bentoGrid })}
              >
                {kpiConfig.bentoGrid ? (lang === "bn" ? "চালু 🟢" : "ON 🟢") : (lang === "bn" ? "বন্ধ" : "OFF")}
              </Button>
            </div>

            {/* Card Style Variant */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "কার্ড ডিজাইন স্টাইল" : "Card Design Style"}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: "glass", label: lang === "bn" ? "গ্লাস (Glass)" : "Glassmorphic" },
                  { id: "neon", label: lang === "bn" ? "নিয়ন (Neon)" : "Neon Glow" },
                  { id: "gradient", label: lang === "bn" ? "গ্রেডিয়েন্ট" : "Gradient" },
                  { id: "bordered", label: lang === "bn" ? "বর্ডার" : "Bordered" },
                  { id: "flat", label: lang === "bn" ? "ফ্ল্যাট (Flat)" : "Minimal Flat" },
                ].map(v => (
                  <button
                    key={v.id}
                    onClick={() => updateKpiConfig({ variant: v.id })}
                    className={`p-2 rounded-xl border text-[11px] font-bold text-center transition-all ${
                      (kpiConfig.variant || "glass") === v.id
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shadows & Effects */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "শ্যাডো ও গ্লো ইফেক্ট" : "Shadow & Glow Effects"}</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "glow", label: lang === "bn" ? "অ্যাম্বিয়েন্ট গ্লো" : "Ambient Glow" },
                  { id: "neon", label: lang === "bn" ? "নিয়ন শ্যাডো" : "Neon Shadow" },
                  { id: "deep", label: lang === "bn" ? "ডিপ শ্যাডো" : "Deep Elevation" },
                  { id: "soft", label: lang === "bn" ? "সফট শ্যাডো" : "Soft Shadow" },
                  { id: "none", label: lang === "bn" ? "কোন শ্যাডো না" : "No Shadow" },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => updateKpiConfig({ shadow: s.id })}
                    className={`p-2 rounded-xl border text-[10px] font-bold text-center transition-all ${
                      (kpiConfig.shadow || "glow") === s.id
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Border Style Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "কেপিআই বর্ডার কাস্টমাইজ" : "KPI Border Style"}</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "subtle", label: lang === "bn" ? "সফ্‌ট বর্ডার" : "Subtle Border" },
                  { id: "bold", label: lang === "bn" ? "বোল্ড প্রাইমারি" : "Bold Primary" },
                  { id: "pink", label: lang === "bn" ? "গোলাপী (Pink)" : "Pink Accent" },
                  { id: "emerald", label: lang === "bn" ? "সবুজ (Emerald)" : "Emerald" },
                  { id: "amber", label: lang === "bn" ? "গোল্ড (Gold)" : "Gold" },
                  { id: "indigo", label: lang === "bn" ? "ইন্ডিগো (Indigo)" : "Indigo" },
                  { id: "dashed", label: lang === "bn" ? "ড্যাশড বর্ডার" : "Dashed" },
                  { id: "none", label: lang === "bn" ? "বর্ডার ছাড়া" : "No Border" },
                ].map(b => (
                  <button
                    key={b.id}
                    onClick={() => updateKpiConfig({ borderStyle: b.id as any })}
                    className={`p-2 rounded-xl border text-[10px] font-bold text-center transition-all ${
                      (kpiConfig.borderStyle || "subtle") === b.id
                        ? "border-primary bg-primary/15 text-primary shadow-sm ring-1 ring-primary/40"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Columns per Row */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "গ্রিড কলাম সংখ্যা" : "Grid Columns"}</Label>
              <div className="flex bg-muted rounded-xl p-1 text-xs">
                {[1, 2, 3, 4].map(c => (
                  <button
                    key={c}
                    onClick={() => updateKpiConfig({ columns: c })}
                    className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-all ${
                      kpiConfig.columns === c
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c} {lang === "bn" ? "কলাম" : "Cols"}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Alignment */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "টেক্সট অ্যালাইনমেন্ট" : "Text Alignment"}</Label>
              <div className="flex bg-muted rounded-xl p-1 text-xs">
                {(["left", "center", "right"] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => updateKpiConfig({ align: a })}
                    className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-all capitalize ${
                      kpiConfig.align === a
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Curve / Corner Roundness Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "কেপিআই কর্নার কার্ভ (গোলাই)" : "KPI Corner Curve / Roundness"}</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-muted rounded-xl p-1 text-xs">
                {[
                  { id: "none", label: lang === "bn" ? "ফ্ল্যাট (0px)" : "None (0px)" },
                  { id: "sm", label: "Small" },
                  { id: "md", label: "Medium" },
                  { id: "lg", label: "Large" },
                  { id: "xl", label: "XL (28px)" },
                  { id: "full", label: lang === "bn" ? "পিল (Pill)" : "Pill / Oval" },
                ].map(cr => (
                  <button
                    key={cr.id}
                    onClick={() => updateKpiConfig({ curve: cr.id as any })}
                    className={`py-1.5 px-1 rounded-lg text-center text-[10px] font-bold transition-all ${
                      (kpiConfig.curve || "none") === cr.id
                        ? "bg-background text-foreground shadow-sm ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Size with Increase/Decrease Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-foreground">{lang === "bn" ? "কেপিআই বক্স সাইজ অ্যাডজাস্ট" : "KPI Box Size Adjust"}</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs font-bold gap-1"
                    onClick={decreaseKpiSize}
                    disabled={kpiConfig.size === "xxs"}
                  >
                    <span>-</span>
                    <span>{lang === "bn" ? "ছোট করুন" : "Decrease"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs font-bold gap-1"
                    onClick={increaseKpiSize}
                    disabled={kpiConfig.size === "xl"}
                  >
                    <span>+</span>
                    <span>{lang === "bn" ? "বড় করুন" : "Increase"}</span>
                  </Button>
                </div>
              </div>
              <div className="flex bg-muted rounded-xl p-1 text-xs">
                {[
                  { id: "xxs", label: "XXS" },
                  { id: "xs", label: "XS" },
                  { id: "small", label: lang === "bn" ? "ছোট (S)" : "Small" },
                  { id: "standard", label: lang === "bn" ? "মাঝারি (M)" : "Medium" },
                  { id: "large", label: lang === "bn" ? "বড় (L)" : "Large" },
                  { id: "xl", label: "XL" },
                ].map(sz => (
                  <button
                    key={sz.id}
                    onClick={() => updateKpiConfig({ size: sz.id as any })}
                    className={`flex-1 py-1.5 rounded-lg text-center font-bold transition-all ${
                      kpiConfig.size === sz.id
                        ? "bg-background text-foreground shadow-sm ring-1 ring-primary/30"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Drag and Drop Reordering */}
            <div className="space-y-2.5 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                  <ArrowUpDown className="size-3.5 text-primary" />
                  <span>{lang === "bn" ? "কেপিআই কার্ডের অবস্থান ক্রম (ড্র্যাগ ও ড্রপ)" : "KPI Card Sequence (Drag & Drop)"}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={resetKpiToDefault}
                  className="h-6 px-2 text-[10px] font-bold text-muted-foreground hover:text-foreground gap-1"
                >
                  <RotateCcw className="size-3" />
                  <span>{lang === "bn" ? "ডিফল্ট ক্রম" : "Reset"}</span>
                </Button>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {normalizeKpiOrder(kpiConfig.order).map((kpiKey, idx) => {
                  const meta = KPI_METADATA[kpiKey] || {
                    nameEn: kpiKey,
                    nameBn: kpiKey,
                    badge: "KPI",
                    bg: "bg-primary/10 border-primary/20 text-primary",
                  };
                  const isBeingDragged = draggedKpiIdx === idx;

                  return (
                    <div
                      key={kpiKey}
                      draggable
                      onDragStart={() => handleKpiDragStart(idx)}
                      onDragOver={(e) => handleKpiDragOver(e, idx)}
                      onDragEnd={handleKpiDragEnd}
                      className={`group flex items-center justify-between gap-2 p-2 rounded-xl border text-xs select-none transition-all cursor-grab active:cursor-grabbing ${
                        isBeingDragged
                          ? "opacity-50 border-primary bg-primary/15 shadow-sm"
                          : "bg-background/70 hover:bg-background border-border/80 hover:border-primary/40 shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <GripVertical className="size-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                        <span className="size-5 rounded-md bg-muted text-[10px] font-bold font-mono flex items-center justify-center text-muted-foreground shrink-0">
                          {idx + 1}
                        </span>
                        <span className="font-bold truncate text-foreground text-[11px]">
                          {lang === "bn" ? meta.nameBn : meta.nameEn}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${meta.bg}`}>
                          {meta.badge}
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={idx === 0}
                          onClick={() => moveKpiPosition(idx, idx - 1)}
                          className="size-6 p-0 text-muted-foreground hover:text-foreground rounded disabled:opacity-20 cursor-pointer"
                          title={lang === "bn" ? "উপরে নিন" : "Move Up"}
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={idx === normalizeKpiOrder(kpiConfig.order).length - 1}
                          onClick={() => moveKpiPosition(idx, idx + 1)}
                          className="size-6 p-0 text-muted-foreground hover:text-foreground rounded disabled:opacity-20 cursor-pointer"
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
          </div>

          <DialogFooter className="pt-2 border-t border-border/50">
            <Button className="w-full font-bold rounded-xl" onClick={() => setBentoCustomizerOpen(false)}>
              {lang === "bn" ? "সংরক্ষণ করুন" : "Save & Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
