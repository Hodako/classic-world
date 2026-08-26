"use client";

import { useMemo, useState } from "react";
import { Download, BarChart3, TrendingUp, TrendingDown, ArrowUpRight, DollarSign, Calendar, Search } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getSales, getPurchases, getExpenses, getReturns } from "@/lib/queries";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Range = "today" | "yesterday" | "week" | "this_month" | "last_month" | "month" | "all";

function inRange(dateInput: any, range: Range, from?: string, to?: string) {
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

  if (from) {
    const fromBoundary = new Date(`${from}T00:00:00`);
    if (d < fromBoundary) return false;
  }
  if (to) {
    const toBoundary = new Date(`${to}T23:59:59.999`);
    if (d > toBoundary) return false;
  }
  if (from || to) return true;

  const now = new Date();
  if (range === "today") {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    return d >= today && d < tomorrow;
  }
  if (range === "yesterday") {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return d >= yesterday && d < today;
  }
  if (range === "week") {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
  }
  if (range === "this_month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return d >= startOfMonth;
  }
  if (range === "last_month") {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return d >= startOfLastMonth && d <= endOfLastMonth;
  }
  if (range === "month") {
    const startOf30Days = new Date(now);
    startOf30Days.setDate(now.getDate() - 30);
    startOf30Days.setHours(0, 0, 0, 0);
    return d >= startOf30Days;
  }
  return true;
}

