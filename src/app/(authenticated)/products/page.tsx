"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { FAB } from "@/components/ui/fab";
import { useState, useMemo, useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Pencil, Trash2, Search, Archive, Download, Eye, AlertCircle, MoreVertical, ShoppingCart, Minus, X, Scan } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getProducts, getSales, getCustomers, type Product } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { ProductImage } from "@/components/product-image";
import { preloadAssetsToLocalStorage } from "@/lib/asset-cache";
import { ProductDialog } from "@/components/product-dialog";
import { SaleDialog } from "@/components/sale-dialog";
import { PurchaseDialog } from "@/components/purchase-dialog";
import { BarcodeScannerDialog } from "@/components/barcode-scanner-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { deleteProductFn, archiveProductFn, createDirectProductReturnFn, createSaleFn } from "@/lib/rpc";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ProductsPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { data: productsData } = useCachedQuery(["products"], getProducts);
  const salesQuery = useCachedQuery(["sales"], getSales);

  useEffect(() => {
    if (productsData && productsData.length > 0) {
      preloadAssetsToLocalStorage(productsData.map(p => p.image_url));
    }
  }, [productsData]);

  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [saleProduct, setSaleProduct] = useState<string | undefined>();
  const [saleOpen, setSaleOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"active" | "archived" | "low_stock">("active");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sellCart, setSellCart] = useState<{ product: Product; qty: number; sellPrice: number }[]>([]);
  const [showCartPanel, setShowCartPanel] = useState(false);
  const [returnProduct, setReturnProduct] = useState<Product | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [productBoxSize, setProductBoxSize] = useState<"small" | "standard" | "large" | string>("standard");
  const [searchVisible, setSearchVisible] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hz_pinned_products");
      if (saved) {
        try {
          setPinnedIds(JSON.parse(saved));
        } catch (e) {}
      }

      const loadTheme = () => {
        const themeSaved = localStorage.getItem("hz_custom_theme");
        if (themeSaved) {
          try {
            const parsed = JSON.parse(themeSaved);
            if (parsed.productBoxSize) {
              setProductBoxSize(parsed.productBoxSize);
            }
          } catch (e) {}
        }
      };
      loadTheme();
      window.addEventListener("hz-theme-updated", loadTheme);
      return () => window.removeEventListener("hz-theme-updated", loadTheme);
    }
  }, []);

  const togglePin = (id: string) => {
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter(x => x !== id)
      : [...pinnedIds, id];
    setPinnedIds(next);
    localStorage.setItem("hz_pinned_products", JSON.stringify(next));
    toast.success(pinnedIds.includes(id) 
      ? (lang === "bn" ? "পণ্যটি আনপিন করা হয়েছে" : "Product unpinned")
      : (lang === "bn" ? "পণ্যটি পিন করা হয়েছে" : "Product pinned to top")
    );
  };

  const [sellType, setSellType] = useState<"cash" | "credit" | "online">("cash");
  const [sellCustomerId, setSellCustomerId] = useState("");
  const [sellPaidAmount, setSellPaidAmount] = useState("");
  const [sellBusy, setSellBusy] = useState(false);

  const customersQuery = useCachedQuery(["customers"], getCustomers);
  const customers = customersQuery.data ?? [];

  async function handleCompleteDirectSell() {
    if (sellCart.length === 0) return;
    if (sellType === "credit" && !sellCustomerId) {
      toast.error((lang === "bn" ? "কাস্টমার" : "Customer") + " " + t("required"));
      return;
    }
    setSellBusy(true);
    try {
      const total = sellCart.reduce((sum, item) => sum + item.qty * item.sellPrice, 0);
      const paidNum = (sellType === "cash" || sellType === "online") ? total : Number(sellPaidAmount) || 0;
      const due = Math.max(total - paidNum, 0);
      const duePerItem = sellType === "credit" ? due / sellCart.length : 0;
      const paidPerItem = sellType === "credit" ? paidNum / sellCart.length : 0;
      const cartId = crypto.randomUUID();
      for (const item of sellCart) {
        const qtyNum = item.qty;
        const sellPrice = item.sellPrice;
        const lineSell = sellPrice * qtyNum;
        const lineProfit = (sellPrice - item.product.buy_price) * qtyNum;
        await createSaleFn({
          data: {
            product_id: item.product.id,
            product_name: item.product.name,
            qty: qtyNum,
            buy_price: item.product.buy_price,
            sell_price: sellPrice,
            profit: lineProfit,
            type: sellType,
            party_id: sellType === "credit" ? sellCustomerId : null,
            paid_amount: sellType === "credit" ? paidPerItem : lineSell,
            due_amount: sellType === "credit" ? duePerItem : 0,
            cart_id: cartId,
          }
        });
      }
      toast.success(t("record_sale"));
      setSellCart([]);
      setShowCartPanel(false);
      setSellCustomerId("");
      setSellPaidAmount("");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["party-detail"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setSellBusy(false);
    }
  }

  const pageSize = isMobile ? 12 : 24;

  const allProducts = productsData ?? [];
  const salesData = salesQuery.data ?? [];
  // Valuations & Total Raw Profit from sold products (Selling Price - Buying Cost)
  const totalCostValuation = allProducts.filter(p => !p.archived).reduce((sum, p) => sum + (p.buy_price * p.stock), 0);
  const totalSaleValuation = allProducts.filter(p => !p.archived).reduce((sum, p) => sum + (p.sell_price * p.stock), 0);
  const totalRawProfit = useMemo(() => {
    return salesData
      .filter(s => !s.returned)
      .reduce((sum, s) => sum + (Number(s.profit) || (Number(s.sell_price) - Number(s.buy_price || 0)) * s.qty), 0);
  }, [salesData]);

  // Compute popularity (quantity sold)
  const popularityMap = useMemo(() => {
    const map: Record<string, number> = {};
    salesData.forEach(s => {
      if (s.product_id) {
        map[s.product_id] = (map[s.product_id] ?? 0) + s.qty;
      }
    });
    return map;
  }, [salesData]);

  // Extract unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(allProducts.map(p => p.category).filter(Boolean))) as string[];
  }, [allProducts]);

  // Filters (Name, Barcode, Unique Product Number, Code, SKU, QR, ID, Attributes, Category)
  const searchFiltered = allProducts.filter(p => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const strippedQ = q.replace(/^0+/, "");
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.barcode && (p.barcode.toLowerCase().includes(q) || (strippedQ && p.barcode.replace(/^0+/, "").includes(strippedQ)))) ||
      (p.code && (p.code.toLowerCase().includes(q) || (strippedQ && p.code.replace(/^0+/, "").includes(strippedQ)))) ||
      (p.product_number && (p.product_number.toLowerCase().includes(q) || (strippedQ && p.product_number.replace(/^0+/, "").includes(strippedQ)))) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.qr_code && p.qr_code.toLowerCase().includes(q)) ||
      p.id.toLowerCase() === q ||
      p.id.toLowerCase().slice(-6) === q ||
      Object.values(p.attributes || {}).some(val => val.toLowerCase().includes(q)) ||
      (p.category || "").toLowerCase().includes(q)
    );
  });

  const filteredProducts = searchFiltered.filter(p => {
    const matchesTab = activeTab === "archived" ? p.archived === true : p.archived !== true;
    const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
    const matchesLowStock = activeTab === "low_stock" ? p.stock <= (p.min_stock ?? 5) : true;
    return matchesTab && matchesCategory && matchesLowStock;
  });

  // Sort by popularity (descending) and pinned items first
  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id);
      const bPinned = pinnedIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const popA = popularityMap[a.id] ?? 0;
      const popB = popularityMap[b.id] ?? 0;
      return popB - popA;
    });
  }, [filteredProducts, popularityMap, pinnedIds]);

  const { items: productsToShow, totalPages, safePage } = paginate(sortedProducts, page, pageSize);

  async function performDeleteProduct() {
    if (!productToDelete) return;
    setIsDeletingProduct(true);
    try {
      await deleteProductFn({ data: { id: productToDelete.id } });
      toast.success(t("delete"));
      qc.invalidateQueries({ queryKey: ["products"] });
      setProductToDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingProduct(false);
    }
  }

  function remove(p: Product) {
    setProductToDelete(p);
  }

  async function toggleArchive(p: Product) {
    const nextVal = !p.archived;
    try {
      await archiveProductFn({ data: { id: p.id, archived: nextVal } });
      toast.success(nextVal ? t("archived") : t("active"));
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function exportProducts(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["আইডি", "নাম", "ক্রয় মূল্য", "বিক্রয় মূল্য", "স্টক", "সর্বনিম্ন স্টক সতর্কবার্তা", "বৈশিষ্ট্য", "আর্কাইভ করা"]
      : ["ID", "Name", "Buy Price", "Sell Price", "Stock", "Min Stock Alert", "Attributes", "Archived"];
    const rows = filteredProducts.map(p => [
      p.id,
      p.name,
      p.buy_price,
      p.sell_price,
      p.stock,
      p.min_stock ?? 5,
      JSON.stringify(p.attributes || {}),
      p.archived
        ? (langCode === "bn" ? "হ্যাঁ" : "Yes")
        : (langCode === "bn" ? "না" : "No")
    ]);
    downloadCsv(`products_${activeTab}_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  return (
    <div className="space-y-3">
      {/* Valuation & Top Header - Collapsible */}
      <div className="flex items-center justify-between bg-secondary/20 px-3 py-1.5 rounded-lg border border-border/40 no-print">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {lang === "bn" ? "স্টক এবং মূল্যায়ন পরিসংখ্যান" : "Stock & Valuation Statistics"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] hover:bg-transparent text-primary hover:text-primary/80"
          onClick={() => setStatsExpanded(!statsExpanded)}
        >
          {statsExpanded 
            ? (lang === "bn" ? "লুকান ▲" : "Hide Stats ▲") 
            : (lang === "bn" ? "পরিসংখ্যান দেখান ▼" : "Show Stats ▼")}
        </Button>
      </div>

      {statsExpanded && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3 transition-all duration-300">
          <Card className="p-2 sm:p-3 bg-gradient-to-br from-indigo-50/50 to-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10 border-indigo-200/30">
            <div className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{t("stock_value")} ({t("buy")})</div>
            <div className="text-xs sm:text-base font-bold font-serif text-indigo-700 dark:text-indigo-400 mt-0.5">{fmtMoney(totalCostValuation)}</div>
          </Card>
          <Card className="p-2 sm:p-3 bg-gradient-to-br from-emerald-50/50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 border-emerald-200/30">
            <div className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{t("stock_value")} ({t("sell")})</div>
            <div className="text-xs sm:text-base font-bold font-serif text-emerald-700 dark:text-emerald-400 mt-0.5">{fmtMoney(totalSaleValuation)}</div>
          </Card>
          <Card className="p-2 sm:p-3 bg-gradient-to-br from-amber-50/50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10 border-amber-200/30">
            <div className="text-[8px] sm:text-[10px] text-muted-foreground uppercase tracking-wider">{lang === "bn" ? "মোট বিক্রয় লাভ (র' প্রফিট)" : "Raw Sales Profit"}</div>
            <div className="text-xs sm:text-base font-bold font-serif text-amber-700 dark:text-amber-400 mt-0.5">{fmtMoney(totalRawProfit)}</div>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg sm:text-xl font-bold">{t("products")}</h1>
        <div className="flex gap-1.5 items-center">
          <Button
            size="sm"
            variant={searchVisible ? "default" : "outline"}
            className="h-8 w-8 p-0 shrink-0"
            title={t("search_products")}
            onClick={() => setSearchVisible(prev => !prev)}
          >
            <Search className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0 shrink-0"
            title={lang === "bn" ? "বারকোড স্ক্যান" : "Scan Barcode"}
            onClick={() => setScannerOpen(true)}
          >
            <Scan className="size-3.5 text-primary" />
          </Button>
          <Button
            size="sm"
            variant={showCartPanel ? "default" : "outline"}
            className="h-8 text-[10px] sm:text-xs relative"
            onClick={() => setShowCartPanel(prev => !prev)}
          >
            <ShoppingCart className="size-3.5 mr-1" />
            {t("cart")}
            {sellCart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-white rounded-full size-3.5 flex items-center justify-center text-[8px] font-bold">
                {sellCart.reduce((sum, item) => sum + item.qty, 0)}
              </span>
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs">
                <Download className="size-3.5 mr-1" />
                {isMobile ? "" : t("download_csv")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportProducts("en")}>
                English (ইংরেজি)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportProducts("bn")}>
                Bangla (বাংলা)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs" onClick={() => setBuyOpen(true)}>{t("buy")}</Button>
        </div>
      </div>

      {searchVisible && (
        <div className="relative animate-in fade-in slide-in-from-top-2 duration-150">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10 pointer-events-none" />
          <Input autoFocus style={{ paddingLeft: "2.5rem" }} className="pl-10 h-9 text-sm" placeholder={t("search_products")} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
      )}

      {/* Category Pills Slider */}
      {categories.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 flex-nowrap scrollbar-none">
          <Button
            size="sm"
            variant={selectedCategory === null ? "default" : "outline"}
            className="h-7 text-[10px] rounded-full shrink-0 px-2.5"
            onClick={() => { setSelectedCategory(null); setPage(1); }}
          >
            {t("all")}
          </Button>
          {categories.map(cat => (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? "default" : "outline"}
              className="h-7 text-[10px] rounded-full shrink-0 px-2.5"
              onClick={() => { setSelectedCategory(cat); setPage(1); }}
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(1); }}>
        <TabsList className="grid grid-cols-3 w-full h-8 p-0.5 bg-muted/60">
          <TabsTrigger value="active" className="text-xs py-1">{t("active")}</TabsTrigger>
          <TabsTrigger value="low_stock" className="text-xs py-1 flex items-center gap-1">
            {t("critical_stock")}
            {allProducts.filter(p => !p.archived && p.stock <= (p.min_stock ?? 5)).length > 0 && (
              <span className="size-1.5 bg-destructive rounded-full" />
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="text-xs py-1">{t("archived")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Sell Basket Panel */}
      {showCartPanel && (
        sellCart.length > 0 ? (
          <Card className="p-4 border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/20 dark:via-emerald-950/10 dark:to-transparent backdrop-blur-md space-y-3.5 beveled-card shadow-lg rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ShoppingCart className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-xs text-emerald-800 dark:text-emerald-300">
                  {t("cart")} ({sellCart.reduce((sum, item) => sum + item.qty, 0)})
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive rounded-lg"
                onClick={() => {
                  setSellCart([]);
                  setShowCartPanel(false);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2 no-scrollbar">
              {sellCart.map((item, index) => (
                <div key={item.product.id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-white/60 dark:bg-zinc-950/40 border border-emerald-500/10 shadow-sm text-xs transition-all">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-50 truncate">{item.product.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-5.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0"
                      onClick={() => setSellCart(prev => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="text-[10px] text-muted-foreground shrink-0">{t("qty")}:</span>
                      <div className="flex items-center border border-input rounded-lg bg-background overflow-hidden h-7 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 rounded-none border-r"
                          onClick={() => {
                            const val = Math.max(1, item.qty - 1);
                            setSellCart(prev => prev.map((x, i) => i === index ? { ...x, qty: val } : x));
                          }}
                        >
                          <Minus className="size-2.5" />
                        </Button>
                        <span className="w-8 text-center text-xs font-semibold">{item.qty}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 rounded-none border-l"
                          onClick={() => {
                            const val = Math.min(item.product.stock, item.qty + 1);
                            setSellCart(prev => prev.map((x, i) => i === index ? { ...x, qty: val } : x));
                          }}
                        >
                          <Plus className="size-2.5" />
                        </Button>
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">/ {item.product.stock}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1 justify-end">
                      <span className="text-[10px] text-muted-foreground shrink-0">{t("sell_price")}:</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.sellPrice}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          setSellCart(prev => prev.map((x, i) => i === index ? { ...x, sellPrice: val } : x));
                        }}
                        className="h-7 text-xs bg-background text-right px-1.5 w-20 font-semibold rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-dashed border-emerald-500/10 font-mono text-muted-foreground">
                    <span>Profit: {fmtMoney((item.sellPrice - item.product.buy_price) * item.qty)}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">Subtotal: {fmtMoney(item.qty * item.sellPrice)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-emerald-500/20 pt-3 space-y-3">
              <div className="flex gap-1 bg-muted/65 p-0.5 rounded-lg border border-border/20">
                {(["cash", "credit", "online"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    variant={sellType === mode ? "default" : "outline"}
                    className="h-7 text-[10px] flex-1 px-1 rounded-md"
                    onClick={() => setSellType(mode)}
                  >
                    {mode === "cash" ? t("cash_sale") : mode === "credit" ? t("credit_sale") : t("online_sell")}
                  </Button>
                ))}
              </div>

              {sellType === "credit" && (
                <div className="space-y-1.5 p-2.5 bg-background/50 rounded-xl border border-emerald-500/15 shadow-inner">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-12 shrink-0">{lang === "bn" ? "কাস্টমার" : "Customer"}:</span>
                    <select
                      value={sellCustomerId}
                      onChange={e => setSellCustomerId(e.target.value)}
                      className="h-7 rounded border border-input bg-background px-2 text-xs flex-1"
                    >
                      <option value="">— Select Customer —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-12 shrink-0">{t("paid_amount")}:</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={sellPaidAmount}
                      onChange={e => setSellPaidAmount(e.target.value)}
                      className="h-7 text-xs bg-background"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] pt-1">
                    <span className="text-muted-foreground">{t("due_amount")}:</span>
                    <span className="font-semibold text-warning">
                      {fmtMoney(Math.max(0, sellCart.reduce((sum, item) => sum + item.qty * item.sellPrice, 0) - (Number(sellPaidAmount) || 0)))}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs font-semibold">
                <div>
                  <span className="text-muted-foreground">{t("total")}: </span>
                  <span className="font-bold text-sm text-emerald-950 dark:text-emerald-50">
                    {fmtMoney(sellCart.reduce((sum, item) => sum + item.qty * item.sellPrice, 0))}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">{t("profit")}: </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    {fmtMoney(sellCart.reduce((sum, item) => sum + (item.sellPrice - item.product.buy_price) * item.qty, 0))}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                disabled={sellBusy}
                className="w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl"
                onClick={handleCompleteDirectSell}
              >
                {sellBusy ? "..." : t("record_sale")}
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-4 border border-dashed border-border/80 bg-muted/5 space-y-2.5 rounded-2xl beveled-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ShoppingCart className="size-4 text-muted-foreground/60" />
                <span className="font-semibold text-xs">{t("cart_empty")}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                onClick={() => setShowCartPanel(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center py-2">
              {lang === "bn" ? "পণ্য যোগ করতে পণ্যের কার্ডে ট্যাপ করুন" : "Tap on any product card to add it to the cart"}
            </p>
          </Card>
        )
      )}

      {!productsData && <p className="text-xs text-muted-foreground">{t("loading")}</p>}
      {productsData && filteredProducts.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">{t("no_products")}</Card>
      )}

      <div className={`grid gap-1.5 pt-1 ${
        productBoxSize === "small" 
          ? "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8" 
          : productBoxSize === "large" 
            ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" 
            : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
      }`}>
        {productsToShow.map(p => {
          const isLowStock = p.stock <= (p.min_stock ?? 5);
          return (
            <ProductCard
              key={p.id}
              p={p}
              isLowStock={isLowStock}
              t={t}
              isMobile={isMobile}
              isPinned={pinnedIds.includes(p.id)}
              onTogglePin={() => togglePin(p.id)}
              onSell={() => {
                setSellCart(prev => {
                  const existing = prev.find(x => x.product.id === p.id);
                  if (existing) {
                    return prev.map(x => x.product.id === p.id ? { ...x, qty: Math.min(x.qty + 1, p.stock) } : x);
                  }
                  return [...prev, { product: p, qty: 1, sellPrice: p.sell_price || p.buy_price || 0 }];
                });
                setShowCartPanel(true);
                toast.success(`${p.name} -> ${t("cart")}`);
              }}
              onDirectSell={() => {
                setSaleProduct(p.id);
                setSaleOpen(true);
              }}
              onEdit={() => {
                setEditing(p);
                setOpen(true);
              }}
              onArchive={() => toggleArchive(p)}
              onRestore={() => toggleArchive(p)}
              onDelete={() => remove(p)}
              onLongPress={() => {
                setReturnProduct(p);
                setReturnOpen(true);
              }}
            />
          );
        })}
      </div>

      <PaginationBar page={safePage} totalPages={totalPages} total={filteredProducts.length} pageSize={pageSize} onPageChange={setPage} />

      <FAB onClick={() => { setEditing(null); setOpen(true); }} />
      <ProductDialog open={open} onOpenChange={setOpen} product={editing} />
      <SaleDialog
        open={saleOpen}
        onOpenChange={(v) => {
          setSaleOpen(v);
          if (!v) {
            setSaleProduct(undefined);
            setSellCart([]);
          }
        }}
        presetProductId={saleProduct}
        presetCart={
          sellCart.length > 0
            ? sellCart.map(c => ({
                productId: c.product.id,
                qty: String(c.qty),
                sellPrice: String(c.sellPrice || c.product.sell_price),
              }))
            : undefined
        }
      />
      <PurchaseDialog open={buyOpen} onOpenChange={setBuyOpen} />
      <ReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        product={returnProduct}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["products"] });
          qc.invalidateQueries({ queryKey: ["sales"] });
        }}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={(scannedCode) => {
          setSearch(scannedCode);
          setSearchVisible(true);
          const found = allProducts.find(p => p.barcode?.toLowerCase() === scannedCode.toLowerCase() || p.id === scannedCode);
          if (found) {
            toast.success(lang === "bn" ? `পণ্য পাওয়া গেছে: ${found.name}` : `Product found: ${found.name}`);
            setSellCart(prev => {
              const idx = prev.findIndex(item => item.product.id === found.id);
              if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], qty: updated[idx].qty + 1 };
                return updated;
              } else {
                return [...prev, { product: found, qty: 1, sellPrice: found.sell_price }];
              }
            });
            setShowCartPanel(true);
          } else {
            toast.error(lang === "bn" ? `বারকোড (${scannedCode}) দ্বারা পণ্য পাওয়া যায়নি` : `No product found for barcode: ${scannedCode}`);
          }
        }}
        title={lang === "bn" ? "বারকোড স্ক্যান করুন" : "Scan Barcode"}
      />

      <ConfirmDeleteDialog
        open={productToDelete !== null}
        onOpenChange={(v) => { if (!v) setProductToDelete(null); }}
        title="Delete Product"
        description={`Are you sure you want to delete "${productToDelete?.name}"? This action is permanent and cannot be undone.`}
        onConfirm={performDeleteProduct}
        busy={isDeletingProduct}
      />
    </div>
  );
}

function ProductCard({
  p,
  isLowStock,
  onSell,
  onDirectSell,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onLongPress,
  t,
  isMobile,
  isPinned,
  onTogglePin,
}: {
  p: Product;
  isLowStock: boolean;
  onSell: () => void;
  onDirectSell: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onLongPress: () => void;
  t: (k: any) => string;
  isMobile: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(false);

  const handleStart = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLongPressProgress(true);
    timerRef.current = setTimeout(() => {
      setLongPressProgress(false);
      setContextMenuOpen(true);
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 1500);
  };

  const handleEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setLongPressProgress(false);
  };

  // Shared context menu rendered as a fixed overlay (bottom sheet on mobile, centered on desktop)
  const contextMenu = contextMenuOpen ? (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
      onClick={() => setContextMenuOpen(false)}
    >
      <div
        className="w-full sm:w-80 bg-card rounded-t-2xl sm:rounded-2xl border-t sm:border border-border p-4 pb-8 sm:pb-4 space-y-0.5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-3 sm:hidden" />
        <p className="text-xs font-bold text-foreground mb-2 truncate px-1 py-1 border-b border-border/40 pb-2">📦 {p.name}</p>
        {!p.archived ? (
          <>
            <button onClick={() => { setContextMenuOpen(false); onTogglePin(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-muted flex items-center gap-3 font-medium transition-colors">
              📌 {isPinned ? "Unpin" : "Pin to Top"}
            </button>
            <button onClick={() => { setContextMenuOpen(false); onDirectSell(); }} disabled={p.stock <= 0} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-muted flex items-center gap-3 font-medium transition-colors disabled:opacity-50">
              💰 {t("sell")} (Direct)
            </button>
            <button onClick={() => { setContextMenuOpen(false); onEdit(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-muted flex items-center gap-3 font-medium transition-colors">
              ✏️ {t("edit")}
            </button>
            <button onClick={() => { setContextMenuOpen(false); onLongPress(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-amber-500/10 flex items-center gap-3 font-medium text-amber-600 dark:text-amber-400 transition-colors">
              ↩️ Return Product
            </button>
            <button onClick={() => { setContextMenuOpen(false); onArchive(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-muted flex items-center gap-3 font-medium transition-colors">
              🗄️ {t("archive")}
            </button>
            <button onClick={() => { setContextMenuOpen(false); onDelete(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-destructive/10 flex items-center gap-3 font-medium text-destructive transition-colors">
              🗑️ {t("delete")}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => { setContextMenuOpen(false); onRestore(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-muted flex items-center gap-3 font-medium transition-colors">
              ♻️ {t("restore")}
            </button>
            <button onClick={() => { setContextMenuOpen(false); onDelete(); }} className="w-full text-left text-sm px-3 py-2.5 rounded-xl hover:bg-destructive/10 flex items-center gap-3 font-medium text-destructive transition-colors">
              🗑️ {t("delete")}
            </button>
          </>
        )}
        <button onClick={() => setContextMenuOpen(false)} className="w-full text-center text-xs px-3 py-2.5 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground font-medium mt-2 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <>
        <Card
          className={`flex flex-col overflow-hidden border-border/60 select-none transition-all active:scale-[0.98] beveled-card ${
            p.archived ? "opacity-60" : "hover:border-primary/40"
          } ${longPressProgress ? "ring-2 ring-primary/40" : ""}`}
          onMouseDown={handleStart}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchEnd={handleEnd}
          onTouchMove={handleEnd}
          onClick={() => {
            if (p.archived) return;
            if (p.stock > 0) onSell();
          }}
        >
          {/* Image section — aspect-square */}
          <div className="relative aspect-square w-full overflow-hidden">
            <ProductImage path={p.image_url} className="w-full h-full object-cover" />

            {/* Stock badge */}
            <div className="absolute top-1 left-1 bg-black/60 backdrop-blur-md text-white px-1.5 py-0.5 rounded text-[8px] font-bold flex items-center gap-0.5 z-10">
              <span className={isLowStock ? "text-rose-400" : "text-emerald-400"}>●</span>
              <span>{p.stock}</span>
            </div>

            {/* Pin indicator */}
            {isPinned && (
              <div className="absolute top-1 right-1 bg-primary/95 text-white size-4 rounded-full flex items-center justify-center shadow-sm z-10">
                <span className="text-[9px]">📌</span>
              </div>
            )}

            {/* Low stock indicator */}
            {!p.archived && isLowStock && (
              <div className="absolute bottom-1 right-1 bg-destructive text-destructive-foreground p-0.5 rounded-full shadow z-10">
                <AlertCircle className="size-2.5" />
              </div>
            )}

            {/* Long press visual feedback */}
            {longPressProgress && (
              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center z-20">
                <div className="bg-black/60 rounded-full px-2 py-1 text-white text-[9px] font-semibold animate-pulse">Hold...</div>
              </div>
            )}
          </div>

          {/* Title + Price below the image */}
          <div className="px-1.5 py-1 bg-card">
            <div className="font-semibold text-[10px] leading-tight truncate text-foreground" title={p.name}>
              {p.name}
            </div>
            <div className="flex justify-between items-baseline mt-0.5">
              <span className="font-bold text-[10px] text-emerald-600 dark:text-emerald-400 font-serif">
                {p.sell_price > 0 ? fmtMoney(p.sell_price) : "—"}
              </span>
              {p.category && (
                <span className="text-[7px] text-muted-foreground truncate ml-1 max-w-[40px]">{p.category}</span>
              )}
            </div>
          </div>
        </Card>
        {contextMenu}
      </>
    );
  }

  return (
    <>
      <Card
        className={`overflow-hidden border-border/60 flex flex-col justify-between p-1 sm:p-1.5 gap-1 select-none transition-all active:scale-[0.98] beveled-card cursor-pointer ${
          p.archived ? "opacity-60" : "hover:border-primary/50 hover:shadow-md hover:ring-1 hover:ring-primary/20"
        }`}
        onClick={() => {
          setContextMenuOpen(true);
        }}
      >
        <div>
          <div className="relative rounded overflow-hidden">
            <ProductImage path={p.image_url} className="w-full aspect-square object-cover" />
            {!p.archived && isLowStock && (
              <div className="absolute top-1 right-1 bg-destructive text-destructive-foreground p-0.5 rounded-full shadow" title={t("critical_stock")}>
                <AlertCircle className="size-3" />
              </div>
            )}
            {p.category && (
              <span className="absolute bottom-1 left-1 bg-black/60 text-[7px] sm:text-[8px] text-white px-1 py-0.2 rounded font-medium truncate max-w-[80px]">
                {p.category}
              </span>
            )}
          </div>
          <div className="p-1 space-y-0.5">
            <div className="font-semibold text-[10px] sm:text-xs truncate leading-tight text-foreground flex items-center gap-1" title={p.name}>
              {isPinned && <span className="shrink-0 text-[10px]" title="Pinned">📌</span>}
              <span className="truncate">{p.name}</span>
            </div>

            {/* Custom Attributes Badges */}
            {p.attributes && Object.keys(p.attributes).length > 0 && (
              <div className="flex flex-wrap gap-0.5 pt-0.5">
                {Object.entries(p.attributes).map(([key, val]) => (
                  <span key={key} className="bg-secondary/70 text-[8px] px-1 py-0.2 rounded text-secondary-foreground truncate max-w-[80px]" title={`${key}: ${val}`}>
                    {val}
                  </span>
                ))}
              </div>
            )}

            <div className="flex justify-between text-[9px] sm:text-[10px] pt-1">
              <span className="text-muted-foreground">{t("sell_price")}</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400 font-serif">{p.sell_price > 0 ? fmtMoney(p.sell_price) : "—"}</span>
            </div>
            <div className="flex justify-between text-[9px] sm:text-[10px]">
              <span className="text-muted-foreground">{t("stock")}</span>
              <span className={isLowStock ? "text-rose-600 dark:text-rose-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>{p.stock}</span>
            </div>
          </div>
        </div>

        <div className="pt-0.5 flex gap-1" onClick={e => e.stopPropagation()}>
          {!p.archived ? (
            <Button
              size="sm"
              className="h-6 text-[9px] flex-1 px-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg"
              disabled={p.stock <= 0}
              onClick={(e) => {
                e.stopPropagation();
                onSell();
              }}
            >
              {t("sell")}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" className="h-6 text-[9px] flex-1 font-semibold rounded-lg" onClick={() => onRestore()}>{t("restore")}</Button>
              <Button size="sm" variant="ghost" className="size-6 text-destructive shrink-0 rounded-lg" onClick={() => onDelete()}>
                <Trash2 className="size-3" />
              </Button>
            </>
          )}
        </div>
      </Card>
      {contextMenu}
    </>
  );
}

function ReturnDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}) {
  const { t } = useT();
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (product) {
      setQty("1");
      setPrice(String(product.sell_price || ""));
      setNote("");
    }
  }, [product, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    setBusy(true);
    try {
      await createDirectProductReturnFn({
        data: {
          product_id: product.id,
          qty: Number(qty) || 0,
          return_price: Number(price) || 0,
          note: note.trim() || null,
        },
      });
      toast.success("Product returned successfully");
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return Product: {product?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Quantity to Return</Label>
            <Input
              type="number"
              min="1"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Return Price / Old Selling Price (per unit)</Label>
            <Input
              type="number"
              min="0"
              step="any"
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note / Reason</Label>
            <Input
              placeholder="e.g. Damaged item / size issue"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="bg-destructive hover:bg-destructive/90 text-white font-medium">
              {busy ? "..." : "Confirm Return"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
