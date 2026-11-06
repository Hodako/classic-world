"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Printer,
  Sliders,
  Type,
  Plus,
  Trash2,
  RotateCcw,
  Check,
  Eye,
  Scissors,
  FileText,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_HARDWARE_SETTINGS,
  DEFAULT_VISIBILITY_SETTINGS,
  type PosHardwareSettings,
  type CustomInvoiceLine,
  type InvoiceVisibilitySettings,
} from "@/lib/pos-hardware";
import {
  buildInvoiceHtml,
  printPwaInvoice,
  type PrintInvoiceParams,
} from "@/lib/invoice-printer";
import { toast } from "sonner";

export interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang?: "en" | "bn" | string;
  invoiceData?: PrintInvoiceParams;
  initialSettings?: Partial<PosHardwareSettings>;
  onPrintComplete?: () => void;
}

const PRESET_WIDTHS = [
  { label: "80mm (Standard POS)", value: 80 },
  { label: "76mm (Driver Default)", value: 76 },
  { label: "70mm (Medium Roll)", value: 70 },
  { label: "58mm (Mini Thermal)", value: 58 },
  { label: "50mm (Label/Tape)", value: 50 },
  { label: "20mm (Narrow Strip)", value: 20 },
];

const PRESET_HEIGHTS = [
  { label: "স্বয়ংক্রিয় (Auto)", value: "auto" as const },
  { label: "120mm", value: 120 },
  { label: "100mm", value: 100 },
  { label: "80mm", value: 80 },
  { label: "60mm", value: 60 },
  { label: "50mm", value: 50 },
  { label: "40mm", value: 40 },
  { label: "30mm", value: 30 },
];

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  lang = "bn",
  invoiceData,
  initialSettings,
  onPrintComplete,
}: InvoicePreviewDialogProps) {
  const [settings, setSettings] = useState<PosHardwareSettings>(DEFAULT_HARDWARE_SETTINGS);
  const [customMmInput, setCustomMmInput] = useState<string>("80");
  const [customHeightInput, setCustomHeightInput] = useState<string>("auto");
  const [scaleInput, setScaleInput] = useState<string>("100");
  const [activeTab, setActiveTab] = useState<string>("format");
  const [printing, setPrinting] = useState<boolean>(false);
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // New Custom Line form state
  const [newLineText, setNewLineText] = useState("");
  const [newLinePos, setNewLinePos] = useState<"header" | "before_items" | "after_items" | "footer">("header");
  const [newLineAlign, setNewLineAlign] = useState<"left" | "center" | "right">("center");
  const [newLineBold, setNewLineBold] = useState(true);

  // Load hardware settings when dialog opens
  useEffect(() => {
    if (open) {
      const current = { ...getPosHardwareSettings(), ...(initialSettings || {}) };
      setSettings(current);
      setCustomMmInput(String(current.paperWidthMm || 80));
      setCustomHeightInput(current.paperHeightMm === "auto" || !current.paperHeightMm ? "auto" : String(current.paperHeightMm));
      setScaleInput(String(current.printScale || 100));
    }
  }, [open, initialSettings]);

  // Sample data fallback if no live invoice is supplied
  const effectiveInvoiceData: PrintInvoiceParams = useMemo(() => {
    if (invoiceData) return invoiceData;
    return {
      businessName: settings.customHeaderTitle || "CLASSIC WORLD",
      tagline: settings.customSubtitle || "প্রিমিয়াম পোশাক ও ফ্যাশন ব্র্যান্ড",
      shopAddress: settings.customAddress || "দোকান নং #০৫, সিটি সেন্টার, ঢাকা",
      shopPhoneNumbers: settings.customPhone || "01712-345678",
      invoiceNo: "INV-CW-SAMPLE",
      invoiceDate: new Date().toLocaleDateString("en-GB") + " " + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cashierName: "ক্যাশিয়ার (Admin)",
      customerName: "জনাব সোহেল (Sohel)",
      customerPhone: "01799-887766",
      paymentMode: "CASH (নগদ)",
      items: [
        { product: { name: "ক্লাসিক ক্যাজুয়াল শার্ট (Shirt)" }, qty: 1, sellPrice: 1350 },
        { product: { name: "প্রিমিয়াম ব্ল্যাক চিনো প্যান্ট" }, qty: 1, sellPrice: 1550 },
      ],
      subtotal: 2900,
      discountAmount: 200,
      total: 2700,
      paidAmount: 2700,
      due: 0,
      changeAmount: 0,
      terms: settings.customFooterNote || "আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!\n৭ দিনের মধ্যে ইনভয়েস সহ পণ্য পরিবর্তন প্রযোজ্য",
    };
  }, [invoiceData, settings]);

  // Generate live invoice HTML string
  const invoiceHtml = useMemo(() => {
    return buildInvoiceHtml(effectiveInvoiceData, settings);
  }, [effectiveInvoiceData, settings]);

  const updateSettings = (patch: Partial<PosHardwareSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const updateVisibility = (patch: Partial<InvoiceVisibilitySettings>) => {
    setSettings((prev) => ({
      ...prev,
      visibility: {
        ...(prev.visibility || DEFAULT_VISIBILITY_SETTINGS),
        ...patch,
      },
    }));
  };

  const handleCustomMmChange = (valStr: string) => {
    setCustomMmInput(valStr);
    const num = parseInt(valStr.replace(/\D/g, ""), 10);
    if (Number.isFinite(num) && num > 0) {
      updateSettings({ paperWidthMm: num });
    }
  };

  const handleCustomHeightChange = (valStr: string) => {
    setCustomHeightInput(valStr);
    if (valStr.toLowerCase() === "auto" || !valStr.trim()) {
      updateSettings({ paperHeightMm: "auto" });
      return;
    }
    const num = parseInt(valStr.replace(/\D/g, ""), 10);
    if (Number.isFinite(num) && num > 0) {
      updateSettings({ paperHeightMm: num });
    }
  };

  const handleScaleChange = (valStr: string) => {
    setScaleInput(valStr);
    const num = parseInt(valStr.replace(/\D/g, ""), 10);
    if (Number.isFinite(num) && num >= 20 && num <= 250) {
      updateSettings({ printScale: num });
    }
  };

  const handleAddCustomLine = () => {
    const text = newLineText.trim();
    if (!text) {
      toast.error(lang === "bn" ? "লাইনের টেক্সট লিখুন" : "Please enter line text");
      return;
    }
    const newLine: CustomInvoiceLine = {
      id: "line_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      text,
      position: newLinePos,
      align: newLineAlign,
      bold: newLineBold,
    };
    const nextLines = [...(settings.customLines || []), newLine];
    updateSettings({ customLines: nextLines });
    setNewLineText("");
    toast.success(lang === "bn" ? "কাস্টম লাইন যোগ করা হয়েছে" : "Custom line added");
  };

  const handleRemoveCustomLine = (id: string) => {
    const nextLines = (settings.customLines || []).filter((l) => l.id !== id);
    updateSettings({ customLines: nextLines });
    toast.success(lang === "bn" ? "লাইন মুছে ফেলা হয়েছে" : "Line removed");
  };

  const handleSaveDefault = () => {
    const saved = savePosHardwareSettings(settings);
    setSettings(saved);
    toast.success(
      lang === "bn"
        ? "ইনভয়েস সাইজ, টেক্সট এবং মার্জিন ডিফল্ট হিসেবে সংরক্ষিত হয়েছে!"
        : "Invoice size, texts, and margins saved as permanent defaults!"
    );
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      savePosHardwareSettings(settings);
      await printPwaInvoice(effectiveInvoiceData, settings);
      toast.success(lang === "bn" ? "প্রিন্ট সম্পন্ন বা স্পুলারে পাঠানো হয়েছে!" : "Print sent to printer spooler!");
      if (onPrintComplete) onPrintComplete();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Print error");
    } finally {
      setPrinting(false);
    }
  };

  const handleResetDefaults = () => {
    const def = { ...DEFAULT_HARDWARE_SETTINGS };
    setSettings(def);
    setCustomMmInput(String(def.paperWidthMm));
    setCustomHeightInput("auto");
    setScaleInput(String(def.printScale));
    toast.info(lang === "bn" ? "ডিফল্ট মার্জিন (০ মিমি) ও সাইজ রিসেট করা হয়েছে" : "Reset to default 0mm margins & settings");
  };

  const currentWidthMm = Number(settings.paperWidthMm) || 80;
  const currentHeightMm =
    settings.paperHeightMm !== undefined &&
    settings.paperHeightMm !== "auto" &&
    Number(settings.paperHeightMm) > 0
      ? Number(settings.paperHeightMm)
      : null;
  const currentScale = Number(settings.printScale) || 100;
  const vis = { ...DEFAULT_VISIBILITY_SETTINGS, ...(settings.visibility || {}) };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[92vh] max-h-[860px] p-0 flex flex-col overflow-hidden bg-background border-border/80 rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b border-border/70 flex flex-row items-center justify-between space-y-0 shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Eye className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <span>{lang === "bn" ? "ইনভয়েস লাইভ প্রিভিউ ও কাস্টমাইজেশন" : "Live Invoice Preview & Customizer"}</span>
                <Badge variant="outline" className="font-mono text-xs font-bold bg-primary/10 text-primary border-primary/30">
                  {currentWidthMm}mm × {currentHeightMm ? `${currentHeightMm}mm` : "Auto"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {lang === "bn"
                  ? "যে কোনো সাইজ (২০মিমি, ৫০মিমি, ৭০মিমি, ৮০মিমি), মার্জিন ০মিমি, ফন্ট সাইজ এবং কাস্টম লাইন প্রিভিউ ও এডিট করুন"
                  : "Preview exact thermal roll layout, adjust 0mm margins, fit to width, edit texts, and add custom lines"}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              className="h-8 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              <span>{lang === "bn" ? "রিসেট" : "Reset"}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSaveDefault}
              className="h-8 text-xs gap-1.5 cursor-pointer font-bold border-primary/40 text-primary hover:bg-primary/10"
            >
              <Check className="size-3.5" />
              <span>{lang === "bn" ? "ডিফল্ট সেভ করুন" : "Save as Default"}</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Body: Split view (Left: Controls Tabs, Right: Realistic Thermal Paper Preview) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border/60">
          {/* Controls Column (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden bg-card">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <div className="p-3 border-b border-border/60 bg-muted/10 shrink-0">
                <TabsList className="grid grid-cols-4 w-full h-9">
                  <TabsTrigger value="format" className="text-xs gap-1.5">
                    <Scissors className="size-3.5" />
                    <span>{lang === "bn" ? "সাইজ ও ফিট" : "Size & Fit"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="typography" className="text-xs gap-1.5">
                    <Type className="size-3.5" />
                    <span>{lang === "bn" ? "ফন্ট ও মার্জিন" : "Fonts & Margins"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="texts" className="text-xs gap-1.5">
                    <FileText className="size-3.5" />
                    <span>{lang === "bn" ? "টেক্সট এডিট" : "Edit Texts"}</span>
                  </TabsTrigger>
                  <TabsTrigger value="lines" className="text-xs gap-1.5">
                    <Plus className="size-3.5" />
                    <span>{lang === "bn" ? "কাস্টম লাইন" : "Lines & Hide"}</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Tab 1: Size, Width & Fit */}
              <TabsContent value="format" className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 m-0">
                {/* Paper Width Presets */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "থার্মাল পেপার প্রস্থ নির্বাচন করুন (Paper Width Presets)" : "Paper Width Presets"}
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PRESET_WIDTHS.map((preset) => {
                      const isSelected = currentWidthMm === preset.value;
                      return (
                        <Button
                          key={preset.value}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            updateSettings({ paperWidthMm: preset.value });
                            setCustomMmInput(String(preset.value));
                          }}
                          className={`h-9 text-xs font-bold rounded-xl justify-center cursor-pointer ${
                            isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                          }`}
                        >
                          {preset.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom MM Input */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-foreground">
                        {lang === "bn" ? "কাস্টম সাইজ লিখে সেট করুন (Custom mm by Typing)" : "Custom Width in Millimeters"}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "bn"
                          ? "যেকোনো বিশেষ থার্মাল রোল সাইজ যেমন 70mm, 50mm, 20mm লিখে দিন"
                          : "Type any custom thermal roll size (e.g. 70, 50, 20, 48)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 w-32 shrink-0">
                      <Input
                        type="number"
                        min="15"
                        max="210"
                        value={customMmInput}
                        onChange={(e) => handleCustomMmChange(e.target.value)}
                        className="h-8 text-xs font-mono font-bold text-center bg-background"
                        placeholder="70"
                      />
                      <span className="text-xs font-bold text-muted-foreground">mm</span>
                    </div>
                  </div>
                </div>

                {/* Paper Height Controls (User sets height to eliminate blank space) */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-foreground">
                        {lang === "bn" ? "কাগজের উচ্চতা নির্ধারণ (Paper Height)" : "Paper Height Selection"}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "bn"
                          ? "উপরে ও নিচে বাড়তি ফাঁকা জায়গা দূর করতে উচ্চতা অটো বা নির্দিষ্ট মিমি (যেমন 50mm, 60mm) সেট করুন"
                          : "Eliminate top and bottom wasted blank space by setting exact height or auto"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 w-32 shrink-0">
                      <Input
                        value={customHeightInput}
                        onChange={(e) => handleCustomHeightChange(e.target.value)}
                        className="h-8 text-xs font-mono font-bold text-center bg-background"
                        placeholder="auto"
                      />
                      <span className="text-xs font-bold text-muted-foreground">mm</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PRESET_HEIGHTS.map((preset) => {
                      const isSelected =
                        preset.value === "auto"
                          ? settings.paperHeightMm === "auto" || !settings.paperHeightMm
                          : Number(settings.paperHeightMm) === preset.value;
                      return (
                        <Button
                          key={String(preset.value)}
                          type="button"
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => {
                            updateSettings({ paperHeightMm: preset.value });
                            setCustomHeightInput(String(preset.value));
                          }}
                          className={`h-8 text-xs font-bold rounded-xl justify-center cursor-pointer ${
                            isSelected ? "ring-2 ring-primary ring-offset-1" : ""
                          }`}
                        >
                          {preset.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Fit to Width Option */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-4 text-emerald-500" />
                      <span>{lang === "bn" ? "কাগজে নিখুঁত ফিট (Fit to Width)" : "Fit Content to Paper Width"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {lang === "bn"
                        ? "টেক্সট এবং টেবিল স্বয়ংক্রিয়ভাবে নির্বাচিত রোলের ভেতরে ফিট থাকবে, কোনো টেক্সট রোল বাইরে কেটে যাবে না।"
                        : "Constrains text and items within the printable roll boundary so nothing clips off edges."}
                    </p>
                  </div>
                  <Switch
                    checked={settings.fitToWidth !== false}
                    onCheckedChange={(checked) => updateSettings({ fitToWidth: checked })}
                  />
                </div>

                {/* Custom Print Scale Typing */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Maximize2 className="size-3.5 text-primary" />
                        <span>{lang === "bn" ? "কাস্টম প্রিন্টিং স্কেল টাইপ করে দিন (Scale %)" : "Custom Print Scale (Type %)"}</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "bn"
                          ? "টাইপ করুন: যেমন 95%, 100%, 110% বা বোতাম চেপে পরিবর্তন করুন"
                          : "Type exact zoom percentage or use stepper buttons (20% to 250%)"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg cursor-pointer"
                        onClick={() => {
                          const next = Math.max(20, currentScale - 5);
                          updateSettings({ printScale: next });
                          setScaleInput(String(next));
                        }}
                      >
                        -
                      </Button>
                      <div className="relative w-20">
                        <Input
                          type="number"
                          min="20"
                          max="250"
                          value={scaleInput}
                          onChange={(e) => handleScaleChange(e.target.value)}
                          className="h-8 text-xs font-mono font-bold text-center pr-5 bg-background"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">
                          %
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 rounded-lg cursor-pointer"
                        onClick={() => {
                          const next = Math.min(250, currentScale + 5);
                          updateSettings({ printScale: next });
                          setScaleInput(String(next));
                        }}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Typography & Margins */}
              <TabsContent value="typography" className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 m-0">
                {/* Font Size Adjusters */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-3">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Type className="size-3.5 text-primary" />
                      <span>{lang === "bn" ? "ফন্ট সাইজ বৃদ্ধি / হ্রাস করুন (Font Sizes)" : "Font Size Adjusters (pt)"}</span>
                    </Label>
                    <Badge variant="outline" className="text-[10px] font-bold">
                      {lang === "bn" ? "সব লেখা স্বয়ংক্রিয় বোল্ড" : "Pure Thermal Bold"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{lang === "bn" ? "মূল ফন্ট (Base Font):" : "Base Font:"}</span>
                        <span className="font-mono font-bold text-primary">{settings.fontSizePt || 8.5} pt</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-bold cursor-pointer"
                          onClick={() => {
                            const cur = Number(settings.fontSizePt) || 8.5;
                            updateSettings({ fontSizePt: Math.max(5.5, Number((cur - 0.5).toFixed(1))) });
                          }}
                        >
                          - A
                        </Button>
                        <Input
                          type="number"
                          step="0.5"
                          min="5"
                          max="16"
                          value={settings.fontSizePt || 8.5}
                          onChange={(e) => updateSettings({ fontSizePt: Number(e.target.value) || 8.5 })}
                          className="h-8 text-xs font-mono font-bold text-center bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-bold cursor-pointer"
                          onClick={() => {
                            const cur = Number(settings.fontSizePt) || 8.5;
                            updateSettings({ fontSizePt: Math.min(18, Number((cur + 0.5).toFixed(1))) });
                          }}
                        >
                          + A
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{lang === "bn" ? "দোকানের নাম ফন্ট (Title Font):" : "Shop Title Font:"}</span>
                        <span className="font-mono font-bold text-primary">{settings.titleFontSizePt || 12} pt</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-bold cursor-pointer"
                          onClick={() => {
                            const cur = Number(settings.titleFontSizePt) || 12;
                            updateSettings({ titleFontSizePt: Math.max(8, Number((cur - 0.5).toFixed(1))) });
                          }}
                        >
                          - A
                        </Button>
                        <Input
                          type="number"
                          step="0.5"
                          min="8"
                          max="24"
                          value={settings.titleFontSizePt || 12}
                          onChange={(e) => updateSettings({ titleFontSizePt: Number(e.target.value) || 12 })}
                          className="h-8 text-xs font-mono font-bold text-center bg-background"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-bold cursor-pointer"
                          onClick={() => {
                            const cur = Number(settings.titleFontSizePt) || 12;
                            updateSettings({ titleFontSizePt: Math.min(26, Number((cur + 0.5).toFixed(1))) });
                          }}
                        >
                          + A
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Margins: Default 0mm & User Selection */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs font-bold text-foreground">
                        {lang === "bn" ? "মার্জিন নির্বাচন করুন (চারপাশের ফাঁকা জায়গা mm)" : "Receipt Margins in Millimeters (mm)"}
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        {lang === "bn"
                          ? "থার্মাল পেপারে বাড়তি ফাঁকা জায়গা দূর করতে টপ ও বটম মার্জিন ০ মিমি রাখা হয়েছে।"
                          : "Default is set to 0mm to eliminate excessive top and bottom blank paper feed."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateSettings({
                          marginTopMm: 0,
                          marginBottomMm: 0,
                          marginLeftMm: 0,
                          marginRightMm: 0,
                        })
                      }
                      className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer"
                    >
                      <span>০ মিমি (0mm) সেট</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-semibold">
                        {lang === "bn" ? "উপরে (Top mm)" : "Top (mm)"}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="30"
                        step="0.5"
                        value={settings.marginTopMm ?? 0}
                        onChange={(e) => updateSettings({ marginTopMm: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-xs font-mono font-bold bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-semibold">
                        {lang === "bn" ? "নিচে (Bottom mm)" : "Bottom (mm)"}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="40"
                        step="0.5"
                        value={settings.marginBottomMm ?? 0}
                        onChange={(e) => updateSettings({ marginBottomMm: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-xs font-mono font-bold bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-semibold">
                        {lang === "bn" ? "বামে (Left mm)" : "Left (mm)"}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="20"
                        step="0.5"
                        value={settings.marginLeftMm ?? 0}
                        onChange={(e) => updateSettings({ marginLeftMm: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-xs font-mono font-bold bg-background"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-semibold">
                        {lang === "bn" ? "ডানে (Right mm)" : "Right (mm)"}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="20"
                        step="0.5"
                        value={settings.marginRightMm ?? 0}
                        onChange={(e) => updateSettings({ marginRightMm: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 text-xs font-mono font-bold bg-background"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Text Editing */}
              <TabsContent value="texts" className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3.5 m-0">
                <div className="text-xs text-muted-foreground">
                  {lang === "bn"
                    ? "ইনভয়েসে প্রদর্শিত প্রতিটি টেক্সট সরাসরি আপনার পছন্দ অনুযায়ী এডিট করুন:"
                    : "Directly customize all receipt header, address, phone and footer texts:"}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "দোকান / ব্যবসার নাম (Shop Name)" : "Header / Business Title"}
                  </Label>
                  <Input
                    value={settings.customHeaderTitle ?? effectiveInvoiceData.businessName}
                    onChange={(e) => updateSettings({ customHeaderTitle: e.target.value })}
                    placeholder="CLASSIC WORLD"
                    className="h-9 text-xs font-bold bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "ট্যাগলাইন বা স্লোগান (Tagline)" : "Tagline / Subtitle"}
                  </Label>
                  <Input
                    value={settings.customSubtitle ?? (effectiveInvoiceData.tagline || "")}
                    onChange={(e) => updateSettings({ customSubtitle: e.target.value })}
                    placeholder="প্রিমিয়াম পোশাক ও ফ্যাশন ব্র্যান্ড"
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "দোকানের ঠিকানা (Address)" : "Shop Address"}
                  </Label>
                  <Input
                    value={settings.customAddress ?? (effectiveInvoiceData.shopAddress || "")}
                    onChange={(e) => updateSettings({ customAddress: e.target.value })}
                    placeholder="দোকান নং #০৫, সিটি সেন্টার, ঢাকা"
                    className="h-9 text-xs bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "মোবাইল নম্বর (Phone)" : "Shop Phone Number(s)"}
                  </Label>
                  <Input
                    value={settings.customPhone ?? (effectiveInvoiceData.shopPhoneNumbers || "")}
                    onChange={(e) => updateSettings({ customPhone: e.target.value })}
                    placeholder="01712-345678, 01898-765432"
                    className="h-9 text-xs font-mono bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "ফুটার নোট বা শর্তাবলী (Footer Note / Terms)" : "Footer Note & Return Policy"}
                  </Label>
                  <Input
                    value={settings.customFooterNote ?? (effectiveInvoiceData.terms || "")}
                    onChange={(e) => updateSettings({ customFooterNote: e.target.value })}
                    placeholder="আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!"
                    className="h-9 text-xs bg-background"
                  />
                </div>
              </TabsContent>

              {/* Tab 4: Custom Lines & Visibility Toggles */}
              <TabsContent value="lines" className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-4 m-0">
                {/* Add Custom Line Section */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-2.5">
                  <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Plus className="size-3.5 text-primary" />
                    <span>{lang === "bn" ? "নতুন কাস্টম লাইন যোগ করুন" : "Add Custom Receipt Line"}</span>
                  </Label>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-12">
                      <Input
                        value={newLineText}
                        onChange={(e) => setNewLineText(e.target.value)}
                        placeholder={lang === "bn" ? "লাইনের টেক্সট লিখুন (যেমন: 'বিকাশ নম্বর: ০১৭১২...')" : "Enter line text"}
                        className="h-8 text-xs bg-background"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <Select value={newLinePos} onValueChange={(v: any) => setNewLinePos(v)}>
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue placeholder="Position" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="header">{lang === "bn" ? "উপরে (Header)" : "Header"}</SelectItem>
                          <SelectItem value="before_items">{lang === "bn" ? "আইটেমের আগে" : "Before Items"}</SelectItem>
                          <SelectItem value="after_items">{lang === "bn" ? "আইটেমের পরে" : "After Items"}</SelectItem>
                          <SelectItem value="footer">{lang === "bn" ? "ফুটার (নিচে)" : "Footer"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-4">
                      <Select value={newLineAlign} onValueChange={(v: any) => setNewLineAlign(v)}>
                        <SelectTrigger className="h-8 text-xs bg-background">
                          <SelectValue placeholder="Align" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="center">{lang === "bn" ? "মাঝখানে (Center)" : "Center"}</SelectItem>
                          <SelectItem value="left">{lang === "bn" ? "বামে (Left)" : "Left"}</SelectItem>
                          <SelectItem value="right">{lang === "bn" ? "ডানে (Right)" : "Right"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="sm:col-span-4 flex items-center justify-between gap-1 bg-background px-2.5 rounded-md border border-input">
                      <span className="text-xs font-bold">{lang === "bn" ? "বোল্ড (Bold)" : "Bold"}</span>
                      <Switch checked={newLineBold} onCheckedChange={setNewLineBold} />
                    </div>
                  </div>

                  <Button
                    type="button"
                    onClick={handleAddCustomLine}
                    size="sm"
                    className="w-full h-8 text-xs font-bold gap-1.5 cursor-pointer mt-1"
                  >
                    <Plus className="size-3.5" />
                    <span>{lang === "bn" ? "ইনভয়েসে লাইনটি যোগ করুন" : "Add Line to Receipt"}</span>
                  </Button>
                </div>

                {/* Existing Custom Lines List */}
                {settings.customLines && settings.customLines.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">
                      {lang === "bn" ? "যুক্ত করা কাস্টম লাইনসমূহ:" : "Configured Custom Lines:"}
                    </Label>
                    <div className="space-y-1.5">
                      {settings.customLines.map((l) => (
                        <div
                          key={l.id}
                          className="p-2.5 rounded-lg bg-muted/20 border border-border/60 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                              {l.position}
                            </Badge>
                            <span className={`truncate ${l.bold ? "font-bold" : ""}`}>{l.text}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveCustomLine(l.id)}
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Standard Lines Visibility Toggles */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-2.5">
                  <Label className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "বিদ্যমান লাইন অন / অফ করুন (Show/Hide Existing Lines)" : "Standard Line Visibility"}
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "দোকানের নাম" : "Shop Name"}</span>
                      <Switch
                        checked={vis.showShopName !== false}
                        onCheckedChange={(c) => updateVisibility({ showShopName: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "ট্যাগলাইন" : "Tagline"}</span>
                      <Switch
                        checked={vis.showTagline !== false}
                        onCheckedChange={(c) => updateVisibility({ showTagline: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "দোকানের ঠিকানা" : "Shop Address"}</span>
                      <Switch
                        checked={vis.showShopAddress !== false}
                        onCheckedChange={(c) => updateVisibility({ showShopAddress: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "দোকানের ফোন নম্বর" : "Shop Phone"}</span>
                      <Switch
                        checked={vis.showShopPhone !== false}
                        onCheckedChange={(c) => updateVisibility({ showShopPhone: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "ইনভয়েস নম্বর" : "Invoice No"}</span>
                      <Switch
                        checked={vis.showInvoiceNo !== false}
                        onCheckedChange={(c) => updateVisibility({ showInvoiceNo: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "তারিখ ও সময়" : "Date & Time"}</span>
                      <Switch
                        checked={vis.showDateTime !== false}
                        onCheckedChange={(c) => updateVisibility({ showDateTime: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "ক্যাশিয়ার নাম" : "Cashier Name"}</span>
                      <Switch
                        checked={vis.showCashierName !== false}
                        onCheckedChange={(c) => updateVisibility({ showCashierName: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "কাস্টমার তথ্য" : "Customer Details"}</span>
                      <Switch
                        checked={vis.showCustomerDetails !== false}
                        onCheckedChange={(c) => updateVisibility({ showCustomerDetails: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "আইটেম টেবিল হেডার" : "Item Table Header"}</span>
                      <Switch
                        checked={vis.showItemHeader !== false}
                        onCheckedChange={(c) => updateVisibility({ showItemHeader: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "ডিসকাউন্ট লাইন" : "Discount Line"}</span>
                      <Switch
                        checked={vis.showDiscount !== false}
                        onCheckedChange={(c) => updateVisibility({ showDiscount: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "ফেরত টাকা (Change)" : "Change Return"}</span>
                      <Switch
                        checked={vis.showChangeReturn !== false}
                        onCheckedChange={(c) => updateVisibility({ showChangeReturn: c })}
                      />
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50 cursor-pointer">
                      <span>{lang === "bn" ? "শর্তাবলী / নোট" : "Terms & Policy"}</span>
                      <Switch
                        checked={vis.showTerms !== false}
                        onCheckedChange={(c) => updateVisibility({ showTerms: c })}
                      />
                    </label>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Live Thermal Paper Roll Preview Column (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col h-full bg-slate-900/90 overflow-hidden">
            {/* Preview Toolbar */}
            <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-slate-700 bg-slate-800/80 text-slate-200 text-xs font-mono font-bold">
                  {currentWidthMm}mm Real Size
                </Badge>
                <Badge variant="outline" className="border-slate-700 bg-slate-800/80 text-emerald-400 text-xs font-mono">
                  Scale: {currentScale}%
                </Badge>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                  onClick={() => setPreviewZoom((z) => Math.max(60, z - 10))}
                  title="Zoom Out"
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
                  {previewZoom}%
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                  onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))}
                  title="Zoom In"
                >
                  <ZoomIn className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Realistic Thermal Paper Roll Simulation */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto flex items-start justify-center bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px]">
              <div
                style={{
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease",
                }}
                className="flex flex-col items-center shrink-0"
              >
                {/* Paper Tear Effect Top */}
                <div
                  style={{ width: `${Math.min(currentWidthMm * 3.78, 380)}px` }}
                  className="h-2 bg-white border-t border-dashed border-slate-300 rounded-t-sm shadow-md"
                />

                {/* Thermal Receipt Paper Roll Container */}
                <div
                  style={{
                    width: `${Math.min(currentWidthMm * 3.78, 380)}px`,
                    height: currentHeightMm ? `${currentHeightMm * 3.78}px` : "auto",
                    minHeight: currentHeightMm ? `${currentHeightMm * 3.78}px` : "240px",
                    maxHeight: currentHeightMm ? `${currentHeightMm * 3.78}px` : undefined,
                  }}
                  className="bg-white text-black p-0 shadow-2xl transition-all duration-200 border-x border-slate-200 select-none overflow-hidden"
                >
                  <iframe
                    title="Invoice Live Preview"
                    srcDoc={invoiceHtml}
                    className="w-full border-none pointer-events-none"
                    style={{
                      height: currentHeightMm ? `${currentHeightMm * 3.78}px` : "580px",
                      background: "#ffffff",
                    }}
                  />
                </div>

                {/* Paper Tear Effect Bottom */}
                <div
                  style={{ width: `${Math.min(currentWidthMm * 3.78, 380)}px` }}
                  className="h-3 bg-white border-b border-dashed border-slate-400 rounded-b-sm shadow-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 sm:p-4 border-t border-border/70 flex flex-row items-center justify-between space-y-0 shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
              ✓ {lang === "bn" ? "প্রিন্টারে সকল লেখা বোল্ড ও নিখুঁত ফিট হবে" : "All bold thermal text & perfect fit"}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 px-4 text-xs font-semibold cursor-pointer"
            >
              {lang === "bn" ? "বন্ধ করুন" : "Close"}
            </Button>
            <Button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              className="h-9 px-5 text-xs font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-sm"
            >
              <Printer className={`size-4 ${printing ? "animate-pulse" : ""}`} />
              <span>{lang === "bn" ? "এখনই প্রিন্ট করুন" : "Print Receipt Now"}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
