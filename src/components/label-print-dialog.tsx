"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Sliders,
  Sparkles,
  Layers,
  RotateCcw,
  RefreshCw,
  Download,
  QrCode,
  Wand2,
  Save,
  Ruler,
  Crosshair,
  Settings2,
  CheckCircle2,
} from "lucide-react";
import { getProducts, type Product } from "@/lib/queries";
import { updateProductFn } from "@/lib/rpc";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_LABEL_SETTINGS,
  type PosLabelSettings,
  type BarcodeSymbology,
} from "@/lib/pos-hardware";
import {
  LABEL_PRESETS,
  resolveProductBarcode,
  resolveProductVariantText,
  generateUniqueBarcode,
  generateStickerGraphicSvg,
  computeStickerLayoutMetrics,
  printProductLabels,
  printCalibrationSticker,
  downloadLabelsPdf,
  type LabelQueueItem,
} from "@/lib/label-printer";
import { toast } from "sonner";

interface InstalledPrinter {
  name: string;
  isDefault?: boolean;
}

export interface LabelPrintingStudioProps {
  products?: Product[];
  initialProducts?: (Product & { initialCopies?: number })[];
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
  const qc = useQueryClient();

  const [labelCfg, setLabelCfg] = useState<PosLabelSettings>(DEFAULT_LABEL_SETTINGS);
  const [effectiveShopName, setEffectiveShopName] = useState<string>(shopName);
  const [printers, setPrinters] = useState<InstalledPrinter[]>([]);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [printing, setPrinting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [savingBarcodeId, setSavingBarcodeId] = useState<string | null>(null);
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

  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.getPrinters) {
        const list = await electronPOS.getPrinters();
        if (Array.isArray(list)) {
          setPrinters(list.map((p: any) => ({ name: p.name, isDefault: p.isDefault })));
          setBridgeConnected(true);
          return;
        }
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1200);
      const res = await fetch("http://127.0.0.1:9123/printers", { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.printers)) {
          setPrinters(data.printers);
          setBridgeConnected(true);
        }
      }
    } catch {
      setBridgeConnected(false);
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    const hw = getPosHardwareSettings();
    setLabelCfg({ ...DEFAULT_LABEL_SETTINGS, ...(hw.labelSettings || {}) });
    if (hw.customHeaderTitle) {
      setEffectiveShopName(hw.customHeaderTitle);
    } else if (shopName) {
      setEffectiveShopName(shopName);
    }
    loadPrinters();
  }, [shopName, loadPrinters]);

  // Populate initial products if passed (e.g. from Product Card, Product Dialog, or Purchase row)
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
          variantText: resolveProductVariantText(p),
          copies: Math.max(1, Math.min(500, Math.floor(Number(p.initialCopies) || 1))),
        }))
      );
    } else if (queue.length === 0 && resolvedProducts.length > 0 && embedded) {
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
            variantText: resolveProductVariantText(first),
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

  const existingBarcodeSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of resolvedProducts) {
      if (p.barcode) s.add(p.barcode.trim().toUpperCase());
    }
    for (const q of queue) {
      if (q.code) s.add(q.code.trim().toUpperCase());
    }
    return s;
  }, [resolvedProducts, queue]);

  const filteredSearchProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeProducts.slice(0, 10);
    return activeProducts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q)) ||
          (p.code && p.code.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
      )
      .slice(0, 12);
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
          variantText: resolveProductVariantText(p),
          copies: 1,
        },
      ];
    });
  };

  const addManualCustomLabel = () => {
    const newCode = generateUniqueBarcode(labelCfg.barcodeFormat, existingBarcodeSet, "CW");
    setQueue((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}`,
        name: isBn ? "কাস্টম স্টিকার আইটেম" : "Custom Sticker Item",
        code: newCode,
        price: 550,
        mrp: labelCfg.showMrp ? 650 : undefined,
        category: "",
        variantText: "",
        copies: 1,
      },
    ]);
  };

  const matchStockCopies = () => {
    if (!queue.length) return;
    setQueue((prev) =>
      prev.map((item) => {
        const prod = resolvedProducts.find((p) => p.id === item.productId);
        const stockQty = Math.max(1, Math.min(300, Math.floor(Number(prod?.stock) || 1)));
        return { ...item, copies: stockQty };
      })
    );
    toast.success(
      isBn
        ? "বর্তমান স্টক অনুযায়ী স্টিকারের সংখ্যা সেট হয়েছে!"
        : "Sticker copies matched to current stock!"
    );
  };

  const handleGenerateCodeForItem = (itemId: string) => {
    const fresh = generateUniqueBarcode(labelCfg.barcodeFormat, existingBarcodeSet, "CW");
    updateQueueItem(itemId, { code: fresh });
    toast.success(
      isBn ? `নতুন বারকোড তৈরি হয়েছে: ${fresh}` : `Generated unique barcode: ${fresh}`
    );
  };

  const handleSaveBarcodeToProduct = async (item: LabelQueueItem) => {
    if (!item.productId) return;
    const prod = resolvedProducts.find((p) => p.id === item.productId);
    if (!prod) return;

    const cleanCode = String(item.code || "").trim();
    if (!cleanCode) {
      toast.error(isBn ? "বারকোড খালি রাখা যাবে না" : "Barcode cannot be empty");
      return;
    }

    setSavingBarcodeId(item.id);
    try {
      await updateProductFn({
        data: {
          id: prod.id,
          name: prod.name,
          image_url: prod.image_url ?? null,
          buy_price: Number(prod.buy_price) || 0,
          sell_price: Number(item.price ?? prod.sell_price) || 0,
          stock: Number(prod.stock) || 0,
          min_stock: prod.min_stock ?? 5,
          category: prod.category || "",
          barcode: cleanCode,
          attributes: prod.attributes || {},
        },
      });
      await qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(
        isBn
          ? `"${prod.name}" পণ্যে বারকোড (${cleanCode}) স্থায়ীভাবে সেভ হয়েছে!`
          : `Saved barcode (${cleanCode}) to "${prod.name}"!`
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to save barcode");
    } finally {
      setSavingBarcodeId(null);
    }
  };

  const handleOpenStickerPrinterPreferences = async () => {
    const targetName = labelCfg.printerName || getPosHardwareSettings().devicePrinterName || "";
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.openPrinterPreferences) {
        await electronPOS.openPrinterPreferences(targetName);
        toast.info(
          isBn
            ? "উইন্ডোজ স্টিকার প্রিন্টার প্রেফারেন্স ওপেন হচ্ছে..."
            : "Opening Windows Sticker Printer Preferences..."
        );
        return;
      }
      const res = await fetch("http://127.0.0.1:9123/printer-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: targetName }),
      });
      if (res.ok) {
        toast.info(
          isBn
            ? "উইন্ডোজ স্টিকার প্রিন্টার প্রেফারেন্স ওপেন হচ্ছে..."
            : "Opening Windows Sticker Printer Preferences..."
        );
        return;
      }
    } catch {}
    toast.info(
      isBn
        ? "ব্রাউজার মোডে প্রিন্ট করার সময় 'ডায়ালগ সহ প্রিন্ট' চাপলে প্রিন্টার প্রেফারেন্স পাবেন।"
        : "In browser mode, click 'Print Dialog' to adjust OS driver preferences."
    );
  };

  const handleCalibrationPrint = async () => {
    setCalibrating(true);
    try {
      await printCalibrationSticker({
        shopName: effectiveShopName,
        settings: labelCfg,
      });
      toast.success(
        isBn
          ? `${labelCfg.widthMm}×${labelCfg.heightMm}mm টেস্ট স্টিকার প্রিন্ট পাঠানো হয়েছে!`
          : `Sent ${labelCfg.widthMm}×${labelCfg.heightMm}mm calibration test sticker!`
      );
    } catch {
      toast.error(isBn ? "টেস্ট প্রিন্ট ব্যর্থ হয়েছে" : "Calibration test print failed");
    } finally {
      setCalibrating(false);
    }
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

  const previewItem: LabelQueueItem = queue[0] || {
    id: "sample",
    name: isBn ? "প্রিমিয়াম পাঞ্জাবি - XL" : "Premium Panjabi - XL",
    code: labelCfg.barcodeFormat === "EAN13" ? "8941234567896" : "89420261",
    price: 1250,
    mrp: 1450,
    category: "Apparel",
    variantText: "Size: XL • Black",
    copies: 1,
  };

  const previewGraphic = useMemo(
    () =>
      generateStickerGraphicSvg(
        previewItem.code,
        labelCfg.barcodeFormat || "CODE128",
        labelCfg.barcodeHeightPx,
        labelCfg.barcodeWidthPct || 94
      ),
    [
      previewItem.code,
      labelCfg.barcodeFormat,
      labelCfg.barcodeHeightPx,
      labelCfg.barcodeWidthPct,
    ]
  );

  const layoutMetrics = useMemo(() => computeStickerLayoutMetrics(labelCfg), [labelCfg]);

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
          ? `${queue.length > 0 ? totalLabelsCount : 1}টি স্টিকার প্রিন্টারে পাঠানো হয়েছে!`
          : `Sent ${queue.length > 0 ? totalLabelsCount : 1} sticker(s) to printer!`
      );
      onPrinted?.();
    } catch (err) {
      console.error("[Sticker Print] Error:", err);
      toast.error(isBn ? "স্টিকার প্রিন্ট করতে সমস্যা হয়েছে" : "Failed to print stickers");
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    const targetItems = queue.length > 0 ? queue : [previewItem];
    setDownloadingPdf(true);
    try {
      await downloadLabelsPdf(targetItems, {
        shopName: effectiveShopName,
        settings: labelCfg,
      });
      toast.success(
        isBn
          ? "সঠিক মাপের স্টিকার PDF ডাউনলোড হয়েছে!"
          : "Exact-size Sticker PDF downloaded!"
      );
    } catch (err) {
      console.error("[Sticker PDF] Error:", err);
      toast.error(isBn ? "PDF তৈরিতে সমস্যা হয়েছে" : "Failed to generate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const activePresetId = useMemo(() => {
    const found = LABEL_PRESETS.find(
      (p) =>
        p.mode === labelCfg.mode &&
        p.widthMm === labelCfg.widthMm &&
        p.heightMm === labelCfg.heightMm &&
        (p.mode === "thermal"
          ? (p.rollColumns || 1) === (labelCfg.rollColumns || 1)
          : p.a4Columns === labelCfg.a4Columns)
    );
    return found?.id || "custom";
  }, [labelCfg]);

  const previewScalePxPerMm =
    labelCfg.widthMm >= 80 ? 2.6 : labelCfg.widthMm <= 30 ? 5.2 : 4.2;
  const previewW = Math.min(
    330,
    Math.max(125, Math.round(labelCfg.widthMm * previewScalePxPerMm))
  );
  const previewH = Math.min(
    340,
    Math.max(85, Math.round(labelCfg.heightMm * previewScalePxPerMm))
  );

  const previewMetaLine = [
    labelCfg.showCategory ? previewItem.category : "",
    labelCfg.showVariant ? previewItem.variantText : "",
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <Card
      className={`${
        embedded
          ? "p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs"
          : "p-0 border-0 shadow-none bg-transparent"
      } space-y-5`}
    >
      {/* Top Header & Dedicated Sticker Printer Connection Bar */}
      <div className="flex flex-col gap-3 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400">
              <Barcode className="size-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-foreground flex items-center gap-2 flex-wrap">
                <span>
                  {isBn
                    ? "লেবেল ও বারকোড স্টিকার প্রিন্টার সিস্টেম"
                    : "Barcode & Custom-Size Sticker Printer System"}
                </span>
                <Badge
                  variant="outline"
                  className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 text-[10px]"
                >
                  Code-128 • EAN-13 • Code-39 • QR • Custom mm
                </Badge>
                {bridgeConnected && (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1"
                  >
                    <CheckCircle2 className="size-3" />
                    {isBn ? "প্রিন্টার সংযুক্ত" : "Printer Ready"}
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isBn
                  ? "যেকোনো কাস্টম সাইজের (mm) বারকোড স্টিকার, প্রাইস ট্যাগ ও A4 লেবেল শীট ডিজাইন এবং ১-ক্লিকে সরাসরি প্রিন্ট করুন"
                  : "Print barcode stickers in any custom millimeter size (1-col, 2-col, 3-col thermal rolls or A4 sheets)"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={calibrating}
              onClick={handleCalibrationPrint}
              className="rounded-xl h-8 text-xs font-semibold gap-1.5 border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 cursor-pointer"
            >
              <Crosshair className="size-3.5" />
              {isBn ? "সাইজ টেস্ট স্টিকার" : "Test Calibration"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => updateCfg(DEFAULT_LABEL_SETTINGS)}
              className="rounded-xl h-8 text-xs gap-1.5 text-muted-foreground cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              {isBn ? "রিসেট" : "Reset"}
            </Button>
          </div>
        </div>

        {/* Dedicated Sticker Printer Hardware Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 items-center">
          <div className="md:col-span-5 space-y-1">
            <Label className="text-[11px] font-bold flex items-center gap-1.5 text-foreground">
              <Printer className="size-3.5 text-indigo-600" />
              {isBn
                ? "স্টিকার / বারকোড প্রিন্টার নির্বাচন (রসিদ প্রিন্টার থেকে আলাদা রাখা যাবে)"
                : "Dedicated Sticker / Barcode Printer"}
            </Label>
            <div className="flex items-center gap-1.5">
              <Select
                value={labelCfg.printerName || "__default__"}
                onValueChange={(v) => updateCfg({ printerName: v === "__default__" ? "" : v })}
              >
                <SelectTrigger className="h-9 text-xs font-semibold bg-background flex-1">
                  <SelectValue
                    placeholder={isBn ? "ডিফল্ট প্রিন্টার" : "System / POS Default Printer"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    {isBn
                      ? "ডিফল্ট প্রিন্টার (System / POS Default)"
                      : "System / POS Default Printer"}
                  </SelectItem>
                  {printers.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name} {p.isDefault ? "(Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                title={isBn ? "প্রিন্টার তালিকা রিফ্রেশ করুন" : "Refresh printers"}
                className="h-9 w-9 shrink-0 rounded-xl cursor-pointer"
              >
                <RefreshCw className={`size-3.5 ${loadingPrinters ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="md:col-span-4 flex items-center justify-between px-3 py-2 rounded-xl bg-background border border-border/60">
            <div className="pr-2">
              <div className="text-xs font-bold text-foreground">
                {isBn ? "১-ক্লিক সাইলেন্ট স্টিকার প্রিন্ট" : "1-Click Silent Sticker Print"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {labelCfg.silentPrint !== false
                  ? isBn
                    ? "চালু: পপআপ ছাড়াই সরাসরি প্রিন্ট হবে"
                    : "ON: Prints directly without dialog"
                  : isBn
                  ? "বন্ধ: প্রিন্ট করার আগে ডায়ালগ দেখাবে"
                  : "OFF: Opens print dialog every time"}
              </div>
            </div>
            <Switch
              checked={labelCfg.silentPrint !== false}
              onCheckedChange={(c) => updateCfg({ silentPrint: c })}
            />
          </div>

          <div className="md:col-span-3 flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenStickerPrinterPreferences}
              className="w-full h-9 rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
            >
              <Settings2 className="size-3.5 text-indigo-600" />
              {isBn ? "প্রিন্টার প্রেফারেন্স" : "Driver Preferences"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (7 cols): Custom Size, Calibration, Symbology & Product Queue */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. Sticker Mode, Presets & Exact Custom Millimeter Size */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Ruler className="size-3.5 text-indigo-500" />
                {isBn
                  ? "১. স্টিকার পেপার মোড ও কাস্টম সাইজ (mm)"
                  : "1. Sticker Mode & Exact Custom Size (mm)"}
              </Label>

              {/* Mode Switcher: Thermal Roll vs A4 Sheet */}
              <div className="inline-flex rounded-xl bg-background p-0.5 border border-border/70">
                <button
                  type="button"
                  onClick={() => updateCfg({ mode: "thermal" })}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    labelCfg.mode === "thermal"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isBn ? "থার্মাল স্টিকার রোল" : "Thermal Sticker Roll"}
                </button>
                <button
                  type="button"
                  onClick={() => updateCfg({ mode: "a4_sheet" })}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    labelCfg.mode === "a4_sheet"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isBn ? "A4 স্টিকার শীট" : "A4 Sticker Sheet"}
                </button>
              </div>
            </div>

            {/* Quick Size Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {LABEL_PRESETS.filter((p) => p.mode === labelCfg.mode).map((preset) => {
                const selected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      updateCfg({
                        mode: preset.mode,
                        widthMm: preset.widthMm,
                        heightMm: preset.heightMm,
                        rollColumns: preset.rollColumns ?? 1,
                        columnGapMm: preset.columnGapMm ?? labelCfg.columnGapMm ?? 2,
                        ...(preset.a4Columns ? { a4Columns: preset.a4Columns } : {}),
                      })
                    }
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      selected
                        ? "bg-indigo-500/10 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs"
                        : "bg-background border-border/60 hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="text-[11px] font-bold leading-tight">
                      {isBn ? preset.labelBn : preset.labelEn}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Width x Height + Columns + Gap + Calibration Offsets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "স্টিকার প্রস্থ Width (mm)" : "Sticker Width (mm)"}
                </Label>
                <Input
                  type="number"
                  min={15}
                  max={210}
                  step="0.5"
                  value={labelCfg.widthMm}
                  onChange={(e) =>
                    updateCfg({
                      widthMm: Math.max(15, Math.min(210, Number(e.target.value) || 38)),
                    })
                  }
                  className="h-8 text-xs font-mono font-bold bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "স্টিকার উচ্চতা Height (mm)" : "Sticker Height (mm)"}
                </Label>
                <Input
                  type="number"
                  min={10}
                  max={297}
                  step="0.5"
                  value={labelCfg.heightMm}
                  onChange={(e) =>
                    updateCfg({
                      heightMm: Math.max(10, Math.min(297, Number(e.target.value) || 25)),
                    })
                  }
                  className="h-8 text-xs font-mono font-bold bg-background"
                />
              </div>

              {labelCfg.mode === "thermal" ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-semibold">
                    {isBn ? "রোলে কলাম সংখ্যা" : "Stickers Per Row"}
                  </Label>
                  <Select
                    value={String(labelCfg.rollColumns || 1)}
                    onValueChange={(v) => updateCfg({ rollColumns: Number(v) || 1 })}
                  >
                    <SelectTrigger className="h-8 text-xs font-bold bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">
                        {isBn ? "১ কলাম (Single Roll)" : "1 Column (1-Up)"}
                      </SelectItem>
                      <SelectItem value="2">
                        {isBn ? "২ কলাম (2-Up Roll)" : "2 Columns (2-Up)"}
                      </SelectItem>
                      <SelectItem value="3">
                        {isBn ? "৩ কলাম (3-Up Roll)" : "3 Columns (3-Up)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-semibold">
                    {isBn ? "A4 কলাম সংখ্যা" : "A4 Columns"}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={6}
                    value={labelCfg.a4Columns}
                    onChange={(e) =>
                      updateCfg({
                        a4Columns: Math.max(1, Math.min(6, Number(e.target.value) || 4)),
                      })
                    }
                    className="h-8 text-xs font-mono font-bold bg-background"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "কলাম গ্যাপ (mm)" : "Column Gap (mm)"}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={15}
                  step="0.5"
                  value={labelCfg.columnGapMm ?? 2}
                  onChange={(e) =>
                    updateCfg({
                      columnGapMm: Math.max(0, Math.min(15, Number(e.target.value) || 0)),
                    })
                  }
                  className="h-8 text-xs font-mono font-bold bg-background"
                />
              </div>
            </div>

            {/* Barcode Format, Height, Font Size & Alignment Offset */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-border/50">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "বারকোড ধরন (Format)" : "Barcode Format"}
                </Label>
                <Select
                  value={labelCfg.barcodeFormat || "CODE128"}
                  onValueChange={(v) => updateCfg({ barcodeFormat: v as BarcodeSymbology })}
                >
                  <SelectTrigger className="h-8 text-[11px] font-bold bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CODE128">Code-128 (Standard)</SelectItem>
                    <SelectItem value="EAN13">EAN-13 (Retail 13-Digit)</SelectItem>
                    <SelectItem value="CODE39">Code-39 (Industrial)</SelectItem>
                    <SelectItem value="QR">QR Code (2D Square)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "বারকোড উচ্চতা (px)" : "Barcode Height"}
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-7 shrink-0 cursor-pointer"
                    onClick={() =>
                      updateCfg({ barcodeHeightPx: Math.max(14, labelCfg.barcodeHeightPx - 3) })
                    }
                  >
                    <Minus className="size-3" />
                  </Button>
                  <div className="flex-1 text-center text-xs font-mono font-bold">
                    {labelCfg.barcodeHeightPx}px
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-7 shrink-0 cursor-pointer"
                    onClick={() =>
                      updateCfg({ barcodeHeightPx: Math.min(95, labelCfg.barcodeHeightPx + 3) })
                    }
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "ফন্ট সাইজ (pt)" : "Font Size (pt)"}
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-7 shrink-0 cursor-pointer"
                    onClick={() =>
                      updateCfg({
                        fontSizePt: Math.max(5.5, Number((labelCfg.fontSizePt - 0.5).toFixed(1))),
                      })
                    }
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
                    className="h-8 w-7 shrink-0 cursor-pointer"
                    onClick={() =>
                      updateCfg({
                        fontSizePt: Math.min(16, Number((labelCfg.fontSizePt + 0.5).toFixed(1))),
                      })
                    }
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "পজিশন অফসেট X / Y (mm)" : "Offset Left / Top (mm)"}
                </Label>
                <div className="grid grid-cols-2 gap-1">
                  <Input
                    type="number"
                    min={-8}
                    max={12}
                    step="0.5"
                    title="Left Offset (mm)"
                    placeholder="X"
                    value={labelCfg.offsetLeftMm ?? 0}
                    onChange={(e) =>
                      updateCfg({
                        offsetLeftMm: Math.max(-8, Math.min(12, Number(e.target.value) || 0)),
                      })
                    }
                    className="h-8 px-1.5 text-[11px] font-mono text-center bg-background"
                  />
                  <Input
                    type="number"
                    min={-8}
                    max={12}
                    step="0.5"
                    title="Top Offset (mm)"
                    placeholder="Y"
                    value={labelCfg.offsetTopMm ?? 0}
                    onChange={(e) =>
                      updateCfg({
                        offsetTopMm: Math.max(-8, Math.min(12, Number(e.target.value) || 0)),
                      })
                    }
                    className="h-8 px-1.5 text-[11px] font-mono text-center bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Toggle Switches for Sticker Fields */}
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
                <span>{isBn ? "বিক্রয় মূল্য (৳)" : "Sell Price (৳)"}</span>
                <Switch
                  checked={labelCfg.showPrice}
                  onCheckedChange={(c) => updateCfg({ showPrice: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "বারকোড / QR" : "Barcode / QR"}</span>
                <Switch
                  checked={labelCfg.showBarcode}
                  onCheckedChange={(c) => updateCfg({ showBarcode: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "কোড টেক্সট" : "Code Text"}</span>
                <Switch
                  checked={labelCfg.showCodeText}
                  onCheckedChange={(c) => updateCfg({ showCodeText: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "সাইজ / ভ্যারিয়েন্ট" : "Size / Variant"}</span>
                <Switch
                  checked={labelCfg.showVariant !== false}
                  onCheckedChange={(c) => updateCfg({ showVariant: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "ক্যাটাগরি" : "Category"}</span>
                <Switch
                  checked={labelCfg.showCategory}
                  onCheckedChange={(c) => updateCfg({ showCategory: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "কাটা দাম (MRP)" : "Regular MRP"}</span>
                <Switch
                  checked={Boolean(labelCfg.showMrp)}
                  onCheckedChange={(c) => updateCfg({ showMrp: c })}
                />
              </label>
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-background border border-border/60 text-xs font-semibold cursor-pointer">
                <span>{isBn ? "চারপাশে বর্ডার" : "Sticker Border"}</span>
                <Switch
                  checked={Boolean(labelCfg.showBorder)}
                  onCheckedChange={(c) => updateCfg({ showBorder: c })}
                />
              </label>
            </div>

            {/* Editable Shop Title & Custom Footer Note on Sticker */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn ? "স্টিকারে দোকানের নাম" : "Sticker Header / Shop Name"}
                </Label>
                <Input
                  value={effectiveShopName}
                  onChange={(e) => setEffectiveShopName(e.target.value)}
                  placeholder="CLASSIC WORLD"
                  className="h-8 text-xs font-bold bg-background"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground font-semibold">
                  {isBn
                    ? "অতিরিক্ত ছোট লেখা (যেমন: একদাম / Fixed Price)"
                    : "Extra Footer Text (e.g. Fixed Price / VAT Incl.)"}
                </Label>
                <Input
                  value={labelCfg.customFooterText || ""}
                  onChange={(e) => updateCfg({ customFooterText: e.target.value })}
                  placeholder={isBn ? "ঐচ্ছিক: একদাম / মোবাইল নম্বর" : "Optional: Fixed Price"}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          </div>

          {/* 2. Product Search & Sticker Print Queue */}
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Layers className="size-3.5 text-emerald-600" />
                {isBn
                  ? "২. পণ্য নির্বাচন, বারকোড জেনারেট ও স্টিকার সংখ্যা"
                  : "2. Select Products, Generate Barcodes & Copies"}
              </Label>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addManualCustomLabel}
                  className="h-7 rounded-lg text-[11px] font-semibold gap-1 cursor-pointer"
                >
                  <Plus className="size-3" />
                  {isBn ? "কাস্টম স্টিকার" : "Custom Sticker"}
                </Button>
                {queue.length > 0 && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={matchStockCopies}
                      className="h-7 rounded-lg text-[11px] font-semibold gap-1 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 cursor-pointer"
                    >
                      <Sparkles className="size-3" />
                      {isBn ? "স্টক সমান কপি" : "Match Stock"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQueue([])}
                      className="h-7 rounded-lg text-[11px] text-destructive cursor-pointer"
                    >
                      {isBn ? "সব মুছুন" : "Clear"}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isBn
                    ? "পণ্যের নাম, বারকোড বা ক্যাটাগরি লিখে যোগ করুন..."
                    : "Search product by name, barcode, or SKU to add..."
                }
                className="h-9 pl-8 text-xs rounded-xl bg-background"
              />
            </div>

            {/* Quick Product Chips */}
            {filteredSearchProducts.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {filteredSearchProducts.map((p) => {
                  const inQueue = queue.some((q) => q.productId === p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProductToQueue(p)}
                      className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        inQueue
                          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-background border-border/70 hover:border-indigo-500/50 text-foreground"
                      }`}
                    >
                      <Plus className="size-3 text-indigo-500" />
                      <span className="max-w-[140px] truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        ৳{p.sell_price}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Queue List */}
            {queue.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                {isBn
                  ? "উপরের তালিকা থেকে পণ্যে ক্লিক করুন অথবা 'কাস্টম স্টিকার' বাটনে চাপুন।"
                  : "Click any product above or '+ Custom Sticker' to build your print batch."}
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {queue.map((item) => {
                  const linkedProd = item.productId
                    ? resolvedProducts.find((p) => p.id === item.productId)
                    : undefined;
                  const codeUnsavedOnProduct =
                    linkedProd && (linkedProd.barcode || "").trim() !== item.code.trim();

                  return (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-background border border-border/70 space-y-2"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-4">
                          <Input
                            value={item.name}
                            onChange={(e) => updateQueueItem(item.id, { name: e.target.value })}
                            className="h-7 text-xs font-bold px-2"
                            placeholder={isBn ? "পণ্যের নাম" : "Item name"}
                          />
                        </div>

                        <div className="sm:col-span-4 flex items-center gap-1">
                          <Input
                            value={item.code}
                            onChange={(e) => updateQueueItem(item.id, { code: e.target.value })}
                            className="h-7 text-[11px] font-mono px-2 flex-1"
                            placeholder="Barcode / QR"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7 shrink-0 cursor-pointer text-indigo-600"
                            title={
                              isBn
                                ? "অটো নতুন বারকোড তৈরি করুন"
                                : "Generate unique barcode"
                            }
                            onClick={() => handleGenerateCodeForItem(item.id)}
                          >
                            <Wand2 className="size-3" />
                          </Button>
                          {linkedProd && codeUnsavedOnProduct && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              disabled={savingBarcodeId === item.id}
                              className="size-7 shrink-0 cursor-pointer border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10"
                              title={
                                isBn
                                  ? "এই বারকোডটি পণ্যে স্থায়ীভাবে সেভ করুন"
                                  : "Save this barcode permanently to product"
                              }
                              onClick={() => handleSaveBarcodeToProduct(item)}
                            >
                              <Save className="size-3" />
                            </Button>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) =>
                              updateQueueItem(item.id, { price: Number(e.target.value) || 0 })
                            }
                            className="h-7 text-xs font-mono px-2"
                            placeholder={isBn ? "বিক্রয় মূল্য" : "Price"}
                          />
                        </div>

                        <div className="sm:col-span-2 flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7 shrink-0 cursor-pointer"
                            onClick={() =>
                              updateQueueItem(item.id, {
                                copies: Math.max(1, item.copies - 1),
                              })
                            }
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
                            className="h-7 w-11 text-center text-xs font-bold px-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-7 shrink-0 cursor-pointer"
                            onClick={() =>
                              updateQueueItem(item.id, {
                                copies: Math.min(500, item.copies + 1),
                              })
                            }
                          >
                            <Plus className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive shrink-0 cursor-pointer"
                            onClick={() => removeQueueItem(item.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Optional Variant / MRP secondary inline row when enabled */}
                      {(labelCfg.showVariant !== false || labelCfg.showMrp) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                          {labelCfg.showVariant !== false && (
                            <Input
                              value={item.variantText || ""}
                              onChange={(e) =>
                                updateQueueItem(item.id, { variantText: e.target.value })
                              }
                              placeholder={
                                isBn
                                  ? "সাইজ / কালার / ভ্যারিয়েন্ট (যেমন: Size: XL • Black)"
                                  : "Variant / Size / Color (e.g. XL • Black)"
                              }
                              className="h-6 text-[11px] px-2 bg-muted/30"
                            />
                          )}
                          {labelCfg.showMrp && (
                            <Input
                              type="number"
                              value={item.mrp ?? ""}
                              onChange={(e) =>
                                updateQueueItem(item.id, {
                                  mrp: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              placeholder={
                                isBn ? "রেগুলার / কাটা দাম (MRP ৳)" : "Regular / Strikethrough MRP"
                              }
                              className="h-6 text-[11px] font-mono px-2 bg-muted/30"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Live True-Proportion Sticker Preview & Print / PDF Actions */}
        <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-900 text-slate-100 border border-slate-800 space-y-4 sticky top-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold flex items-center gap-1.5 text-slate-200">
              {labelCfg.barcodeFormat === "QR" ? (
                <QrCode className="size-4 text-emerald-400" />
              ) : (
                <Barcode className="size-4 text-emerald-400" />
              )}
              {isBn ? "লাইভ স্টিকার প্রিভিউ" : "Live Sticker Preview"} (
              {labelCfg.widthMm}×{labelCfg.heightMm}mm)
            </span>
            <Badge
              variant="secondary"
              className="bg-slate-800 text-emerald-300 border-slate-700 text-[10px]"
            >
              {queue.length > 0
                ? isBn
                  ? `মোট ${totalLabelsCount}টি স্টিকার`
                  : `${totalLabelsCount} Stickers Queued`
                : isBn
                ? "নমুনা প্রিভিউ"
                : "Sample Preview"}
            </Badge>
          </div>

          {/* Live Sticker Canvas */}
          <div className="py-5 px-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col items-center justify-center min-h-[225px]">
            <div
              style={{
                width: `${previewW}px`,
                minHeight: `${previewH}px`,
              }}
              className="bg-white text-black rounded-md shadow-2xl p-2 flex flex-col items-center justify-between text-center overflow-hidden border border-slate-300 transition-all"
            >
              <div
                className={`w-full h-full flex flex-col items-center justify-between gap-0.5 ${
                  labelCfg.showBorder ? "border border-black rounded-xs p-1" : ""
                }`}
              >
                {labelCfg.showShopName && (
                  <div
                    style={{ fontSize: `${Math.max(8, labelCfg.fontSizePt + 1)}px` }}
                    className="font-black uppercase tracking-tight leading-tight w-full truncate text-black"
                  >
                    {effectiveShopName || shopName}
                  </div>
                )}

                {labelCfg.showProductName && (
                  <div
                    style={{ fontSize: `${Math.max(9, labelCfg.fontSizePt + 2)}px` }}
                    className="font-extrabold leading-tight w-full truncate text-black"
                  >
                    {previewItem.name}
                  </div>
                )}

                {previewMetaLine && (
                  <div className="text-[9px] font-bold text-black/80 leading-none truncate w-full">
                    {previewMetaLine}
                  </div>
                )}

                {labelCfg.showBarcode && (
                  <div
                    className="w-full my-0.5 flex items-center justify-center overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: previewGraphic.svg }}
                  />
                )}

                {labelCfg.showBarcode && labelCfg.showCodeText && (
                  <div className="font-mono font-extrabold text-[10px] tracking-wider leading-none text-black">
                    {previewGraphic.displayCode}
                  </div>
                )}

                {labelCfg.showPrice && (
                  <div
                    style={{ fontSize: `${Math.max(11, labelCfg.fontSizePt + 4)}px` }}
                    className="font-black leading-tight text-black pt-0.5"
                  >
                    {labelCfg.showMrp &&
                      previewItem.mrp &&
                      Number(previewItem.mrp) > Number(previewItem.price) && (
                        <span className="text-[10px] font-bold line-through opacity-75 mr-1.5">
                          {labelCfg.currencyPrefix || "৳"}
                          {Number(previewItem.mrp).toLocaleString()}
                        </span>
                      )}
                    {labelCfg.currencyPrefix || "৳"}
                    {Number(previewItem.price || 0).toLocaleString()}
                  </div>
                )}

                {labelCfg.customFooterText?.trim() && (
                  <div className="text-[8.5px] font-bold text-black leading-none truncate w-full">
                    {labelCfg.customFooterText.trim()}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 text-[11px] text-slate-400 text-center space-y-0.5">
              {labelCfg.mode === "a4_sheet" ? (
                <p>
                  {isBn
                    ? `A4 কাগজে প্রতি সারিতে ${labelCfg.a4Columns}টি করে স্টিকার প্রিন্ট হবে`
                    : `Prints ${labelCfg.a4Columns} stickers per row on A4 sheet`}
                </p>
              ) : (
                <p>
                  {isBn
                    ? `থার্মাল রোল মাপ: ${layoutMetrics.totalRowWidthMm}×${layoutMetrics.heightMm}mm (${
                        layoutMetrics.rollCols > 1
                          ? `প্রতি সারিতে ${layoutMetrics.rollCols}টি স্টিকার`
                          : "প্রতি সারিতে ১টি স্টিকার"
                      })`
                    : `Thermal Roll Media: ${layoutMetrics.totalRowWidthMm}×${layoutMetrics.heightMm}mm (${layoutMetrics.rollCols}-Up)`}
                </p>
              )}
            </div>
          </div>

          {/* Primary Print & PDF Export Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              type="button"
              onClick={() => handlePrintNow(false)}
              disabled={printing}
              className="w-full h-10 text-xs sm:text-sm font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white gap-2 cursor-pointer shadow-md rounded-xl"
            >
              <Printer className={`size-4 ${printing ? "animate-pulse" : ""}`} />
              {isBn
                ? `এখনই স্টিকার প্রিন্ট করুন (${queue.length > 0 ? totalLabelsCount : 1}টি)`
                : `Print Stickers Now (${queue.length > 0 ? totalLabelsCount : 1})`}
            </Button>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handlePrintNow(true)}
                disabled={printing}
                className="h-9 text-xs font-bold border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 gap-1.5 cursor-pointer rounded-xl"
              >
                <Sliders className="size-3.5" />
                {isBn ? "ডায়ালগ সহ প্রিন্ট" : "Print Dialog"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="h-9 text-xs font-bold border-indigo-500/40 bg-indigo-950/60 hover:bg-indigo-900/70 text-indigo-200 gap-1.5 cursor-pointer rounded-xl"
              >
                <Download className="size-3.5" />
                {downloadingPdf
                  ? isBn
                    ? "PDF তৈরি হচ্ছে..."
                    : "Saving PDF..."
                  : isBn
                  ? "স্টিকার PDF ডাউনলোড"
                  : "Download PDF"}
              </Button>
            </div>
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
  initialProducts?: (Product & { initialCopies?: number })[];
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
      <DialogContent className="max-w-6xl w-[96vw] max-h-[93vh] overflow-y-auto p-4 sm:p-6 rounded-3xl">
        <DialogHeader className="pb-2 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-extrabold">
            <Barcode className="size-5 text-indigo-600" />
            {isBn
              ? "বারকোড ও কাস্টম সাইজ স্টিকার প্রিন্টার"
              : "Barcode & Custom-Size Sticker Printer"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isBn
              ? "যেকোনো মাপের (mm) বারকোড স্টিকার, প্রাইস ট্যাগ অথবা QR লেবেল কাস্টমাইজ করে ১-ক্লিকে প্রিন্ট বা PDF ডাউনলোড করুন"
              : "Design and print custom-size barcode stickers, price tags, or QR labels in 1 click"}
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
