"use client";

import { useMemo, useState, useEffect } from "react";
import { Download, BarChart3, Trash2, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getSales, getPurchases, getExpenses, getReturns, getParties } from "@/lib/queries";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteSaleFn, deletePurchaseFn, deleteExpenseFn, deleteReturnFn } from "@/lib/rpc";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
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

export default function TrackbackPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Check if an employee session is active
  const [activeEmpSession, setActiveEmpSession] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("cw_active_employee_session") || "null"); } catch { return null; }
  });
  useEffect(() => {
    const h = () => {
      try { setActiveEmpSession(JSON.parse(localStorage.getItem("cw_active_employee_session") || "null")); } catch {}
    };
    window.addEventListener("hz-employee-switched", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("hz-employee-switched", h); window.removeEventListener("storage", h); };
  }, []);

  const isEmployee = activeEmpSession != null || user?.role === "employee";

  // If employee: show access denied, no redirect needed (keeps URL clean)
  if (isEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20">
          <Lock className="size-10 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground">
          {lang === "bn" ? "এই পেজে প্রবেশাধিকার নেই" : "Access Restricted"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          {lang === "bn"
            ? "ট্র্যাকব্যাক রিপোর্ট শুধুমাত্র ব্যবসার মালিক দেখতে পারবেন। কর্মচারীরা এই পেজ অ্যাক্সেস করতে পারবেন না।"
            : "The Trackback report is restricted to business owners only. Employees cannot access this page."}
        </p>
        <Button variant="outline" className="rounded-xl" onClick={() => router.replace("/dashboard")}>
          {lang === "bn" ? "ড্যাশবোর্ডে ফিরুন" : "Return to Dashboard"}
        </Button>
      </div>
    );
  }

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    type: "sale" | "purchase" | "expense" | "return";
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function performDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { id, type } = deleteTarget;
      if (type === "sale") {
        const res = await deleteSaleFn({ data: { id } });
        if (res && !res.success && 'error' in res) throw new Error(res.error as string);
        qc.invalidateQueries({ queryKey: ["sales"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["cashbox"] });
        qc.invalidateQueries({ queryKey: ["returns"] });
      } else if (type === "purchase") {
        const res = await deletePurchaseFn({ data: { id } });
        if (res && !res.success && 'error' in res) throw new Error(res.error as string);
        qc.invalidateQueries({ queryKey: ["purchases"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["cashbox"] });
      } else if (type === "expense") {
        const res = await deleteExpenseFn({ data: { id } });
        if (res && !res.success && 'error' in res) throw new Error(res.error as string);
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["cashbox"] });
      } else if (type === "return") {
        const res = await deleteReturnFn({ data: { id } });
        if (res && !res.success && 'error' in res) throw new Error(res.error as string);
        qc.invalidateQueries({ queryKey: ["returns"] });
        qc.invalidateQueries({ queryKey: ["sales"] });
        qc.invalidateQueries({ queryKey: ["products"] });
        qc.invalidateQueries({ queryKey: ["cashbox"] });
      }
      toast.success(t("delete") || "Deleted successfully");
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteSale(id: string) {
    setDeleteTarget({ id, type: "sale" });
  }

  async function handleDeletePurchase(id: string) {
    setDeleteTarget({ id, type: "purchase" });
  }

  async function handleDeleteExpense(id: string) {
    setDeleteTarget({ id, type: "expense" });
  }

  async function handleDeleteReturn(id: string) {
    setDeleteTarget({ id, type: "return" });
  }

  // Graph line toggle states
  const [showSales, setShowSales] = useState(true);
  const [showBuys, setShowBuys] = useState(true);
  const [showSpends, setShowSpends] = useState(true);
  const [showProfit, setShowProfit] = useState(true);

  const sales = useCachedQuery(["sales"], getSales);
  const purchases = useCachedQuery(["purchases"], getPurchases);
  const expenses = useCachedQuery(["expenses"], getExpenses);
  const returns = useCachedQuery(["returns"], getReturns);
  const parties = useCachedQuery(["parties"], getParties);

  const filteredSales = useMemo(
    () => (sales.data ?? []).filter(s => !s.returned && inRange(s.created_at, range, from, to)),
    [sales.data, range, from, to],
  );

  const filteredPurchases = useMemo(
    () => (purchases.data ?? []).filter(p => inRange(p.created_at, range, from, to)),
    [purchases.data, range, from, to],
  );

  const filteredExpenses = useMemo(
    () => (expenses.data ?? []).filter(e => inRange(e.created_at, range, from, to)),
    [expenses.data, range, from, to],
  );

  const filteredReturns = useMemo(
    () => (returns.data ?? []).filter(r => inRange(r.created_at, range, from, to)),
    [returns.data, range, from, to],
  );

  const chartData = useMemo(() => {
    const map: Record<string, { date: string; dateObj: Date; sales: number; buys: number; spends: number; profit: number }> = {};
    
    for (const s of filteredSales) {
      const date = new Date(s.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, sales: 0, buys: 0, spends: 0, profit: 0 };
      map[key].sales += Number(s.sell_price) * s.qty;
      map[key].profit += Number(s.profit);
    }
    
    for (const p of filteredPurchases) {
      const date = new Date(p.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, sales: 0, buys: 0, spends: 0, profit: 0 };
      map[key].buys += p.total;
    }
    
    for (const e of filteredExpenses) {
      const date = new Date(e.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, sales: 0, buys: 0, spends: 0, profit: 0 };
      map[key].spends += e.amount;
    }
    
    return Object.values(map)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .map(({ date, sales, buys, spends, profit }) => ({ date, sales, buys, spends, profit }));
  }, [filteredSales, filteredPurchases, filteredExpenses]);

  const totals = useMemo(() => {
    const totalSales = filteredSales.reduce((a, s) => a + Number(s.sell_price) * s.qty, 0);
    const totalProfit = filteredSales.reduce((a, s) => a + Number(s.profit), 0);
    const totalBuys = filteredPurchases.reduce((a, p) => a + p.total, 0);
    const totalSpends = filteredExpenses.reduce((a, e) => a + e.amount, 0);
    const netProfit = totalProfit - totalSpends;

    return {
      sales: totalSales,
      profit: totalProfit,
      buys: totalBuys,
      spends: totalSpends,
      netProfit: netProfit,
      salesCount: filteredSales.length,
      buysCount: filteredPurchases.length,
      spendsCount: filteredExpenses.length,
    };
  }, [filteredSales, filteredPurchases, filteredExpenses]);

  const { items: pagedSales, totalPages, safePage } = paginate(filteredSales, page, pageSize);

  function exportSalesCsv(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["তারিখ", "পণ্য", "পরিমাণ", "ধরণ", "মোট মূল্য", "লাভ", "বকেয়া"]
      : ["Date", "Product", "Qty", "Type", "Total", "Profit", "Due"];
    const rows = filteredSales.map(s => [
      fmtDateTime(s.created_at),
      s.product_name,
      s.qty,
      langCode === "bn"
        ? (s.type === "cash" ? "নগদ" : s.type === "credit" ? "বাকী" : "অনলাইন")
        : s.type,
      Number(s.sell_price) * s.qty,
      s.profit,
      s.due_amount,
    ]);
    downloadCsv(`sales-${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold font-serif">{t("trackback")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("reports")} · {t("all_records")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">
              <Download className="size-3.5 mr-1" />
              {t("download_csv")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportSalesCsv("en")}>
              English (ইংরেজি)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportSalesCsv("bn")}>
              Bangla (বাংলা)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Date filters */}
      <Card className="p-3 shadow-sm space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t("filter_date")}</p>
        <div className="flex flex-wrap gap-1.5">
          {(["today", "week", "month", "all"] as Range[]).map(r => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-7 text-xs px-2.5"
              onClick={() => { setRange(r); setPage(1); }}
            >
              {r === "today" ? t("today") : r === "week" ? t("this_week") : r === "month" ? t("this_month") : t("all_records")}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <span className="text-[9px] text-muted-foreground">{lang === "bn" ? "শুরু তারিখ / বছর" : "From Date / Year"}</span>
            <Input type="date" className="h-8 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-0.5">
            <span className="text-[9px] text-muted-foreground">{lang === "bn" ? "শেষ তারিখ / বছর" : "To Date / Year"}</span>
            <Input type="date" className="h-8 text-xs" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <Card className="p-3 shadow-sm text-center bg-indigo-50/50 dark:bg-indigo-950/10 border-indigo-200/30">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("total_sales")}</p>
          <p className="text-sm font-bold mt-0.5 text-indigo-700 dark:text-indigo-400">{fmtMoney(totals.sales)}</p>
          <span className="text-[9px] text-muted-foreground block mt-0.5">{totals.salesCount} {t("records")}</span>
        </Card>
        <Card className="p-3 shadow-sm text-center bg-sky-50/50 dark:bg-sky-950/10 border-sky-200/30">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("total_buys")}</p>
          <p className="text-sm font-bold mt-0.5 text-sky-700 dark:text-sky-400">{fmtMoney(totals.buys)}</p>
          <span className="text-[9px] text-muted-foreground block mt-0.5">{totals.buysCount} {t("records")}</span>
        </Card>
        <Card className="p-3 shadow-sm text-center bg-rose-50/50 dark:bg-rose-950/10 border-rose-200/30">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("total_spends")}</p>
          <p className="text-sm font-bold mt-0.5 text-rose-700 dark:text-rose-400">{fmtMoney(totals.spends)}</p>
          <span className="text-[9px] text-muted-foreground block mt-0.5">{totals.spendsCount} {t("records")}</span>
        </Card>
        <Card className="p-3 shadow-sm text-center bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/30">
          <p className="text-[10px] text-muted-foreground uppercase font-medium">{t("raw_profit")}</p>
          <p className="text-sm font-bold mt-0.5 text-amber-700 dark:text-amber-400">{fmtMoney(totals.profit)}</p>
        </Card>
        <Card className="p-3 shadow-sm text-center bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200/30 col-span-2 md:col-span-1">
          <p className="text-[10px] text-muted-foreground uppercase font-semibold">{t("net_profit")}</p>
          <p className={`text-base font-extrabold mt-0.5 ${totals.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
            {fmtMoney(totals.netProfit)}
          </p>
        </Card>
      </div>

      {/* Live chart with filters */}
      <Card className="p-3 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div className="flex items-center gap-1.5">
            <BarChart3 className="icon-sm text-primary" />
            <h2 className="text-sm font-semibold">{t("comparison_chart")}</h2>
          </div>
          
          {/* Toggles */}
          <div className="flex flex-wrap gap-2.5 items-center text-[10px]">
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={showSales} onChange={e => setShowSales(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 scale-90" />
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">{lang === "bn" ? "বিক্রি" : "Sells"}</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={showBuys} onChange={e => setShowBuys(e.target.checked)} className="rounded text-sky-600 focus:ring-sky-500 scale-90" />
              <span className="font-semibold text-sky-600 dark:text-sky-400">{lang === "bn" ? "ক্রয় (বুয়)" : "Buys"}</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={showSpends} onChange={e => setShowSpends(e.target.checked)} className="rounded text-rose-600 focus:ring-rose-500 scale-90" />
              <span className="font-semibold text-rose-600 dark:text-rose-400">{lang === "bn" ? "খরচ (স্পেন্ডস)" : "Spends"}</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input type="checkbox" checked={showProfit} onChange={e => setShowProfit(e.target.checked)} className="rounded text-emerald-600 focus:ring-emerald-500 scale-90" />
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{lang === "bn" ? "লাভ (প্রফিট)" : "Profit"}</span>
            </label>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} />
            <YAxis tick={{ fontSize: 9 }} width={45} tickFormatter={v => `৳${v}`} />
            <Tooltip formatter={(v: number) => fmtMoney(v)} />
            <Legend wrapperStyle={{ fontSize: 9 }} />
            {showSales && <Line type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} name={lang === "bn" ? "বিক্রি" : "Sales"} activeDot={{ r: 4 }} />}
            {showBuys && <Line type="monotone" dataKey="buys" stroke="#0ea5e9" strokeWidth={2} name={lang === "bn" ? "পণ্য কেনা" : "Purchases (Buys)"} activeDot={{ r: 4 }} />}
            {showSpends && <Line type="monotone" dataKey="spends" stroke="#f43f5e" strokeWidth={2} name={lang === "bn" ? "দোকান খরচ" : "Expenses (Spends)"} activeDot={{ r: 4 }} />}
            {showProfit && <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name={lang === "bn" ? "লাভ" : "Profit"} activeDot={{ r: 4 }} />}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Data tabs */}
      <Tabs defaultValue="sales" onValueChange={() => setPage(1)}>
        <TabsList className="grid grid-cols-4 w-full h-8">
          <TabsTrigger value="sales" className="text-[10px] px-1">{t("sales")}</TabsTrigger>
          <TabsTrigger value="purchases" className="text-[10px] px-1">{t("purchases")}</TabsTrigger>
          <TabsTrigger value="expenses" className="text-[10px] px-1">{t("expenses")}</TabsTrigger>
          <TabsTrigger value="returns" className="text-[10px] px-1">{t("returns")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-3 space-y-2">
          <Card className="divide-y divide-border overflow-hidden shadow-sm">
            {pagedSales.length === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">{t("no_sales")}</p>
            )}
            {pagedSales.map(s => (
              <div key={s.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-muted/10 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{s.product_name} ×{s.qty}</p>
                  <p className="text-muted-foreground text-[10px]">{fmtDateTime(s.created_at)} · {s.type}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className="font-semibold">{fmtMoney(Number(s.sell_price) * s.qty)}</p>
                    <p className="text-[9px] text-emerald-600">+{fmtMoney(s.profit)}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteSale(s.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </Card>
          <PaginationBar page={safePage} totalPages={totalPages} total={filteredSales.length} pageSize={pageSize} onPageChange={setPage} />
        </TabsContent>

        <TabsContent value="purchases" className="mt-3">
          <RecordList
            items={filteredPurchases}
            render={p => ({ label: `${p.product_name} ×${p.qty}`, sub: fmtDateTime(p.created_at), amount: fmtMoney(p.total) })}
            empty={t("no_activity")}
            onDelete={handleDeletePurchase}
          />
        </TabsContent>

        <TabsContent value="expenses" className="mt-3">
          <RecordList
            items={filteredExpenses}
            render={e => ({ label: e.title, sub: fmtDateTime(e.created_at), amount: fmtMoney(e.amount) })}
            empty={t("no_activity")}
            onDelete={handleDeleteExpense}
          />
        </TabsContent>

        <TabsContent value="returns" className="mt-3">
          <RecordList
            items={filteredReturns}
            render={r => ({ label: `${r.product_name} ×${r.qty}`, sub: fmtDateTime(r.created_at), amount: t("returned") })}
            empty={t("no_activity")}
            onDelete={handleDeleteReturn}
          />
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-muted-foreground text-center">
        {parties.data?.length ?? 0} {t("parties")} · cached locally
      </p>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.type}`}
        description={`Are you sure you want to delete this ${deleteTarget?.type}? This action is permanent and cannot be undone.`}
        onConfirm={performDelete}
        busy={isDeleting}
      />
    </div>
  );
}

function RecordList<T extends { id: string }>({
  items, render, empty, onDelete,
}: {
  items: T[];
  render: (item: T) => { label: string; sub: string; amount: string };
  empty: string;
  onDelete?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const { items: paged, totalPages, safePage } = paginate(items, page, 15);

  return (
    <div className="space-y-2">
      <Card className="divide-y divide-border overflow-hidden shadow-sm">
        {paged.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">{empty}</p>}
        {paged.map(item => {
          const { label, sub, amount } = render(item);
          return (
            <div key={item.id} className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-muted/10 transition-colors">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{label}</p>
                <p className="text-muted-foreground">{sub}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <p className="font-semibold">{amount}</p>
                {onDelete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:bg-destructive/10"
                    onClick={() => onDelete(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
      <PaginationBar page={safePage} totalPages={totalPages} total={items.length} pageSize={15} onPageChange={setPage} />
    </div>
  );
}
