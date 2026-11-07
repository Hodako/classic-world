"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Barcode,
  Printer,
  Plus,
  Minus,
  Trash2,
  Search,
  Check,
  Sliders,
  Sparkles,
  Tag,
  Layers,
  RotateCcw,
} from "lucide-react";
import { getProducts, type Product } from "@/lib/queries";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_LABEL_SETTINGS,
  type PosLabelSettings,
} from "@/lib/pos-hardware";
import {
  LABEL_PRESETS,
  resolveProductBarcode,
  generateCode128Svg,
  printProductLabels,
  type LabelQueueItem,
} from "@/lib/label-printer";
import { toast } from "sonner";

interface InstalledPrinter {
  name: string;
  isDefault?: boolean;
}

export interface LabelPrintingStudioProps {
  products?: Product[];
  initialProducts?: Product[];
  shopName?: string;
  lang?: string;
  embedded?: boolean;
  onPrinted?: () => void;
}

export function LabelPrintingStudio({
  products = [],
  initialProducts = [],
  shopName = "CLASSIC WORLD",
  lang = "bn",
  embedded = false,
  onPrinted,
}: LabelPrintingStudioProps) {
  const isBn = lang === "bn";
  const [labelCfg, setLabelCfg] = useState<PosLabelSettings>(DEFAULT_LABEL_SETTINGS);
  const [effectiveShopName, setEffectiveShopName] = useState<string>(shopName);
  const [printers, setPrinters] = useState<InstalledPrinter[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [printing, setPrinting] = useState(false);
  const [queue, setQueue] = useState<LabelQueueItem[]>([]);

  const fallbackProductsQuery = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    enabled: !products || products.length === 0,
  });

  const resolvedProducts = useMemo(
    () => (products && products.length > 0 ? products : fallbackProductsQuery.data || []),
    [products, fallbackProductsQuery.data]
  );

  // Load saved label settings & installed Windows printers
  useEffect(() => {
    const hw = getPosHardwareSettings();
    setLabelCfg({ ...DEFAULT_LABEL_SETTINGS, ...(hw.labelSettings || {}) });
    if (hw.customHeaderTitle) {
      setEffectiveShopName(hw.customHeaderTitle);
    } else if (shopName) {
      setEffectiveShopName(shopName);
    }

    const loadPrinters = async () => {
      try {
        const electronPOS = (window as any).electronPOS;
        if (electronPOS?.getPrinters) {
          const list = await electronPOS.getPrinters();
          if (Array.isArray(list)) {
            setPrinters(list.map((p: any) => ({ name: p.name, isDefault: p.isDefault })));
            return;
          }
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1000);
        const res = await fetch("http://127.0.0.1:9123/printers", { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.printers)) setPrinters(data.printers);
        }
      } catch {}
    };
    loadPrinters();
  }, [shopName]);

  // Populate initial products if passed (e.g. from Product Card "Print Label" click)
  useEffect(() => {
    if (initialProducts && initialProducts.length > 0) {
      setQueue(
        initialProducts.map((p) => ({
          id: `lbl_${p.id}_${Math.random().toString(36).slice(2, 6)}`,
          productId: p.id,
          name: p.name,
          code: resolveProductBarcode(p),
          price: Number(p.sell_price) || 0,
          category: p.category || "",
          copies: 1,
        }))
      );
    } else if (queue.length === 0 && resolvedProducts.length > 0 && embedded) {
      // Pre-load 1 sample item in embedded Settings studio so preview is immediately interactive
      const first = resolvedProducts.find((p) => !p.archived) || resolvedProducts[0];
      if (first) {
        setQueue([
          {
            id: `lbl_${first.id}`,
            productId: first.id,
            name: first.name,
            code: resolveProductBarcode(first),
            price: Number(first.sell_price) || 0,
            category: first.category || "",
            copies: 1,
          },
        ]);
      }
    }
  }, [initialProducts, resolvedProducts.length]);

  const updateCfg = (patch: Partial<PosLabelSettings>) => {
    setLabelCfg((prev) => {
      const next = { ...prev, ...patch };
      savePosHardwareSettings({ labelSettings: next });
      return next;
    });
  };

  const activeProducts = useMemo(
    () => resolvedProducts.filter((p) => !p.archived),
    [resolvedProducts]
  );

  const filteredSearchProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeProducts.slice(0, 8);
    return activeProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [activeProducts, searchQuery]);

  const addProductToQueue = (p: Product) => {
    setQueue((prev) => {
      const idx = prev.findIndex((item) => item.productId === p.id);
      if (idx > -1) {
        return prev.map((item, i) =>
          i === idx ? { ...item, copies: Math.min(500, item.copies + 1) } : item
        );
      }
      return [
        ...prev,
        {
          id: `lbl_${p.id}_${Date.now().toString(36)}`,
          productId: p.id,
          name: p.name,
          code: resolveProductBarcode(p),
          price: Number(p.sell_price) || 0,
          category: p.category || "",
          copies: 1,
        },
      ];
    });
  };

  const addManualCustomLabel = () => {
    const rnd = Math.floor(100000 + Math.random() * 900000);
    setQueue((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        name: isBn ? "কাস্টম পণ্য" : "Custom Item",
        code: `CW-${rnd}`,
        price: 500,
        category: "",
        copies: 1,
      },
    ]);
  };

  const matchStockCopies = () => {
    if (!queue.length) return;
    setQueue((prev) =>
      prev.map((item) => {
        const prod = resolvedProducts.find((p) => p.id === item.productId);
        const stockQty = Math.max(1, Math.min(200, Math.floor(Number(prod?.stock) || 1)));
        return { ...item, copies: stockQty };
      })
    );
    toast.success(isBn ? "বর্তমান স্টক অনুযায়ী লেবেল সংখ্যা সেট হয়েছে!" : "Label copies matched to current stock!");
  };

  const updateQueueItem = (id: string, patch: Partial<LabelQueueItem>) => {
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => prev.filter((it) => it.id !== id));
  };

  const totalLabelsCount = useMemo(
    () => queue.reduce((sum, it) => sum + Math.max(1, Number(it.copies) || 1), 0),
    [queue]
  );

  // Sample / active preview item
  const previewItem: LabelQueueItem = queue[0] || {
    id: "sample",
    name: isBn ? "প্রিমিয়াম পাঞ্জাবি - XL" : "Premium Panjabi - XL",
    code: "CW-202601",
    price: 1250,
    category: "Apparel",
    copies: 1,
  };

  const previewBarcodeSvg = useMemo(
    () => generateCode128Svg(previewItem.code, labelCfg.barcodeHeightPx),
    [previewItem.code, labelCfg.barcodeHeightPx]
  );

  const handlePrintNow = async (forceDialog = false) => {
    const targetItems = queue.length > 0 ? queue : [previewItem];
    setPrinting(true);
    try {
      await printProductLabels(targetItems, {
        shopName: effectiveShopName,
        settings: labelCfg,
        forcePrintDialog: forceDialog,
      });
      toast.success(
        isBn
          ? `${targetItems.reduce((s, x) => s + x.copies, 0)}টি বারকোড লেবেল প্রিন্টারে পাঠানো হয়েছে!`
          : `Sent ${targetItems.reduce((s, x) => s + x.copies, 0)} barcode labels to printer!`
      );
      onPrinted?.();
    } catch (e: any) {
      toast.error(e?.message || "Label print error");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Card className={`${embedded ? "p-4 sm:p-6 rounded-3xl border-border/80 shadow-xs" : "border-0 shadow-none p-0"} bg-card space-y-5`}>
      {/* Header */}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Barcode className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
                  {isBn ? "বারকোড ও প্রাইস লেবেল প্রিন্টিং (Label Printer)" : "Product Barcode & Price Label Printing"}
                </h2>
                <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-[11px] font-bold">
                  {labelCfg.mode === "a4_sheet"
                    ? `A4 (${labelCfg.a4Columns} Col)`
                    : `${labelCfg.widthMm}×${labelCfg.heightMm}mm`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {isBn
                  ? "যেকোনো থার্মাল বারকোড স্টিকার প্রিন্টার অথবা সাধারণ A4 প্রিন্টারে ১-ক্লিকে পণ্যের প্রাইস ট্যাগ ও বারকোড প্রিন্ট করুন"
                  : "1-click barcode & price sticker printing on thermal roll label printers or standard A4 sheets"}
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => handlePrintNow(false)}
            disabled={printing}
            className="h-9 px-4 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs"
          >
            <Printer className="size-3.5" />
            <span>
              {isBn
                ? `লেবেল প্রিন্ট করুন (${queue.length > 0 ? totalLabelsCount : 1}টি)`
                : `Print Labels (${queue.length > 0 ? totalLabelsCount : 1})`}
            </span>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Product Picker & Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. Sticker Size Presets */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Tag className="size-3.5 text-indigo-500" />
                {isBn ? "১. লেবেল / স্টিকারের সাইজ নির্বাচন করুন" : "1. Choose Sticker / Sheet Size"}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => updateCfg(DEFAULT_LABEL_SETTINGS)}
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1 cursor-pointer"
              >
                <RotateCcw className="size-3" />
                {isBn ? "ডিফল্ট" : "Reset"}
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {LABEL_PRESETS.map((preset) => {
                const isSelected =
                  labelCfg.mode === preset.mode &&
                  labelCfg.widthMm === preset.widthMm &&
                  labelCfg.heightMm === preset.heightMm &&
                  (preset.mode !== "a4_sheet" || labelCfg.a4Columns === preset.a4Columns);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      updateCfg({
                        mode: preset.mode,
                        widthMm: preset.widthMm,
                        heightMm: preset.heightMm,
                        a4Columns: preset.a4Columns || labelCfg.a4Columns,
                      })
                    }
                    className={`text-left px-2.5 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-background hover:bg-muted/70 border-border/70 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{isBn ? preset.labelBn : preset.labelEn}</span>
                      {isSelected && <Check className="size-3 shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom W x H & Printer Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {isBn ? "প্রস্থ Width (mm)" : "Width (mm)"}
                </Label>
                <Input
                  type="number"
                  min={20}
                  max={120}
                  value={labelCfg.widthMm}
                  onChange={(e) => updateCfg({ widthMm: Math.max(20, Math.min(120, Number(e.target.value) || 38)) })}
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {isBn ? "উচ্চতা Height (mm)" : "Height (mm)"}
                </Label>
                <Input
                  type="number"
                  min={15}
                  max={100}
                  value={labelCfg.heightMm}
                  onChange={(e) => updateCfg({ heightMm: Math.max(15, Math.min(100, Number(e.target.value) || 25)) })}
                  className="h-8 text-xs font-mono font-bold"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {isBn ? "ফন্ট সাইজ (pt)" : "Font Size (pt)"}
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 cursor-pointer"
                    onClick={() => updateCfg({ fontSizePt: Math.max(5.5, Number((labelCfg.fontSizePt - 0.5).toFixed(1))) })}
                  >
                    <Minus className="size-3" />
                  </Button>
                  <div className="flex-1 text-center text-xs font-mono font-bold">
                    {labelCfg.fontSizePt}pt
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0 cursor-pointer"
                    onClick={() => updateCfg({ fontSizePt: Math.min(14, Number((labelCfg.fontSizePt + 0.5).toFixed(1))) })}
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {isBn ? "লেবেল প্রিন্টার" : "Label Printer"}
                </Label>
                <Select
                  value={labelCfg.printerName || "__default__"}
                  onValueChange={(v) => updateCfg({ printerName: v === "__default__" ? "" : v })}
                >
                  <SelectTrigger className="h-8 text-[11px] font-semibold">
                    <SelectValue placeholder={isBn ? "ডিফল্ট প্রিন্টার" : "Default Printer"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {isBn ? "ডিফল্ট প্রিন্টার (System/POS)" : "Default POS Printer"}
                    </SelectItem>
                    {printers.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggle Switches for What Appears on Label */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "দোকানের নাম" : "Shop Name"}</span>
                <Switch
                  checked={labelCfg.showShopName}
                  onCheckedChange={(c) => updateCfg({ showShopName: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "পণ্যের নাম" : "Product Name"}</span>
                <Switch
                  checked={labelCfg.showProductName}
                  onCheckedChange={(c) => updateCfg({ showProductName: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "বিক্রয় মূল্য (৳)" : "Price (৳)"}</span>
                <Switch
                  checked={labelCfg.showPrice}
                  onCheckedChange={(c) => updateCfg({ showPrice: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "বারকোড দাগ" : "Barcode Bars"}</span>
                <Switch
                  checked={labelCfg.showBarcode}
                  onCheckedChange={(c) => updateCfg({ showBarcode: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "বারকোড কোড" : "Code Text"}</span>
                <Switch
                  checked={labelCfg.showCodeText}
                  onCheckedChange={(c) => updateCfg({ showCodeText: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "ক্যাটাগরি" : "Category"}</span>
                <Switch
                  checked={labelCfg.showCategory}
                  onCheckedChange={(c) => updateCfg({ showCategory: c })}
                />
              </label>
            </div>
          </div>

          {/* 2. Product Search & Print Queue */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Layers className="size-3.5 text-emerald-600" />
                {isBn ? "২. পণ্য নির্বাচন ও লেবেল সংখ্যা" : "2. Select Products & Label Copies"}
              </Label>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addManualCustomLabel}
                  className="h-7 px-2.5 text-[11px] font-bold gap-1 cursor-pointer"
                >
                  <Plus className="size-3" />
                  {isBn ? "কাস্টম ট্যাগ" : "Custom Tag"}
                </Button>
                {queue.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={matchStockCopies}
                      className="h-7 px-2.5 text-[11px] font-bold gap-1 cursor-pointer"
                    >
                      <Sparkles className="size-3 text-amber-500" />
                      {isBn ? "স্টক সমান কপি" : "Match Stock"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQueue([])}
                      className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-500/10 cursor-pointer"
                    >
                      {isBn ? "ক্লিয়ার" : "Clear"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Product Fast Search */}
            {activeProducts.length > 0 && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      isBn
                        ? "পণ্যের নাম, বারকোড বা কোড লিখে সার্চ করে যোগ করুন..."
                        : "Search product by name, barcode or SKU to add..."
                    }
                    className="h-8 pl-8 text-xs bg-background"
                  />
                </div>

                {filteredSearchProducts.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {filteredSearchProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProductToQueue(p)}
                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-background hover:bg-primary/10 border border-border/70 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Plus className="size-3 text-primary" />
                        <span className="max-w-[130px] truncate">{p.name}</span>
                        <span className="text-muted-foreground font-mono">৳{p.sell_price}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Selected Queue Table */}
            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {queue.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                  {isBn
                    ? "উপর থেকে পণ্য সিলেক্ট করুন অথবা 'কাস্টম ট্যাগ' বাটনে ক্লিক করে ইচ্ছেমতো লেবেল তৈরি করুন।"
                    : "Click any product chip above or 'Custom Tag' to queue labels for printing."}
                </div>
              ) : (
                queue.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 gap-1.5 items-center p-2 rounded-xl bg-background border border-border/70"
                  >
                    <div className="col-span-4">
                      <Input
                        value={item.name}
                        onChange={(e) => updateQueueItem(item.id, { name: e.target.value })}
                        className="h-7 text-xs font-bold px-2"
                        placeholder="Product Name"
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        value={item.code}
                        onChange={(e) => updateQueueItem(item.id, { code: e.target.value })}
                        className="h-7 text-[11px] font-mono px-2"
                        placeholder="Barcode"
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) => updateQueueItem(item.id, { price: Number(e.target.value) || 0 })}
                        className="h-7 text-xs font-mono font-bold px-1.5"
                        placeholder="Price"
                      />
                    </div>
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-6 shrink-0 cursor-pointer"
                        onClick={() => updateQueueItem(item.id, { copies: Math.max(1, item.copies - 1) })}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={item.copies}
                        onChange={(e) =>
                          updateQueueItem(item.id, {
                            copies: Math.max(1, Math.min(500, Number(e.target.value) || 1)),
                          })
                        }
                        className="h-7 w-11 text-center text-xs font-mono font-bold px-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-6 shrink-0 cursor-pointer"
                        onClick={() => updateQueueItem(item.id, { copies: Math.min(500, item.copies + 1) })}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-6 shrink-0 text-rose-500 hover:text-rose-600 cursor-pointer"
                        onClick={() => removeQueueItem(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Real-Size Sticker Preview & Print Actions (5 cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-200 text-[11px] font-mono">
                {labelCfg.widthMm}mm × {labelCfg.heightMm}mm
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-[11px]">
                {isBn
                  ? `মোট: ${queue.length > 0 ? totalLabelsCount : 1}টি স্টিকার`
                  : `Total: ${queue.length > 0 ? totalLabelsCount : 1} Labels`}
              </Badge>
            </div>
            <span className="text-[11px] text-slate-400">
              {isBn ? "লাইভ প্রিভিউ" : "Live Sticker"}
            </span>
          </div>

          {/* Visual Sticker Mockup */}
          <div className="flex-1 min-h-[190px] flex flex-col items-center justify-center bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:14px_14px] rounded-xl p-4">
            <div
              style={{
                width: `${Math.min(Math.max(labelCfg.widthMm * 4.2, 150), 290)}px`,
                minHeight: `${Math.min(Math.max(labelCfg.heightMm * 4.2, 100), 210)}px`,
                backgroundColor: "#ffffff",
                color: "#000000",
              }}
              className="pos-paper-preview rounded-md shadow-2xl border-2 border-dashed border-slate-300 p-2.5 flex flex-col items-center justify-between text-center select-none"
            >
              {labelCfg.showShopName && (
                <div
                  style={{ fontSize: `${Math.max(8, labelCfg.fontSizePt * 1.15)}px` }}
                  className="font-black uppercase tracking-wide leading-tight w-full truncate text-black"
                >
                  {effectiveShopName}
                </div>
              )}

              {labelCfg.showProductName && (
                <div
                  style={{ fontSize: `${Math.max(9, labelCfg.fontSizePt * 1.3)}px` }}
                  className="font-extrabold leading-tight w-full truncate text-black"
                >
                  {previewItem.name}
                </div>
              )}

              {labelCfg.showCategory && previewItem.category && (
                <div className="text-[10px] font-bold text-black leading-none truncate w-full">
                  {previewItem.category}
                </div>
              )}

              {labelCfg.showBarcode && (
                <div
                  className="w-[94%] my-0.5 overflow-hidden bg-white"
                  dangerouslySetInnerHTML={{ __html: previewBarcodeSvg }}
                />
              )}

              {labelCfg.showBarcode && labelCfg.showCodeText && (
                <div className="text-[10px] font-mono font-extrabold tracking-wider leading-none text-black">
                  {previewItem.code}
                </div>
              )}

              {labelCfg.showPrice && (
                <div
                  style={{ fontSize: `${Math.max(11, (labelCfg.fontSizePt + 1.5) * 1.35)}px` }}
                  className="font-black leading-tight text-black mt-0.5"
                >
                  {labelCfg.currencyPrefix || "৳"}
                  {Number(previewItem.price || 0).toLocaleString()}
                </div>
              )}
            </div>

            <p className="text-[11px] text-slate-400 mt-3 text-center">
              {labelCfg.mode === "a4_sheet"
                ? isBn
                  ? `A4 কাগজে প্রতি সারিতে ${labelCfg.a4Columns}টি করে স্টিকার প্রিন্ট হবে`
                  : `Prints ${labelCfg.a4Columns} stickers per row on standard A4 sheet`
                : isBn
                ? `থার্মাল বারকোড রোল (${labelCfg.widthMm}×${labelCfg.heightMm}mm) অনুযায়ী নিখুঁত ফিট`
                : `Exact ${labelCfg.widthMm}×${labelCfg.heightMm}mm thermal barcode roll fit`}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => handlePrintNow(true)}
              disabled={printing}
              className="flex-1 h-9 text-xs font-bold border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 gap-1.5 cursor-pointer"
            >
              <Sliders className="size-3.5" />
              {isBn ? "ডায়ালগ সহ প্রিন্ট" : "Print Dialog"}
            </Button>
            <Button
              type="button"
              onClick={() => handlePrintNow(false)}
              disabled={printing}
              className="flex-1 h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 cursor-pointer shadow-md"
            >
              <Printer className={`size-4 ${printing ? "animate-pulse" : ""}`} />
              {isBn
                ? `এখনই প্রিন্ট (${queue.length > 0 ? totalLabelsCount : 1})`
                : `Print Now (${queue.length > 0 ? totalLabelsCount : 1})`}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface LabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products?: Product[];
  initialProducts?: Product[];
  shopName?: string;
  lang?: string;
}

export function LabelPrintDialog({
  open,
  onOpenChange,
  products = [],
  initialProducts = [],
  shopName = "CLASSIC WORLD",
  lang = "bn",
}: LabelPrintDialogProps) {
  const isBn = lang === "bn";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
        <DialogHeader className="pb-2 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-extrabold">
            <Barcode className="size-5 text-indigo-600" />
            {isBn ? "সহজ বারকোড ও প্রাইস লেবেল প্রিন্টিং" : "Easy Barcode & Price Label Printing"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isBn
              ? "পণ্যের বারকোড স্টিকার অথবা প্রাইস ট্যাগ কাস্টমাইজ করে ১-ক্লিকে প্রিন্ট করুন"
              : "Customize and print product barcode stickers or price tags in 1 click"}
          </DialogDescription>
        </DialogHeader>

        <LabelPrintingStudio
          products={products}
          initialProducts={initialProducts}
          shopName={shopName}
          lang={lang}
          embedded={false}
        />
      </DialogContent>
    </Dialog>
  );
}
