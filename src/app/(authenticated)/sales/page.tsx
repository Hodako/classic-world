"use client";

import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getSales, getProducts, type Sale, type Product } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { FAB } from "@/components/ui/fab";
import { SaleDialog } from "@/components/sale-dialog";
import { EditSaleDialog } from "@/components/edit-sale-dialog";
import {
  RotateCcw,
  Search,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Printer,
  FileDown,
  FileSpreadsheet,
  Calendar,
  Filter,
  CreditCard,
  Banknote,
  DollarSign,
  Tag,
  Plus,
  Truck,
  PackageCheck,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { createReturnFn, deleteSaleFn, approveCourierPaymentFn, cancelCourierOrderFn } from "@/lib/rpc";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";
import { useAuth } from "@/hooks/use-auth";
import { getBusinessSettingsFn } from "@/lib/rpc-admin";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GroupedSale {
  id: string;
  isGroup: boolean;
  cart_id?: string | null;
  product_name: string;
  qty: number;
  sell_price: number;
  profit: number;
  due_amount: number;
  paid_amount: number;
  type: "cash" | "bkash" | "bank" | "credit" | "online" | string;
  courier_status?: string | null;
  courier_name?: string | null;
  tracking_code?: string | null;
  returned?: boolean;
  created_at: string;
  parties?: { name: string } | null;
  items: Sale[];
}

function groupSales(sales: Sale[]): GroupedSale[] {
  const grouped: GroupedSale[] = [];
  const cartGroups: Record<string, Sale[]> = {};

  sales.forEach(s => {
    if (s.cart_id) {
      if (!cartGroups[s.cart_id]) {
        cartGroups[s.cart_id] = [];
      }
      cartGroups[s.cart_id].push(s);
    } else {
      grouped.push({
        id: s.id,
        isGroup: false,
        cart_id: null,
        product_name: s.product_name,
        qty: s.qty,
        sell_price: Number(s.sell_price) * s.qty,
        profit: s.profit,
        due_amount: s.due_amount,
        paid_amount: s.paid_amount,
        type: s.type || "cash",
        courier_status: (s as any).courier_status || (s.type === "online" ? "pending" : null),
        courier_name: (s as any).courier_name || (s.type === "online" ? "Courier" : null),
        tracking_code: (s as any).tracking_code || null,
        returned: (s as any).returned || false,
        created_at: s.created_at,
        parties: s.parties,
        items: [s],
      });
    }
  });

  Object.entries(cartGroups).forEach(([cartId, items]) => {
    items.sort((a, b) => a.product_name.localeCompare(b.product_name));

    const firstItem = items[0];
    const totalQty = items.reduce((sum, x) => sum + x.qty, 0);
    const totalSellPrice = items.reduce((sum, x) => sum + Number(x.sell_price) * x.qty, 0);
    const totalProfit = items.reduce((sum, x) => sum + x.profit, 0);
    const totalDue = items.reduce((sum, x) => sum + x.due_amount, 0);
    const totalPaid = items.reduce((sum, x) => sum + x.paid_amount, 0);

    const names = items.map(x => `${x.product_name} (×${x.qty})`).join(", ");

    grouped.push({
      id: firstItem.id,
      isGroup: true,
      cart_id: cartId,
      product_name: names,
      qty: totalQty,
      sell_price: totalSellPrice,
      profit: totalProfit,
      due_amount: totalDue,
      paid_amount: totalPaid,
      type: firstItem.type || "cash",
      courier_status: (firstItem as any).courier_status || (firstItem.type === "online" ? "pending" : null),
      courier_name: (firstItem as any).courier_name || (firstItem.type === "online" ? "Courier" : null),
      tracking_code: (firstItem as any).tracking_code || null,
      returned: (firstItem as any).returned || false,
      created_at: firstItem.created_at,
      parties: firstItem.parties,
      items: items,
    });
  });

  grouped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return grouped;
}

export default function SalesPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const { data: rawSales = [] } = useCachedQuery(["sales"], getSales);
  const { data: products = [] } = useCachedQuery(["products"], getProducts);

  const [open, setOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeTab, setActiveTab] = useState("all");
  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = isMobile ? 12 : 20;

  // Build product to category lookup
  const productCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => {
      if (p.id && p.category) map.set(p.id, p.category.trim());
      if (p.name && p.category) map.set(p.name.toLowerCase().trim(), p.category.trim());
    });
    return map;
  }, [products]);

  // Unique categories list
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) cats.add(p.category.trim());
    });
    return Array.from(cats).sort();
  }, [products]);

  const allSalesGrouped = useMemo(() => {
    return groupSales(rawSales);
  }, [rawSales]);

  // Date Filtering Logic
  const inDateRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();

    if (dateRange === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= today;
    }
    if (dateRange === "yesterday") {
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= yesterdayStart && d < yesterdayEnd;
    }
    if (dateRange === "week") {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return d >= weekStart;
    }
    if (dateRange === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= monthStart;
    }
    if (dateRange === "custom") {
      if (customFrom && d < new Date(customFrom)) return false;
      if (customTo) {
        const toDate = new Date(customTo);
        toDate.setHours(23, 59, 59, 999);
        if (d > toDate) return false;
      }
      return true;
    }
    return true; // "all"
  };

  // Master Filter: Search + Date + Category + Payment Method Tab
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();

    return allSalesGrouped.filter(s => {
      // 1. Date filter
      if (!inDateRange(s.created_at)) return false;

      // 2. Tab / Payment Method Filter
      if (activeTab !== "all") {
        if (activeTab === "cash" && s.type !== "cash") return false;
        if (activeTab === "bkash" && s.type !== "bkash") return false;
        if (activeTab === "bank" && s.type !== "bank") return false;
        if (activeTab === "credit" && s.type !== "credit") return false;
        if (activeTab === "courier_pending" && (s.type !== "online" || s.courier_status === "collected" || s.courier_status === "cancelled" || s.returned)) return false;
        if (activeTab === "online" && s.type !== "online") return false;
      }

      // 3. Category Filter
      if (selectedCategory !== "all") {
        const matchesCategory = s.items.some(it => {
          const cat = (it.product_id ? productCategoryMap.get(it.product_id) : null) ||
                      productCategoryMap.get(it.product_name.toLowerCase().trim());
          return cat === selectedCategory;
        });
        if (!matchesCategory) return false;
      }

      // 4. Search Query
      if (q) {
        const matchName = s.product_name.toLowerCase().includes(q);
        const matchCustomer = (s.parties?.name ?? "").toLowerCase().includes(q);
        const matchNote = s.items.some(it => (it.note || "").toLowerCase().includes(q));
        if (!matchName && !matchCustomer && !matchNote) return false;
      }

      return true;
    });
  }, [allSalesGrouped, dateRange, customFrom, customTo, activeTab, selectedCategory, search, productCategoryMap]);

  // Financial KPIs for filtered set
  const filteredTotalSales = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (s.returned ? 0 : s.sell_price), 0);
  }, [filteredSales]);

  const filteredTotalProfit = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (s.returned ? 0 : s.profit), 0);
  }, [filteredSales]);

  const filteredTotalDue = useMemo(() => {
    return filteredSales.reduce((acc, s) => acc + (s.returned ? 0 : s.due_amount), 0);
  }, [filteredSales]);

  // CSV Exporter
  const exportSalesCsv = (langCode: "en" | "bn") => {
    const isBn = langCode === "bn";
    const headers = isBn
      ? ["তারিখ ও সময়", "ইনভয়েস / পণ্য বিবরণ", "ক্যাটাগরি", "পরিমাণ", "বিক্রয় মূল্য (টাকা)", "লাভ (টাকা)", "পেমেন্ট মাধ্যম", "কাস্টমার", "পরিশোধ (টাকা)", "বকেয়া (টাকা)"]
      : ["Date & Time", "Invoice / Products", "Category", "Qty", "Total Sell (BDT)", "Profit (BDT)", "Payment Method", "Customer", "Paid (BDT)", "Due (BDT)"];

    const rows = filteredSales.map(s => {
      const methodStr =
        s.type === "bkash" ? (isBn ? "বিকাশ" : "bKash") :
        s.type === "bank" ? (isBn ? "ব্যাংক" : "Bank") :
        s.type === "credit" ? (isBn ? "বাকী" : "Credit") :
        s.type === "online" ? (isBn ? `কুরিয়ার (${s.courier_status || "pending"})` : `Courier (${s.courier_status || "pending"})`) :
        (isBn ? "নগদ" : "Cash");

      const custName = s.parties?.name || (isBn ? "সাধারণ কাস্টমার" : "Walk-in Customer");
      const cats = Array.from(new Set(s.items.map(it => {
        return (it.product_id ? productCategoryMap.get(it.product_id) : null) ||
               productCategoryMap.get(it.product_name.toLowerCase().trim()) ||
               (isBn ? "সাধারণ" : "General");
      }))).join("; ");

      return [
        `"${fmtDateTime(s.created_at)}"`,
        `"${s.product_name.replace(/"/g, '""')}"`,
        `"${cats}"`,
        s.qty,
        s.sell_price,
        s.profit,
        `"${methodStr}"`,
        `"${custName.replace(/"/g, '""')}"`,
        s.paid_amount,
        s.due_amount,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(isBn ? "বিক্রয় স্প্রেডশিট ডাউনলোড সম্পন্ন হয়েছে" : "Sales CSV exported successfully");
  };

  return (
    <div className="space-y-3 pb-12 font-hind">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 sm:p-3.5 rounded-2xl border-[0.5px] border-black/75 dark:border-white/30 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <ShoppingBag className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold font-balooda tracking-tight truncate">{lang === "bn" ? "বিক্রয় হিসাব" : "Sales Ledger"}</h1>
              <p className="text-[11px] text-muted-foreground font-balooda truncate max-w-[210px] min-[400px]:max-w-[260px] sm:max-w-none">
                {lang === "bn" ? "বিক্রয়, কুরিয়ার ও ইনভয়েস ট্র্যাকিং" : "Track sales, courier & invoices"}
              </p>
            </div>
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            className="sm:hidden h-8 px-2.5 text-xs font-bold font-balooda rounded-lg bg-primary text-primary-foreground gap-1 shrink-0"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন বিক্রি" : "New"}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8.5 text-xs rounded-xl font-balooda"
              placeholder={lang === "bn" ? "পণ্য বা ক্রেতার নাম দিয়ে খুঁজুন..." : "Search product or customer..."}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8.5 px-2.5 text-xs font-bold font-balooda rounded-xl gap-1.5 cursor-pointer">
                <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isMobile ? "CSV" : (lang === "bn" ? "এক্সেল / CSV" : "Export CSV")}</span>
                <ChevronDown className="size-3 opacity-60 ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportSalesCsv("bn")}>
                Bangla (বাংলা স্প্রেডশিট)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSalesCsv("en")}>
                English (ইংরেজি Spreadsheet)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            className="hidden sm:flex h-8.5 px-3 text-xs font-bold font-balooda rounded-xl bg-primary text-primary-foreground shadow-xs gap-1.5"
          >
            <Plus className="size-4 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন বিক্রি" : "New Sale"}</span>
          </Button>
        </div>
      </div>

      <Card className="p-3 rounded-2xl border-[0.5px] border-black/75 dark:border-white/30 bg-card/60 backdrop-blur-sm space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Calendar className="size-4 text-primary" />
            <span className="font-balooda font-bold text-xs sm:text-sm">{lang === "bn" ? "তারিখ ফিল্টার:" : "Date Filter:"}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap font-balooda">
            <button
              type="button"
              onClick={() => { setDateRange("today"); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateRange === "today" ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "আজ" : "Today"}
            </button>
            <button
              type="button"
              onClick={() => { setDateRange("yesterday"); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateRange === "yesterday" ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "গতকাল" : "Yesterday"}
            </button>
            <button
              type="button"
              onClick={() => { setDateRange("week"); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateRange === "week" ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "গত ৭ দিন" : "Last 7 Days"}
            </button>
            <button
              type="button"
              onClick={() => { setDateRange("month"); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateRange === "month" ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "চলতি মাস" : "This Month"}
            </button>
            <button
              type="button"
              onClick={() => { setDateRange("all"); setPage(1); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                dateRange === "all" ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "সকল সময়" : "All Time"}
            </button>

            <button
              type="button"
              onClick={() => {
                setDateRange(dateRange === "custom" ? "today" : "custom");
                setPage(1);
              }}
              title={lang === "bn" ? "কাস্টম তারিখ নির্বাচন" : "Custom Date Picker"}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                dateRange === "custom"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground border-border/70"
              }`}
            >
              <Calendar className="size-3.5" />
              <span>{lang === "bn" ? "কাস্টম তারিখ" : "Custom"}</span>
            </button>
          </div>
        </div>

        {dateRange === "custom" && (
          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/50 font-balooda">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "হতে" : "From"}</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={e => { setCustomFrom(e.target.value); setPage(1); }}
                className="h-8 text-xs rounded-xl"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "পর্যন্ত" : "To"}</Label>
              <Input
                type="date"
                value={customTo}
                onChange={e => { setCustomTo(e.target.value); setPage(1); }}
                className="h-8 text-xs rounded-xl"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Tag className="size-3.5 text-primary" />
            <span className="font-balooda font-bold text-xs sm:text-sm">{lang === "bn" ? "ক্যাটাগরি ফিল্টার:" : "Category Filter:"}</span>
          </div>

          <select
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs font-bold font-balooda text-foreground shadow-xs cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="all">{lang === "bn" ? "সকল ক্যাটাগরি" : "All Categories"}</option>
            {availableCategories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
        <Card
          className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <span className="text-[11px] sm:text-xs font-semibold font-balooda text-[#64748B] uppercase tracking-tight block" style={{ color: "#64748B" }}>
            {lang === "bn" ? "মোট বিক্রি" : "Total Sales"}
          </span>
          <p className="text-base sm:text-lg font-extrabold font-serif text-[#0F172A] mt-0.5" style={{ color: "#0F172A" }}>
            {fmtMoney(filteredTotalSales)}
          </p>
        </Card>

        <Card
          className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <span className="text-[11px] sm:text-xs font-semibold font-balooda text-[#64748B] uppercase tracking-tight block" style={{ color: "#64748B" }}>
            {lang === "bn" ? "মোট লাভ" : "Total Profit"}
          </span>
          <p className="text-base sm:text-lg font-extrabold font-serif text-[#0F172A] mt-0.5" style={{ color: "#0F172A" }}>
            {fmtMoney(filteredTotalProfit)}
          </p>
        </Card>

        <Card
          className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm transition-all"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E8F0", boxShadow: "0 2px 4px rgba(0,0,0,0.06)" }}
        >
          <span className="text-[11px] sm:text-xs font-semibold font-balooda text-[#64748B] uppercase tracking-tight block" style={{ color: "#64748B" }}>
            {lang === "bn" ? "মোট বাকী" : "Total Due"}
          </span>
          <p className="text-base sm:text-lg font-extrabold font-serif text-[#0F172A] mt-0.5" style={{ color: "#0F172A" }}>
            {fmtMoney(filteredTotalDue)}
          </p>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setPage(1); }}>
        {/* Mobile Category Dropdown Selector */}
        <div className="sm:hidden flex items-center justify-between gap-2 p-2 bg-card rounded-xl border-[0.5px] border-black/75 dark:border-white/30 shadow-2xs font-balooda">
          <span className="text-xs font-bold text-muted-foreground whitespace-nowrap pl-1">
            {lang === "bn" ? "বিক্রয় ফিল্টার:" : "Sales Filter:"}
          </span>
          <select
            value={activeTab}
            onChange={(e) => { setActiveTab(e.target.value); setPage(1); }}
            className="flex-1 h-8.5 rounded-lg border-[0.5px] border-black/60 dark:border-white/30 bg-background px-2.5 text-xs font-bold font-balooda text-foreground shadow-xs cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="all">{lang === "bn" ? "সব বিক্রি" : "All Sales"}</option>
            <option value="cash">{lang === "bn" ? "নগদ" : "Cash"}</option>
            <option value="bkash">{lang === "bn" ? "বিকাশ" : "bKash"}</option>
            <option value="bank">{lang === "bn" ? "ব্যাংক" : "Bank"}</option>
            <option value="credit">{lang === "bn" ? "বাকী" : "Credit"}</option>
            <option value="courier_pending">{lang === "bn" ? "⏳ কুরিয়ার পেন্ডিং" : "⏳ Pending Courier"}</option>
            <option value="online">{lang === "bn" ? "অনলাইন সব" : "All Online"}</option>
          </select>
        </div>

        {/* Desktop Tabs List */}
        <TabsList className="hidden sm:grid sm:grid-cols-7 w-full text-xs font-bold font-balooda p-1 bg-muted/80 rounded-xl gap-1">
          <TabsTrigger value="all" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "সব বিক্রি" : "All Sales"}
          </TabsTrigger>
          <TabsTrigger value="cash" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "নগদ" : "Cash"}
          </TabsTrigger>
          <TabsTrigger value="bkash" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "বিকাশ" : "bKash"}
          </TabsTrigger>
          <TabsTrigger value="bank" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "ব্যাংক" : "Bank"}
          </TabsTrigger>
          <TabsTrigger value="credit" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "বাকী" : "Credit"}
          </TabsTrigger>
          <TabsTrigger value="courier_pending" className="rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300">
            ⏳ {lang === "bn" ? "কুরিয়ার পেন্ডিং" : "Pending Courier"}
          </TabsTrigger>
          <TabsTrigger value="online" className="rounded-lg text-xs font-bold">
            {lang === "bn" ? "অনলাইন সব" : "All Online"}
          </TabsTrigger>
        </TabsList>

        <div className="pt-3 space-y-2">
          <SalesTab
            items={filteredSales}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onEdit={setEditSale}
            productCategoryMap={productCategoryMap}
          />
        </div>
      </Tabs>

      <FAB onClick={() => setOpen(true)} />
      <SaleDialog open={open} onOpenChange={setOpen} />
      {editSale && (
        <EditSaleDialog sale={editSale} open={!!editSale} onOpenChange={v => { if (!v) setEditSale(null); }} />
      )}
      {returnSale && (
        <ReturnDialog sale={returnSale} open={!!returnSale} onOpenChange={v => { if (!v) setReturnSale(null); }} />
      )}
    </div>
  );
}

function SalesTab({
  items,
  page,
  pageSize,
  onPageChange,
  onEdit,
  productCategoryMap,
}: {
  items: GroupedSale[];
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onEdit: (sale: Sale) => void;
  productCategoryMap: Map<string, string>;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { items: paged, totalPages, safePage } = paginate(items, page, pageSize);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleApproveCourier(id: string) {
    setActionBusyId(id);
    try {
      await approveCourierPaymentFn({ data: { id } });
      toast.success(lang === "bn" ? "কুরিয়ার পেমেন্ট সফলভাবে ক্যাশবক্সে জমা হয়েছে!" : "Courier payment collected and deposited into Cashbox!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleCancelCourier(id: string) {
    setActionBusyId(id);
    try {
      await cancelCourierOrderFn({ data: { id } });
      toast.success(lang === "bn" ? "কুরিয়ার অর্ডার বাতিল এবং স্টক ফিরিয়ে দেওয়া হয়েছে!" : "Courier order cancelled and stock restored!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function performDelete() {
    if (!saleToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteSaleFn({ data: { id: saleToDelete } });
      if (res && !res.success && "error" in res) {
        throw new Error(res.error as string);
      }
      toast.success(t("delete") || "Deleted successfully");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setSaleToDelete(null);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDeleteClick(id: string) {
    setSaleToDelete(id);
  }

  const { user } = useAuth();
  const { data: bizData } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const biz = bizData?.business;

  async function handlePrintSale(s: GroupedSale) {
    const custName = s.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer");
    const invNo = s.cart_id ? `INV-${s.cart_id.slice(-6).toUpperCase()}` : `INV-${s.id.slice(-6).toUpperCase()}`;
    const discTotal = s.items.reduce((acc, x) => acc + (Number(x.discount) || 0) * (Number(x.qty) || 1), 0);
    const sub = s.sell_price + discTotal;

    const paymentModeLabel =
      s.type === "bkash" ? "BKASH (বিকাশ)" :
      s.type === "bank" ? "BANK (ব্যাংক)" :
      s.type === "credit" ? "CREDIT (বাকী)" :
      s.type === "online" ? `COURIER [${s.courier_name || "Courier"}]` :
      "CASH (নগদ)";

    try {
      printPwaInvoice({
        businessName: user?.business_name || biz?.name || "Dream Fashion",
        userEmail: biz?.emails || user?.business_emails || user?.email || "",
        shopAddress: biz?.address || user?.business_address || "",
        shopPhoneNumbers: biz?.phone_numbers || user?.business_phone_numbers || "",
        pageSize: biz?.invoice_page_size || user?.invoice_page_size || "58mm",
        terms: biz?.invoice_terms || "",
        invoiceNo: invNo,
        invoiceDate: fmtDateTime(s.created_at),
        customerName: custName,
        paymentMode: paymentModeLabel,
        items: s.items.map(item => ({
          product: { id: item.product_id || undefined, name: item.product_name },
          qty: Number(item.qty) || 1,
          sellPrice: Number(item.sell_price) || 0,
        })),
        subtotal: sub,
        discountAmount: discTotal,
        total: s.sell_price,
        paidAmount: s.paid_amount,
        due: s.due_amount,
      });
      toast.success(lang === "bn" ? "ইনভয়েস প্রিন্ট প্রস্তুত হচ্ছে!" : "Opening invoice print view!");
    } catch (err: any) {
      toast.error(err?.message || "Print failed");
    }
  }

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center rounded-2xl border-dashed border-border text-muted-foreground">
        <p className="text-xs font-medium">
          {lang === "bn" ? "নির্বাচিত ফিল্টারে কোন বিক্রয় রেকর্ড পাওয়া যায়নি।" : "No sales found for the selected filters."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {paged.map((s) => {
        const isGroup = s.isGroup;
        const expanded = expandedGroups[s.id] || false;

        // Payment Method Badge Color
        const isPendingCourier = s.type === "online" && s.courier_status !== "collected" && s.courier_status !== "cancelled" && !s.returned;
        const isCollectedCourier = s.type === "online" && s.courier_status === "collected";
        const isCancelled = s.returned || s.courier_status === "cancelled";

        const badgeColor =
          isCancelled ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 line-through" :
          isPendingCourier ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" :
          isCollectedCourier ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
          s.type === "bkash" ? "bg-[#E2136E]/15 text-[#E2136E] border-[#E2136E]/30" :
          s.type === "bank" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30" :
          s.type === "credit" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" :
          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";

        const badgeLabel =
          isCancelled ? (lang === "bn" ? "বাতিল" : "Cancelled") :
          isPendingCourier ? (lang === "bn" ? "⏳ কুরিয়ার" : "⏳ Courier") :
          isCollectedCourier ? (lang === "bn" ? "✓ কুরিয়ার" : "✓ Courier") :
          s.type === "bkash" ? (lang === "bn" ? "বিকাশ" : "bKash") :
          s.type === "bank" ? (lang === "bn" ? "ব্যাংক" : "Bank") :
          s.type === "credit" ? (lang === "bn" ? "বাকী" : "Credit") :
          (lang === "bn" ? "নগদ" : "Cash");

        return (
          <div
            key={s.id}
            className={`rounded-xl border-[0.5px] transition-all duration-150 ${
              expanded
                ? "border-black dark:border-white bg-primary/[0.02] shadow-xs"
                : "border-black/70 dark:border-white/30 hover:border-black dark:hover:border-white bg-card"
            }`}
          >
            {/* Clickable Compact 2-Line Summary Statement */}
            <div
              onClick={() => toggleGroup(s.id)}
              className="p-2.5 sm:p-3 cursor-pointer select-none space-y-1"
            >
              {/* Line 1: Product Name & Count | Total Amount & Payment Badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 flex items-center gap-1.5">
                  <span className={`font-bold font-balooda text-xs sm:text-sm text-foreground truncate ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                    {s.product_name}
                  </span>
                  {isGroup && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0 font-balooda font-bold">
                      {s.items.length}টি
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-bold font-balooda px-1.5 py-0.5 rounded border-[0.5px] border-black/30 dark:border-white/30 uppercase tracking-wider ${badgeColor}`}>
                    {badgeLabel}
                  </span>
                  <span className={`text-xs sm:text-sm font-extrabold font-serif text-foreground ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                    {fmtMoney(s.sell_price)}
                  </span>
                </div>
              </div>

              {/* Line 2: Customer / Date | Profit / Due & Reveal Icon */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground font-balooda">
                <div className="min-w-0 flex-1 truncate flex items-center gap-1">
                  {s.parties?.name ? (
                    <>
                      <span className="font-bold font-charukola text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                        {s.parties.name}
                      </span>
                      <span>·</span>
                    </>
                  ) : null}
                  <span className="font-mono text-[10.5px]">
                    {fmtDateTime(s.created_at)}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {s.due_amount > 0 && !isCancelled ? (
                    <span className="text-[10.5px] font-bold font-balooda text-rose-600">
                      {lang === "bn" ? "বাকী:" : "Due:"} {fmtMoney(s.due_amount)}
                    </span>
                  ) : (
                    <span className="text-[10.5px] font-bold font-balooda text-emerald-600 dark:text-emerald-400">
                      +{isCancelled ? "৳০" : fmtMoney(s.profit)}
                    </span>
                  )}
                  <span className="p-0.5 rounded text-muted-foreground/70 hover:text-foreground">
                    {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  </span>
                </div>
              </div>
            </div>

            {/* Revealable Action & Details Drawer */}
            {expanded && (
              <div className="px-3 pb-3 pt-1 border-t-[0.5px] border-black/40 dark:border-white/20 space-y-2.5 bg-muted/10 rounded-b-xl animate-in fade-in-50 duration-150 font-balooda">
                {/* Note / Remarks if any */}
                {s.note && (
                  <p className="text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded border-[0.5px] border-black/20 dark:border-white/20">
                    <strong className="text-foreground">{lang === "bn" ? "নোট:" : "Note:"}</strong> {s.note}
                  </p>
                )}

                {/* Inline Courier Delivery Info & Approval Actions if Online Sale */}
                {s.type === "online" && (
                  <div className="p-2 rounded-lg bg-purple-500/10 border-[0.5px] border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Truck className="size-3.5 text-purple-600 shrink-0" />
                      <span className="font-bold text-purple-900 dark:text-purple-200">{s.courier_name || "Courier Delivery"}</span>
                      {s.tracking_code && (
                        <span className="font-mono text-[10.5px] bg-background text-foreground px-1.5 py-0.5 rounded border-[0.5px] border-black/30 dark:border-white/30">
                          ID: {s.tracking_code}
                        </span>
                      )}
                    </div>

                    {isCollectedCourier ? (
                      <span className="text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                        <CheckCircle2 className="size-3" />
                        {lang === "bn" ? "পেমেন্ট ক্যাশবক্সে জমা হয়েছে" : "Deposited in Cashbox"}
                      </span>
                    ) : isCancelled ? (
                      <span className="text-[10.5px] font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1 bg-rose-500/15 px-2 py-0.5 rounded border border-rose-500/30">
                        <XCircle className="size-3" />
                        {lang === "bn" ? "অর্ডার বাতিলকৃত" : "Order Cancelled"}
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto">
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleApproveCourier(s.id); }}
                          disabled={actionBusyId === s.id}
                          className="h-6.5 px-2 text-[11px] font-bold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs flex-1 sm:flex-initial cursor-pointer"
                        >
                          <PackageCheck className="size-3" />
                          <span>{lang === "bn" ? "✓ গ্রহণ" : "Accept"}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleCancelCourier(s.id); }}
                          disabled={actionBusyId === s.id}
                          className="h-6.5 px-2 text-[11px] font-semibold rounded-md gap-1 flex-1 sm:flex-initial cursor-pointer"
                        >
                          <RotateCcw className="size-3" />
                          <span>{lang === "bn" ? "বাতিল" : "Cancel"}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Multi-Item Breakdown List if Group */}
                {isGroup && (
                  <div className="space-y-1 bg-background/80 p-2 rounded-lg border-[0.5px] border-black/20 dark:border-white/20">
                    <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block font-balooda">
                      {lang === "bn" ? "কার্ট আইটেম তালিকা" : "Cart Items"}
                    </span>
                    {s.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-xs py-0.5 border-b border-border/30 last:border-0 font-balooda">
                        <div className="truncate mr-2">
                          <span className="font-bold text-foreground">{item.product_name}</span>
                          <span className="text-muted-foreground font-mono ml-1">×{item.qty}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-bold text-foreground">{fmtMoney(Number(item.sell_price) * item.qty)}</span>
                          <Button
                            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                            variant="ghost"
                            size="icon"
                            className="size-5 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions Toolbar */}
                <div className="flex items-center justify-between gap-2 pt-1 font-balooda">
                  <Button
                    onClick={(e) => { e.stopPropagation(); handlePrintSale(s); }}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs font-bold rounded-lg gap-1.5 cursor-pointer bg-background hover:bg-muted border-[0.5px] border-black/50 dark:border-white/30"
                  >
                    <Printer className="size-3.5 text-primary" />
                    <span>{lang === "bn" ? "রসিদ প্রিন্ট" : "Print Invoice"}</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    {!isGroup && !isCancelled && (
                      <Button
                        onClick={(e) => { e.stopPropagation(); onEdit(s.items[0]); }}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs font-bold text-muted-foreground hover:text-foreground gap-1 rounded-lg border-[0.5px] border-black/30 dark:border-white/30"
                      >
                        <Pencil className="size-3.5" />
                        <span>{lang === "bn" ? "এডিট" : "Edit"}</span>
                      </Button>
                    )}
                    <Button
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(s.items[0].id); }}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs font-bold text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 gap-1 rounded-lg border-[0.5px] border-rose-500/30"
                    >
                      <Trash2 className="size-3.5" />
                      <span>{lang === "bn" ? "ডিলিট" : "Delete"}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <PaginationBar totalPages={totalPages} page={safePage} onPageChange={onPageChange} />

      <ConfirmDeleteDialog
        open={!!saleToDelete}
        onOpenChange={o => { if (!o) setSaleToDelete(null); }}
        onConfirm={performDelete}
        loading={isDeleting}
        title={lang === "bn" ? "বিক্রি রেকর্ড মুছে ফেলবেন?" : "Delete Sale Record?"}
        description={lang === "bn" ? "এই বিক্রয়টি মুছে ফেললে পণ্যের স্টক এবং ক্যাশবক্স স্বয়ংক্রিয়ভাবে সমন্বয় করা হবে।" : "Deleting this sale will adjust product stock and cashbox ledger."}
      />
    </div>
  );
}

function ReturnDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: Sale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [returnQty, setReturnQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createReturnFn({
        data: {
          sale_id: sale.id,
          product_id: sale.product_id,
          qty: Number(returnQty) || 1,
          refund_amount: (Number(sale.sell_price) || 0) * (Number(returnQty) || 1),
        },
      });
      toast.success(lang === "bn" ? "পণ্য রিটার্ন সফল হয়েছে" : "Return processed successfully");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Return failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <RotateCcw className="size-5 text-amber-600" />
            <span>{lang === "bn" ? "পণ্য রিটার্ন / ফেরত" : "Process Product Return"}</span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleReturn} className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label>{lang === "bn" ? "পণ্যের নাম:" : "Product:"}</Label>
            <p className="font-bold text-foreground text-sm">{sale.product_name}</p>
          </div>
          <div className="space-y-1">
            <Label>{lang === "bn" ? "ফেরতের পরিমাণ (সর্বোচ্চ " + sale.qty + "):" : "Return Qty (Max " + sale.qty + "):"}</Label>
            <Input
              type="number"
              min="1"
              max={sale.qty}
              value={returnQty}
              onChange={e => setReturnQty(e.target.value)}
              required
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">{lang === "bn" ? "ফেরত নিশ্চিত করুন" : "Confirm Return"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