export default function ProfitPage() {
  const { lang, t } = useT();
  const [range, setRange] = useState<Range>("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chartType, setChartType] = useState<"area" | "bar" | "line">("area");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const sales = useCachedQuery(["sales"], getSales);
  const purchases = useCachedQuery(["purchases"], getPurchases);
  const expenses = useCachedQuery(["expenses"], getExpenses);
  const returns = useCachedQuery(["returns"], getReturns);

  // Filter lists based on selected range
  const filteredSales = useMemo(
    () => (sales.data ?? []).filter(s => inRange(s.created_at, range, from, to)),
    [sales.data, range, from, to],
  );

  const filteredExpenses = useMemo(
    () => (expenses.data ?? []).filter(e => inRange(e.created_at, range, from, to)),
    [expenses.data, range, from, to],
  );

  const filteredReturns = useMemo(
    () => (returns.data ?? []).filter(r => inRange(r.created_at, range, from, to)),
    [returns.data, range, from, to],
  );

  // Group metrics by day for custom interactive charts
  const chartData = useMemo(() => {
    const map: Record<string, { date: string; dateObj: Date; profit: number; sales: number; expenses: number }> = {};
    
    // Aggregate sales profit
    for (const s of filteredSales) {
      if (s.returned) continue;
      const date = new Date(s.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, profit: 0, sales: 0, expenses: 0 };
      map[key].profit += Number(s.profit);
      map[key].sales += Number(s.sell_price) * s.qty;
    }
    
    // Subtract expenses
    for (const e of filteredExpenses) {
      const date = new Date(e.created_at);
      const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[key]) map[key] = { date: key, dateObj: date, profit: 0, sales: 0, expenses: 0 };
      map[key].expenses += e.amount;
      map[key].profit -= e.amount; // Direct deduction from net profit
    }
    
    return Object.values(map).sort((a, b) => +a.dateObj - +b.dateObj);
  }, [filteredSales, filteredExpenses]);

  // Aggregated totals
  const totalSalesRevenue = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (s.returned ? 0 : Number(s.sell_price) * s.qty), 0);
  }, [filteredSales]);

  const totalSalesProfit = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (s.returned ? 0 : Number(s.profit)), 0);
  }, [filteredSales]);

  const totalCostOfGoods = useMemo(() => {
    return Math.max(totalSalesRevenue - totalSalesProfit, 0);
  }, [totalSalesRevenue, totalSalesProfit]);

  const totalOverheadExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const netProfit = useMemo(() => {
    return totalSalesProfit - totalOverheadExpenses;
  }, [totalSalesProfit, totalOverheadExpenses]);

  // Filter transaction level ledger
  const transactions = useMemo(() => {
    const list: Array<{
      id: string;
      date: string;
      name: string;
      qty: number;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
      type: "sale" | "expense" | "return";
    }> = [];

    // Add sales
    filteredSales.forEach(s => {
      const rev = Number(s.sell_price) * s.qty;
      const prof = Number(s.profit);
      const cst = Math.max(rev - prof, 0);
      list.push({
        id: s.id,
        date: s.created_at,
        name: s.product_name + (s.returned ? ` (${t("returned")})` : ""),
        qty: s.qty,
        revenue: rev,
        cost: cst,
        profit: s.returned ? 0 : prof,
        margin: rev > 0 ? (prof / rev) * 100 : 0,
        type: s.returned ? "return" : "sale"
      });
    });

    // Add expenses
    filteredExpenses.forEach(e => {
      list.push({
        id: e.id,
        date: e.created_at,
        name: `${t("expense")}: ${e.title}`,
        qty: 1,
        revenue: 0,
        cost: e.amount,
        profit: -e.amount,
        margin: 0,
        type: "expense"
      });
    });

    return list.sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [filteredSales, filteredExpenses, t]);

  // Search filter
  const searchedTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter(t => !q || t.name.toLowerCase().includes(q));
  }, [transactions, search]);

  const { items: pagedTransactions, totalPages, safePage } = paginate(searchedTransactions, page, pageSize);

  // CSV Export
  const exportCSV = (langCode: "en" | "bn") => {
    const headers = langCode === "bn"
      ? ["তারিখ", "বিবরণ / আইটেম", "ধরণ", "পরিমাণ", "রাজস্ব", "খরচ / ব্যয়", "নেট লাভ", "মার্জিন (%)"]
      : ["Date", "Item / Description", "Type", "Quantity", "Revenue", "Cost / Expense", "Net Profit", "Margin (%)"];
    const rows = searchedTransactions.map(t => [
      fmtDateTime(t.date),
      t.name,
      langCode === "bn"
        ? (t.type === "sale" ? "বিক্রয়" : t.type === "expense" ? "খরচ" : "ফেরত")
        : t.type.toUpperCase(),
      t.qty,
      t.revenue,
      t.cost,
      t.profit,
      t.margin.toFixed(1)
    ]);
    downloadCsv(`profit_loss_statement_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  };

  // Recharts color configurations
  const chartColor = netProfit >= 0 ? "#10b981" : "#ef4444";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight font-serif">{lang === "bn" ? "লাভ ও লোকসান খতিয়ান" : "Profit & Loss Analytics"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "bn" ? "ব্যবসার মোট লাভ, পরিচালন খরচ এবং প্রকৃত আয়-ব্যয়ের হিসাব" : "Overview of sales revenue, cost of goods, overhead expenses, and actual profits"}
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
          <div className="flex flex-wrap bg-muted/60 rounded-lg p-0.5 text-xs gap-1">
            <button onClick={() => { setRange("today"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "today" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "আজ" : "Today"}</button>
            <button onClick={() => { setRange("yesterday"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "yesterday" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "গতকাল" : "Yesterday"}</button>
            <button onClick={() => { setRange("week"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "week" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "৭ দিন" : "7 Days"}</button>
            <button onClick={() => { setRange("this_month"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "this_month" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "এই মাস" : "This Month"}</button>
            <button onClick={() => { setRange("last_month"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "last_month" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "গত মাস" : "Last Month"}</button>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-3.5 bg-card border-border beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "মোট বিক্রি" : "Total Revenue"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-zinc-950 dark:text-zinc-50">{fmtMoney(totalSalesRevenue)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "গ্রস বিক্রি মূল্য" : "Gross Revenue"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-card border-border beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "বিক্রিত পণ্যের ক্রয়মূল্য" : "Cost of Goods Sold"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-zinc-950 dark:text-zinc-50">{fmtMoney(totalCostOfGoods)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "পণ্য কেনা খরচ (COGS)" : "Product Buy Cost"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-card border-border beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "পণ্যের মুনাফা" : "Products Profit"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-emerald-600 dark:text-emerald-400">{fmtMoney(totalSalesProfit)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "বিক্রি হতে লাভ (কর্তন ছাড়া)" : "Sales profit, no deductions"}</span>
          </div>
        </Card>

        <Card className="p-3.5 bg-card border-border beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "পরিচালন খরচ" : "Overhead Expenses"}</div>
          <div className="mt-2">
            <div className="text-lg font-bold font-serif text-rose-600">-{fmtMoney(totalOverheadExpenses)}</div>
            <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "দোকান ও ব্যবসা খরচ" : "Overheads / Spends"}</span>
          </div>
        </Card>

        {/* Net Profit Card */}
        <Card className={`p-3.5 border beveled-card shadow-md flex flex-col justify-between h-24 transition-colors ${
          netProfit >= 0 
            ? "bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-background border-emerald-500/30" 
            : "bg-gradient-to-br from-rose-500/10 via-rose-600/5 to-background border-rose-500/30"
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{t("net_profit")}</span>
            {netProfit >= 0 ? (
              <TrendingUp className="size-4 text-emerald-600" />
            ) : (
              <TrendingDown className="size-4 text-rose-500" />
            )}
          </div>
          <div className="mt-2">
            <div className={`text-xl font-bold font-serif ${netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {netProfit >= 0 ? "+" : ""}{fmtMoney(netProfit)}
            </div>
            <span className="text-[9px] text-muted-foreground block">
              {lang === "bn" ? (netProfit >= 0 ? "প্রকৃত মুনাফা" : "আসল লোকসান") : (netProfit >= 0 ? "Net Gain" : "Net Loss")}
            </span>
          </div>
        </Card>
      </div>

      {/* Profit Trend Chart Card */}
      <Card className="p-4 space-y-3 beveled-card bg-card/45 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{lang === "bn" ? "লাভের গতিধারা গ্রাফ" : "Profit Trend Graph"}</h2>
          
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
                  <Tooltip formatter={(value: any) => [`৳${value}`, t("net_profit")]} labelStyle={{ fontWeight: "bold" }} />
                  <Area type="monotone" dataKey="profit" stroke={chartColor} strokeWidth={2} fill="url(#pGrad)" name={t("profit")} />
                </AreaChart>
              ) : chartType === "bar" ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(val) => `৳${val}`} />
                  <Tooltip formatter={(value: any) => [`৳${value}`, t("net_profit")]} />
                  <Bar dataKey="profit" fill={chartColor} radius={[4, 4, 0, 0]} name={t("profit")} />
                </BarChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(val) => `৳${val}`} />
                  <Tooltip formatter={(value: any) => [`৳${value}`, t("net_profit")]} />
                  <Line type="monotone" dataKey="profit" stroke={chartColor} strokeWidth={2.5} name={t("profit")} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Transaction Level Profit Ledger */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2">
          <h2 className="text-sm font-semibold tracking-tight font-serif">{lang === "bn" ? "লেনদেন বিবরণী ও মার্জিন" : "Transactions Margin Breakdown"}</h2>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10 pointer-events-none" />
            <Input
              style={{ paddingLeft: "2.5rem" }}
              className="pl-9 h-8 text-xs"
              placeholder={lang === "bn" ? "পণ্য বা বিবরণী খুঁজুন" : "Search products or descriptions"}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {searchedTransactions.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm">
            {lang === "bn" ? "কোন লেনদেন বিবরণী পাওয়া যায়নি" : "No transactions matching filter"}
          </Card>
        ) : (
          <>
            <Card className="divide-y divide-border overflow-hidden bg-card/75 backdrop-blur-sm border-border/80 beveled-card">
              {pagedTransactions.map((tx) => (
                <div key={tx.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-zinc-900 dark:text-zinc-50">{tx.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{fmtDateTime(tx.date)}</span>
                      {tx.type === "sale" && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/45" />
                          <span>{lang === "bn" ? `পরিমাণ: ×${tx.qty}` : `Qty: ×${tx.qty}`}</span>
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/45" />
                          <span className="text-indigo-600 font-medium">Margin: {tx.margin.toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-bold ${
                      tx.profit > 0 
                        ? "text-emerald-600" 
                        : tx.profit < 0 
                          ? "text-rose-600" 
                          : "text-muted-foreground"
                    }`}>
                      {tx.profit > 0 ? "+" : ""}{fmtMoney(tx.profit)}
                    </div>
                    {tx.type === "sale" && (
                      <span className="text-[9px] text-muted-foreground block">
                        Cost: {fmtMoney(tx.cost)} · Sell: {fmtMoney(tx.revenue)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Card>

            <PaginationBar page={safePage} totalPages={totalPages} total={searchedTransactions.length} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
