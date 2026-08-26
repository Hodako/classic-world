"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  Trash2, Plus, Tag, Filter, Search, Calendar,
  Pin, Edit3, X, Check, MoreVertical, PinOff, Sparkles, Download, FileSpreadsheet, ChevronDown
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { getExpenses } from "@/lib/queries";
import type { Expense } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { toast } from "sonner";
import { createExpenseFn, deleteExpenseFn } from "@/lib/rpc";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useIsMobile } from "@/hooks/use-mobile";

interface ExpenseCategoryItem {
  id: string;
  bn: string;
  en: string;
  color: string;
  isCustom?: boolean;
}

const DEFAULT_CATEGORIES: ExpenseCategoryItem[] = [
  { id: "rent", bn: "দোকান ভাড়া", en: "Shop Rent", color: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  { id: "electricity", bn: "বিদ্যুৎ বিল", en: "Electricity Bill", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  { id: "salary", bn: "কর্মচারীর বেতন", en: "Staff Salary", color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  { id: "tea_snacks", bn: "চা-নাস্তা ও আপ্যায়ন", en: "Tea & Snacks", color: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30" },
  { id: "transport", bn: "যাতায়াত ও পরিবহন", en: "Transport", color: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30" },
  { id: "marketing", bn: "মার্কেটিং ও প্রচার", en: "Marketing", color: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30" },
  { id: "maintenance", bn: "মেরামত ও রক্ষণাবেক্ষণ", en: "Maintenance", color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30" },
  { id: "other", bn: "অন্যান্য খরচ", en: "Other Expenses", color: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30" },
];

function formatExpenseTitle(title: string, lang: "bn" | "en") {
  if (lang === "bn" && title.startsWith("Product Purchase:")) {
    return title.replace("Product Purchase:", "পণ্য ক্রয়:");
  }
  return title;
}

function formatExpenseNote(note: string | null | undefined, lang: "bn" | "en") {
  if (!note) return "";
  if (lang === "bn") {
    const match = note.match(/^Purchased\s+(\d+(?:\.\d+)?)\s+units\s+of\s+(.*?)\s+at\s+unit\s+cost\s+(\d+(?:\.\d+)?)(?:\.\s*Purchase\s*ID:\s*(.*))?$/i);
    if (match) {
      return `${match[1]} টি ${match[2]} ক্রয় করা হয়েছে (প্রতি পিস ৳${match[3]})`;
    }
    return note
      .replace(/Purchased/gi, "ক্রয় করা হয়েছে")
      .replace(/units of/gi, "টি")
      .replace(/at unit cost/gi, "দাম")
      .replace(/Purchase ID:/gi, "ক্রয় আইডি:");
  }
  return note;
}

export default function ExpensesPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { data = [] } = useCachedQuery(["expenses"], getExpenses);

  // Modals & Active state
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Revealable Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Date Filter State - Defaults to "today"
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [range, setRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  const [customFrom, setCustomFrom] = useState(todayStr);
  const [customTo, setCustomTo] = useState(todayStr);

  // Category customization states
  const [customCategories, setCustomCategories] = useState<ExpenseCategoryItem[]>([]);
  const [pinnedCategories, setPinnedCategories] = useState<string[]>([]);
  const [renamedCategories, setRenamedCategories] = useState<Record<string, string>>({});
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [manageCat, setManageCat] = useState<ExpenseCategoryItem | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);

  // Long press timer ref
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load custom, pinned, and renamed categories from localStorage
  useEffect(() => {
    try {
      const storedCustom = localStorage.getItem("dreamfashion_custom_expense_categories");
      if (storedCustom) setCustomCategories(JSON.parse(storedCustom));
      const storedPinned = localStorage.getItem("dreamfashion_pinned_expense_categories");
      if (storedPinned) setPinnedCategories(JSON.parse(storedPinned));
      const storedRenamed = localStorage.getItem("dreamfashion_renamed_expense_categories");
      if (storedRenamed) setRenamedCategories(JSON.parse(storedRenamed));
    } catch {}
  }, []);

  // Save changes
  const saveCustomCats = (cats: ExpenseCategoryItem[]) => {
    setCustomCategories(cats);
    localStorage.setItem("dreamfashion_custom_expense_categories", JSON.stringify(cats));
  };
  const savePinnedCats = (pinned: string[]) => {
    setPinnedCategories(pinned);
    localStorage.setItem("dreamfashion_pinned_expense_categories", JSON.stringify(pinned));
  };
  const saveRenamedCats = (renamed: Record<string, string>) => {
    setRenamedCategories(renamed);
    localStorage.setItem("dreamfashion_renamed_expense_categories", JSON.stringify(renamed));
  };

  // Merge default + custom categories, apply renames, and sort pinned to top
  const allCategories = useMemo(() => {
    const list: ExpenseCategoryItem[] = [...DEFAULT_CATEGORIES, ...customCategories].map(c => {
      if (renamedCategories[c.id]) {
        return { ...c, bn: renamedCategories[c.id], en: renamedCategories[c.id] };
      }
      return c;
    });

    // Sort: Pinned first
    return list.sort((a, b) => {
      const aPinned = pinnedCategories.includes(a.id);
      const bPinned = pinnedCategories.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [customCategories, pinnedCategories, renamedCategories]);

  const pageSize = isMobile ? 12 : 20;

  // Date Filtering logic
  const inDateRange = (dateInput: any) => {
    if (!dateInput) return false;
    let d: Date;
    if (typeof dateInput?.toDate === "function") {
      d = dateInput.toDate();
    } else if (dateInput?.seconds !== undefined) {
      d = new Date(dateInput.seconds * 1000);
    } else {
      d = new Date(dateInput);
    }
    if (isNaN(d.getTime())) return false;
    const now = new Date();

    if (range === "today") {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= today;
    }
    if (range === "yesterday") {
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d >= yesterdayStart && d < yesterdayEnd;
    }
    if (range === "week") {
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return d >= weekStart;
    }
    if (range === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= monthStart;
    }
    if (range === "custom") {
      const ds = d.toLocaleDateString("en-CA");
      return ds >= customFrom && ds <= customTo;
    }
    return true; // all
  };

  // Expenses filtered by Date first
  const dateFilteredExpenses = useMemo(() => {
    return (data ?? []).filter(e => inDateRange(e.created_at));
  }, [data, range, customFrom, customTo]);

  // Period Total
  const periodTotal = useMemo(() => {
    return dateFilteredExpenses.reduce((a, e) => a + Number(e.amount), 0);
  }, [dateFilteredExpenses]);

  // Category breakdown for the selected period
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    dateFilteredExpenses.forEach(e => {
      const cat = e.category || "other";
      map[cat] = (map[cat] || 0) + Number(e.amount);
    });
    return map;
  }, [dateFilteredExpenses]);

  // Filtered expenses by category & search
  const filteredExpenses = useMemo(() => {
    let list = dateFilteredExpenses;
    if (selectedCategory !== "all") {
      list = list.filter(e => (e.category || "other") === selectedCategory);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.note || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [dateFilteredExpenses, selectedCategory, search]);

  const filteredTotal = filteredExpenses.reduce((a, e) => a + Number(e.amount), 0);
  const { items: pagedExpenses, totalPages, safePage } = paginate(filteredExpenses, page, pageSize);

  async function performDelete() {
    if (!expenseToDelete) return;
    setDeleteBusy(true);
    setCachedData<Expense[]>(qc, ["expenses"], old => (old ?? []).filter(e => e.id !== expenseToDelete.id));
    try {
      await deleteExpenseFn({ data: { id: expenseToDelete.id } });
      await refreshQueries(qc, ["expenses"], ["cashbox"]);
      toast.success(t("delete"));
      setExpenseToDelete(null);
    } catch (err: unknown) {
      await refreshQueries(qc, ["expenses"], ["cashbox"]);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const getCategoryMeta = (catId?: string | null) => {
    const found = allCategories.find(c => c.id === catId);
    if (found) return found;
    return {
      id: "other",
      bn: catId || "অন্যান্য খরচ",
      en: catId || "Other Expenses",
      color: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30"
    };
  };

  // Category management handlers
  const handleAddCustomCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const catId = "custom_" + Date.now();
    const newCat: ExpenseCategoryItem = {
      id: catId,
      bn: newCatName.trim(),
      en: newCatName.trim(),
      color: "bg-primary/10 text-primary border-primary/30",
      isCustom: true,
    };
    saveCustomCats([...customCategories, newCat]);
    setNewCatName("");
    setNewCatOpen(false);
    toast.success(lang === "bn" ? `নতুন ক্যাটাগরি "${newCat.bn}" তৈরি হয়েছে!` : `New category created!`);
  };

  const togglePinCategory = (catId: string) => {
    if (pinnedCategories.includes(catId)) {
      savePinnedCats(pinnedCategories.filter(id => id !== catId));
      toast.success(lang === "bn" ? "ক্যাটাগরি আনপিন করা হয়েছে" : "Category unpinned");
    } else {
      savePinnedCats([...pinnedCategories, catId]);
      toast.success(lang === "bn" ? "ক্যাটাগরি পিন করা হয়েছে (সবার উপরে থাকবে)" : "Category pinned to top");
    }
    setManageCat(null);
  };

  const handleRenameCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageCat || !renameValue.trim()) return;
    saveRenamedCats({ ...renamedCategories, [manageCat.id]: renameValue.trim() });
    setRenameOpen(false);
    setManageCat(null);
    toast.success(lang === "bn" ? "ক্যাটাগরির নাম পরিবর্তন হয়েছে" : "Category renamed");
  };

  const handleDeleteCategory = (catId: string) => {
    saveCustomCats(customCategories.filter(c => c.id !== catId));
    savePinnedCats(pinnedCategories.filter(id => id !== catId));
    if (selectedCategory === catId) setSelectedCategory("all");
    setManageCat(null);
    toast.success(lang === "bn" ? "ক্যাটাগরি মুছে ফেলা হয়েছে" : "Category deleted");
  };

  // Long press trigger handlers
  const handleTouchStart = (cat: ExpenseCategoryItem) => {
    longPressTimerRef.current = setTimeout(() => {
      setManageCat(cat);
      setRenameValue(cat.bn);
    }, 550);
  };
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const exportExpenses = (langCode: "en" | "bn") => {
    const isBn = langCode === "bn";
    const headers = isBn
      ? ["তারিখ", "ক্যাটাগরি", "বিবরণ / শিরোনাম", "টাকার পরিমাণ", "নোট"]
      : ["Date", "Category", "Description / Title", "Amount (BDT)", "Note"];
    const rows = filteredExpenses.map(e => {
      const meta = getCategoryMeta(e.category);
      const catLabel = isBn ? meta.bn : meta.en;
      return [
        fmtDateTime(e.created_at),
        catLabel,
        formatExpenseTitle(e.title, langCode),
        e.amount,
        formatExpenseNote(e.note, langCode) || ""
      ];
    });
    downloadCsv(`expenses_${exportDateStamp()}_${langCode}.csv`, headers, rows);
    toast.success(isBn ? "খরচের এক্সেল/CSV ফাইল ডাউনলোড হয়েছে!" : "Expenses CSV exported successfully!");
  };

  return (
    <div className="space-y-4 pb-6 font-['Hind_Siliguri',sans-serif]">
      {/* Top Header Toolbar - Fitted in One Single Line on Phone and Desktop */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 flex-nowrap bg-card/60 p-2 sm:p-3 rounded-2xl border border-border/80 shadow-xs">
        <div className="min-w-0 flex-1 pr-1">
          <h1 className="text-base sm:text-2xl font-bold tracking-tight font-serif text-foreground truncate">{t("expenses")}</h1>
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            {lang === "bn" ? "ক্যাটাগরি ও তারিখ ভিত্তিক দোকান খরচ ব্যবস্থাপনা" : "Category & Date-wise Shop Expense Management"}
          </p>
        </div>

        {/* Action Controls in a SINGLE horizontal non-wrapping line: [Search] [CSV] [+] */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
          {/* Search Toggle Icon */}
          <div className="relative flex items-center">
            {searchOpen ? (
              <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 shadow-xs transition-all animate-in fade-in duration-200">
                <Search className="size-3.5 text-muted-foreground ml-1.5 shrink-0 pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  placeholder={lang === "bn" ? "খরচ খুঁজুন…" : "Search…"}
                  className="h-7.5 w-24 sm:w-44 text-xs border-0 bg-transparent focus-visible:ring-0 p-1"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="size-8 sm:size-9 rounded-xl cursor-pointer beveled-button shrink-0"
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 50);
                }}
                title={lang === "bn" ? "সার্চ করুন" : "Search"}
              >
                <Search className="size-3.5 sm:size-4 text-muted-foreground" />
              </Button>
            )}
          </div>

          {/* CSV Export Dropdown with clear CSV text */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 sm:h-9 px-2 sm:px-2.5 text-xs font-bold rounded-xl beveled-button gap-1 cursor-pointer shrink-0"
              >
                <FileSpreadsheet className="size-3.5 sm:size-4 text-emerald-600 dark:text-emerald-400" />
                <span>CSV</span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportExpenses("bn")}>
                Bangla (বাংলা স্প্রেডশিট)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportExpenses("en")}>
                English (ইংরেজি Spreadsheet)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* '+' Icon Button directly beside CSV */}
          <Button
            onClick={() => setOpen(true)}
            size="icon"
            className="size-8 sm:size-9 font-bold cursor-pointer beveled-button bg-primary text-primary-foreground shadow-xs shrink-0 rounded-xl"
            title={lang === "bn" ? "খরচ যোগ করুন" : "Add Expense"}
          >
            <Plus className="size-4.5 sm:size-5 stroke-[2.5]" />
          </Button>
        </div>
      </div>

      {/* Date Filter Bar at Start of Categories (Default: Today) */}
      <Card className="p-3.5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <Calendar className="size-4 text-primary" />
            <span>{lang === "bn" ? "তারিখ ফিল্টার (ডিফল্ট: আজ):" : "Date Filter (Default: Today):"}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => { setRange("today"); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                range === "today"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "আজ (Today)" : "Today"}
            </button>
            <button
              type="button"
              onClick={() => { setRange("yesterday"); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                range === "yesterday"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "গতকাল" : "Yesterday"}
            </button>
            <button
              type="button"
              onClick={() => { setRange("week"); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                range === "week"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "গত ৭ দিন" : "Last 7 Days"}
            </button>
            <button
              type="button"
              onClick={() => { setRange("month"); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                range === "month"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "চলতি মাস" : "This Month"}
            </button>
            <button
              type="button"
              onClick={() => { setRange("all"); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                range === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
            >
              {lang === "bn" ? "সকল সময়" : "All Time"}
            </button>

            {/* Custom Date Filter Icon Button Beside 'All Time' */}
            <button
              type="button"
              onClick={() => {
                setRange(range === "custom" ? "today" : "custom");
                setPage(1);
              }}
              title={lang === "bn" ? "কাস্টম তারিখ ফিল্টার" : "Custom Date Range Filter"}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                range === "custom"
                  ? "bg-primary text-primary-foreground border-primary shadow-xs"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground border-border/70"
              }`}
            >
              <Calendar className="size-3.5" />
              <span>{lang === "bn" ? "কাস্টম তারিখ" : "Custom"}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {range === "custom" && (
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
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
      </Card>

      {/* Summary KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 beveled-kpi border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-rose-500/5 to-card rounded-none shadow-xs relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
            <span>{t("total")} {t("expenses")}</span>
            <Tag className="size-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400 font-serif">
            {fmtMoney(periodTotal)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {dateFilteredExpenses.length} {lang === "bn" ? "টি খরচ ভাউচার" : "entries in range"}
          </div>
        </Card>

        {/* Selected Category Total Card */}
        <Card className="p-4 beveled-kpi border-border/80 rounded-none shadow-xs sm:col-span-2 space-y-2 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
            <span>{lang === "bn" ? "নির্বাচিত ক্যাটাগরি ও মোট খরচ" : "Selected Category Breakdown"}</span>
            <span className="text-[11px] font-bold text-foreground">
              {selectedCategory === "all" ? (lang === "bn" ? "সকল ক্যাটাগরি" : "All Categories") : getCategoryMeta(selectedCategory)[lang === "bn" ? "bn" : "en"]}: {fmtMoney(filteredTotal)}
            </span>
          </div>

          <div className="text-xs text-muted-foreground">
            {lang === "bn"
              ? "টিপস: যেকোনো ক্যাটাগরিকে উপরে পিন করতে, নাম পরিবর্তন করতে বা মুছে ফেলতে তার উপর লং প্রেস করুন।"
              : "Tip: Long-press on any category to pin it to top, rename, or delete."}
          </div>
        </Card>
      </div>

      {/* Category Filter Section: Dropdown on Phone / Horizontal Sliding on Desktop */}
      <div className="space-y-2">
        {/* Phone View: Clean Select Dropdown */}
        <div className="block sm:hidden space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Filter className="size-3.5 text-primary" />
              <span>{lang === "bn" ? "খরচ ক্যাটাগরি নির্বাচন:" : "Expense Category:"}</span>
            </Label>
            <button
              onClick={() => setNewCatOpen(true)}
              className="text-xs font-bold text-primary flex items-center gap-1 cursor-pointer hover:underline"
            >
              <Plus className="size-3.5" />
              <span>{lang === "bn" ? "ক্যাটাগরি যোগ" : "Add Category"}</span>
            </button>
          </div>

          <select
            value={selectedCategory}
            onChange={e => { setSelectedCategory(e.target.value); setPage(1); }}
            className="w-full h-10 rounded-xl border border-input bg-card px-3 text-xs font-bold text-foreground shadow-xs cursor-pointer focus:ring-2 focus:ring-primary"
          >
            <option value="all">
              {lang === "bn" ? "সকল খরচ" : "All Expenses"} ({fmtMoney(periodTotal)})
            </option>
            {allCategories.map(c => {
              const amt = categoryBreakdown[c.id] || 0;
              const isPinned = pinnedCategories.includes(c.id);
              return (
                <option key={c.id} value={c.id}>
                  {isPinned ? "★ " : ""}{c[lang === "bn" ? "bn" : "en"]} {amt > 0 ? `(${fmtMoney(amt)})` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* Desktop / PC View: Horizontal Sliding Pill Bar with "+" at the end */}
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
          <span className="text-xs font-bold text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
            <Filter className="size-3.5 text-primary" />
            {lang === "bn" ? "ক্যাটাগরি:" : "Category:"}
          </span>

          <button
            onClick={() => { setSelectedCategory("all"); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 transition-all cursor-pointer ${
              selectedCategory === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-card border-border hover:bg-muted/60 text-muted-foreground"
            }`}
          >
            {lang === "bn" ? "সব খরচ" : "All"} ({fmtMoney(periodTotal)})
          </button>

          {allCategories.map(c => {
            const amt = categoryBreakdown[c.id] || 0;
            const isPinned = pinnedCategories.includes(c.id);
            const isSelected = selectedCategory === c.id;

            return (
              <div
                key={c.id}
                className="relative group shrink-0"
                onTouchStart={() => handleTouchStart(c)}
                onTouchEnd={handleTouchEnd}
                onContextMenu={e => {
                  e.preventDefault();
                  setManageCat(c);
                  setRenameValue(c.bn);
                }}
              >
                <button
                  onClick={() => { setSelectedCategory(c.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                      : "bg-card border-border hover:bg-muted/60 text-muted-foreground"
                  }`}
                  title={lang === "bn" ? "অপশনের জন্য লং প্রেস বা রাইট ক্লিক করুন" : "Long press or right-click for options"}
                >
                  {isPinned && <Pin className="size-3 fill-amber-500 text-amber-500 shrink-0" />}
                  <span>{c[lang === "bn" ? "bn" : "en"]}</span>
                  {amt > 0 && <span className="opacity-80 font-mono text-[11px]">({fmtMoney(amt)})</span>}
                </button>
              </div>
            );
          })}

          {/* "+" Icon at the edge of the horizontal category sliding */}
          <button
            onClick={() => setNewCatOpen(true)}
            className="size-8 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 text-primary flex items-center justify-center shrink-0 cursor-pointer transition-colors shadow-xs"
            title={lang === "bn" ? "নতুন খরচ ক্যাটাগরি তৈরি করুন" : "Add new expense category"}
          >
            <Plus className="size-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Empty State */}
      {(!filteredExpenses || filteredExpenses.length === 0) && (
        <Card className="p-10 text-center text-sm text-muted-foreground rounded-2xl border-dashed">
          {lang === "bn" ? "নির্বাচিত তারিখ ও ক্যাটাগরিতে কোনো খরচের রেকর্ড পাওয়া যায়নি" : "No expense records found in this date range & category"}
        </Card>
      )}

      {/* Expense Items List */}
      {filteredExpenses.length > 0 && (
        <Card className="divide-y divide-border overflow-hidden rounded-2xl border border-border/90 shadow-xs bg-card">
          {pagedExpenses.map(e => {
            const meta = getCategoryMeta(e.category);
            const displayTitle = formatExpenseTitle(e.title, lang);
            const displayNote = formatExpenseNote(e.note, lang);

            return (
              <div key={e.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{displayTitle}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${meta.color}`}>
                      {meta[lang === "bn" ? "bn" : "en"]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDateTime(e.created_at)}
                    {displayNote ? ` · ${displayNote}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="font-bold text-sm font-serif text-destructive">
                    −{fmtMoney(e.amount)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 cursor-pointer rounded-lg"
                    onClick={() => setExpenseToDelete(e)}
                    title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Pagination Bar */}
      {filteredExpenses.length > pageSize && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filteredExpenses.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      {/* Modal 1: Add New Expense */}
      <ExpenseDialog
        open={open}
        onOpenChange={setOpen}
        categories={allCategories}
        defaultCategory={selectedCategory !== "all" ? selectedCategory : "other"}
      />

      {/* Modal 2: Add Custom Expense Category */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-1.5">
              <Plus className="size-4 text-primary" />
              {lang === "bn" ? "নতুন খরচ ক্যাটাগরি তৈরি করুন" : "Create Expense Category"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCustomCategory} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-semibold">
                {lang === "bn" ? "ক্যাটাগরির নাম" : "Category Name"}
              </Label>
              <Input
                required
                placeholder={lang === "bn" ? "যেমন: প্যাকেজিং ও ব্যাগ" : "e.g. Packaging & Bags"}
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="rounded-xl"
                autoFocus
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNewCatOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" className="rounded-xl font-bold bg-primary text-primary-foreground">
                {lang === "bn" ? "ক্যাটাগরি সংরক্ষণ" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Long-Press Category Options Menu (Pin, Rename, Delete) */}
      <Dialog open={!!manageCat && !renameOpen} onOpenChange={v => { if (!v) setManageCat(null); }}>
        <DialogContent className="max-w-xs rounded-2xl p-4">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center justify-between">
              <span>{manageCat?.[lang === "bn" ? "bn" : "en"]}</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                {manageCat?.isCustom ? (lang === "bn" ? "কাস্টম ক্যাটাগরি" : "Custom") : (lang === "bn" ? "ডিফল্ট ক্যাটাগরি" : "Default")}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 pt-2">
            {/* Pin / Unpin Action */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-9 text-xs rounded-xl font-semibold cursor-pointer"
              onClick={() => manageCat && togglePinCategory(manageCat.id)}
            >
              {manageCat && pinnedCategories.includes(manageCat.id) ? (
                <>
                  <PinOff className="size-3.5 text-amber-600" />
                  <span>{lang === "bn" ? "আনপিন করুন" : "Unpin from Top"}</span>
                </>
              ) : (
                <>
                  <Pin className="size-3.5 text-amber-600 fill-amber-500" />
                  <span>{lang === "bn" ? "সবার উপরে পিন করুন" : "Pin to Top"}</span>
                </>
              )}
            </Button>

            {/* Rename Action */}
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-9 text-xs rounded-xl font-semibold cursor-pointer"
              onClick={() => {
                if (manageCat) {
                  setRenameValue(manageCat.bn);
                  setRenameOpen(true);
                }
              }}
            >
              <Edit3 className="size-3.5 text-sky-600" />
              <span>{lang === "bn" ? "নাম পরিবর্তন করুন" : "Rename Category"}</span>
            </Button>

            {/* Delete Custom Category Action */}
            {manageCat?.isCustom && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-9 text-xs rounded-xl font-semibold text-destructive hover:bg-destructive/10 cursor-pointer"
                onClick={() => manageCat && handleDeleteCategory(manageCat.id)}
              >
                <Trash2 className="size-3.5" />
                <span>{lang === "bn" ? "ক্যাটাগরি মুছে ফেলুন" : "Delete Category"}</span>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Rename Category Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-1.5">
              <Edit3 className="size-4 text-primary" />
              {lang === "bn" ? "ক্যাটাগরির নাম পরিবর্তন" : "Rename Category"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRenameCategory} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-semibold">
                {lang === "bn" ? "নতুন নাম লিখুন" : "New Name"}
              </Label>
              <Input
                required
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="rounded-xl"
                autoFocus
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setRenameOpen(false)} className="rounded-xl">
                {t("cancel")}
              </Button>
              <Button type="submit" className="rounded-xl font-bold bg-primary text-primary-foreground">
                {lang === "bn" ? "নাম সংরক্ষণ" : "Save Name"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Expense Confirmation */}
      <ConfirmDeleteDialog
        open={!!expenseToDelete}
        onOpenChange={(v) => { if (!v) setExpenseToDelete(null); }}
        title={lang === "bn" ? "খরচ ডিলিট করুন" : "Delete Expense"}
        description={lang === "bn" ? `আপনি কি "${expenseToDelete?.title}" খরচটি মুছে ফেলতে চান?` : `Are you sure you want to delete "${expenseToDelete?.title}"?`}
        onConfirm={performDelete}
        busy={deleteBusy}
      />
    </div>
  );
}

function ExpenseDialog({
  open, onOpenChange, categories, defaultCategory = "other"
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: ExpenseCategoryItem[];
  defaultCategory?: string;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(defaultCategory);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultCategory) setCategory(defaultCategory);
  }, [defaultCategory]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0 || !title.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Expense = {
      id: tempId,
      title: title.trim(),
      amount: amt,
      category: category || "other",
      note: note.trim() || null,
      created_at: new Date().toISOString()
    };

    setCachedData<Expense[]>(qc, ["expenses"], old => [optimistic, ...(old ?? [])]);
    setTitle(""); setAmount(""); setNote("");
    onOpenChange(false);
    toast.success(t("save"));

    setBusy(true);
    try {
      await createExpenseFn({
        data: {
          title: title.trim(),
          amount: amt,
          category: category || "other",
          note: note.trim() || null
        }
      });
      await refreshQueries(qc, ["expenses"], ["cashbox"]);
    } catch (err: unknown) {
      setCachedData<Expense[]>(qc, ["expenses"], old => (old ?? []).filter(e => e.id !== tempId));
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl font-['Hind_Siliguri',sans-serif]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-1.5">
            <Tag className="size-4 text-primary" />
            {lang === "bn" ? "নতুন খরচ যোগ করুন" : "Add Expense"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5 pt-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "ক্যাটাগরি নির্বাচন করুন" : "Category"}
            </Label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full h-9 rounded-xl border border-input bg-background px-3 text-xs font-medium focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c[lang === "bn" ? "bn" : "en"]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "খরচের বিবরণ" : "Expense Title"}
            </Label>
            <Input
              required
              placeholder={lang === "bn" ? "যেমন: আগস্ট মাসের দোকান ভাড়া / চা-নাস্তা" : "e.g. August Rent / Snacks"}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="rounded-xl"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "টাকার পরিমাণ" : "Amount"}
            </Label>
            <Input
              required
              placeholder="0.00"
              type="number"
              step="any"
              inputMode="decimal"
              pattern="[0-9.]*"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl font-serif text-sm font-semibold"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "অতিরিক্ত মন্তব্য (ঐচ্ছিক)" : "Note (Optional)"}
            </Label>
            <Input
              placeholder={lang === "bn" ? "অতিরিক্ত বিবরণ বা ভাউচার নম্বর" : "Additional notes (optional)"}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="rounded-xl font-semibold bg-primary text-primary-foreground">
              {busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Expense")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
