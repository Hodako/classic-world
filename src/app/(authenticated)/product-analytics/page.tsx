"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart2, TrendingUp, TrendingDown, AlertTriangle, Package,
  ShoppingCart, Download, ArrowLeft, Search, Filter,
  Layers, Eye, RefreshCw, ChevronRight, Zap, PieChart as PieChartIcon,
  Clock, Flame, DollarSign, SlidersHorizontal, Printer, Sparkles,
  ArrowUpDown, CheckCircle2, ShieldAlert, Award, Percent
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getProducts, getSales, type Product, type Sale } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { ProductImage } from "@/components/product-image";
import { ProductDialog } from "@/components/product-dialog";
import { SaleDialog } from "@/components/sale-dialog";
import { PurchaseDialog } from "@/components/purchase-dialog";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeRange = "today" | "7d" | "30d" | "this_month" | "all";
type SortOption = "pieces_desc" | "revenue_desc" | "profit_desc" | "velocity_desc" | "stock_asc" | "stock_desc" | "margin_desc";
type ChartTab = "volume_revenue" | "momentum" | "category" | "stock_ratio";

const PIE_COLORS = ["#059669", "#0284c7", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#6366f1"];

export default function ProductAnalyticsPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const { data: products = [], isLoading: productsLoading } = useCachedQuery(["products"], getProducts);
  const { data: sales = [], isLoading: salesLoading } = useCachedQuery(["sales"], getSales);

  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"best_sellers" | "trending" | "critical_stock" | "slow_moving" | "all">("best_sellers");
  const [sortBy, setSortBy] = useState<SortOption>("pieces_desc");
  const [chartTab, setChartTab] = useState<ChartTab>("volume_revenue");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog triggers
  const [saleProduct, setSaleProduct] = useState<string | undefined>();
  const [saleOpen, setSaleOpen] = useState(false);
  const [buyProduct, setBuyProduct] = useState<string | undefined>();
  const [buyOpen, setBuyOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Distinct product categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set);
  }, [products]);

  // Filter sales by date range
  const filteredSales = useMemo(() => {
    const now = new Date();
    return sales.filter((s) => {
      if (s.returned) return false;
      const saleDate = new Date(s.created_at || Date.now());

      if (timeRange === "today") {
        const todayStr = now.toISOString().slice(0, 10);
        return String(s.created_at).slice(0, 10) === todayStr;
      }
      if (timeRange === "7d") {
        const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return saleDate >= cutoff;
      }
      if (timeRange === "30d") {
        const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return saleDate >= cutoff;
      }
      if (timeRange === "this_month") {
        return saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth();
      }
      return true; // all
    });
  }, [sales, timeRange]);

  // Prior period sales for trend/velocity comparison
  const priorPeriodSales = useMemo(() => {
    const now = new Date();
    const days = timeRange === "today" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 30;
    const startPrior = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);
    const endPrior = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return sales.filter((s) => {
      if (s.returned) return false;
      const d = new Date(s.created_at || Date.now());
      return d >= startPrior && d < endPrior;
    });
  }, [sales, timeRange]);

  // Aggregate Product Performance Metrics
  const productMetrics = useMemo(() => {
    const map = new Map<string, {
      product: Product;
      piecesSold: number;
      revenue: number;
      profit: number;
      marginPct: number;
      salesCount: number;
      priorPiecesSold: number;
      velocityGrowth: number;
      lastSaleDate: string | null;
      avgDailySales: number;
    }>();

    // Initialize map with catalog products
    products.forEach((p) => {
      map.set(p.id, {
        product: p,
        piecesSold: 0,
        revenue: 0,
        profit: 0,
        marginPct: 0,
        salesCount: 0,
        priorPiecesSold: 0,
        velocityGrowth: 0,
        lastSaleDate: null,
        avgDailySales: 0,
      });
    });

    // Aggregate Current Period Sales
    filteredSales.forEach((s) => {
      let entry = s.product_id ? map.get(s.product_id) : undefined;
      if (!entry) {
        const matched = products.find((p) => p.name.toLowerCase() === (s.product_name || "").toLowerCase());
        if (matched) entry = map.get(matched.id);
      }

      const qty = Number(s.qty || 1);
      const sellPrice = Number(s.sell_price || 0);
      const profit = Number(s.profit || 0);

      if (entry) {
        entry.piecesSold += qty;
        entry.revenue += sellPrice * qty;
        entry.profit += profit;
        entry.salesCount += 1;
        if (!entry.lastSaleDate || new Date(s.created_at) > new Date(entry.lastSaleDate)) {
          entry.lastSaleDate = s.created_at;
        }
      }
    });

    // Aggregate Prior Period Sales for Growth Rate
    priorPeriodSales.forEach((s) => {
      let entry = s.product_id ? map.get(s.product_id) : undefined;
      if (!entry) {
        const matched = products.find((p) => p.name.toLowerCase() === (s.product_name || "").toLowerCase());
        if (matched) entry = map.get(matched.id);
      }
      if (entry) {
        entry.priorPiecesSold += Number(s.qty || 1);
      }
    });

    // Calculate Velocity, Margins & Daily Run-rate
    const daysInPeriod = timeRange === "today" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 30;
    map.forEach((item) => {
      item.avgDailySales = Number((item.piecesSold / Math.max(1, daysInPeriod)).toFixed(2));
      item.marginPct = item.revenue > 0 ? Number(((item.profit / item.revenue) * 100).toFixed(1)) : 0;

      if (item.priorPiecesSold === 0) {
        item.velocityGrowth = item.piecesSold > 0 ? 100 : 0;
      } else {
        item.velocityGrowth = Number((((item.piecesSold - item.priorPiecesSold) / item.priorPiecesSold) * 100).toFixed(1));
      }
    });

    return Array.from(map.values());
  }, [products, filteredSales, priorPeriodSales, timeRange]);

  // Key KPI Aggregates
  const totalCatalogPiecesSold = useMemo(() => {
    return productMetrics.reduce((acc, p) => acc + p.piecesSold, 0);
  }, [productMetrics]);

  const totalCatalogRevenue = useMemo(() => {
    return productMetrics.reduce((acc, p) => acc + p.revenue, 0);
  }, [productMetrics]);

  const totalCatalogProfit = useMemo(() => {
    return productMetrics.reduce((acc, p) => acc + p.profit, 0);
  }, [productMetrics]);

  const totalCatalogStockUnits = useMemo(() => {
    return products.filter((p) => !p.archived).reduce((acc, p) => acc + Number(p.stock || 0), 0);
  }, [products]);

  const totalStockBuyCost = useMemo(() => {
    return products.filter((p) => !p.archived).reduce((acc, p) => acc + (Number(p.buy_price || 0) * Number(p.stock || 0)), 0);
  }, [products]);

  // Best Selling Products
  const bestSellers = useMemo(() => {
    return [...productMetrics]
      .filter((p) => !p.product.archived && p.piecesSold > 0)
      .sort((a, b) => b.piecesSold - a.piecesSold || b.revenue - a.revenue);
  }, [productMetrics]);

  // Top Trending Products
  const trendingProducts = useMemo(() => {
    return [...productMetrics]
      .filter((p) => !p.product.archived && p.piecesSold > 0)
      .sort((a, b) => b.velocityGrowth - a.velocityGrowth || b.piecesSold - a.piecesSold);
  }, [productMetrics]);

  // Critical & Low Stock Products
  const criticalStockProducts = useMemo(() => {
    return [...productMetrics]
      .filter((p) => {
        if (p.product.archived) return false;
        const minStock = p.product.min_stock ?? 5;
        return Number(p.product.stock || 0) <= minStock;
      })
      .sort((a, b) => (a.product.stock || 0) - (b.product.stock || 0) || b.piecesSold - a.piecesSold);
  }, [productMetrics]);

  // Slow Moving / Dead Stock Products
  const slowMovingProducts = useMemo(() => {
    return [...productMetrics]
      .filter((p) => !p.product.archived && p.product.stock > 0 && p.piecesSold <= 2)
      .sort((a, b) => (b.product.stock * b.product.buy_price) - (a.product.stock * a.product.buy_price));
  }, [productMetrics]);

  const tiedCapitalInSlowStock = useMemo(() => {
    return slowMovingProducts.reduce((acc, p) => acc + (p.product.stock * (p.product.buy_price || 0)), 0);
  }, [slowMovingProducts]);

  // Chart Data: Top 10 Best Sellers (Volume & Revenue)
  const top10BarData = useMemo(() => {
    return bestSellers.slice(0, 10).map((item) => ({
      name: item.product.name.length > (isMobile ? 8 : 14) ? item.product.name.slice(0, isMobile ? 7 : 13) + "…" : item.product.name,
      fullName: item.product.name,
      pieces: item.piecesSold,
      revenue: item.revenue,
      profit: item.profit,
      stock: item.product.stock,
    }));
  }, [bestSellers, isMobile]);

  // Chart Data: Timeline Sales Growth
  const salesTimelineData = useMemo(() => {
    const dayMap = new Map<string, { date: string; pieces: number; revenue: number }>();
    const now = new Date();
    const daysToShow = timeRange === "today" ? 1 : timeRange === "7d" ? 7 : timeRange === "30d" ? 12 : 12;

    for (let i = daysToShow - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { date: key.slice(5), pieces: 0, revenue: 0 });
    }

    filteredSales.forEach((s) => {
      const key = String(s.created_at || "").slice(0, 10);
      if (dayMap.has(key)) {
        const item = dayMap.get(key)!;
        item.pieces += Number(s.qty || 1);
        item.revenue += Number(s.sell_price || 0) * Number(s.qty || 1);
      }
    });

    return Array.from(dayMap.values());
  }, [filteredSales, timeRange]);

  // Chart Data: Category Breakdown
  const categoryPieData = useMemo(() => {
    const catMap = new Map<string, { revenue: number; pieces: number }>();
    productMetrics.forEach((m) => {
      const cat = m.product.category || (lang === "bn" ? "সাধারণ" : "General");
      const current = catMap.get(cat) || { revenue: 0, pieces: 0 };
      current.revenue += m.revenue;
      current.pieces += m.piecesSold;
      catMap.set(cat, current);
    });

    return Array.from(catMap.entries())
      .filter(([_, v]) => v.revenue > 0)
      .map(([name, v]) => ({ name, revenue: v.revenue, pieces: v.pieces }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [productMetrics, lang]);

  // Smart Recommendations
  const smartTips = useMemo(() => {
    const tips: { type: "urgent" | "trending" | "dead_stock" | "opportunity"; text: string }[] = [];

    // 1. Critical fast mover
    const urgentRestock = criticalStockProducts.find((p) => p.piecesSold > 5);
    if (urgentRestock) {
      tips.push({
        type: "urgent",
        text: lang === "bn"
          ? `⚠️ "${urgentRestock.product.name}" দ্রুত বিক্রি হচ্ছে কিন্তু স্টক মাত্র ${urgentRestock.product.stock} টি অবশিষ্ট! অবিলম্বে রি-অর্ডার করুন।`
          : `⚠️ "${urgentRestock.product.name}" is selling fast with only ${urgentRestock.product.stock} left in stock! Restock immediately.`,
      });
    }

    // 2. High trending growth
    if (trendingProducts[0] && trendingProducts[0].velocityGrowth > 30) {
      tips.push({
        type: "trending",
        text: lang === "bn"
          ? `🚀 "${trendingProducts[0].product.name}" পণ্যের বিক্রি +${trendingProducts[0].velocityGrowth}% বৃদ্ধি পেয়েছে!`
          : `🚀 "${trendingProducts[0].product.name}" has surged +${trendingProducts[0].velocityGrowth}% in sales velocity!`,
      });
    }

    // 3. Tied-up dead stock
    if (tiedCapitalInSlowStock > 0 && slowMovingProducts.length > 0) {
      tips.push({
        type: "dead_stock",
        text: lang === "bn"
          ? `💤 ${slowMovingProducts.length} টি অচল পণ্যে প্রায় ${fmtMoney(tiedCapitalInSlowStock)} পুঁজি আটকে আছে। ডিসকাউন্ট বা অফার দিন।`
          : `💤 ${slowMovingProducts.length} slow-moving items hold ${fmtMoney(tiedCapitalInSlowStock)} in tied capital. Consider clearance sales.`,
      });
    }

    return tips;
  }, [criticalStockProducts, trendingProducts, slowMovingProducts, tiedCapitalInSlowStock, lang]);

  // Filtered and Sorted List
  const activeTabList = useMemo(() => {
    let list = productMetrics;
    if (activeTab === "best_sellers") list = bestSellers;
    else if (activeTab === "trending") list = trendingProducts;
    else if (activeTab === "critical_stock") list = criticalStockProducts;
    else if (activeTab === "slow_moving") list = slowMovingProducts;

    // Apply Search and Category Filter
    let filtered = list.filter((item) => {
      if (selectedCategory && item.product.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = item.product.name.toLowerCase().includes(q);
        const matchBarcode = (item.product.barcode || "").toLowerCase().includes(q);
        const matchSku = (item.product.sku || item.product.code || "").toLowerCase().includes(q);
        return matchName || matchBarcode || matchSku;
      }
      return true;
    });

    // Apply Sorting
    return filtered.sort((a, b) => {
      if (sortBy === "pieces_desc") return b.piecesSold - a.piecesSold;
      if (sortBy === "revenue_desc") return b.revenue - a.revenue;
      if (sortBy === "profit_desc") return b.profit - a.profit;
      if (sortBy === "velocity_desc") return b.velocityGrowth - a.velocityGrowth;
      if (sortBy === "stock_asc") return (a.product.stock || 0) - (b.product.stock || 0);
      if (sortBy === "stock_desc") return (b.product.stock || 0) - (a.product.stock || 0);
      if (sortBy === "margin_desc") return b.marginPct - a.marginPct;
      return 0;
    });
  }, [activeTab, productMetrics, bestSellers, trendingProducts, criticalStockProducts, slowMovingProducts, selectedCategory, search, sortBy]);

  const pagedList = useMemo(() => {
    return paginate(activeTabList, page, pageSize);
  }, [activeTabList, page, pageSize]);

  // Refresh queries
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["sales"] }),
    ]);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success(lang === "bn" ? "অ্যানালিটিক্স ডেটা রিফ্রেশ হয়েছে" : "Analytics data refreshed");
    }, 400);
  };

  // Export Analytics to CSV
  const handleExportCsv = () => {
    const rows = activeTabList.map((item, idx) => ({
      "SL": idx + 1,
      "Product Name": item.product.name,
      "Category": item.product.category || "General",
      "Pieces Sold": item.piecesSold,
      "Total Revenue (Tk)": item.revenue,
      "Gross Profit (Tk)": item.profit,
      "Margin (%)": item.marginPct + "%",
      "Remaining Stock": item.product.stock,
      "Buy Price (Tk)": item.product.buy_price,
      "Sell Price (Tk)": item.product.sell_price,
      "Growth Velocity (%)": item.velocityGrowth + "%",
      "Stock Status": item.product.stock <= (item.product.min_stock ?? 5) ? "CRITICAL" : "OK",
    }));

    const headers = Object.keys(rows[0] || {});
    downloadCsv(`Product_Analytics_${exportDateStamp()}.csv`, headers, rows.map(r => Object.values(r)));
    toast.success(lang === "bn" ? "অ্যানালিটিক্স রিপোর্ট CSV ডাউনলোড হয়েছে" : "Product analytics exported to CSV");
  };

  // Print Analytical Report
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 max-w-7xl mx-auto animate-in fade-in duration-200 px-1 sm:px-0 print:p-0 print:m-0">
      {/* ─── Top Header & Controls ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-border/70 pb-3 sm:pb-4 print:hidden">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link href="/products">
            <Button variant="ghost" size="icon" className="rounded-xl size-8 sm:size-9 shrink-0">
              <ArrowLeft className="size-4 sm:size-5 text-muted-foreground" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight flex items-center gap-1.5 sm:gap-2 truncate">
              <BarChart2 className="size-5 sm:size-7 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{lang === "bn" ? "পণ্য অ্যানালিটিক্স ও ইনভেন্টরি ইন্টেলিজেন্স" : "Product Analytics & Intelligence"}</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              {lang === "bn"
                ? "শীর্ষ বিক্রিত, ট্রেন্ডিং প্রবৃদ্ধি, সংকটজনক স্টক এবং অচল ইনভেন্টরি বিশ্লেষণ"
                : "Top sellers, momentum, critical stock alerts, and capital allocation"}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between sm:justify-end flex-wrap gap-2">
          {/* Time Range Pills */}
          <div className="flex items-center bg-muted/60 p-0.5 sm:p-1 rounded-xl border border-border/80 text-[11px] sm:text-xs overflow-x-auto scrollbar-none">
            {(["today", "7d", "30d", "this_month", "all"] as TimeRange[]).map((tr) => (
              <button
                key={tr}
                onClick={() => {
                  setTimeRange(tr);
                  setPage(1);
                }}
                className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                  timeRange === tr
                    ? "bg-card text-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tr === "today"
                  ? lang === "bn" ? "আজ" : "Today"
                  : tr === "7d"
                  ? lang === "bn" ? "৭ দিন" : "7D"
                  : tr === "30d"
                  ? lang === "bn" ? "৩০ দিন" : "30D"
                  : tr === "this_month"
                  ? lang === "bn" ? "এই মাস" : "Month"
                  : lang === "bn" ? "সব" : "All"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              className="rounded-xl text-xs h-8 px-2.5 border-border/80"
              title="Refresh"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrint}
              className="rounded-xl text-xs h-8 px-2.5 border-border/80 hidden sm:flex items-center gap-1"
              title="Print Report"
            >
              <Printer className="size-3.5" />
              <span>{lang === "bn" ? "প্রিন্ট" : "Print"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              className="rounded-xl text-xs h-8 px-2.5 border-border/80"
            >
              <Download className="size-3.5 mr-1" />
              CSV
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Smart AI Recommendations Banner ─────────────────────────────── */}
      {smartTips.length > 0 && (
        <div className="space-y-1.5 print:hidden">
          {smartTips.map((tip, idx) => (
            <div
              key={idx}
              className={`p-2.5 sm:p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
                tip.type === "urgent"
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300"
                  : tip.type === "trending"
                  ? "bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-300"
                  : "bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-300"
              }`}
            >
              <Sparkles className="size-4 shrink-0" />
              <span className="font-medium leading-tight">{tip.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── 5 Interactive KPI Overview Cards (Clean White Style) ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {/* 1. Best Selling Leader */}
        <div
          onClick={() => { setActiveTab("best_sellers"); setPage(1); }}
          className={`p-3 sm:p-4 rounded-xl cursor-pointer transition-all hover:shadow-md bg-white border shadow-sm flex flex-col justify-between ${
            activeTab === "best_sellers"
              ? "border-emerald-500 ring-2 ring-emerald-500/20"
              : "border-slate-200 hover:border-slate-300"
          }`}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#64748B] uppercase tracking-wider truncate">
              {lang === "bn" ? "শীর্ষ বিক্রিত" : "Top Seller"}
            </span>
            <div className="size-6 sm:size-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <Flame className="size-3.5 sm:size-4 text-emerald-600" />
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-[#0F172A] truncate" title={bestSellers[0]?.product.name || "N/A"}>
              {bestSellers[0]?.product.name || (lang === "bn" ? "তথ্য নেই" : "No Sales Yet")}
            </h3>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-bold text-emerald-600">
                {bestSellers[0]?.piecesSold || 0} {lang === "bn" ? "পিস" : "pcs"}
              </span>
            </div>
            <p className="text-[10px] text-[#64748B] truncate">
              {fmtMoney(bestSellers[0]?.revenue || 0)} • {lang === "bn" ? "স্টক:" : "Stock:"} <span className="font-semibold text-[#0F172A]">{bestSellers[0]?.product.stock ?? 0}</span>
            </p>
          </div>
        </div>

        {/* 2. Top Trending */}
        <div
          onClick={() => { setActiveTab("trending"); setPage(1); }}
          className={`p-3 sm:p-4 rounded-xl cursor-pointer transition-all hover:shadow-md bg-white border shadow-sm flex flex-col justify-between ${
            activeTab === "trending"
              ? "border-sky-500 ring-2 ring-sky-500/20"
              : "border-slate-200 hover:border-slate-300"
          }`}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#64748B] uppercase tracking-wider truncate">
              {lang === "bn" ? "ট্রেন্ডিং" : "Trending"}
            </span>
            <div className="size-6 sm:size-7 rounded-lg bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
              <TrendingUp className="size-3.5 sm:size-4 text-sky-600" />
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            <h3 className="text-xs sm:text-sm font-bold text-[#0F172A] truncate" title={trendingProducts[0]?.product.name || "N/A"}>
              {trendingProducts[0]?.product.name || (lang === "bn" ? "তথ্য নেই" : "No Sales Yet")}
            </h3>
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-bold text-sky-600">
                +{trendingProducts[0]?.velocityGrowth || 0}%
              </span>
            </div>
            <p className="text-[10px] text-[#64748B] truncate">
              {trendingProducts[0]?.piecesSold || 0} {lang === "bn" ? "পিস বিক্রি" : "pcs sold"}
            </p>
          </div>
        </div>

        {/* 3. Critical & Low Stock */}
        <div
          onClick={() => { setActiveTab("critical_stock"); setPage(1); }}
          className={`p-3 sm:p-4 rounded-xl cursor-pointer transition-all hover:shadow-md bg-white border shadow-sm flex flex-col justify-between ${
            activeTab === "critical_stock"
              ? "border-amber-500 ring-2 ring-amber-500/20"
              : "border-slate-200 hover:border-slate-300"
          }`}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#64748B] uppercase tracking-wider truncate">
              {lang === "bn" ? "সংকট স্টক" : "Low Stock"}
            </span>
            <div className="size-6 sm:size-7 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-3.5 sm:size-4 text-amber-600" />
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-2xl font-bold text-amber-600">
                {criticalStockProducts.length}
              </span>
              <span className="text-[11px] text-[#64748B]">{lang === "bn" ? "আইটেম" : "items"}</span>
            </div>
            <p className="text-[10px] text-[#64748B] truncate">
              {criticalStockProducts.filter(p => p.product.stock <= 0).length} {lang === "bn" ? "টি শূন্য স্টকে" : "out of stock"}
            </p>
          </div>
        </div>

        {/* 4. Slow Moving */}
        <div
          onClick={() => { setActiveTab("slow_moving"); setPage(1); }}
          className={`p-3 sm:p-4 rounded-xl cursor-pointer transition-all hover:shadow-md bg-white border shadow-sm flex flex-col justify-between ${
            activeTab === "slow_moving"
              ? "border-purple-500 ring-2 ring-purple-500/20"
              : "border-slate-200 hover:border-slate-300"
          }`}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#64748B] uppercase tracking-wider truncate">
              {lang === "bn" ? "অচল স্টক" : "Dead Stock"}
            </span>
            <div className="size-6 sm:size-7 rounded-lg bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shrink-0">
              <Clock className="size-3.5 sm:size-4 text-purple-600" />
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-bold text-purple-600 truncate">
                {fmtMoney(tiedCapitalInSlowStock)}
              </span>
            </div>
            <p className="text-[10px] text-[#64748B] truncate">
              {slowMovingProducts.length} {lang === "bn" ? "টি পণ্যে পুঁজি আবদ্ধ" : "items tied up"}
            </p>
          </div>
        </div>

        {/* 5. Total Sold vs Stock */}
        <div
          onClick={() => { setActiveTab("all"); setPage(1); }}
          className={`col-span-2 sm:col-span-1 p-3 sm:p-4 rounded-xl cursor-pointer transition-all hover:shadow-md bg-white border shadow-sm flex flex-col justify-between ${
            activeTab === "all"
              ? "border-slate-800 ring-2 ring-slate-800/10"
              : "border-slate-200 hover:border-slate-300"
          }`}
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#64748B] uppercase tracking-wider truncate">
              {lang === "bn" ? "বিক্রি ও স্টক" : "Sold / In-Stock"}
            </span>
            <div className="size-6 sm:size-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
              <Package className="size-3.5 sm:size-4 text-emerald-700" />
            </div>
          </div>
          <div className="mt-2 space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span className="text-base sm:text-xl font-bold text-[#0F172A]">
                {totalCatalogPiecesSold}
              </span>
              <span className="text-[11px] text-[#64748B]">
                / {totalCatalogStockUnits} {lang === "bn" ? "পিস" : "pcs"}
              </span>
            </div>
            <p className="text-[10px] text-[#64748B] truncate">
              {lang === "bn" ? "মোট লাভ: " : "Profit: "} <span className="font-semibold text-emerald-600">{fmtMoney(totalCatalogProfit)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ─── Interactive Multi-View Charts Section ───────────────────────── */}
      <Card className="p-4 sm:p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-3 print:border-none print:shadow-none">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold flex items-center gap-1.5">
              <BarChart2 className="size-4 sm:size-5 text-emerald-600" />
              <span>{lang === "bn" ? "ভিজ্যুয়াল চার্ট ও পারফরম্যান্স গ্রাফ" : "Visual Performance Analytics"}</span>
            </h3>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {lang === "bn" ? "বিক্রয়, প্রবৃদ্ধি ও স্টক অনুপাতের তুলনামূলক দৃশ্য" : "Interactive comparative visualization"}
            </p>
          </div>

          {/* Chart View Switcher */}
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 sm:p-1 rounded-xl border border-border/80 text-[11px] sm:text-xs overflow-x-auto scrollbar-none">
            {[
              { id: "volume_revenue", label: lang === "bn" ? "📊 শীর্ষ পণ্য" : "📊 Top Products" },
              { id: "momentum", label: lang === "bn" ? "📈 বিক্রির ট্রেন্ড" : "📈 Sales Trend" },
              { id: "category", label: lang === "bn" ? "🥧 ক্যাটাগরি" : "🥧 Categories" },
            ].map((c) => (
              <button
                key={c.id}
                onClick={() => setChartTab(c.id as any)}
                className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all ${
                  chartTab === c.id
                    ? "bg-card text-foreground shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart View 1: Top 10 Best Sellers */}
        {chartTab === "volume_revenue" && (
          <div className="h-60 sm:h-72 w-full pt-2">
            {top10BarData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                <Package className="size-7 mb-2 opacity-40" />
                {lang === "bn" ? "কোনো বিক্রয় নেই" : "No sales in selected timeframe"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top10BarData} margin={{ top: 10, right: 5, left: -25, bottom: isMobile ? 35 : 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="left" orientation="left" stroke="#059669" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#0284c7" tick={{ fontSize: 9 }} />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      name === "pieces" ? `${val} pcs` : fmtMoney(val),
                      name === "pieces" ? (lang === "bn" ? "বিক্রিত পিস" : "Pieces Sold") : (lang === "bn" ? "মোট রাজস্ব" : "Total Revenue"),
                    ]}
                    contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.85)", borderRadius: "10px", border: "none", color: "#fff", fontSize: "11px" }}
                  />
                  <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: "10px" }} />
                  <Bar yAxisId="left" dataKey="pieces" name={lang === "bn" ? "বিক্রিত পিস" : "Pieces"} fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="revenue" name={lang === "bn" ? "রাজস্ব (৳)" : "Revenue"} fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Chart View 2: Sales Timeline Trend */}
        {chartTab === "momentum" && (
          <div className="h-60 sm:h-72 w-full pt-2">
            {salesTimelineData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                <TrendingUp className="size-7 mb-2 opacity-40" />
                {lang === "bn" ? "কোনো টাইমলাইন ডেটা নেই" : "No timeline data"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTimelineData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPieces" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip
                    formatter={(val: any) => [`${val} pcs`, lang === "bn" ? "বিক্রিত সংখ্যা" : "Units Sold"]}
                    contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.85)", borderRadius: "10px", border: "none", color: "#fff", fontSize: "11px" }}
                  />
                  <Area type="monotone" dataKey="pieces" stroke="#0284c7" strokeWidth={2.5} fillOpacity={1} fill="url(#colorPieces)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Chart View 3: Category Revenue Breakdown */}
        {chartTab === "category" && (
          <div className="h-60 sm:h-72 w-full pt-2">
            {categoryPieData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                <PieChartIcon className="size-7 mb-2 opacity-40" />
                {lang === "bn" ? "কোনো ক্যাটাগরি ডেটা নেই" : "No category sales data"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={isMobile ? 45 : 60}
                    outerRadius={isMobile ? 75 : 95}
                    paddingAngle={3}
                    dataKey="revenue"
                    nameKey="name"
                  >
                    {categoryPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [fmtMoney(val), lang === "bn" ? "মোট রাজস্ব" : "Total Revenue"]}
                    contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.85)", borderRadius: "10px", border: "none", color: "#fff", fontSize: "11px" }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </Card>

      {/* ─── Segmented Analytics Tabs, Filter & Mobile Cards/Desktop Table ─── */}
      <Card className="p-3 sm:p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4 print:border-none print:shadow-none">
        {/* Controls: Tabs, Search & Sorter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/60 pb-3 print:hidden">
          {/* Scrollable Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "best_sellers", label: lang === "bn" ? "🏆 সেরা বিক্রি" : "🏆 Best Sellers" },
              { id: "trending", label: lang === "bn" ? "🚀 ট্রেন্ডিং" : "🚀 Trending" },
              { id: "critical_stock", label: lang === "bn" ? "⚠️ সংকট স্টক" : "⚠️ Low Stock", badge: criticalStockProducts.length },
              { id: "slow_moving", label: lang === "bn" ? "💤 কম বিক্রি" : "💤 Slow Moving" },
              { id: "all", label: lang === "bn" ? "📊 সব পণ্য" : "📊 All Products" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge && tab.badge > 0 && (
                  <span className="size-1.5 bg-amber-400 rounded-full shrink-0" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search Input */}
            <div className="relative w-full sm:w-56 md:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                style={{ paddingLeft: "2rem" }}
                className="h-8 text-xs rounded-xl"
                placeholder={lang === "bn" ? "নাম বা বারকোড দিয়ে খুঁজুন..." : "Search name or barcode..."}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Sort Selector */}
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v as SortOption); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-[130px] rounded-xl shrink-0">
                <ArrowUpDown className="size-3 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="pieces_desc">{lang === "bn" ? "বিক্রিত পিস (বেশি)" : "Units Sold ↓"}</SelectItem>
                <SelectItem value="revenue_desc">{lang === "bn" ? "মোট রাজস্ব (বেশি)" : "Revenue ↓"}</SelectItem>
                <SelectItem value="profit_desc">{lang === "bn" ? "লাভ (বেশি)" : "Profit ↓"}</SelectItem>
                <SelectItem value="margin_desc">{lang === "bn" ? "মার্জিন % (বেশি)" : "Margin % ↓"}</SelectItem>
                <SelectItem value="velocity_desc">{lang === "bn" ? "প্রবৃদ্ধি গতি (বেশি)" : "Growth Rate ↓"}</SelectItem>
                <SelectItem value="stock_asc">{lang === "bn" ? "স্টক (কম)" : "Stock (Low) ↑"}</SelectItem>
                <SelectItem value="stock_desc">{lang === "bn" ? "স্টক (বেশি)" : "Stock (High) ↓"}</SelectItem>
              </SelectContent>
            </Select>

            {/* Page Size Selector */}
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-[75px] rounded-xl shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="10">10 / pg</SelectItem>
                <SelectItem value="25">25 / pg</SelectItem>
                <SelectItem value="50">50 / pg</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category Pills Filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-nowrap scrollbar-none print:hidden">
            <Button
              size="sm"
              variant={selectedCategory === null ? "default" : "outline"}
              className="h-6 text-[10px] rounded-full shrink-0 px-2.5"
              onClick={() => { setSelectedCategory(null); setPage(1); }}
            >
              {t("all")}
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? "default" : "outline"}
                className="h-6 text-[10px] rounded-full shrink-0 px-2.5"
                onClick={() => { setSelectedCategory(cat); setPage(1); }}
              >
                {cat}
              </Button>
            ))}
          </div>
        )}

        {/* Item Counter & Summary */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground print:hidden">
          <span>
            {lang === "bn"
              ? `মোট ${activeTabList.length} টির মধ্যে ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, activeTabList.length)} দেখানো হচ্ছে`
              : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, activeTabList.length)} of ${activeTabList.length} products`}
          </span>
          {activeTabList.length > 0 && (
            <span className="font-semibold text-foreground">
              {lang === "bn" ? "পৃষ্ঠা:" : "Page:"} {page} / {pagedList.totalPages}
            </span>
          )}
        </div>

        {/* ─── Product Analytics List ─── */}
        {pagedList.items.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2 text-muted-foreground">
            <Package className="size-10 opacity-40" />
            <p className="text-sm font-semibold">{lang === "bn" ? "কোনো পণ্য পাওয়া যায়নি" : "No matching products found"}</p>
            <p className="text-xs">{lang === "bn" ? "ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন" : "Try adjusting your filters"}</p>
          </div>
        ) : (
          <>
            {/* ── Mobile Cards View (Visible on Phone Screens) ── */}
            <div className="grid grid-cols-1 gap-3 sm:hidden">
              {pagedList.items.map((item, idx) => {
                const p = item.product;
                const rank = (page - 1) * pageSize + idx + 1;
                const isCritical = (p.stock || 0) <= (p.min_stock ?? 5);
                const isOutOfStock = (p.stock || 0) <= 0;
                const totalLifecycleUnits = item.piecesSold + (p.stock || 0);
                const soldProgress = totalLifecycleUnits > 0 ? Math.round((item.piecesSold / totalLifecycleUnits) * 100) : 0;

                return (
                  <Card key={p.id} className="p-3.5 rounded-2xl bg-card border-border/80 space-y-2.5 shadow-2xs">
                    {/* Header: Rank + Image + Product Details */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Rank Badge */}
                        <div className="flex flex-col items-center justify-center">
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            rank === 1 ? "bg-amber-500 text-white" : rank === 2 ? "bg-slate-400 text-white" : rank === 3 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"
                          }`}>
                            #{rank}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div
                          className="size-12 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60 cursor-pointer"
                          onClick={() => {
                            setEditingProduct(p);
                            setEditOpen(true);
                          }}
                        >
                          <ProductImage path={p.image_url} className="w-full h-full object-cover" />
                        </div>

                        {/* Title & Category */}
                        <div className="min-w-0 flex-1">
                          <h4
                            className="font-bold text-xs text-foreground truncate cursor-pointer hover:underline"
                            title={p.name}
                            onClick={() => {
                              setEditingProduct(p);
                              setEditOpen(true);
                            }}
                          >
                            {p.name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                            <span>{p.category || "General"}</span>
                            <span>•</span>
                            <span className="font-semibold text-foreground">{fmtMoney(p.sell_price)}</span>
                          </div>

                          {/* Badges */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {isOutOfStock ? (
                              <Badge variant="destructive" className="text-[9px] py-0 px-1.5">
                                {lang === "bn" ? "স্টক শেষ" : "Out of Stock"}
                              </Badge>
                            ) : isCritical ? (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-amber-500/10 text-amber-600 border-amber-500/30">
                                {lang === "bn" ? "সংকটজনক" : "Low Stock"}
                              </Badge>
                            ) : item.piecesSold === 0 ? (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-purple-500/10 text-purple-600 border-purple-500/30">
                                {lang === "bn" ? "অচল" : "Slow"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                                {lang === "bn" ? "স্বাভাবিক" : "Healthy"}
                              </Badge>
                            )}

                            {item.marginPct > 0 && (
                              <span className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                                {item.marginPct}% {lang === "bn" ? "মার্জিন" : "margin"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar: Sold vs Remaining Stock */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{lang === "bn" ? "বিক্রয় হার" : "Sell-through"}: <strong className="text-foreground">{soldProgress}%</strong></span>
                        <span>{item.piecesSold} / {totalLifecycleUnits} {lang === "bn" ? "পিস" : "pcs"}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div style={{ width: `${soldProgress}%` }} className="bg-emerald-600 h-full rounded-full transition-all" />
                      </div>
                    </div>

                    {/* 3-Column Key Numbers Grid */}
                    <div className="grid grid-cols-3 gap-1.5 p-2 bg-muted/40 rounded-xl text-[11px] text-center border border-border/50">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "বিক্রি" : "Sold"}</span>
                        <span className="font-extrabold text-foreground">{item.piecesSold} pcs</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "রাজস্ব" : "Revenue"}</span>
                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmtMoney(item.revenue)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">{lang === "bn" ? "অবশিষ্ট" : "Stock"}</span>
                        <span className={`font-extrabold ${isOutOfStock ? "text-destructive" : isCritical ? "text-amber-600" : "text-foreground"}`}>
                          {p.stock ?? 0} pcs
                        </span>
                      </div>
                    </div>

                    {/* Touch Action Buttons */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1 rounded-xl font-bold text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10"
                        onClick={() => {
                          setSaleProduct(p.id);
                          setSaleOpen(true);
                        }}
                        disabled={p.stock <= 0}
                      >
                        <ShoppingCart className="size-3 mr-1" />
                        {t("sell")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs flex-1 rounded-xl font-bold text-sky-600 border-sky-500/40 hover:bg-sky-500/10"
                        onClick={() => {
                          setBuyProduct(p.id);
                          setBuyOpen(true);
                        }}
                      >
                        <Package className="size-3 mr-1" />
                        {t("buy")}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* ── Desktop Tabular View (Visible on PC Screens) ── */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/80 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">{lang === "bn" ? "পণ্য" : "Product"}</th>
                    <th className="py-2.5 px-3 text-center">{lang === "bn" ? "বিক্রিত পিস" : "Pieces Sold"}</th>
                    <th className="py-2.5 px-3 text-right">{lang === "bn" ? "মোট রাজস্ব" : "Total Revenue"}</th>
                    <th className="py-2.5 px-3 text-right">{lang === "bn" ? "অর্জিত লাভ (মার্জিন)" : "Profit (Margin)"}</th>
                    <th className="py-2.5 px-3 text-center">{lang === "bn" ? "অবশিষ্ট স্টক" : "Stock Left"}</th>
                    <th className="py-2.5 px-3 text-center">{lang === "bn" ? "দৈনিক রান রেট" : "Daily Pace"}</th>
                    <th className="py-2.5 px-3 text-center">{lang === "bn" ? "স্টক স্ট্যাটাস" : "Status"}</th>
                    <th className="py-2.5 px-3 text-right print:hidden">{lang === "bn" ? "একশন" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pagedList.items.map((item, idx) => {
                    const p = item.product;
                    const rank = (page - 1) * pageSize + idx + 1;
                    const isCritical = (p.stock || 0) <= (p.min_stock ?? 5);
                    const isOutOfStock = (p.stock || 0) <= 0;
                    const daysLeft = item.avgDailySales > 0 ? Math.floor((p.stock || 0) / item.avgDailySales) : 999;
                    const totalLifecycleUnits = item.piecesSold + (p.stock || 0);
                    const soldProgress = totalLifecycleUnits > 0 ? Math.round((item.piecesSold / totalLifecycleUnits) * 100) : 0;

                    return (
                      <tr key={p.id} className="hover:bg-muted/40 transition-colors group">
                        {/* Rank Badge */}
                        <td className="py-2.5 px-3 font-mono font-bold text-muted-foreground text-center">
                          {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                        </td>

                        {/* Product Thumbnail & Details */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="size-10 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60 cursor-pointer"
                              onClick={() => {
                                setEditingProduct(p);
                                setEditOpen(true);
                              }}
                            >
                              <ProductImage path={p.image_url} className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                              <div
                                className="font-bold text-foreground truncate max-w-[200px] lg:max-w-[260px] cursor-pointer hover:underline"
                                title={p.name}
                                onClick={() => {
                                setEditingProduct(p);
                                setEditOpen(true);
                              }}
                              >
                                {p.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                {p.category && <span className="bg-muted px-1.5 py-0.2 rounded">{p.category}</span>}
                                <span>{fmtMoney(p.sell_price)} / pc</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pieces Sold & Progress */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1 font-extrabold text-sm text-foreground">
                            {item.piecesSold}
                            <span className="text-[10px] text-muted-foreground font-normal">{lang === "bn" ? "টি" : "pcs"}</span>
                          </div>
                          <div className="w-20 mx-auto mt-0.5">
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden flex">
                              <div style={{ width: `${soldProgress}%` }} className="bg-emerald-600 h-full rounded-full" />
                            </div>
                          </div>
                          {item.velocityGrowth > 0 && (
                            <div className="text-[9px] text-emerald-600 font-semibold flex items-center justify-center gap-0.5 mt-0.5">
                              <TrendingUp className="size-2.5" /> +{item.velocityGrowth}%
                            </div>
                          )}
                        </td>

                        {/* Revenue */}
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(item.revenue)}
                        </td>

                        {/* Profit & Margin */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="font-semibold text-foreground">{fmtMoney(item.profit)}</div>
                          {item.marginPct > 0 && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              ({item.marginPct}%)
                            </div>
                          )}
                        </td>

                        {/* Remaining Stock */}
                        <td className="py-2.5 px-3 text-center">
                          <div className={`font-bold text-xs ${isOutOfStock ? "text-destructive" : isCritical ? "text-amber-600" : "text-foreground"}`}>
                            {p.stock ?? 0} {lang === "bn" ? "পিস" : "pcs"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {lang === "bn" ? "কেনা:" : "Buy:"} {fmtMoney(p.buy_price || 0)}
                          </div>
                        </td>

                        {/* Daily Sales Pace */}
                        <td className="py-2.5 px-3 text-center">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {item.avgDailySales} / {lang === "bn" ? "দিন" : "day"}
                          </span>
                          {item.avgDailySales > 0 && p.stock > 0 && daysLeft < 30 && (
                            <div className="text-[9px] text-amber-600 font-bold">
                              ~{daysLeft} {lang === "bn" ? "দিনের স্টক" : "days left"}
                            </div>
                          )}
                        </td>

                        {/* Stock Health Badge */}
                        <td className="py-2.5 px-3 text-center">
                          {isOutOfStock ? (
                            <Badge variant="destructive" className="text-[10px] py-0 px-2">
                              {lang === "bn" ? "স্টক শেষ" : "Out of Stock"}
                            </Badge>
                          ) : isCritical ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-2 bg-amber-500/10 text-amber-600 border-amber-500/30">
                              {lang === "bn" ? "সংকটজনক" : "Low Stock"}
                            </Badge>
                          ) : item.piecesSold === 0 ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-2 bg-purple-500/10 text-purple-600 border-purple-500/30">
                              {lang === "bn" ? "অচল স্টক" : "Slow Moving"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] py-0 px-2 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                              {lang === "bn" ? "স্বাভাবিক" : "Healthy"}
                            </Badge>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3 text-right print:hidden">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2 rounded-lg text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                              onClick={() => {
                                setSaleProduct(p.id);
                                setSaleOpen(true);
                              }}
                              disabled={p.stock <= 0}
                            >
                              {t("sell")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2 rounded-lg text-sky-600 border-sky-500/30 hover:bg-sky-500/10"
                              onClick={() => {
                                setBuyProduct(p.id);
                                setBuyOpen(true);
                              }}
                            >
                              {t("buy")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination Bar */}
        {pagedList.totalPages > 1 && (
          <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 print:hidden">
            <span className="text-xs text-muted-foreground">
              {lang === "bn"
                ? `মোট ${activeTabList.length} টির মধ্যে পৃষ্ঠা ${page} (প্রতি পৃষ্ঠায় ${pageSize} টি)`
                : `Page ${page} of ${pagedList.totalPages} (${activeTabList.length} items)`}
            </span>
            <PaginationBar
              page={page}
              totalPages={pagedList.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>

      {/* Sale Dialog */}
      <SaleDialog
        open={saleOpen}
        onOpenChange={setSaleOpen}
        presetProductId={saleProduct}
      />

      {/* Buy / Purchase Dialog */}
      <PurchaseDialog
        open={buyOpen}
        onOpenChange={setBuyOpen}
        presetProductId={buyProduct}
      />

      {/* Product Edit Dialog */}
      <ProductDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        product={editingProduct}
      />
    </div>
  );
}
