"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Calendar,
  ShoppingBag,
  TrendingUp,
  CreditCard,
  Banknote,
  DollarSign,
  Truck,
  Printer,
  Search,
  Filter,
  Package,
  Clock,
  Sparkles,
  Trophy,
  Receipt,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getSales, getProducts, type Sale, type Product } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime, fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import { toast } from "sonner";

interface ProductSaleStat {
  productId: string;
  name: string;
  category: string;
  barcode?: string | null;
  imageUrl?: string | null;
  qtySold: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  currentStock: number;
  minStock: number;
}

export default function TodaysSalePage() {
  const { lang } = useT();
  const salesQuery = useCachedQuery(["sales"], getSales);
  const productsQuery = useCachedQuery(["products"], getProducts);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const allSales: Sale[] = salesQuery.data ?? [];
  const allProducts: Product[] = productsQuery.data ?? [];

  // Product map for quick lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of allProducts) {
      if (p.id) map.set(p.id, p);
      if (p._id) map.set(String(p._id), p);
    }
    return map;
  }, [allProducts]);

  // Filter sales for the selected date (default today)
  const todaysSales = useMemo(() => {
    return allSales.filter(s => {
      if (!s.created_at) return false;
      const saleDateStr = typeof s.created_at === "string" 
        ? s.created_at.slice(0, 10) 
        : new Date(s.created_at).toISOString().slice(0, 10);
      return saleDateStr === selectedDate;
    });
  }, [allSales, selectedDate]);

  // Group items by cart / invoice
  const groupedTodaysSales = useMemo(() => {
    const map: Record<string, Sale[]> = {};
    const singles: Sale[] = [];

    todaysSales.forEach(s => {
      if (s.cart_id) {
        if (!map[s.cart_id]) map[s.cart_id] = [];
        map[s.cart_id].push(s);
      } else {
        singles.push(s);
      }
    });

    const groups = Object.values(map);
    return { groups, singles, totalInvoices: groups.length + singles.length };
  }, [todaysSales]);

  // High-level KPI Calculations
  const kpis = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalDiscount = 0;
    let cash = 0;
    let bkash = 0;
    let bank = 0;
    let credit = 0;
    let online = 0;

    todaysSales.forEach(s => {
      const qty = Number(s.qty) || 1;
      const sellPrice = Number(s.sell_price) || 0;
      const buyPrice = Number(s.buy_price) || 0;
      const disc = Number(s.discount) || 0;

      const lineTotal = Math.max(0, (sellPrice * qty) - disc);
      const lineCost = buyPrice * qty;

      totalRevenue += lineTotal;
      totalCost += lineCost;
      totalDiscount += disc;

      const type = (s.type || "cash").toLowerCase();
      if (type === "split") {
        cash += Number((s as any).split_cash) || 0;
        bkash += Number((s as any).split_bkash) || 0;
        bank += Number((s as any).split_bank) || 0;
      } else if (type === "cash") {
        cash += lineTotal;
      } else if (type === "bkash" || type === "nagad") {
        bkash += lineTotal;
      } else if (type === "bank" || type === "card" || type === "pos") {
        bank += lineTotal;
      } else if (type === "credit") {
        credit += lineTotal;
      } else if (type === "online") {
        online += lineTotal;
      } else {
        cash += lineTotal;
      }
    });

    const profit = Math.max(0, totalRevenue - totalCost);
    const profitMargin = totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) : "0";

    return {
      totalRevenue,
      totalCost,
      totalDiscount,
      profit,
      profitMargin,
      cash,
      bkash,
      bank,
      credit,
      online,
      itemsCount: todaysSales.reduce((acc, s) => acc + (Number(s.qty) || 1), 0),
    };
  }, [todaysSales]);

  // Detailed Top Selling Products Today
  const topSellingProducts: ProductSaleStat[] = useMemo(() => {
    const stats: Record<string, ProductSaleStat> = {};

    todaysSales.forEach(s => {
      const pId = s.product_id || s.id || "unknown";
      const qty = Number(s.qty) || 1;
      const sellPrice = Number(s.sell_price) || 0;
      const buyPrice = Number(s.buy_price) || 0;
      const disc = Number(s.discount) || 0;
      const revenue = Math.max(0, (sellPrice * qty) - disc);
      const cost = buyPrice * qty;

      if (!stats[pId]) {
        const prod = productMap.get(pId);
        stats[pId] = {
          productId: pId,
          name: s.product_name || prod?.name || (lang === "bn" ? "অজ্ঞাত পণ্য" : "Unknown Product"),
          category: s.category || prod?.category || (lang === "bn" ? "সাধারণ" : "General"),
          barcode: s.barcode || prod?.barcode || prod?.code || null,
          imageUrl: prod?.image_url || null,
          qtySold: 0,
          totalRevenue: 0,
          totalCost: 0,
          profit: 0,
          currentStock: Number(prod?.stock) || 0,
          minStock: Number(prod?.min_stock) || 5,
        };
      }

      stats[pId].qtySold += qty;
      stats[pId].totalRevenue += revenue;
      stats[pId].totalCost += cost;
      stats[pId].profit += Math.max(0, revenue - cost);
    });

    return Object.values(stats).sort((a, b) => b.qtySold - a.qtySold || b.totalRevenue - a.totalRevenue);
  }, [todaysSales, productMap, lang]);

  // Hourly Sales Trend (6 AM to 11 PM)
  const hourlyStats = useMemo(() => {
    const hours: { hourLabel: string; count: number; total: number }[] = [];
    for (let h = 8; h <= 23; h++) {
      const ampm = h >= 12 ? "PM" : "AM";
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      hours.push({ hourLabel: `${displayH} ${ampm}`, count: 0, total: 0 });
    }

    todaysSales.forEach(s => {
      if (!s.created_at) return;
      const d = new Date(s.created_at);
      const h = d.getHours();
      if (h >= 8 && h <= 23) {
        const idx = h - 8;
        const lineTotal = Math.max(0, ((Number(s.sell_price) || 0) * (Number(s.qty) || 1)) - (Number(s.discount) || 0));
        hours[idx].count += 1;
        hours[idx].total += lineTotal;
      }
    });

    const maxTotal = Math.max(...hours.map(h => h.total), 1);
    return { hours, maxTotal };
  }, [todaysSales]);

  // Filtered sales list for the detailed invoice log
  const filteredSales = useMemo(() => {
    return todaysSales.filter(s => {
      if (filterType !== "all" && (s.type || "cash").toLowerCase() !== filterType.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (s.product_name || "").toLowerCase().includes(q);
        const matchesCustomer = (s.customer?.name || (s.parties as any)?.name || "").toLowerCase().includes(q);
        const matchesPhone = (s.customer?.phone || "").toLowerCase().includes(q);
        const matchesBarcode = (s.barcode || "").toLowerCase().includes(q);
        return matchesName || matchesCustomer || matchesPhone || matchesBarcode;
      }
      return true;
    });
  }, [todaysSales, filterType, searchQuery]);

  const handlePrintSale = (sale: Sale) => {
    const singleGroup = {
      cart_id: sale.cart_id || sale.id,
      customer_id: sale.customer_id,
      party_id: sale.party_id,
      customer_name: sale.customer?.name || (sale.parties as any)?.name,
      customer_phone: sale.customer?.phone,
      total_price: Math.max(0, ((Number(sale.sell_price) || 0) * (Number(sale.qty) || 1)) - (Number(sale.discount) || 0)),
      total_qty: Number(sale.qty) || 1,
      total_discount: Number(sale.discount) || 0,
      paid_amount: Number(sale.paid_amount) || 0,
      due_amount: Number(sale.due_amount) || 0,
      profit: Number(sale.profit) || 0,
      type: sale.type || "cash",
      created_at: sale.created_at,
      items: [sale],
    };
    executeDirectSilentPrint(singleGroup as any, undefined, { printerType: "thermal" });
  };

  const isSelectedToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4 pt-2">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/60 p-4 sm:p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/sales">
            <Button variant="outline" size="icon" className="size-9 rounded-xl border-border/80 hover:bg-muted">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                <ShoppingBag className="size-6 text-primary" />
                {isSelectedToday ? (lang === "bn" ? "আজকের বিক্রয় বিবরণ" : "Today's Sales Overview") : (lang === "bn" ? "দৈনিক বিক্রয় বিবরণ" : "Daily Sales Report")}
              </h1>
              {isSelectedToday && (
                <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs px-2 py-0.5 font-bold">
                  LIVE
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "bn"
                ? "আজকের মোট বিক্রয়, শীর্ষ বিক্রীত পণ্য, সময়ভিত্তিক ট্রেন্ড এবং বিস্তারিত ইনভয়েস রিপোর্ট"
                : "Real-time today sales KPIs, best selling products, hourly timeline & invoice logs"}
            </p>
          </div>
        </div>

        {/* Date Selector & Quick Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border/70 rounded-xl px-3 py-1.5 text-xs font-semibold">
            <Calendar className="size-4 text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-semibold cursor-pointer"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => salesQuery.refetch()}
            className="rounded-xl h-9 text-xs gap-1.5 border-border/80"
          >
            <RotateCcw className={`size-3.5 ${salesQuery.isFetching ? "animate-spin" : ""}`} />
            {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
          </Button>
          <Link href="/sales">
            <Button size="sm" className="rounded-xl h-9 text-xs gap-1.5 bg-primary text-primary-foreground font-bold">
              <Receipt className="size-3.5" />
              {lang === "bn" ? "সকল বিক্রয় দেখুন" : "View All Sales"}
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Metric KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3.5 sm:p-4 rounded-2xl border-blue-500/20 bg-blue-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "আজকের মোট বিক্রয়" : "Total Revenue"}</span>
            <DollarSign className="size-4 text-blue-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-blue-600 dark:text-blue-400">
            {fmtMoney(kpis.totalRevenue)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
            <span>{groupedTodaysSales.totalInvoices} {lang === "bn" ? "ইনভয়েস" : "Invoices"}</span>
            <span>•</span>
            <span>{kpis.itemsCount} {lang === "bn" ? "পণ্য" : "items"}</span>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 rounded-2xl border-emerald-500/20 bg-emerald-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "আজকের লাভ" : "Today Profit"}</span>
            <TrendingUp className="size-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">
            {fmtMoney(kpis.profit)}
          </div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
            {lang === "bn" ? `মার্জিন: ${kpis.profitMargin}%` : `Margin: ${kpis.profitMargin}%`}
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 rounded-2xl border-teal-500/20 bg-teal-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "নগদ আদায়" : "Cash Collected"}</span>
            <Banknote className="size-4 text-teal-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-teal-600 dark:text-teal-400">
            {fmtMoney(kpis.cash)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "ক্যাশবক্সে জমা" : "Deposited to cashbox"}
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 rounded-2xl border-pink-500/20 bg-pink-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "বিকাশ / নগদ" : "bKash / Nagad"}</span>
            <CreditCard className="size-4 text-pink-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-pink-600 dark:text-pink-400">
            {fmtMoney(kpis.bkash)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "ডিজিটাল পেমেন্ট" : "Mobile financial"}
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 rounded-2xl border-amber-500/20 bg-amber-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "বাকি বিক্রয়" : "Due / Credit"}</span>
            <Receipt className="size-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">
            {fmtMoney(kpis.credit)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "ক্রেতার খাতা পাওনা" : "Receivable dues"}
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4 rounded-2xl border-purple-500/20 bg-purple-500/5 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="font-semibold">{lang === "bn" ? "মোট ছাড় (Discount)" : "Discounts Given"}</span>
            <DollarSign className="size-4 text-purple-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-purple-600 dark:text-purple-400">
            {fmtMoney(kpis.totalDiscount)}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "ক্রেতাদের মোট ছাড়" : "Discount concession"}
          </div>
        </Card>
      </div>

      {/* ── Top Selling Products Today (WHICH PRODUCTS SOLD MOST) ── */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border/60">
          <div>
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              {lang === "bn" ? "আজকের সর্বাধিক বিক্রীত পণ্য (Top Selling Products Today)" : "Today's Best Selling Products"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "bn"
                ? "আজ কোন পণ্যটি কত পিস বিক্রি হয়েছে, মোট কত টাকা এসেছে এবং কত লাভ হয়েছে বিস্তারিত তালিকা"
                : "Ranked list of products with highest sale volume, revenue and profits today"}
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
            {topSellingProducts.length} {lang === "bn" ? "টি পণ্যের বিক্রি হয়েছে" : "Unique items sold"}
          </Badge>
        </div>

        {topSellingProducts.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground space-y-2">
            <Package className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm font-semibold">{lang === "bn" ? "আজ এখনো কোনো পণ্য বিক্রি হয়নি" : "No products sold today yet"}</p>
            <p className="text-xs">{lang === "bn" ? "পণ্য বিক্রি হলে স্বয়ংক্রিয়ভাবে এখানে তালিকা তৈরি হবে।" : "Product sales will appear here in real-time."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3 w-12 text-center">{lang === "bn" ? "র‌্যাংক" : "Rank"}</th>
                  <th className="py-2.5 px-3">{lang === "bn" ? "পণ্যের নাম ও বিবরণ" : "Product Name & Details"}</th>
                  <th className="py-2.5 px-3 text-center">{lang === "bn" ? "বিক্রীত পরিমাণ" : "Qty Sold"}</th>
                  <th className="py-2.5 px-3 text-right">{lang === "bn" ? "মোট বিক্রি (টাকা)" : "Total Revenue"}</th>
                  <th className="py-2.5 px-3 text-right">{lang === "bn" ? "লাভ (Profit)" : "Profit"}</th>
                  <th className="py-2.5 px-3 text-center">{lang === "bn" ? "বর্তমান স্টক" : "Current Stock"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {topSellingProducts.map((stat, idx) => {
                  const rankBadge =
                    idx === 0
                      ? "bg-amber-500 text-white"
                      : idx === 1
                      ? "bg-slate-400 text-white"
                      : idx === 2
                      ? "bg-amber-700 text-white"
                      : "bg-muted text-foreground";

                  const isLowStock = stat.currentStock <= stat.minStock;

                  return (
                    <tr key={stat.productId} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-flex items-center justify-center size-6 rounded-full text-xs font-black ${rankBadge}`}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          {stat.imageUrl ? (
                            <img
                              src={stat.imageUrl}
                              alt={stat.name}
                              className="size-9 rounded-lg object-cover border border-border"
                            />
                          ) : (
                            <div className="size-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                              <Package className="size-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-foreground text-xs sm:text-sm line-clamp-1">{stat.name}</div>
                            <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                                {stat.category}
                              </Badge>
                              {stat.barcode && <span>Code: {stat.barcode}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-black text-sm text-primary bg-primary/10 px-2.5 py-1 rounded-lg">
                          {stat.qtySold} {lang === "bn" ? "টি" : "pcs"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-xs sm:text-sm text-foreground">
                        {fmtMoney(stat.totalRevenue)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                        +{fmtMoney(stat.profit)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            isLowStock
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {stat.currentStock} {isLowStock ? (lang === "bn" ? "(কম স্টক)" : "(Low)") : (lang === "bn" ? "মজুদ" : "in stock")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Hourly Rush Hour Timeline ── */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/80 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              {lang === "bn" ? "আজকের ঘণ্টাওয়ারি বিক্রয় সময়রেখা (Hourly Rush Hours)" : "Hourly Sales Distribution"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "bn" ? "কোন সময়ে বিক্রির চাপ বেশি ছিল তা একনজরে দেখুন" : "Identify peak sales hours and customer traffic"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-16 gap-2">
          {hourlyStats.hours.map((h, i) => {
            const heightPercent = Math.max(8, Math.round((h.total / hourlyStats.maxTotal) * 100));
            return (
              <div key={i} className="flex flex-col items-center justify-end h-28 bg-muted/30 p-1.5 rounded-xl border border-border/40">
                <div className="text-[10px] font-bold text-foreground text-center line-clamp-1 mb-1">
                  {h.total > 0 ? fmtMoney(h.total) : "—"}
                </div>
                <div
                  style={{ height: `${heightPercent}%` }}
                  className={`w-full rounded-md transition-all ${
                    h.total > 0 ? "bg-primary hover:bg-primary/90" : "bg-muted-foreground/15"
                  }`}
                />
                <div className="text-[9px] text-muted-foreground mt-1.5 font-semibold text-center whitespace-nowrap">
                  {h.hourLabel}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── All Today's Invoices & Sales Log ── */}
      <Card className="p-4 sm:p-5 rounded-2xl border-border/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
          <div>
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-2">
              <Receipt className="size-4 text-primary" />
              {lang === "bn" ? "আজকের ইনভয়েস ও মেমো তালিকা" : "Today's Invoices & Receipts"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {todaysSales.length} {lang === "bn" ? "টি বিক্রয় রেকর্ড পাওয়া গেছে" : "sales transactions recorded today"}
            </p>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-44 sm:w-56">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={lang === "bn" ? "খুঁজুন (পণ্য, ক্রেতা, ফোন)..." : "Search sales..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs rounded-xl"
              />
            </div>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-xl bg-card border border-border font-medium cursor-pointer"
            >
              <option value="all">{lang === "bn" ? "সকল পেমেন্ট" : "All Payments"}</option>
              <option value="cash">{lang === "bn" ? "নগদ (Cash)" : "Cash"}</option>
              <option value="bkash">{lang === "bn" ? "বিকাশ / নগদ" : "bKash"}</option>
              <option value="bank">{lang === "bn" ? "ব্যাংক / কার্ড" : "Bank"}</option>
              <option value="credit">{lang === "bn" ? "বাকি (Credit)" : "Credit"}</option>
              <option value="split">{lang === "bn" ? "স্প্লিট (Split)" : "Split"}</option>
            </select>
          </div>
        </div>

        {filteredSales.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {lang === "bn" ? "কোনো বিক্রয় রেকর্ড পাওয়া যায়নি।" : "No sales match current filter."}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filteredSales.map(sale => {
              const qty = Number(sale.qty) || 1;
              const sellPrice = Number(sale.sell_price) || 0;
              const disc = Number(sale.discount) || 0;
              const total = Math.max(0, (sellPrice * qty) - disc);

              return (
                <div key={sale.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 px-2 rounded-xl transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs shrink-0 mt-0.5">
                      ৳
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-2">
                        <span>{sale.product_name || (lang === "bn" ? "পণ্য" : "Product")}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {sale.category || "General"}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{qty} pcs @ ৳{sellPrice}</span>
                        {disc > 0 && <span className="text-rose-500 font-semibold">(Dis: -৳{disc})</span>}
                        <span>•</span>
                        <span>{sale.customer?.name || (sale.parties as any)?.name || (lang === "bn" ? "সাধারণ ক্রেতা" : "Walk-in Customer")}</span>
                        <span>•</span>
                        <span className="text-[10px]">{fmtDateTime(sale.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center w-full sm:w-auto">
                    <div className="text-right">
                      <div className="font-black text-sm text-foreground">{fmtMoney(total)}</div>
                      <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                        {sale.type || "Cash"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintSale(sale)}
                      className="size-8 p-0 rounded-lg border-border"
                      title={lang === "bn" ? "রসিদ প্রিন্ট করুন" : "Print receipt"}
                    >
                      <Printer className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
