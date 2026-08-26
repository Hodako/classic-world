"use client";

import { useMemo, useState } from "react";
import { Download, BarChart3, TrendingUp, ArrowUpRight, ShoppingCart, Calendar, Search, Pencil, Trash2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getPurchases } from "@/lib/queries";
import type { Purchase } from "@/lib/queries";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { EditPurchaseDialog } from "@/components/edit-purchase-dialog";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { deletePurchaseFn } from "@/lib/rpc";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Range = "today" | "week" | "month" | "all";

function startOfRange(range: Range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - 7);
  if (range === "month") d.setDate(d.getDate() - 30);
  if (range === "all") return new Date(0);
  return d;
}

function inRange(dateStr: string, range: Range, from?: string, to?: string) {
  const d = new Date(dateStr);
  if (from && d < new Date(from)) return false;
  if (to && d > new Date(to + "T23:59:59")) return false;
  return d >= startOfRange(range);
}

export default function PurchaseReportsPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chartType, setChartType] = useState<"area" | "bar" | "line">("area");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [purchaseToEdit, setPurchaseToEdit] = useState<Purchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const pageSize = 15;

  const purchases = useCachedQuery(["purchases"], getPurchases);

  // Filter purchases based on selected range
  const filteredPurchases = useMemo(
    () => (purchases.data ?? []).filter(p => inRange(p.created_at, range, from, to)),
    [purchases.data, range, from, to],
  );

  // Group purchases by day for custom interactive charts
  const chartData = useMemo(() => {
    const map: Record<string, { date: string; dateObj: Date; total: number; qty: number }> = {};
    
    for (const p of filteredPurchases) {
      const date = new Date(p.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, total: 0, qty: 0 };
      map[key].total += Number(p.total);
      map[key].qty += p.qty;
    }
    
    return Object.values(map).sort((a, b) => +a.dateObj - +b.dateObj);
  }, [filteredPurchases]);

  // Aggregated totals
  const totalPurchaseCost = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + Number(p.total), 0);
  }, [filteredPurchases]);

  const totalItemsPurchased = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + p.qty, 0);
  }, [filteredPurchases]);

  const totalVouchers = filteredPurchases.length;

  const averageUnitCost = useMemo(() => {
    return totalItemsPurchased > 0 ? totalPurchaseCost / totalItemsPurchased : 0;
  }, [totalPurchaseCost, totalItemsPurchased]);

  // Search filter
  const searchedPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filteredPurchases
      .filter(p => !q || p.product_name.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [filteredPurchases, search]);

  const { items: pagedPurchases, totalPages, safePage } = paginate(searchedPurchases, page, pageSize);

  // CSV Export
  const exportCSV = (langCode: "en" | "bn") => {
    const headers = langCode === "bn"
      ? ["তারিখ", "পণ্যের নাম", "পরিমাণ", "একক ক্রয়মূল্য", "মোট খরচ", "নোট"]
      : ["Date", "Product Name", "Quantity", "Unit Cost", "Total Cost", "Note"];
    const rows = searchedPurchases.map(p => [
      fmtDateTime(p.created_at),
      p.product_name,
      p.qty,
      p.unit_cost,
      p.total,
      p.note || ""
    ]);
    downloadCsv(`purchase_reports_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  };

  async function performDelete() {
    if (!purchaseToDelete) return;
    setIsDeleting(true);
    try {
      await deletePurchaseFn({ data: { id: purchaseToDelete.id } });
      toast.success(lang === "bn" ? "ক্রয় রেকর্ড সফলভাবে মুছে ফেলা হয়েছে" : "Purchase record deleted successfully");
      setPurchaseToDelete(null);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete purchase");
    } finally {
      setIsDeleting(false);
    }
  }

  const chartColor = "#3b82f6"; // Blue color for purchases

  return (
    <div className="space-y-4 pb-6 font-hind">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight font-balooda text-foreground">{lang === "bn" ? "ক্রয় রিপোর্ট ও বিশ্লেষণ" : "Purchase Reports & Analytics"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "bn" ? "পণ্যের মোট ক্রয়মূল্য, ক্রয়ের পরিমাণ এবং ক্রয়ের গতিধারা" : "Overview of product purchase cost, quantity purchased, and purchase trends"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs beveled-button">
                <Download className="size-3.5 mr-1" />
                {t("download_csv")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCSV("en")}>
                English (ইংরেজি)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV("bn")}>
                Bangla (বাংলা)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Date Filters & Range Selectors */}
      <div className="bg-card/60 backdrop-blur-sm border rounded-xl p-3 space-y-3 beveled-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex bg-muted/60 rounded p-0.5 text-xs">
            <button onClick={() => { setRange("today"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "today" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "আজ" : "Today"}</button>
            <button onClick={() => { setRange("week"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "week" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "৭ দিন" : "7 Days"}</button>
            <button onClick={() => { setRange("month"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "month" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "৩০ দিন" : "30 Days"}</button>
            <button onClick={() => { setRange("all"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "all" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "সব সময়" : "All Time"}</button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            <span>{lang === "bn" ? "কাস্টম রেঞ্জ:" : "Custom Range:"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-dashed">
          <div>
            <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "হতে" : "From Date"}</Label>
            <Input type="date" className="h-8 text-xs mt-0.5" value={from} onChange={e => { setFrom(e.target.value); setRange("all"); setPage(1); }} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "পর্যন্ত" : "To Date"}</Label>
            <Input type="date" className="h-8 text-xs mt-0.5" value={to} onChange={e => { setTo(e.target.value); setRange("all"); setPage(1); }} />
          </div>
        </div>
      </div>

      {/* Financial KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3.5 bg-gradient-to-br from-white via-blue-50/20 to-blue-500/5 dark:from-zinc-900 dark:via-blue-950/10 dark:to-blue-500/5 border border-blue-500/20 rounded-xl shadow-[0_4px_16px_rgba(59,130,246,0.06)] flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "মোট ক্রয় খরচ" : "Total Buy Spend"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-blue-600 dark:text-blue-400">{fmtMoney(totalPurchaseCost)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "পণ্যের মোট ক্রয়মূল্য" : "Gross Purchase Cost"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-white via-indigo-50/20 to-indigo-500/5 dark:from-zinc-900 dark:via-indigo-950/10 dark:to-indigo-500/5 border border-indigo-500/20 rounded-xl shadow-[0_4px_16px_rgba(99,102,241,0.06)] flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "কেনা পণ্যের সংখ্যা" : "Items Purchased"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-indigo-600 dark:text-indigo-400">{totalItemsPurchased} {lang === "bn" ? "টি" : "Units"}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "মোট ক্রয়কৃত পণ্যের পরিমাণ" : "Total Purchased Quantity"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-white via-amber-50/20 to-amber-500/5 dark:from-zinc-900 dark:via-amber-950/10 dark:to-amber-500/5 border border-amber-500/20 rounded-xl shadow-[0_4px_16px_rgba(245,158,11,0.06)] flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "মোট ভাউচার" : "Purchase Vouchers"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-amber-600 dark:text-amber-400">{totalVouchers}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "মোট ক্রয়ের চালান বিবরণী" : "Invoice Vouchers Count"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-gradient-to-br from-white via-emerald-50/20 to-emerald-500/5 dark:from-zinc-900 dark:via-emerald-950/10 dark:to-emerald-500/5 border border-emerald-500/20 rounded-xl shadow-[0_4px_16px_rgba(16,185,129,0.06)] flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "গড় একক ক্রয়মূল্য" : "Average Unit Cost"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-emerald-600 dark:text-emerald-400">{fmtMoney(averageUnitCost)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "প্রতি পিস গড় কেনা দাম" : "Average Price per Piece"}</span>
          </div>
        </Card>
      </div>

      {/* Purchase Trend Chart Card */}
      <Card className="p-4 space-y-3 beveled-card bg-card/45 backdrop-blur-sm shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{lang === "bn" ? "ক্রয় গতিধারা গ্রাফ" : "Purchase Trend Graph"}</h2>
          
          <div className="flex bg-muted/60 rounded p-0.5 text-[10px]">
            <button onClick={() => setChartType("area")} className={`px-2 py-0.5 rounded ${chartType === "area" ? "bg-background shadow" : "text-muted-foreground"}`}>Area</button>
            <button onClick={() => setChartType("bar")} className={`px-2 py-0.5 rounded ${chartType === "bar" ? "bg-background shadow" : "text-muted-foreground"}`}>Bar</button>
            <button onClick={() => setChartType("line")} className={`px-2 py-0.5 rounded ${chartType === "line" ? "bg-background shadow" : "text-muted-foreground"}`}>Line</button>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
            {lang === "bn" ? "গ্রাফ দেখানোর জন্য পর্যাপ্ত তথ্য নেই" : "No trend data available for selection"}
          </div>
        ) : (
          <div className="w-full">
            <ResponsiveContainer width="100%" height={180}>
              {chartType === "area" ? (
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(val) => `৳${val}`} />
                  <Tooltip formatter={(value: any) => [`৳${value}`, lang === "bn" ? "মোট ক্রয়" : "Purchases"]} labelStyle={{ fontWeight: "bold" }} />
                  <Area type="monotone" dataKey="total" stroke={chartColor} strokeWidth={2} fill="url(#pGrad)" name={lang === "bn" ? "মোট ক্রয়" : "Total Cost"} />
                </AreaChart>
              ) : chartType === "bar" ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(val) => `৳${val}`} />
                  <Tooltip formatter={(value: any) => [`৳${value}`, lang === "bn" ? "মোট ক্রয়" : "Purchases"]} />
                  <Bar dataKey="total" fill={chartColor} radius={[4, 4, 0, 0]} name={lang === "bn" ? "মোট ক্রয়" : "Total Cost"} />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(val) => `৳${val}`} />
                  <Tooltip formatter={(value: any) => [`৳${value}`, lang === "bn" ? "মোট ক্রয়" : "Purchases"]} />
                  <Line type="monotone" dataKey="total" stroke={chartColor} strokeWidth={2.5} name={lang === "bn" ? "মোট ক্রয়" : "Total Cost"} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Purchase Ledger Table */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2">
          <h2 className="text-sm font-semibold tracking-tight font-serif">{lang === "bn" ? "ক্রয় তালিকা ও চালান সমূহ" : "Purchases Voucher Records"}</h2>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10 pointer-events-none" />
            <Input
              style={{ paddingLeft: "2.5rem" }}
              className="pl-9 h-8 text-xs"
              placeholder={lang === "bn" ? "পণ্য খুঁজুন" : "Search products"}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {searchedPurchases.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm shadow-sm">
            {lang === "bn" ? "কোন ক্রয় রেকর্ড পাওয়া যায়নি" : "No purchase vouchers matching filter"}
          </Card>
        ) : (
          <>
            <Card className="divide-y divide-border overflow-hidden bg-card/75 backdrop-blur-sm border-border/80 beveled-card shadow-sm">
              {pagedPurchases.map((p) => (
                <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-zinc-900 dark:text-zinc-50">{p.product_name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{fmtDateTime(p.created_at)}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/45" />
                      <span>{lang === "bn" ? `পরিমাণ: ×${p.qty}` : `Qty: ×${p.qty}`}</span>
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/45" />
                      <span className="text-blue-600 font-medium">{lang === "bn" ? `একক মূল্য: ${fmtMoney(p.unit_cost)}` : `Unit Cost: ${fmtMoney(p.unit_cost)}`}</span>
                      {p.note && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/45" />
                          <span className="truncate italic">Note: {p.note}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-zinc-900 dark:text-zinc-50 font-serif">
                      {fmtMoney(p.total)}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg cursor-pointer"
                      onClick={() => setPurchaseToEdit(p)}
                      title={lang === "bn" ? "সম্পাদনা করুন" : "Edit"}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg cursor-pointer"
                      onClick={() => setPurchaseToDelete(p)}
                      title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </Card>

            <PaginationBar page={safePage} totalPages={totalPages} total={searchedPurchases.length} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </div>

      <EditPurchaseDialog
        purchase={purchaseToEdit}
        open={purchaseToEdit !== null}
        onOpenChange={(v) => {
          if (!v) setPurchaseToEdit(null);
        }}
      />

      <ConfirmDeleteDialog
        open={purchaseToDelete !== null}
        onOpenChange={(v) => {
          if (!v) setPurchaseToDelete(null);
        }}
        title={lang === "bn" ? "মাল ক্রয় হিসেব মুছুন" : "Delete Purchase Record"}
        description={
          lang === "bn"
            ? `আপনি কি নিশ্চিত যে "${purchaseToDelete?.product_name}" পণ্যটির ক্রয় হিসাব মুছে ফেলতে চান? এটি স্থায়ীভাবে মুছে যাবে।`
            : `Are you sure you want to delete purchase "${purchaseToDelete?.product_name}"? This action is permanent and cannot be undone.`
        }
        onConfirm={performDelete}
        busy={isDeleting}
      />
    </div>
  );
}