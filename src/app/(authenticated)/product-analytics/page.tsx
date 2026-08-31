"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  BarChart2, TrendingUp, TrendingDown, AlertTriangle, Package,
  ShoppingCart, Download, ArrowLeft, Search, Filter,
  Layers, Eye, RefreshCw, ChevronRight, Zap, PieChart as PieChartIcon,
  Clock, Flame, DollarSign, SlidersHorizontal, Printer, Sparkles,
  ArrowUpDown, CheckCircle2, ShieldAlert, Award, Percent,
  Scan, QrCode, Calculator, CheckCheck, Volume2, VolumeX, Plus, Minus, Trash2, FileSpreadsheet, RotateCcw
} from "lucide-react";
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
import { BarcodeScannerDialog, playBarcodeBeep } from "@/components/barcode-scanner-dialog";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type TimeRange = "today" | "7d" | "30d" | "this_month" | "all";
type SortOption = "pieces_desc" | "revenue_desc" | "profit_desc" | "velocity_desc" | "stock_asc" | "stock_desc" | "margin_desc";
type ActiveTab = "stock_scanner" | "best_sellers" | "trending" | "critical_stock" | "slow_moving" | "all";

interface ScannedAuditItem {
  id: string;
  product: Product;
  scannedQty: number;
  lastScannedAt: number;
}

