"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getSales, getExpenses, getWithdrawals } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDate } from "@/lib/format";
import { cashboxBalance } from "@/lib/cashbox-utils";
import { Wallet, TrendingUp, AlertCircle, Receipt, Download, Code, ArrowUp, ArrowDown, ChevronRight, Banknote } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full inline-block" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-medium">৳{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function KPI({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <Card className="p-3 sm:p-4 flex items-center gap-3 beveled-kpi relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
      <div className={`size-8 sm:size-9 rounded-xl ${color} flex items-center justify-center shrink-0 shadow-xs`}>
        <Icon className="size-4 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground truncate font-medium" title={label}>{label}</div>
        <div className="text-sm sm:text-base font-bold mt-0.5 truncate font-serif" title={value}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground truncate" title={sub}>{sub}</div>}
      </div>
    </Card>
  );
}

function RangePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

export default function CashManagementPage() {
  const { t } = useT();
  const sales = useCachedQuery(["sales"], getSales);
  const expenses = useCachedQuery(["expenses"], getExpenses);
  const withdrawals = useCachedQuery(["withdrawals"], getWithdrawals);
  const cashbox = useCashboxQuery();

  const balance = cashbox.isLoading ? null : cashboxBalance(cashbox.data ?? []);

  type Range = "today" | "yesterday" | "week" | "month" | "custom";
  const [range, setRange] = useState<Range>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { from, to } = useMemo(() => {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date();
    if (range === "today") start.setHours(0, 0, 0, 0);
    if (range === "week") { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); }
    if (range === "month") { start.setDate(1); start.setHours(0, 0, 0, 0); }
    if (range === "custom") {
      return {
        from: startDate ? new Date(startDate) : new Date(0),
        to: endDate ? new Date(endDate + "T23:59:59") : end,
      };
    }
    return { from: start, to: end };
  }, [range, startDate, endDate]);

  const inRange = (d: string) => { const dt = new Date(d); return dt >= from && dt <= to; };

  const filtSales = useMemo(() => (sales.data ?? []).filter(s => !s.returned && inRange(s.created_at)), [sales.data, from, to]);
  const filtExp = useMemo(() => (expenses.data ?? []).filter(e => inRange(e.created_at)), [expenses.data, from, to]);
  const filtWith = useMemo(() => (withdrawals.data ?? []).filter(w => inRange(w.created_at)), [withdrawals.data, from, to]);

  const getSaleTotal = (s: any) => {
    const p = Number(s.paid_amount);
    const d = Number(s.due_amount);
    if (!isNaN(p) && !isNaN(d) && (p + d > 0)) return p + d;
    const q = Number(s.qty) || 1;
    const sp = Number(s.sell_price) || 0;
    const disc = Number((s as any).discount) || 0;
    return Math.max(0, sp * q - disc);
  };

  const getSaleCash = (s: any) => {
    const tot = getSaleTotal(s);
    const p = Number(s.paid_amount);
    if (s.type === "cash" || s.type === "pos" || s.type === "nagad" || s.type === "card" || !s.type) {
      return (!isNaN(p) && p >= 0 ? p : tot);
    }
    if (s.type === "credit") {
      return (!isNaN(p) && p > 0 ? p : 0);
    }
    if (s.type === "bkash" || (s.type as string) === "bank") {
      if ((s as any).payment_status === "accepted" || (s as any).payment_accepted) return (!isNaN(p) && p > 0 ? p : tot);
      return 0;
    }
    if (s.type === "online") {
      if ((s as any).courier_status === "collected") return (!isNaN(p) && p > 0 ? p : tot);
      return 0;
    }
    return (!isNaN(p) && p >= 0 ? p : tot);
  };

  const cashSales = filtSales.reduce((a, s) => a + getSaleCash(s), 0);
  const onlineSales = filtSales.filter(s => s.type === "online").reduce((a, s) => a + getSaleTotal(s), 0);
  const creditSales = filtSales.filter(s => s.type === "credit").reduce((a, s) => a + (!isNaN(Number(s.due_amount)) ? Number(s.due_amount) : getSaleTotal(s)), 0);
  const totalSales = filtSales.reduce((a, s) => a + getSaleTotal(s), 0);
  const totalExp = filtExp.reduce((a, e) => a + Number(e.amount), 0);
  const totalWith = filtWith.reduce((a, w) => a + Number(w.amount), 0);
  const profit = filtSales.reduce((a, s) => a + Number(s.profit), 0);

  const dayCount = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 14;
  const dailyData = useMemo(() => {
    const map: Record<string, { cash: number; online: number; credit: number; expense: number }> = {};
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      map[k] = { cash: 0, online: 0, credit: 0, expense: 0 };
    }
    filtSales.forEach(s => {
      const k = new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (!map[k]) return;
      if (s.type === "cash") map[k].cash += Number(s.sell_price) * s.qty;
      if (s.type === "online") map[k].online += Number(s.sell_price) * s.qty;
      if (s.type === "credit") map[k].credit += Number(s.due_amount);
    });
    filtExp.forEach(e => {
      const k = new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      if (map[k]) map[k].expense += Number(e.amount);
    });
    return Object.entries(map).map(([date, v]) => ({ date, ...v }));
  }, [filtSales, filtExp, dayCount]);

  const pieData = [
    { name: t("cash"), value: cashSales, color: "#6366f1" },
    { name: t("online_sell"), value: onlineSales, color: "#10b981" },
    { name: t("credit_sale"), value: creditSales, color: "#f59e0b" },
  ].filter(d => d.value > 0);

  const flowData = dailyData.map(d => ({ date: d.date, আয়: d.cash + d.online, খরচ: -(d.expense) }));

  function exportCSV(langCode: "en" | "bn") {
    const rows = langCode === "bn"
      ? [["তারিখ", "ধরণ", "বিবরণ / পণ্য", "পরিমাণ", "টাকার পরিমাণ", "লাভ"]]
      : [["Date", "Type", "Product", "Qty", "Amount", "Profit"]];

    filtSales.forEach(s => {
      let typeLabel: string = s.type;
      if (langCode === "bn") {
        typeLabel = s.type === "cash" ? "নগদ বিক্রয়" : s.type === "credit" ? "বাকী বিক্রয়" : "অনলাইন বিক্রয়";
      } else {
        typeLabel = s.type === "cash" ? "Cash Sale" : s.type === "credit" ? "Credit Sale" : "Online Sale";
      }
      rows.push([
        new Date(s.created_at).toLocaleDateString(langCode === "bn" ? "bn-BD" : "en-US"),
        typeLabel,
        s.product_name,
        String(s.qty),
        String(Number(s.sell_price) * s.qty),
        String(s.profit),
      ]);
    });

    filtExp.forEach(e => {
      rows.push([
        new Date(e.created_at).toLocaleDateString(langCode === "bn" ? "bn-BD" : "en-US"),
        langCode === "bn" ? "খরচ" : "Expense",
        e.title,
        "1",
        String(e.amount),
        "0"
      ]);
    });

    filtWith.forEach(w => {
      rows.push([
        new Date(w.created_at).toLocaleDateString(langCode === "bn" ? "bn-BD" : "en-US"),
        langCode === "bn" ? "উত্তোলন" : "Withdrawal",
        w.note ?? (langCode === "bn" ? "মালিক" : "Owner"),
        "1",
        String(w.amount),
        "0"
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `cash-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  function exportJSON() {
    const data = { summary: { cashSales, onlineSales, creditSales, totalSales, totalExp, totalWith, cashboxBalance: balance, profit }, sales: filtSales, expenses: filtExp, withdrawals: filtWith };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `cash-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  const rangeLabel = range === "today" ? (useT().lang === "bn" ? "আজ" : "Today") : range === "yesterday" ? (useT().lang === "bn" ? "গতকাল" : "Yesterday") : range === "week" ? (useT().lang === "bn" ? "এই সপ্তাহ" : "This Week") : (useT().lang === "bn" ? "এই মাস" : "This Month");

  return (
    <div className="space-y-6 pb-4">
      <Card className="p-4 glass-card border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-indigo-500 grid place-items-center shrink-0">
              <Banknote className="size-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("cashbox")} — {t("balance")}</div>
              {balance === null ? (
                <div className="h-8 w-28 rounded-md bg-indigo-200/60 dark:bg-indigo-800/40 animate-pulse mt-1" />
              ) : (
                <div className="text-2xl font-bold text-indigo-600 mt-0.5">{fmtMoney(balance)}</div>
              )}
            </div>
          </div>
          <Link href="/cash-management/cashbox">
            <Button size="sm" variant="outline" className="border-indigo-500/30">
              {t("view_details")} <ChevronRight className="size-4 ml-1" />
            </Button>
          </Link>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("cash_management")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Sales & expense analytics</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePill label={t("today")} active={range === "today"} onClick={() => setRange("today")} />
          <RangePill label={t("this_week")} active={range === "week"} onClick={() => setRange("week")} />
          <RangePill label={t("this_month")} active={range === "month"} onClick={() => setRange("month")} />
          <RangePill label={t("custom")} active={range === "custom"} onClick={() => setRange("custom")} />
          {range === "custom" && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 sm:w-36 h-8 text-xs" />
              <span className="text-muted-foreground text-xs">—</span>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 sm:w-36 h-8 text-xs" />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPI label={t("cashbox")} value={balance === null ? "…" : fmtMoney(balance)} icon={Wallet} color="bg-indigo-500" sub={t("balance")} />
        <KPI label={t("total_sales")} value={fmtMoney(totalSales)} icon={TrendingUp} color="bg-emerald-500" sub={rangeLabel} />
        <KPI label={t("expense")} value={fmtMoney(totalExp)} icon={Receipt} color="bg-rose-500" sub={rangeLabel} />
        <KPI label={t("profit")} value={fmtMoney(profit)} icon={AlertCircle} color="bg-amber-500" sub={rangeLabel} />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card className="p-3 sm:p-4 text-center">
          <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">{t("cash")}</div>
          <div className="text-sm sm:text-lg font-bold text-indigo-600">{fmtMoney(cashSales)}</div>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">{t("online_sell")}</div>
          <div className="text-sm sm:text-lg font-bold text-emerald-600">{fmtMoney(onlineSales)}</div>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">{t("credit_sale")}</div>
          <div className="text-sm sm:text-lg font-bold text-amber-600">{fmtMoney(creditSales)}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4">{t("daily_sales_trend")}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="cmCash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `৳${(v / 1000).toFixed(0)}k`} width={48} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="cash" stroke="#6366f1" fill="url(#cmCash)" strokeWidth={2} name={t("cash")} />
              <Area type="monotone" dataKey="online" stroke="#10b981" fill="none" strokeWidth={2} name={t("online_sell")} />
              <Area type="monotone" dataKey="expense" stroke="#f43f5e" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name={t("expense")} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold mb-4">{t("payment_method_breakdown")}</h2>
          {pieData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">{t("no_activity")}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `৳${Number(v).toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.name}
                    </span>
                    <span className="font-semibold">{fmtMoney(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">{t("monthly_cash_flow")}</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><ArrowUp className="size-3 text-emerald-500" />{t("income")}</span>
            <span className="flex items-center gap-1"><ArrowDown className="size-3 text-rose-500" />{t("expense")}</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={flowData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `৳${Math.abs(v / 1000).toFixed(0)}k`} width={48} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="আয়" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="খরচ" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="flex flex-wrap justify-end gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Download className="size-4 mr-2" /> {t("export_csv")}
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
        <Button variant="outline" size="sm" onClick={exportJSON}>
          <Code className="size-4 mr-2" /> {t("export_json")}
        </Button>
      </div>
    </div>
  );
}
