"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Wallet,
  Plus,
  Search,
  ArrowLeft,
  Trash2,
  Pencil,
  Download,
  Printer,
  Calendar,
  DollarSign,
  TrendingDown,
  Home,
  ShoppingBag,
  Shirt,
  PackageCheck,
  X,
  HeartPulse,
  User,
  MoreHorizontal,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getOwnerWallet, getProducts, type OwnerWalletEntry, type Product } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDate, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { createOwnerWalletEntryFn, updateOwnerWalletEntryFn, deleteOwnerWalletEntryFn } from "@/lib/rpc";

const CATEGORIES = [
  { id: "family", labelBn: "পরিবার খরচ", labelEn: "Family Expense", icon: Home, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
  { id: "bazar", labelBn: "বাজার খরচ", labelEn: "Bazar Expense", icon: ShoppingBag, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
  { id: "home_rent", labelBn: "বাসা ভাড়া", labelEn: "Home Rent", icon: Home, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
  { id: "medical", labelBn: "চিকিৎসা খরচ", labelEn: "Medical Expense", icon: HeartPulse, color: "text-rose-600 bg-rose-500/10 border-rose-500/20" },
  { id: "personal", labelBn: "ব্যক্তিগত খরচ", labelEn: "Personal Expense", icon: User, color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
  { id: "other", labelBn: "অন্যান্য খরচ", labelEn: "Other Expense", icon: MoreHorizontal, color: "text-zinc-600 bg-zinc-500/10 border-zinc-500/20" },
];

function getCategoryInfo(catId?: string | null, lang = "bn") {
  const c = CATEGORIES.find(x => x.id === catId) || CATEGORIES[4];
  return {
    ...c,
    label: lang === "bn" ? c.labelBn : c.labelEn,
  };
}

export default function OwnersWalletPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useCachedQuery(["owner_wallet"], getOwnerWallet);
  const { data: products = [] } = useCachedQuery(["products"], getProducts);

  // Dress / Product Selector state
  const [selectedItems, setSelectedItems] = useState<{ product_id: string; product_name: string; qty: number; unit_price: number; total: number }[]>([]);
  const [prodSearch, setProdSearch] = useState("");

  // Filter States
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "month" | "custom">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Dialog States
  const [addOpen, setAddOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("family");
  const [note, setNote] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [cutFromProfit, setCutFromProfit] = useState(true);
  const [busy, setBusy] = useState(false);

  // Edit / Delete States
  const [editingEntry, setEditingEntry] = useState<OwnerWalletEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<OwnerWalletEntry | null>(null);

  // Helper date parser for Firestore / ISO
  function parseDate(val: any): Date | null {
    if (!val) return null;
    if (typeof val?.toDate === "function") return val.toDate();
    if (typeof val?.seconds === "number") return new Date(val.seconds * 1000);
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentMonthStr = todayStr.slice(0, 7);

    return entries.filter(e => {
      const d = parseDate(e.created_at);
      const dStr = d ? d.toISOString().slice(0, 10) : "";

      // Date Filtering
      if (dateFilter === "today") {
        if (dStr !== todayStr) return false;
      } else if (dateFilter === "month") {
        if (!dStr.startsWith(currentMonthStr)) return false;
      } else if (dateFilter === "custom") {
        if (customStart && dStr < customStart) return false;
        if (customEnd && dStr > customEnd) return false;
      }

      // Category Filtering
      if (selectedCategory !== "all" && e.category !== selectedCategory) {
        return false;
      }

      // Search Filtering
      if (search.trim()) {
        const q = search.toLowerCase();
        const noteMatch = (e.note || "").toLowerCase().includes(q);
        const catInfo = getCategoryInfo(e.category, lang);
        const catMatch = catInfo.label.toLowerCase().includes(q);
        if (!noteMatch && !catMatch) return false;
      }

      return true;
    });
  }, [entries, dateFilter, selectedCategory, search, customStart, customEnd, lang]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);

    let totalAll = 0;
    let totalToday = 0;
    let totalMonth = 0;
    const byCategory: Record<string, number> = {};

    entries.forEach(e => {
      const amt = Number(e.amount) || 0;
      totalAll += amt;

      const d = parseDate(e.created_at);
      const dStr = d ? d.toISOString().slice(0, 10) : "";

      if (dStr === todayStr) totalToday += amt;
      if (dStr.startsWith(monthStr)) totalMonth += amt;

      const cat = e.category || "personal";
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });

    return { totalAll, totalToday, totalMonth, byCategory };
  }, [entries]);

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return toast.error(lang === "bn" ? "সঠিক পরিমাণ লিখুন" : "Enter a valid amount");

    setBusy(true);
    try {
      await createOwnerWalletEntryFn({
        data: {
          amount: num,
          category,
          note: note.trim() || null,
          created_at: new Date(entryDate).toISOString(),
          cut_from_profit: cutFromProfit,
        },
      });

      toast.success(
        lang === "bn"
          ? (cutFromProfit ? "মালিকের ব্যক্তিগত খরচ যুক্ত হয়েছে (ক্যাশবাক্স ও নিট লাভ থেকে কর্তিত)" : "মালিকের ব্যক্তিগত খরচ যুক্ত হয়েছে (ক্যাশবাক্স থেকে কর্তিত)")
          : (cutFromProfit ? "Owner expense added (deducted from cashbox & profit)" : "Owner expense added (deducted from cashbox)")
      );
      qc.invalidateQueries({ queryKey: ["owner_wallet"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });

      setAddOpen(false);
      setAmount("");
      setNote("");
      setCategory("family");
      setCutFromProfit(true);
      setEntryDate(new Date().toISOString().slice(0, 10));
    } catch (err: any) {
      toast.error(err?.message || "Failed to save entry");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEntry) return;
    const num = Number(amount);
    if (!num || num <= 0) return toast.error(lang === "bn" ? "সঠিক পরিমাণ লিখুন" : "Enter a valid amount");

    setBusy(true);
    try {
      await updateOwnerWalletEntryFn({
        data: {
          id: editingEntry.id,
          amount: num,
          category,
          note: note.trim() || null,
        },
      });

      toast.success(lang === "bn" ? "খরচের বিবরণ আপডেট করা হয়েছে" : "Expense updated successfully");
      qc.invalidateQueries({ queryKey: ["owner_wallet"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });

      setEditingEntry(null);
      setAmount("");
      setNote("");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update entry");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEntry() {
    if (!entryToDelete) return;
    setBusy(true);
    try {
      await deleteOwnerWalletEntryFn({
        data: { id: entryToDelete.id },
      });

      toast.success(lang === "bn" ? "খরচ মুছে ফেলা হয়েছে" : "Expense deleted");
      qc.invalidateQueries({ queryKey: ["owner_wallet"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });

      setEntryToDelete(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete entry");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-12 max-w-7xl mx-auto font-hind">
      {/* ──────────────── Top Navigation Bar ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 sm:p-4 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-2.5">
          <Link href="/more">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground font-balooda font-bold">
              <ArrowLeft className="size-4 mr-1" />
              {t("more")}
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Wallet className="size-5" />
            </div>
            <div>
              <h1 className="font-bold font-charukola text-base sm:text-lg flex items-center gap-1.5">
                {lang === "bn" ? "মালিকের খরচ (Owner Expense)" : "Owner's Dedicated Expense"}
              </h1>
              <p className="text-[11px] text-muted-foreground font-balooda">
                {lang === "bn" ? "মালিকের ব্যক্তিগত ও পরিবার খরচের হিসাব" : "Personal & family expense tracker"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setAmount("");
              setNote("");
              setCategory("family");
              setEntryDate(new Date().toISOString().slice(0, 10));
              setAddOpen(true);
            }}
            className="h-8.5 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs flex items-center gap-1.5 font-balooda w-full sm:w-auto justify-center"
          >
            <Plus className="size-4" />
            {lang === "bn" ? "খরচ যোগ করুন" : "Add Expense"}
          </Button>
        </div>
      </div>

      {/* ──────────────── Summary Cards Grid ──────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Card className="p-2.5 sm:p-3.5 rounded-xl border border-border shadow-xs bg-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground font-balooda">
              {lang === "bn" ? "মোট ব্যক্তিগত খরচ" : "Total Personal"}
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
              <TrendingDown className="size-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-bold font-charukola text-amber-600 dark:text-amber-400">
            {fmtMoney(stats.totalAll)}
          </p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-balooda">
            {entries.length} {lang === "bn" ? "টি মোট এন্ট্রি" : "entries"}
          </span>
        </Card>

        <Card className="p-2.5 sm:p-3.5 rounded-xl border border-border shadow-xs bg-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground font-balooda">
              {lang === "bn" ? "চলতি মাস" : "This Month"}
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
              <Calendar className="size-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-bold font-charukola text-blue-600 dark:text-blue-400">
            {fmtMoney(stats.totalMonth)}
          </p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-balooda">
            {lang === "bn" ? "ক্যালেন্ডার মাস" : "This month"}
          </span>
        </Card>

        <Card className="p-2.5 sm:p-3.5 rounded-xl border border-border shadow-xs bg-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground font-balooda">
              {lang === "bn" ? "আজকের খরচ" : "Today"}
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <DollarSign className="size-3.5" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-bold font-charukola text-emerald-600 dark:text-emerald-400">
            {fmtMoney(stats.totalToday)}
          </p>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground font-balooda">
            {lang === "bn" ? "আজকের কর্তন" : "Today's total"}
          </span>
        </Card>

        <Card className="p-2.5 sm:p-3.5 rounded-xl border border-border shadow-xs bg-card space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground font-balooda">
              {lang === "bn" ? "সর্বোচ্চ খাত" : "Top Category"}
            </span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
              <Home className="size-3.5" />
            </div>
          </div>
          {(() => {
            const sortedCats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);
            const topCat = sortedCats[0];
            const topInfo = topCat ? getCategoryInfo(topCat[0], lang) : null;
            return (
              <>
                <p className="text-sm sm:text-base font-bold font-charukola text-purple-600 dark:text-purple-400 truncate">
                  {topInfo ? `${topInfo.label}` : "—"}
                </p>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-balooda">
                  {topCat ? `৳${fmtMoney(topCat[1])}` : "—"}
                </span>
              </>
            );
          })()}
        </Card>
      </div>

      {/* ──────────────── Filter Toolbar ──────────────── */}
      <Card className="p-3 sm:p-4 rounded-xl border border-border shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 font-balooda">
          {/* Search Box */}
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lang === "bn" ? "খরচ বা বিবরণ খুঁজুন..." : "Search note/category..."}
              className="h-8.5 text-xs pl-8"
            />
          </div>

          {/* Category Filter */}
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-8.5 text-xs">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "bn" ? "সকল ক্যাটাগরি" : "All Categories"}</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {lang === "bn" ? c.labelBn : c.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
            <SelectTrigger className="h-8.5 text-xs">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "bn" ? "সব সময় (All Time)" : "All Time"}</SelectItem>
              <SelectItem value="today">{lang === "bn" ? "আজকের (Today)" : "Today"}</SelectItem>
              <SelectItem value="month">{lang === "bn" ? "চলতি মাস (This Month)" : "This Month"}</SelectItem>
              <SelectItem value="custom">{lang === "bn" ? "কাস্টম রেঞ্জ..." : "Custom Range..."}</SelectItem>
            </SelectContent>
          </Select>

          {/* Export / Reset buttons */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSelectedCategory("all");
                setDateFilter("all");
                setCustomStart("");
                setCustomEnd("");
              }}
              className="h-8.5 text-xs flex-1"
            >
              {t("clear")}
            </Button>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-xs">
            <Input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="h-8 text-xs max-w-[160px]"
            />
            <span className="text-muted-foreground font-balooda">{lang === "bn" ? "থেকে" : "to"}</span>
            <Input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="h-8 text-xs max-w-[160px]"
            />
          </div>
        )}
      </Card>

      {/* ──────────────── Transaction List ──────────────── */}
      <Card className="p-0 rounded-xl border border-border shadow-xs overflow-hidden bg-card">
        <div className="p-3 border-b border-border flex items-center justify-between bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider font-balooda">
              {lang === "bn" ? "খরচের তালিকা" : "Expense Transactions"}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono">
              {filteredEntries.length}
            </span>
          </div>

          <div className="text-xs font-bold font-charukola text-foreground">
            {lang === "bn" ? "ফিল্টারকৃত মোট: " : "Filtered Total: "}
            <span className="text-amber-600 dark:text-amber-400">
              {fmtMoney(filteredEntries.reduce((a, b) => a + (Number(b.amount) || 0), 0))}
            </span>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Wallet className="size-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-semibold font-balooda text-muted-foreground">
              {lang === "bn" ? "কোনো খরচ পাওয়া যায়নি" : "No expense records found"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOpen(true)}
              className="text-xs font-balooda"
            >
              {lang === "bn" ? "প্রথম ব্যক্তিগত খরচ যোগ করুন" : "Add first personal expense"}
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredEntries.map(e => {
              const catInfo = getCategoryInfo(e.category, lang);
              const CatIcon = catInfo.icon;
              const d = parseDate(e.created_at);

              return (
                <div
                  key={e.id}
                  className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${catInfo.color}`}>
                      <CatIcon className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-foreground font-balooda">
                          {catInfo.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {d ? fmtDateTime(d.toISOString()) : "—"}
                        </span>
                      </div>
                      {e.note && (
                        <p className="text-xs text-muted-foreground truncate font-balooda">
                          {e.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-sm sm:text-base font-charukola text-amber-600 dark:text-amber-400">
                        -{fmtMoney(e.amount)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingEntry(e);
                          setAmount(String(e.amount));
                          setCategory(e.category || "personal");
                          setNote(e.note || "");
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-rose-600"
                        onClick={() => setEntryToDelete(e)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ──────────────── Add Expense Modal Dialog ──────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <Wallet className="size-4 text-amber-600" />
              {lang === "bn" ? "মালিকের ব্যক্তিগত খরচ যুক্ত করুন" : "Add Owner Expense"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddEntry} className="space-y-3.5 font-balooda">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "টাকার পরিমাণ (৳)" : "Amount (৳)"}</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                pattern="[0-9.]*"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-9 text-base font-bold font-charukola"
                autoFocus
              />
            </div>

            {/* Quick Amount Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[500, 1000, 2000, 5000, 10000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(String(val))}
                  className="px-2 py-0.5 rounded-md text-[11px] bg-muted hover:bg-muted/80 border border-border text-foreground font-mono font-semibold transition-all active:scale-95"
                >
                  +{val}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "খরচের খাত / ক্যাটাগরি" : "Category"}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {lang === "bn" ? c.labelBn : c.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "তারিখ" : "Date"}</Label>
              <Input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "বিবরণ / নোট (ঐচ্ছিক)" : "Note (Optional)"}</Label>
              <Input
                placeholder={lang === "bn" ? "যেমন: বাজার, বিদ্যুৎ বিল, ওষুধ কেনা..." : "e.g. Groceries, rent..."}
                value={note}
                onChange={e => setNote(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>

            {/* Also cut from profit checkbox */}
            <div className="flex items-center space-x-2 py-1 px-1 bg-muted/40 rounded-lg border border-border/50">
              <Checkbox
                id="cut-from-profit"
                checked={cutFromProfit}
                onCheckedChange={v => setCutFromProfit(Boolean(v))}
              />
              <Label
                htmlFor="cut-from-profit"
                className="text-xs font-bold font-balooda cursor-pointer text-foreground select-none"
              >
                {lang === "bn" ? "লাভ থেকেও কর্তন হবে (Also cut from Net Profit)" : "Also cut from Net Profit"}
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                {busy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "নিশ্চিত করুন" : "Save Entry")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Edit Expense Modal Dialog ──────────────── */}
      <Dialog open={Boolean(editingEntry)} onOpenChange={open => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola flex items-center gap-2">
              <Pencil className="size-4 text-primary" />
              {lang === "bn" ? "খরচ এডিট করুন" : "Edit Expense"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdateEntry} className="space-y-3 font-balooda">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "টাকার পরিমাণ (৳)" : "Amount (৳)"}</Label>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                pattern="[0-9.]*"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="h-9 text-base font-bold font-charukola"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "খরচের খাত" : "Category"}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {lang === "bn" ? c.labelBn : c.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{lang === "bn" ? "বিবরণ / নোট" : "Note"}</Label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                className="h-8.5 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingEntry(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={busy} className="bg-primary font-bold">
                {busy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "পরিবর্তন সংরক্ষণ করুন" : "Save Changes")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── Delete Confirmation Dialog ──────────────── */}
      <Dialog open={Boolean(entryToDelete)} onOpenChange={open => !open && setEntryToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-charukola text-rose-600 flex items-center gap-2">
              <Trash2 className="size-4" />
              {lang === "bn" ? "খরচ মুছে ফেলতে চান?" : "Delete Expense Entry?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground font-balooda">
            {lang === "bn"
              ? "এই খরচটি মুছে ফেললে ক্যাশবাক্স এবং খরচের তালিকা থেকেও স্বয়ংক্রিয়ভাবে মুছে যাবে।"
              : "Deleting this expense will also remove its corresponding entry from cashbox logs and expense reports."}
          </p>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setEntryToDelete(null)}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={handleDeleteEntry} className="font-bold">
              {busy ? (lang === "bn" ? "মুছে ফেলা হচ্ছে..." : "Deleting...") : (lang === "bn" ? "মুছে ফেলুন" : "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