export default function ProductAnalyticsPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const qc = useQueryClient();

  const { data: products = [], isLoading: productsLoading } = useCachedQuery(["products"], getProducts);
  const { data: sales = [], isLoading: salesLoading } = useCachedQuery(["sales"], getSales);

  const [timeRange, setTimeRange] = useState<TimeRange>("30d");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("stock_scanner");
  const [sortBy, setSortBy] = useState<SortOption>("pieces_desc");
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

  // -------------------------------------------------------------
  // Stock Audit Scanner & Live Calculator State
  // -------------------------------------------------------------
  const [scannedAuditItems, setScannedAuditItems] = useState<ScannedAuditItem[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [continuousScan, setContinuousScan] = useState(true);
  const [manualBarcodeInput, setManualBarcodeInput] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [auditSearchQuery, setAuditSearchQuery] = useState("");
  const [lastScannedProduct, setLastScannedProduct] = useState<{
    product: Product;
    qty: number;
    timestamp: number;
  } | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input when scanner tab is opened
  useEffect(() => {
    if (activeTab === "stock_scanner" && !scannerOpen) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 150);
    }
  }, [activeTab, scannerOpen]);

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
        const d7 = new Date(now.getTime() - 7 * 86400000);
        return saleDate >= d7;
      }
      if (timeRange === "30d") {
        const d30 = new Date(now.getTime() - 30 * 86400000);
        return saleDate >= d30;
      }
      if (timeRange === "this_month") {
        return (
          saleDate.getFullYear() === now.getFullYear() &&
          saleDate.getMonth() === now.getMonth()
        );
      }
      return true; // "all"
    });
  }, [sales, timeRange]);

  // Map product metrics: total pieces sold, revenue, profit, velocity
  const productMetrics = useMemo(() => {
    const map = new Map<string, { pieces: number; revenue: number; profit: number }>();

    filteredSales.forEach((sale) => {
      const pId = sale.product_id;
      if (!pId) return;

      const qty = Number(sale.qty) || 0;
      const sellPrice = Number(sale.sell_price) || 0;
      const profit = Number(sale.profit) || (sellPrice - (Number(sale.buy_price) || 0)) * qty;
      const rev = sellPrice * qty;

      const cur = map.get(pId) || { pieces: 0, revenue: 0, profit: 0 };
      map.set(pId, {
        pieces: cur.pieces + qty,
        revenue: cur.revenue + rev,
        profit: cur.profit + profit,
      });
    });

    return map;
  }, [filteredSales]);

  // Enhanced product list with computed analytics
  const analyticsProducts = useMemo(() => {
    return products.map((product) => {
      const stats = productMetrics.get(product.id) || { pieces: 0, revenue: 0, profit: 0 };
      const currentStock = Number(product.stock) || 0;
      const minStock = Number(product.min_stock) || 5;
      const buyPrice = Number(product.buy_price) || 0;
      const sellPrice = Number(product.sell_price) || 0;
      const margin = sellPrice > 0 ? ((sellPrice - buyPrice) / sellPrice) * 100 : 0;
      const stockCostValuation = currentStock * buyPrice;
      const stockSaleValuation = currentStock * sellPrice;

      // Velocity: Sold pieces vs current stock ratio
      const velocity = currentStock > 0 ? (stats.pieces / (currentStock + stats.pieces)) * 100 : stats.pieces > 0 ? 100 : 0;

      // Critical stock status
      const isOut = currentStock <= 0;
      const isLow = !isOut && currentStock <= minStock;
      const isHealthy = !isOut && !isLow;

      return {
        product,
        soldPieces: stats.pieces,
        revenue: stats.revenue,
        profit: stats.profit,
        margin,
        velocity,
        currentStock,
        minStock,
        isOut,
        isLow,
        isHealthy,
        stockCostValuation,
        stockSaleValuation,
      };
    });
  }, [products, productMetrics]);

  // Overall aggregate KPIs
  const totalValuationCost = useMemo(() => {
    return analyticsProducts.reduce((acc, p) => acc + p.stockCostValuation, 0);
  }, [analyticsProducts]);

  const totalValuationSale = useMemo(() => {
    return analyticsProducts.reduce((acc, p) => acc + p.stockSaleValuation, 0);
  }, [analyticsProducts]);

  const totalStoreStock = useMemo(() => {
    return products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
  }, [products]);

  // -------------------------------------------------------------
  // Live Stock Audit Scanner & Calculator Logic
  // -------------------------------------------------------------
  const handleScanOrAddProduct = (barcodeOrId: string) => {
    const rawQuery = barcodeOrId.trim();
    if (!rawQuery) return;
    const query = rawQuery.toLowerCase();
    const strippedQuery = query.replace(/^0+/, "");

    const found = products.find(
      (p) =>
        p.id?.toLowerCase() === query ||
        (p.barcode && p.barcode.toLowerCase() === query) ||
        (strippedQuery && p.barcode && p.barcode.replace(/^0+/, "").toLowerCase() === strippedQuery) ||
        (p.sku && p.sku.toLowerCase() === query) ||
        p.name.toLowerCase() === query
    );

    if (!found) {
      toast.error(
        lang === "bn"
          ? `বারকোড বা আইডি "${rawQuery}" দ্বারা পণ্য পাওয়া যায়নি!`
          : `No product found for code "${rawQuery}"!`,
        { duration: 2500 }
      );
      return;
    }

    // Play crisp scan beep sound
    if (soundEnabled) {
      try {
        playBarcodeBeep();
      } catch (e) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch (err) {}
      }
    }

    setScannedAuditItems((prev) => {
      const idx = prev.findIndex((item) => item.id === found.id);
      if (idx >= 0) {
        const next = [...prev];
        const newQty = next[idx].scannedQty + 1;
        next[idx] = {
          ...next[idx],
          scannedQty: newQty,
          lastScannedAt: Date.now(),
        };
        setLastScannedProduct({ product: found, qty: newQty, timestamp: Date.now() });
        return next;
      } else {
        const newItem: ScannedAuditItem = {
          id: found.id,
          product: found,
          scannedQty: 1,
          lastScannedAt: Date.now(),
        };
        setLastScannedProduct({ product: found, qty: 1, timestamp: Date.now() });
        return [newItem, ...prev];
      }
    });

    const buyPrice = Number(found.buy_price) || 0;
    const sellPrice = Number(found.sell_price) || 0;

    toast.success(
      lang === "bn"
        ? `যুক্ত হয়েছে: ${found.name} (কেনা ${fmtMoney(buyPrice)} | বিক্রি ${fmtMoney(sellPrice)})`
        : `Added: ${found.name} (Cost ${fmtMoney(buyPrice)} | Retail ${fmtMoney(sellPrice)})`,
      { duration: 1200 }
    );

    setManualBarcodeInput("");
  };

  const handleAdjustScannedQty = (id: string, delta: number) => {
    setScannedAuditItems((prev) => {
      return prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.scannedQty + delta;
            return nextQty > 0 ? { ...item, scannedQty: nextQty, lastScannedAt: Date.now() } : null;
          }
          return item;
        })
        .filter(Boolean) as ScannedAuditItem[];
    });
  };

  const handleSetScannedQty = (id: string, qty: number) => {
    const validQty = Math.max(0, qty);
    setScannedAuditItems((prev) => {
      if (validQty === 0) {
        return prev.filter((item) => item.id !== id);
      }
      return prev.map((item) =>
        item.id === id ? { ...item, scannedQty: validQty, lastScannedAt: Date.now() } : item
      );
    });
  };

  const handleRemoveScannedItem = (id: string) => {
    setScannedAuditItems((prev) => prev.filter((item) => item.id !== id));
    toast.info(lang === "bn" ? "পণ্যটি অডিট তালিকা থেকে সরানো হয়েছে" : "Item removed from audit list");
  };

  const handleClearAudit = () => {
    if (scannedAuditItems.length === 0) return;
    if (confirm(lang === "bn" ? "আপনি কি নিশ্চিতভাবে সম্পূর্ণ অডিট ক্যালকুলেটর রিসেট করতে চান?" : "Are you sure you want to reset the entire audit calculator?")) {
      setScannedAuditItems([]);
      setLastScannedProduct(null);
      toast.info(lang === "bn" ? "অডিট ক্যালকুলেটর খালি করা হয়েছে" : "Audit calculator cleared");
    }
  };

  // Live Scanned Audit Calculations
  const auditCalculations = useMemo(() => {
    let totalPieces = 0;
    let totalCostValuation = 0;
    let totalSaleValuation = 0;
    let totalSystemStockOfScanned = 0;
    let totalSystemCostOfScanned = 0;
    let totalSystemSaleOfScanned = 0;

    scannedAuditItems.forEach((item) => {
      const q = item.scannedQty;
      const sysStock = Number(item.product.stock) || 0;
      const buyPrice = Number(item.product.buy_price) || 0;
      const sellPrice = Number(item.product.sell_price) || 0;

      totalPieces += q;
      totalCostValuation += q * buyPrice;
      totalSaleValuation += q * sellPrice;

      totalSystemStockOfScanned += sysStock;
      totalSystemCostOfScanned += sysStock * buyPrice;
      totalSystemSaleOfScanned += sysStock * sellPrice;
    });

    const piecesDifference = totalPieces - totalSystemStockOfScanned;
    const costDifference = totalCostValuation - totalSystemCostOfScanned;
    const saleDifference = totalSaleValuation - totalSystemSaleOfScanned;

    return {
      totalPieces,
      totalCostValuation,
      totalSaleValuation,
      totalSystemStockOfScanned,
      totalSystemCostOfScanned,
      totalSystemSaleOfScanned,
      piecesDifference,
      costDifference,
      saleDifference,
      uniqueItemCount: scannedAuditItems.length,
    };
  }, [scannedAuditItems]);

  // Export Scanned Audit to CSV
  const handleExportAuditCsv = () => {
    if (scannedAuditItems.length === 0) {
      toast.error(lang === "bn" ? "এক্সপোর্ট করার মতো কোনো স্ক্যানকৃত পণ্য নেই!" : "No scanned items to export!");
      return;
    }

    const rows = scannedAuditItems.map((item, idx) => {
      const p = item.product;
      const buy = Number(p.buy_price) || 0;
      const sell = Number(p.sell_price) || 0;
      const sysStock = Number(p.stock) || 0;
      const scannedQty = item.scannedQty;
      const diffQty = scannedQty - sysStock;
      const totalCost = scannedQty * buy;
      const totalSell = scannedQty * sell;
      const status = diffQty === 0 ? "Matched" : diffQty > 0 ? `Surplus (+${diffQty})` : `Shortage (${diffQty})`;

      return {
        "SL": idx + 1,
        "Product Name": p.name,
        "Barcode": p.barcode || "",
        "SKU": p.sku || "",
        "Category": p.category || "",
        "Unit Cost Price (BDT)": buy,
        "Unit Retail Price (BDT)": sell,
        "Scanned Physical Qty": scannedQty,
        "System Expected Stock": sysStock,
        "Quantity Variance": diffQty,
        "Physical Cost Worth (BDT)": totalCost,
        "Physical Retail Worth (BDT)": totalSell,
        "Audit Status": status,
      };
    });

    downloadCsv(`Stock_Audit_Valuation_${exportDateStamp()}`, rows);
    toast.success(lang === "bn" ? "অডিট রিপোর্ট CSV ডাউনলোড হয়েছে" : "Audit report CSV downloaded");
  };

  // Filtered Scanned Items for in-table search
  const filteredAuditItems = useMemo(() => {
    if (!auditSearchQuery.trim()) return scannedAuditItems;
    const q = auditSearchQuery.toLowerCase();
    return scannedAuditItems.filter((item) => {
      const p = item.product;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [scannedAuditItems, auditSearchQuery]);

  // Tab Filtering & Sorting for Analytics Tabs
  const filteredProducts = useMemo(() => {
    let list = [...analyticsProducts];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (item) =>
          item.product.name.toLowerCase().includes(q) ||
          (item.product.barcode && item.product.barcode.toLowerCase().includes(q)) ||
          (item.product.sku && item.product.sku.toLowerCase().includes(q))
      );
    }

    if (selectedCategory) {
      list = list.filter((item) => item.product.category === selectedCategory);
    }

    if (activeTab === "best_sellers") {
      list = list.filter((item) => item.soldPieces > 0);
      list.sort((a, b) => b.soldPieces - a.soldPieces);
    } else if (activeTab === "trending") {
      list = list.filter((item) => item.velocity > 0);
      list.sort((a, b) => b.velocity - a.velocity);
    } else if (activeTab === "critical_stock") {
      list = list.filter((item) => item.isLow || item.isOut);
      list.sort((a, b) => a.currentStock - b.currentStock);
    } else if (activeTab === "slow_moving") {
      list = list.filter((item) => item.soldPieces === 0 && item.currentStock > 0);
      list.sort((a, b) => b.currentStock - a.currentStock);
    } else if (activeTab === "all") {
      if (sortBy === "pieces_desc") list.sort((a, b) => b.soldPieces - a.soldPieces);
      else if (sortBy === "revenue_desc") list.sort((a, b) => b.revenue - a.revenue);
      else if (sortBy === "profit_desc") list.sort((a, b) => b.profit - a.profit);
      else if (sortBy === "velocity_desc") list.sort((a, b) => b.velocity - a.velocity);
      else if (sortBy === "stock_asc") list.sort((a, b) => a.currentStock - b.currentStock);
      else if (sortBy === "stock_desc") list.sort((a, b) => b.currentStock - a.currentStock);
      else if (sortBy === "margin_desc") list.sort((a, b) => b.margin - a.margin);
    }

    return list;
  }, [analyticsProducts, search, selectedCategory, activeTab, sortBy]);

  const pagedResult = useMemo(() => {
    return paginate(filteredProducts, page, pageSize);
  }, [filteredProducts, page, pageSize]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b px-4 py-3 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="size-9 rounded-full">
                <ArrowLeft className="size-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
                  <BarChart2 className="size-6 text-primary" />
                  {lang === "bn" ? "পণ্য অ্যানালিটিক্স ও স্টক অডিট" : "Product Analytics & Stock Audit"}
                </h1>
                <Badge variant="outline" className="text-[11px] bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="size-3 mr-1" />
                  {lang === "bn" ? "লাইভ ক্যালকুলেটর" : "Live Calculator"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                {lang === "bn"
                  ? "বারকোড স্ক্যানার দিয়ে ফিজিক্যাল স্টক চেক, ভ্যালুয়েশন ক্যালকুলেটর ও বিক্রির বিশ্লেষণ"
                  : "Physical stock audit scanner, valuation calculator & sales intelligence"}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={activeTab === "stock_scanner" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setActiveTab("stock_scanner");
                setScannerOpen(true);
              }}
              className="gap-1.5 shadow-sm font-semibold"
            >
              <Scan className="size-4" />
              {lang === "bn" ? "বারকোড স্ক্যানার" : "Barcode Scanner"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRefreshing(true);
                qc.invalidateQueries({ queryKey: ["products"] });
                qc.invalidateQueries({ queryKey: ["sales"] });
                setTimeout(() => {
                  setIsRefreshing(false);
                  toast.success(lang === "bn" ? "তথ্য রিফ্রেশ হয়েছে" : "Data refreshed");
                }, 400);
              }}
              disabled={isRefreshing}
              className="size-9 p-0"
              title="Refresh"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-6">
        {/* Main Tab Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b">
          <button
            onClick={() => setActiveTab("stock_scanner")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "stock_scanner"
                ? "border-primary text-primary bg-primary/5 font-bold shadow-sm"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Scan className="size-4 text-emerald-500" />
            <span>{lang === "bn" ? "🔍 স্টক অডিট স্ক্যানার ও ক্যালকুলেটর" : "🔍 Stock Audit Scanner & Calculator"}</span>
            {scannedAuditItems.length > 0 && (
              <Badge className="bg-emerald-600 text-white text-[11px] px-1.5 py-0 h-5">
                {auditCalculations.totalPieces} pcs
              </Badge>
            )}
          </button>

          <button
            onClick={() => setActiveTab("best_sellers")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "best_sellers"
                ? "border-primary text-primary bg-primary/5 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Flame className="size-4 text-amber-500" />
            <span>{lang === "bn" ? "সেরা বিক্রিত" : "Best Sellers"}</span>
          </button>

          <button
            onClick={() => setActiveTab("trending")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "trending"
                ? "border-primary text-primary bg-primary/5 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <TrendingUp className="size-4 text-indigo-500" />
            <span>{lang === "bn" ? "ট্রেন্ডিং" : "Trending"}</span>
          </button>

          <button
            onClick={() => setActiveTab("critical_stock")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "critical_stock"
                ? "border-primary text-primary bg-primary/5 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <AlertTriangle className="size-4 text-rose-500" />
            <span>{lang === "bn" ? "স্টক শেষ / কম" : "Low / Out of Stock"}</span>
          </button>

          <button
            onClick={() => setActiveTab("slow_moving")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "slow_moving"
                ? "border-primary text-primary bg-primary/5 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Clock className="size-4 text-orange-500" />
            <span>{lang === "bn" ? "ধীর বিক্রিত" : "Slow Moving"}</span>
          </button>

          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg font-medium text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === "all"
                ? "border-primary text-primary bg-primary/5 font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <Layers className="size-4 text-slate-500" />
            <span>{lang === "bn" ? "সকল পণ্য" : "All Products"}</span>
          </button>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: STOCK AUDIT SCANNER & VALUATION CALCULATOR             */}
        {/* ------------------------------------------------------------- */}
        {activeTab === "stock_scanner" && (
          <div className="space-y-6">
            {/* Top Audit Calculator Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Scanned Pieces */}
              <Card className="p-4 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                    {lang === "bn" ? "স্ক্যানকৃত মোট পিস" : "Scanned Physical Pieces"}
                  </span>
                  <div className="p-2 bg-emerald-500/20 text-emerald-600 rounded-lg">
                    <Package className="size-4" />
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-foreground">
                    {auditCalculations.totalPieces}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lang === "bn" ? `(${auditCalculations.uniqueItemCount} ধরণের পণ্য)` : `(${auditCalculations.uniqueItemCount} unique items)`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn"
                    ? `দোকানের মোট সিস্টেম স্টক: ${totalStoreStock} পিস`
                    : `Total Store System Stock: ${totalStoreStock} pcs`}
                </p>
              </Card>

              {/* Card 2: Total Cost Worth */}
              <Card className="p-4 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                    {lang === "bn" ? "মোট ক্রয়মূল্য হিসাব (কেনা)" : "Total Cost Worth (Buy)"}
                  </span>
                  <div className="p-2 bg-indigo-500/20 text-indigo-600 rounded-lg">
                    <Calculator className="size-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                    {fmtMoney(auditCalculations.totalCostValuation)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn"
                    ? `প্রত্যাশিত সিস্টেম ক্রয়মূল্য: ${fmtMoney(auditCalculations.totalSystemCostOfScanned)}`
                    : `Expected System Cost: ${fmtMoney(auditCalculations.totalSystemCostOfScanned)}`}
                </p>
              </Card>

              {/* Card 3: Total Retail Worth */}
              <Card className="p-4 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border-purple-500/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                    {lang === "bn" ? "মোট বিক্রয়মূল্য হিসাব (বিক্রি)" : "Total Retail Worth (Sale)"}
                  </span>
                  <div className="p-2 bg-purple-500/20 text-purple-600 rounded-lg">
                    <DollarSign className="size-4" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-black text-purple-600 dark:text-purple-400">
                    {fmtMoney(auditCalculations.totalSaleValuation)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn"
                    ? `প্রত্যাশিত বিক্রয়মূল্য: ${fmtMoney(auditCalculations.totalSystemSaleOfScanned)}`
                    : `Expected Retail: ${fmtMoney(auditCalculations.totalSystemSaleOfScanned)}`}
                </p>
              </Card>

              {/* Card 4: Match Status & Discrepancy */}
              <Card className={`p-4 border ${
                auditCalculations.totalPieces === 0
                  ? "bg-muted/40 border-border"
                  : auditCalculations.piecesDifference === 0
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : auditCalculations.piecesDifference < 0
                  ? "bg-rose-500/10 border-rose-500/30"
                  : "bg-amber-500/10 border-amber-500/30"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === "bn" ? "স্টক ম্যাচিং স্ট্যাটাস" : "Stock Matching Status"}
                  </span>
                  <div className="p-2 rounded-lg bg-card shadow-xs">
                    {auditCalculations.totalPieces === 0 ? (
                      <Clock className="size-4 text-muted-foreground" />
                    ) : auditCalculations.piecesDifference === 0 ? (
                      <CheckCheck className="size-4 text-emerald-500" />
                    ) : auditCalculations.piecesDifference < 0 ? (
                      <AlertTriangle className="size-4 text-rose-500" />
                    ) : (
                      <Plus className="size-4 text-amber-500" />
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  {auditCalculations.totalPieces === 0 ? (
                    <span className="text-lg font-bold text-muted-foreground">
                      {lang === "bn" ? "স্ক্যান শুরু করুন" : "Start Scanning"}
                    </span>
                  ) : auditCalculations.piecesDifference === 0 ? (
                    <div className="flex items-center gap-1.5 text-emerald-600 font-black text-2xl">
                      <CheckCircle2 className="size-6" />
                      <span>{lang === "bn" ? "হুবহু মিল রয়েছে" : "Perfect Match"}</span>
                    </div>
                  ) : auditCalculations.piecesDifference < 0 ? (
                    <div>
                      <span className="text-2xl font-black text-rose-600">
                        {auditCalculations.piecesDifference} pcs
                      </span>
                      <span className="text-xs font-semibold text-rose-500 ml-1.5">
                        {lang === "bn" ? "(ঘাটতি / Shortage)" : "(Shortage)"}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-2xl font-black text-amber-600">
                        +{auditCalculations.piecesDifference} pcs
                      </span>
                      <span className="text-xs font-semibold text-amber-500 ml-1.5">
                        {lang === "bn" ? "(উদ্বৃত্ত / Surplus)" : "(Surplus)"}
                      </span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-1">
                  {auditCalculations.totalPieces === 0
                    ? (lang === "bn" ? "বারকোড দিয়ে পণ্য যোগ করুন" : "Scan barcodes to check")
                    : (lang === "bn"
                        ? `মূল্য পার্থক্য: ${fmtMoney(Math.abs(auditCalculations.costDifference))}`
                        : `Valuation Diff: ${fmtMoney(Math.abs(auditCalculations.costDifference))}`)}
                </p>
              </Card>
            </div>

            {/* Scanner Input Console & Control Bench */}
            <Card className="p-5 border-2 border-primary/20 shadow-md bg-card">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                {/* Manual Barcode & Gun Scan Input */}
                <div className="flex-1 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Scan className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-primary" />
                    <Input
                      ref={barcodeInputRef}
                      value={manualBarcodeInput}
                      onChange={(e) => setManualBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualBarcodeInput.trim()) {
                          e.preventDefault();
                          handleScanOrAddProduct(manualBarcodeInput);
                        }
                      }}
                      placeholder={lang === "bn" ? "বারকোড স্ক্যান করুন বা লিখুন (Enter চাপুন)..." : "Scan barcode or enter SKU/ID (Press Enter)..."}
                      className="pl-11 pr-24 h-12 text-base font-mono bg-background border-primary/30 focus-visible:ring-primary shadow-inner"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      onClick={() => handleScanOrAddProduct(manualBarcodeInput)}
                      disabled={!manualBarcodeInput.trim()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 px-3"
                    >
                      {lang === "bn" ? "যোগ করুন" : "Add"}
                    </Button>
                  </div>

                  {/* Camera Scanner Button */}
                  <Button
                    size="lg"
                    onClick={() => setScannerOpen(true)}
                    className="h-12 px-5 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md"
                  >
                    <QrCode className="size-5" />
                    <span className="hidden sm:inline">{lang === "bn" ? "ক্যামেরা স্ক্যানার" : "Camera Scanner"}</span>
                    <span className="sm:hidden">{lang === "bn" ? "ক্যামেরা" : "Camera"}</span>
                  </Button>
                </div>

                {/* Sound & Controls Toolbar */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`h-10 gap-1.5 ${soundEnabled ? "text-primary border-primary/30" : "text-muted-foreground"}`}
                    title={soundEnabled ? "Sound Enabled" : "Sound Muted"}
                  >
                    {soundEnabled ? <Volume2 className="size-4 text-emerald-500" /> : <VolumeX className="size-4 text-rose-500" />}
                    <span className="text-xs font-semibold">{soundEnabled ? (lang === "bn" ? "সাউন্ড অন" : "Beep On") : (lang === "bn" ? "সাউন্ড অফ" : "Muted")}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportAuditCsv}
                    disabled={scannedAuditItems.length === 0}
                    className="h-10 gap-1.5 text-xs font-semibold"
                  >
                    <Download className="size-4 text-indigo-500" />
                    <span>{lang === "bn" ? "CSV এক্সপোর্ট" : "Export CSV"}</span>
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    disabled={scannedAuditItems.length === 0}
                    className="h-10 gap-1.5 text-xs font-semibold"
                  >
                    <Printer className="size-4 text-purple-500" />
                    <span>{lang === "bn" ? "প্রিন্ট" : "Print"}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAudit}
                    disabled={scannedAuditItems.length === 0}
                    className="h-10 gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold"
                  >
                    <RotateCcw className="size-4" />
                    <span>{lang === "bn" ? "রিসেট" : "Reset"}</span>
                  </Button>
                </div>
              </div>

              {/* Quick Search Dropdown / Fast Picker */}
              <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-500" />
                  {lang === "bn"
                    ? "টিপস: বারকোড গান দিয়ে একটার পর একটা স্ক্যান করলে সাথে সাথে মূল্য ও মোট হিসাব বাড়তে থাকবে।"
                    : "Tip: Scanning barcodes continuously auto-adds products and updates live valuation with a beep sound."}
                </span>
                <span className="font-semibold text-foreground">
                  {lang === "bn" ? `স্ক্যানকৃত আইটেম: ${scannedAuditItems.length} টি` : `Scanned Items: ${scannedAuditItems.length}`}
                </span>
              </div>
            </Card>

            {/* Spotlight of Last Scanned Item */}
            {lastScannedProduct && (
              <Card className="p-4 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-transparent border-2 border-emerald-500/40 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="size-14 rounded-lg overflow-hidden border bg-background shrink-0">
                      <ProductImage
                        path={lastScannedProduct.product.image_url}
                        alt={lastScannedProduct.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                          {lang === "bn" ? "সবেমাত্র স্ক্যান হয়েছে" : "Just Scanned"}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {lastScannedProduct.product.barcode || lastScannedProduct.product.sku || "No Barcode"}
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-foreground">
                        {lastScannedProduct.product.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {lang === "bn" ? "ক্যাটাগরি" : "Category"}: {lastScannedProduct.product.category || "General"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-[11px] text-muted-foreground uppercase font-bold block">
                        {lang === "bn" ? "ক্রয় মূল্য (Unit Cost)" : "Unit Cost"}
                      </span>
                      <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                        {fmtMoney(Number(lastScannedProduct.product.buy_price) || 0)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-muted-foreground uppercase font-bold block">
                        {lang === "bn" ? "বিক্রয় মূল্য (Unit Sell)" : "Unit Retail"}
                      </span>
                      <span className="text-base font-bold text-purple-600 dark:text-purple-400">
                        {fmtMoney(Number(lastScannedProduct.product.sell_price) || 0)}
                      </span>
                    </div>

                    <div className="text-right bg-card px-3 py-1.5 rounded-lg border shadow-xs">
                      <span className="text-[11px] text-muted-foreground uppercase font-bold block">
                        {lang === "bn" ? "স্ক্যান সংখ্যা" : "Scanned Qty"}
                      </span>
                      <span className="text-xl font-black text-emerald-600">
                        {lastScannedProduct.qty} pcs
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Scanned Items Ledger Table */}
            <Card className="overflow-hidden border shadow-sm">
              <div className="p-4 border-b bg-muted/30 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="size-5 text-primary" />
                  <h3 className="text-base font-bold text-foreground">
                    {lang === "bn" ? "স্ক্যানকৃত পণ্যের অডিট লেজার" : "Scanned Product Audit Ledger"}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {scannedAuditItems.length}
                  </Badge>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    placeholder={lang === "bn" ? "তালিকায় খুঁজুন..." : "Filter in table..."}
                    className="pl-9 h-9 text-xs bg-background"
                  />
                </div>
              </div>

              {filteredAuditItems.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-3">
                  <div className="size-16 rounded-full bg-primary/10 text-primary grid place-items-center mx-auto">
                    <Scan className="size-8 animate-pulse" />
                  </div>
                  <h4 className="text-base font-bold text-foreground">
                    {lang === "bn" ? "এখনো কোনো পণ্য স্ক্যান করা হয়নি" : "No products scanned yet"}
                  </h4>
                  <p className="text-xs max-w-md mx-auto">
                    {lang === "bn"
                      ? "উপরে বারকোড ইনপুট বক্সে কোড লিখে Enter চাপুন অথবা 'ক্যামেরা স্ক্যানার' বোতাম চেপে ক্যামেরা দিয়ে দ্রুত স্ক্যান করুন।"
                      : "Scan barcodes using the camera scanner or enter codes in the input field above to calculate stock worth in real time."}
                  </p>
                  <Button
                    onClick={() => setScannerOpen(true)}
                    className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <QrCode className="size-4" />
                    {lang === "bn" ? "ক্যামেরা দিয়ে স্ক্যান শুরু করুন" : "Open Camera Scanner"}
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50 text-muted-foreground font-semibold">
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">{lang === "bn" ? "পণ্য" : "Product"}</th>
                        <th className="p-3">{lang === "bn" ? "বারকোড / SKU" : "Barcode / SKU"}</th>
                        <th className="p-3 text-right">{lang === "bn" ? "একক ক্রয়মূল্য" : "Unit Cost"}</th>
                        <th className="p-3 text-right">{lang === "bn" ? "একক বিক্রয়মূল্য" : "Unit Retail"}</th>
                        <th className="p-3 text-center">{lang === "bn" ? "ফিজিক্যাল সংখ্যা" : "Physical Qty"}</th>
                        <th className="p-3 text-right">{lang === "bn" ? "মোট ক্রয়মূল্য" : "Total Cost"}</th>
                        <th className="p-3 text-right">{lang === "bn" ? "মোট বিক্রয়মূল্য" : "Total Retail"}</th>
                        <th className="p-3 text-center">{lang === "bn" ? "সিস্টেম স্টক" : "System Stock"}</th>
                        <th className="p-3 text-center">{lang === "bn" ? "ম্যাচিং স্ট্যাটাস" : "Match Status"}</th>
                        <th className="p-3 text-center w-12">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredAuditItems.map((item, idx) => {
                        const p = item.product;
                        const buy = Number(p.buy_price) || 0;
                        const sell = Number(p.sell_price) || 0;
                        const sysStock = Number(p.stock) || 0;
                        const diff = item.scannedQty - sysStock;
                        const totalCost = item.scannedQty * buy;
                        const totalSell = item.scannedQty * sell;

                        return (
                          <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3 text-center font-mono text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <div className="size-10 rounded-md overflow-hidden border bg-background shrink-0">
                                  <ProductImage
                                    path={p.image_url}
                                    alt={p.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div>
                                  <span className="font-bold text-foreground text-sm block">
                                    {p.name}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {p.category || "General"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-muted-foreground">
                              {p.barcode || p.sku || "-"}
                            </td>
                            <td className="p-3 text-right font-medium text-indigo-600 dark:text-indigo-400">
                              {fmtMoney(buy)}
                            </td>
                            <td className="p-3 text-right font-medium text-purple-600 dark:text-purple-400">
                              {fmtMoney(sell)}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => handleAdjustScannedQty(item.id, -1)}
                                >
                                  <Minus className="size-3" />
                                </Button>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.scannedQty}
                                  onChange={(e) => handleSetScannedQty(item.id, parseInt(e.target.value, 10) || 0)}
                                  className="w-14 h-7 text-center font-bold font-mono text-sm bg-background border rounded px-1"
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="size-7"
                                  onClick={() => handleAdjustScannedQty(item.id, 1)}
                                >
                                  <Plus className="size-3" />
                                </Button>
                              </div>
                            </td>
                            <td className="p-3 text-right font-bold text-indigo-700 dark:text-indigo-300">
                              {fmtMoney(totalCost)}
                            </td>
                            <td className="p-3 text-right font-bold text-purple-700 dark:text-purple-300">
                              {fmtMoney(totalSell)}
                            </td>
                            <td className="p-3 text-center font-mono text-xs">
                              {sysStock} pcs
                            </td>
                            <td className="p-3 text-center">
                              {diff === 0 ? (
                                <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
                                  <CheckCircle2 className="size-3 mr-1" />
                                  {lang === "bn" ? "মিল রয়েছে" : "Matched"}
                                </Badge>
                              ) : diff < 0 ? (
                                <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]">
                                  {lang === "bn" ? `ঘাটতি (${diff})` : `Shortage (${diff})`}
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
                                  {lang === "bn" ? `উদ্বৃত্ত (+${diff})` : `Surplus (+${diff})`}
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                onClick={() => handleRemoveScannedItem(item.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/60 font-bold">
                        <td colSpan={5} className="p-3 text-right text-sm">
                          {lang === "bn" ? "সর্বমোট হিসাব (Grand Totals):" : "Grand Totals:"}
                        </td>
                        <td className="p-3 text-center text-sm text-emerald-600">
                          {auditCalculations.totalPieces} pcs
                        </td>
                        <td className="p-3 text-right text-sm text-indigo-600">
                          {fmtMoney(auditCalculations.totalCostValuation)}
                        </td>
                        <td className="p-3 text-right text-sm text-purple-600">
                          {fmtMoney(auditCalculations.totalSaleValuation)}
                        </td>
                        <td className="p-3 text-center text-xs text-muted-foreground">
                          {auditCalculations.totalSystemStockOfScanned} pcs
                        </td>
                        <td colSpan={2} className="p-3 text-center">
                          {auditCalculations.piecesDifference === 0 ? (
                            <span className="text-xs text-emerald-600 font-bold">{lang === "bn" ? "হুবহু মিল" : "Perfect Match"}</span>
                          ) : (
                            <span className={`text-xs font-bold ${auditCalculations.piecesDifference < 0 ? "text-rose-600" : "text-amber-600"}`}>
                              {auditCalculations.piecesDifference > 0 ? `+${auditCalculations.piecesDifference}` : auditCalculations.piecesDifference} pcs
                            </span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2-6: STANDARD PRODUCT ANALYTICS & INTELLIGENCE           */}
        {/* ------------------------------------------------------------- */}
        {activeTab !== "stock_scanner" && (
          <div className="space-y-6">
            {/* Top Aggregate Summary Bento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 bg-card shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
                  <span>{lang === "bn" ? "মোট স্টক মূল্য (কেনা)" : "Total Stock Worth (Cost)"}</span>
                  <Package className="size-4 text-teal-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">
                  {fmtMoney(totalValuationCost)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn" ? "কেনা মূল্যের সর্বমোট হিসাব" : "Based on purchase cost"}
                </p>
              </Card>

              <Card className="p-4 bg-card shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
                  <span>{lang === "bn" ? "মোট বিক্রয় মূল্য (আনুমানিক)" : "Total Sell Value (Est.)"}</span>
                  <TrendingUp className="size-4 text-emerald-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">
                  {fmtMoney(totalValuationSale)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn" ? "বিক্রি মূল্যের সর্বমোট হিসাব" : "Based on retail selling price"}
                </p>
              </Card>

              <Card className="p-4 bg-card shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
                  <span>{lang === "bn" ? "স্টক শেষ পণ্য" : "Out of Stock Items"}</span>
                  <ShieldAlert className="size-4 text-rose-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-rose-600">
                  {analyticsProducts.filter((p) => p.isOut).length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn" ? "তাৎক্ষণিক রি-অর্ডার প্রয়োজন" : "Immediate replenishment needed"}
                </p>
              </Card>

              <Card className="p-4 bg-card shadow-xs">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase">
                  <span>{lang === "bn" ? "মোট আইটেম সংখ্যা" : "Total Products"}</span>
                  <Layers className="size-4 text-indigo-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-foreground">
                  {products.length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {lang === "bn" ? `${categories.length} টি ক্যাটাগরি` : `Across ${categories.length} categories`}
                </p>
              </Card>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-lg border shadow-xs">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={lang === "bn" ? "নাম বা বারকোড দিয়ে খুঁজুন..." : "Search name or barcode..."}
                    className="pl-9 h-9 text-xs"
                  />
                </div>

                <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? null : v)}>
                  <SelectTrigger className="w-40 h-9 text-xs">
                    <SelectValue placeholder={lang === "bn" ? "সকল ক্যাটাগরি" : "All Categories"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{lang === "bn" ? "সকল ক্যাটাগরি" : "All Categories"}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
                  <SelectTrigger className="w-32 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">{lang === "bn" ? "আজকে" : "Today"}</SelectItem>
                    <SelectItem value="7d">{lang === "bn" ? "গত ৭ দিন" : "Last 7 Days"}</SelectItem>
                    <SelectItem value="30d">{lang === "bn" ? "গত ৩০ দিন" : "Last 30 Days"}</SelectItem>
                    <SelectItem value="this_month">{lang === "bn" ? "এই মাস" : "This Month"}</SelectItem>
                    <SelectItem value="all">{lang === "bn" ? "সকল সময়" : "All Time"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Product Table */}
            <Card className="overflow-hidden border shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground font-semibold">
                      <th className="p-3">{lang === "bn" ? "পণ্য" : "Product"}</th>
                      <th className="p-3 text-right">{lang === "bn" ? "কেনা মূল্য" : "Buy Price"}</th>
                      <th className="p-3 text-right">{lang === "bn" ? "বিক্রি মূল্য" : "Sale Price"}</th>
                      <th className="p-3 text-center">{lang === "bn" ? "বর্তমান স্টক" : "Current Stock"}</th>
                      <th className="p-3 text-center">{lang === "bn" ? "বিক্রিত পিস" : "Sold Pieces"}</th>
                      <th className="p-3 text-right">{lang === "bn" ? "মোট আয়" : "Revenue"}</th>
                      <th className="p-3 text-right">{lang === "bn" ? "লাভ" : "Profit"}</th>
                      <th className="p-3 text-center">{lang === "bn" ? "অ্যাকশন" : "Actions"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {pagedResult.items.map((item) => (
                      <tr key={item.product.id} className="hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="size-10 rounded-md overflow-hidden border bg-background shrink-0">
                              <ProductImage
                                path={item.product.image_url}
                                alt={item.product.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <span className="font-bold text-foreground text-sm block">
                                {item.product.name}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {item.product.category || "General"} • {item.product.barcode || item.product.sku || "No Barcode"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right font-medium">{fmtMoney(Number(item.product.buy_price) || 0)}</td>
                        <td className="p-3 text-right font-medium">{fmtMoney(Number(item.product.sell_price) || 0)}</td>
                        <td className="p-3 text-center font-bold">
                          <span className={`px-2 py-0.5 rounded text-[11px] ${
                            item.isOut
                              ? "bg-rose-500/15 text-rose-600"
                              : item.isLow
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-emerald-500/15 text-emerald-600"
                          }`}>
                            {item.currentStock} pcs
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-foreground">{item.soldPieces} pcs</td>
                        <td className="p-3 text-right font-bold text-indigo-600">{fmtMoney(item.revenue)}</td>
                        <td className="p-3 text-right font-bold text-emerald-600">{fmtMoney(item.profit)}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              onClick={() => {
                                setSaleProduct(item.product.id);
                                setSaleOpen(true);
                              }}
                            >
                              {lang === "bn" ? "বিক্রি" : "Sell"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              onClick={() => {
                                setBuyProduct(item.product.id);
                                setBuyOpen(true);
                              }}
                            >
                              {lang === "bn" ? "ক্রয়" : "Buy"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagedResult.totalPages > 1 && (
                <div className="p-3 border-t">
                  <PaginationBar
                    page={page}
                    totalPages={pagedResult.totalPages}
                    total={filteredProducts.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Barcode Scanner Modal for Continuous Physical Stock Auditing */}
      {scannerOpen && (
        <BarcodeScannerDialog
          open={scannerOpen}
          onOpenChange={setScannerOpen}
          onScan={(scannedCode) => {
            if (scannedCode) {
              handleScanOrAddProduct(scannedCode);
              if (!continuousScan) {
                setScannerOpen(false);
              }
            }
          }}
          title={lang === "bn" ? "পণ্য স্টক অডিট স্ক্যানার" : "Product Stock Audit Scanner"}
          continuous={continuousScan}
        />
      )}

      {/* Product Edit / Sale / Purchase Modals */}
      {saleOpen && (
        <SaleDialog
          open={saleOpen}
          onOpenChange={setSaleOpen}
          presetProductId={saleProduct}
        />
      )}
      {buyOpen && (
        <PurchaseDialog
          open={buyOpen}
          onOpenChange={setBuyOpen}
          presetProductId={buyProduct}
        />
      )}
    </div>
  );
}
