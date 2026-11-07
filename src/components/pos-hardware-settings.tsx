"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Printer,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
  ShieldCheck,
  Settings2,
  Sliders,
  Check,
  RotateCcw,
  Eye,
  Scissors,
  Plus,
  Trash2,
  FileText,
  Type,
  Layers,
  Barcode,
} from "lucide-react";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import { buildInvoiceHtml } from "@/lib/invoice-printer";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_HARDWARE_SETTINGS,
  DEFAULT_VISIBILITY_SETTINGS,
  DEFAULT_POLICY_NOTE,
  type PosHardwareSettings as PosHwConfig,
  type CustomInvoiceLine,
  type InvoiceVisibilitySettings,
} from "@/lib/pos-hardware";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InvoicePreviewDialog } from "@/components/invoice-preview-dialog";
import { LabelPrintDialog } from "@/components/label-print-dialog";
import { toast } from "sonner";

interface PrinterItem {
  name: string;
  isDefault?: boolean;
  status?: number;
}

export function PosHardwareSettings({ lang = "en" }: { lang?: "en" | "bn" | string }) {
  const [loading, setLoading] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);
  const [testingDialogPrint, setTestingDialogPrint] = useState(false);
  const [testingDrawer, setTestingDrawer] = useState(false);
  const [settingOsDefault, setSettingOsDefault] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);

  const [hwConfig, setHwConfig] = useState<PosHwConfig>(DEFAULT_HARDWARE_SETTINGS);

  // New Custom Line state for direct editing in settings
  const [newLineText, setNewLineText] = useState("");
  const [newLinePos, setNewLinePos] = useState<"header" | "before_items" | "after_items" | "footer">("header");
  const [newLineAlign, setNewLineAlign] = useState<"left" | "center" | "right">("center");
  const [newLineBold, setNewLineBold] = useState(true);

  const [status, setStatus] = useState<{
    isConnected: boolean;
    isElectron: boolean;
    defaultPrinter?: string;
    printers: PrinterItem[];
  }>({
    isConnected: false,
    isElectron: false,
    printers: [],
  });

  useEffect(() => {
    setHwConfig(getPosHardwareSettings());
    const onChanged = () => setHwConfig(getPosHardwareSettings());
    window.addEventListener("pos-hardware-settings-changed", onChanged);
    return () => window.removeEventListener("pos-hardware-settings-changed", onChanged);
  }, []);

  const updateHw = (patch: Partial<PosHwConfig>, silentToast = false) => {
    const next = savePosHardwareSettings(patch);
    setHwConfig(next);
    if (!silentToast) {
      toast.success(
        lang === "bn"
          ? "প্রিন্টার ও ইনভয়েস সেটিংস সংরক্ষিত হয়েছে!"
          : "Printer & invoice settings saved for this device!"
      );
    }
  };

  const updateVisibility = (patch: Partial<InvoiceVisibilitySettings>) => {
    updateHw({
      visibility: {
        ...(hwConfig.visibility || DEFAULT_VISIBILITY_SETTINGS),
        ...patch,
      },
    });
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
    const nextLines = [...(hwConfig.customLines || []), newLine];
    updateHw({ customLines: nextLines });
    setNewLineText("");
    toast.success(lang === "bn" ? "কাস্টম লাইন যোগ করা হয়েছে" : "Custom line added");
  };

  const handleRemoveCustomLine = (id: string) => {
    const nextLines = (hwConfig.customLines || []).filter((l) => l.id !== id);
    updateHw({ customLines: nextLines });
    toast.success(lang === "bn" ? "লাইন মুছে ফেলা হয়েছে" : "Line removed");
  };

  const checkHardware = async () => {
    setLoading(true);
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    // 1. Check Electron Native Desktop App
    const electronPOS = (window as any).electronPOS;
    if (electronPOS) {
      try {
        const def = await electronPOS.getDefaultPrinter();
        const list = await electronPOS.getPrinters();
        setStatus({
          isConnected: true,
          isElectron: true,
          defaultPrinter: def?.name || "System Default",
          printers: Array.isArray(list) ? list : [],
        });
        setLoading(false);
        return;
      } catch (err) {
        console.warn("[POS Hardware] Electron check error:", err);
      }
    }

    // 2. Check Local Windows POS Bridge on 127.0.0.1:9123
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1500);
      const res = await fetch("http://127.0.0.1:9123/printers", { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        setStatus({
          isConnected: true,
          isElectron: false,
          defaultPrinter: data.defaultPrinter?.name || "System Default",
          printers: Array.isArray(data.printers) ? data.printers : [],
        });
        setLoading(false);
        return;
      }
    } catch (_) {}

    // 3. Browser mode
    setStatus({
      isConnected: false,
      isElectron: false,
      printers: [],
    });
    setLoading(false);
  };

  useEffect(() => {
    checkHardware();
  }, []);

  const activeTargetPrinter = hwConfig.devicePrinterName || status.defaultPrinter || "";

  const handleSetWindowsOsDefaultPrinter = async () => {
    const target = hwConfig.devicePrinterName || status.defaultPrinter;
    if (!target) {
      return toast.error(
        lang === "bn" ? "প্রথমে তালিকা থেকে একটি প্রিন্টার নির্বাচন করুন" : "Please select a printer from the list first"
      );
    }
    setSettingOsDefault(true);
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.setDefaultPrinter) {
        const res = await electronPOS.setDefaultPrinter(target);
        if (res?.success) {
          toast.success(
            lang === "bn"
              ? `Windows OS ডিফল্ট প্রিন্টার হিসেবে "${target}" সেট করা হয়েছে!`
              : `"${target}" set as Windows OS Default Printer!`
          );
          await checkHardware();
          return;
        }
      }
      const res = await fetch("http://127.0.0.1:9123/set-default-printer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: target }),
      });
      if (res.ok) {
        toast.success(
          lang === "bn"
            ? `Windows OS ডিফল্ট প্রিন্টার হিসেবে "${target}" সেট করা হয়েছে!`
            : `"${target}" set as Windows OS Default Printer!`
        );
        await checkHardware();
      } else {
        toast.info(
          lang === "bn"
            ? "Windows OS প্রিন্টার সেট করতে পিসি সফটওয়্যার (Desktop App) চালু করুন"
            : "Launch the Windows Desktop POS software to set the OS default printer."
        );
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to set Windows OS default printer");
    } finally {
      setSettingOsDefault(false);
    }
  };

  const handleOpenWindowsPreferences = async () => {
    const target = activeTargetPrinter;
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.openPrinterPreferences) {
        await electronPOS.openPrinterPreferences(target);
        toast.success(
          lang === "bn"
            ? `Windows প্রিন্টিং প্রেফারেন্স খোলা হচ্ছে (${target || "Default"})`
            : `Opening Windows Printing Preferences (${target || "Default"})`
        );
        return;
      }
      const res = await fetch("http://127.0.0.1:9123/printer-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: target }),
      });
      if (res.ok) {
        toast.success(
          lang === "bn"
            ? `Windows প্রিন্টিং প্রেফারেন্স খোলা হচ্ছে (${target || "Default"})`
            : `Opening Windows Printing Preferences (${target || "Default"})`
        );
      } else {
        toast.info(
          lang === "bn"
            ? "Windows প্রিন্টার প্রেফারেন্স খুলতে পিসি সফটওয়্যার চালু করুন"
            : "Run the Windows POS Desktop app to open native Windows Printer Preferences."
        );
      }
    } catch (_) {
      toast.info(
        lang === "bn"
          ? "Windows প্রিন্টার প্রেফারেন্স খুলতে পিসি সফটওয়্যার চালু করুন"
          : "Run the Windows POS Desktop app to open native Windows Printer Preferences."
      );
    }
  };

  const handleOpenWindowsProperties = async () => {
    const target = activeTargetPrinter;
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.openPrinterProperties) {
        await electronPOS.openPrinterProperties(target);
        toast.success(
          lang === "bn"
            ? `Windows প্রিন্টার প্রপার্টিজ খোলা হচ্ছে (${target || "Default"})`
            : `Opening Windows Printer Properties (${target || "Default"})`
        );
        return;
      }
      const res = await fetch("http://127.0.0.1:9123/printer-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printerName: target }),
      });
      if (res.ok) {
        toast.success(
          lang === "bn"
            ? `Windows প্রিন্টার প্রপার্টিজ খোলা হচ্ছে (${target || "Default"})`
            : `Opening Windows Printer Properties (${target || "Default"})`
        );
      }
    } catch (_) {}
  };

  const buildTestReceiptHtml = () =>
    buildInvoiceHtml(
      {
        businessName: hwConfig.customHeaderTitle || "CLASSIC WORLD",
        tagline: hwConfig.customSubtitle || "POS Thermal Printer Ready",
        shopAddress: hwConfig.customAddress || "123 Retail Street",
        shopPhoneNumbers: hwConfig.customPhone || "01700-000000",
        invoiceNo: "TEST-001",
        invoiceDate: new Date().toLocaleString("en-GB"),
        cashierName: "Admin",
        customerName: lang === "bn" ? "টেস্ট ক্রেতা" : "Test Customer",
        customerPhone: "01800-000000",
        paymentMode: "CASH (নগদ)",
        items: [
          { product: { name: lang === "bn" ? "টেস্ট পণ্য ১ (প্রিন্ট চেক)" : "Test Product 1" }, qty: 1, sellPrice: 500 },
          { product: { name: lang === "bn" ? "টেস্ট পণ্য ২" : "Test Product 2" }, qty: 2, sellPrice: 250 },
        ],
        subtotal: 1000,
        discountAmount: 50,
        total: 950,
        paidAmount: 1000,
        due: 0,
        changeAmount: 50,
        terms: hwConfig.customFooterNote || "আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!",
      },
      hwConfig
    );

  const handleTestPrint = async (forceDialog = false) => {
    if (forceDialog) setTestingDialogPrint(true);
    else setTestingPrint(true);

    const html = buildTestReceiptHtml();
    const widthMm = Number(hwConfig.paperWidthMm) || 80;
    try {
      const success = await executeDirectSilentPrint(html, activeTargetPrinter, {
        silent: forceDialog ? false : hwConfig.automatePrinting !== false,
        copies: hwConfig.copies,
        scaleFactor: hwConfig.printScale,
        pageSize: widthMm >= 180 ? "a4" : `${widthMm}mm`,
        paperWidthMm: widthMm,
        paperHeightMm: hwConfig.paperHeightMm || "auto",
        margins: {
          topMm: hwConfig.marginTopMm,
          bottomMm: hwConfig.marginBottomMm,
          leftMm: hwConfig.marginLeftMm,
          rightMm: hwConfig.marginRightMm,
        },
      });
      if (success) {
        toast.success(
          lang === "bn"
            ? `টেস্ট রসিদ সফলভাবে প্রিন্টারে পাঠানো হয়েছে (${activeTargetPrinter || "Default"})`
            : `Test receipt sent to printer: ${activeTargetPrinter || "Default"}`
        );
      } else {
        toast.info(
          lang === "bn"
            ? "ব্রাউজার প্রিন্ট উইন্ডো খোলা হচ্ছে..."
            : "Opening standard browser print window..."
        );
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.width = "1px";
        iframe.style.height = "1px";
        iframe.style.opacity = "0.01";
        document.body.appendChild(iframe);
        const doc = iframe.contentWindow?.document || iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.print();
            setTimeout(() => {
              try {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
              } catch (_) {}
            }, 1500);
          }, 250);
        }
      }
    } catch (e: any) {
      toast.error(`Print error: ${e.message}`);
    } finally {
      setTestingPrint(false);
      setTestingDialogPrint(false);
    }
  };

  const handleTestCashDrawer = async () => {
    setTestingDrawer(true);
    try {
      const electronPOS = (window as any).electronPOS;
      if (electronPOS?.openCashDrawer) {
        const res = await electronPOS.openCashDrawer(activeTargetPrinter);
        if (res && res.success === false) {
          toast.error(lang === "bn" ? "ক্যাশ ড্রয়ার সংযুক্ত নেই বা প্রিন্টার পাওয়া যায়নি।" : (res.error || "Cash drawer pulse failed"));
        } else {
          toast.success(lang === "bn" ? "ক্যাশ ড্রয়ার সিগন্যাল পাঠানো হয়েছে!" : "Cash drawer kick pulse sent!");
        }
      } else {
        const res = await fetch("http://127.0.0.1:9123/open-drawer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ printerName: activeTargetPrinter }),
        });
        if (res.ok) {
          toast.success(lang === "bn" ? "ক্যাশ ড্রয়ার সিগন্যাল পাঠানো হয়েছে!" : "Cash drawer kick pulse sent!");
        } else {
          toast.info("Cash drawer control requires Windows POS Desktop application.");
        }
      }
    } catch (_) {
      toast.info("Cash drawer control requires Windows POS Desktop application.");
    } finally {
      setTestingDrawer(false);
    }
  };

  return (
    <Card className="p-5 sm:p-6 rounded-3xl bg-card border-border/80 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3.5">
        <div className="flex items-center gap-2.5 text-primary">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <Printer className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2 flex-wrap">
              <span>
                {lang === "bn"
                  ? "উইন্ডোজ প্রিন্টার, অটো-প্রিন্ট ও মার্জিন প্রেফারেন্স (এই ডিভাইসের জন্য)"
                  : "Windows OS Printer, Auto-Print & Thermal Preferences (Per-Device)"}
              </span>
              {status.isConnected ? (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[11px] gap-1">
                  <CheckCircle2 className="size-3" />
                  {status.isElectron ? "Windows Desktop App Active" : "Windows Bridge Connected"}
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[11px] gap-1">
                  <AlertCircle className="size-3" />
                  Browser Mode
                </Badge>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "bn"
                ? "প্রতিটি পিসি বা ডিভাইসের জন্য আলাদা ডিফল্ট প্রিন্টার, অটোমেটেড প্রিন্টিং (অন/অফ) এবং মার্জিন সেট করুন"
                : "Configure device-specific default printer, automated silent printing vs dialog, and exact thermal margins"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setLabelDialogOpen(true)}
            className="rounded-xl h-8 text-xs font-bold gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-xs"
          >
            <Barcode className="size-3.5" />
            {lang === "bn" ? "বারকোড লেবেল প্রিন্ট" : "Label Printing"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={checkHardware}
            disabled={loading}
            className="rounded-xl h-8 text-xs gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            {lang === "bn" ? "প্রিন্টার রিফ্রেশ" : "Refresh Printers"}
          </Button>
        </div>
      </div>

      {/* Row 1: Automated Printing Toggles (Admin / Owner Control) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <Zap className="size-4 text-emerald-500 shrink-0" />
              <span>
                {lang === "bn"
                  ? "অটোমেটেড ১-ক্লিক সাইলেন্ট প্রিন্টিং (পপআপ ছাড়া)"
                  : "Automated 1-Click Silent Printing (No Popup)"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hwConfig.automatePrinting
                ? lang === "bn"
                  ? "চালু আছে: প্রিন্ট বাটনে চাপলে কোনো কনফার্ম মেসেজ ছাড়াই সরাসরি প্রিন্ট হবে।"
                  : "ON: Prints directly to the selected printer without showing Windows print confirmation."
                : lang === "bn"
                  ? "বন্ধ আছে: প্রিন্ট করার সময় Windows Printing Preference ও প্রিন্ট ডায়ালগ দেখাবে।"
                  : "OFF: Shows the Windows Print & Preferences dialog every time before printing."}
            </p>
          </div>
          <Switch
            checked={hwConfig.automatePrinting}
            onCheckedChange={(checked) => updateHw({ automatePrinting: checked })}
          />
        </div>

        <div className="p-4 rounded-2xl bg-muted/30 border border-border/70 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <Printer className="size-4 text-primary shrink-0" />
              <span>
                {lang === "bn"
                  ? "বিক্রি সম্পন্ন হলেই অটো-প্রিন্ট"
                  : "Auto-Print Receipt After Recording Sale"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hwConfig.printMode === "automatic"
                ? lang === "bn"
                  ? "চালু আছে: বিক্রয় রেকর্ড করার সাথে সাথেই স্বয়ংক্রিয়ভাবে রসিদ প্রিন্ট হবে।"
                  : "ON: Completing a sale automatically triggers receipt printing."
                : lang === "bn"
                  ? "বন্ধ আছে: শুধুমাত্র প্রিন্ট বাটনে ক্লিক করলে রসিদ প্রিন্ট হবে।"
                  : "OFF: Prints only when you click the Print button."}
            </p>
          </div>
          <Switch
            checked={hwConfig.printMode === "automatic"}
            onCheckedChange={(checked) => updateHw({ printMode: checked ? "automatic" : "manual" })}
          />
        </div>
      </div>

      {/* Row 2: Per-Device Printer Selection & Real Windows OS Driver Controls */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <Settings2 className="size-4 text-primary" />
              <span>
                {lang === "bn"
                  ? "ডিফল্ট প্রিন্টার নির্বাচন ও প্রিন্টার কন্ট্রোল"
                  : "Device Default Printer & Real Windows OS Printer Controls"}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "প্রতিটি কম্পিউটারের জন্য আলাদা প্রিন্টার সিলেক্ট করতে পারবেন এবং সরাসরি প্রিন্টিং প্রেফারেন্স ওপেন করতে পারবেন"
                : "Each PC/terminal remembers its own selected printer. Open native Windows driver preferences anytime."}
            </p>
          </div>
          {status.defaultPrinter && (
            <Badge variant="secondary" className="text-[10px] font-mono self-start sm:self-auto">
              OS Default: {status.defaultPrinter}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
          <div className="md:col-span-6 space-y-1.5">
            <Label className="text-xs font-semibold">
              {lang === "bn" ? "প্রিন্টার নির্বাচন করুন" : "Select Printer for This Device"}
            </Label>
            <select
              value={hwConfig.devicePrinterName}
              onChange={(e) => updateHw({ devicePrinterName: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground cursor-pointer"
            >
              <option value="">
                {lang === "bn"
                  ? "সিস্টেম ডিফল্ট প্রিন্টার"
                  : `Windows System Default (${status.defaultPrinter || "Auto"})`}
              </option>
              {status.printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? "(Default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-6 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={settingOsDefault}
              onClick={handleSetWindowsOsDefaultPrinter}
              className="h-10 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Check className="size-3.5 text-emerald-500" />
              <span>{lang === "bn" ? "ডিফল্ট প্রিন্টার করুন" : "Set as Windows Default"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenWindowsPreferences}
              className="h-10 rounded-xl text-xs font-bold gap-1.5 border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
            >
              <Sliders className="size-3.5" />
              <span>{lang === "bn" ? "প্রিন্টিং প্রেফারেন্স" : "Windows Printing Preferences"}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenWindowsProperties}
              className="h-10 rounded-xl text-xs font-semibold gap-1.5 cursor-pointer"
            >
              <Settings2 className="size-3.5" />
              <span>{lang === "bn" ? "প্রপার্টিজ" : "Printer Properties"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Row 3: Thermal Receipt Margin, Scale & Copies Preferences */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
              <Sliders className="size-4 text-primary" />
              <span>
                {lang === "bn"
                  ? "থার্মাল প্রিন্টিং সাইজ, মার্জিন, ফন্ট ও স্কেল সেটিংস"
                  : "Thermal Printing Margins (mm), Scale, Fonts & Copies"}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "প্রিন্টারের রোল সাইজ অনুযায়ী টেক্সট যাতে সীমানা অতিক্রম না করে সে জন্য অটোমেটিক ফন্ট হ্রাস হবে। আপনি প্রয়োজনে ফন্ট বাড়াতে বা কমাতে পারেন।"
                : "Receipt font auto-decreases if exceeding roll width. You can also customize margins, base/title font sizes, and scale."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              updateHw({
                marginTopMm: 0,
                marginBottomMm: 0,
                marginLeftMm: 0,
                marginRightMm: 0,
                printScale: 100,
                copies: 1,
                fontSizePt: 7,
                titleFontSizePt: 9.5,
              })
            }
            className="h-7 px-2.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>{lang === "bn" ? "ডিফল্ট রিসেট" : "Reset Defaults"}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "রোল প্রস্থ" : "Width (mm)"}
            </Label>
            <Input
              type="number"
              min="15"
              max="210"
              value={hwConfig.paperWidthMm || 80}
              onChange={(e) => updateHw({ paperWidthMm: Math.max(15, Number(e.target.value) || 80) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "রোল উচ্চতা" : "Height (mm)"}
            </Label>
            <Input
              value={hwConfig.paperHeightMm === "auto" || !hwConfig.paperHeightMm ? "auto" : String(hwConfig.paperHeightMm)}
              onChange={(e) => {
                const val = e.target.value.trim().toLowerCase();
                if (val === "auto" || !val) {
                  updateHw({ paperHeightMm: "auto" }, true);
                } else {
                  const n = parseInt(val.replace(/\D/g, ""), 10);
                  if (Number.isFinite(n) && n > 0) updateHw({ paperHeightMm: n }, true);
                }
              }}
              className="h-9 text-xs font-mono font-bold bg-background"
              placeholder="auto"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "বেস ফন্ট" : "Base Font (pt)"}
            </Label>
            <Input
              type="number"
              min="4.5"
              max="16"
              step="0.5"
              value={hwConfig.fontSizePt || 7}
              onChange={(e) => updateHw({ fontSizePt: Math.min(16, Math.max(4.5, Number(e.target.value) || 7)) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "টাইটেল ফন্ট" : "Title Font (pt)"}
            </Label>
            <Input
              type="number"
              min="6"
              max="24"
              step="0.5"
              value={hwConfig.titleFontSizePt || 8.8}
              onChange={(e) => updateHw({ titleFontSizePt: Math.min(24, Math.max(6, Number(e.target.value) || 8.8)) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "উপরের মার্জিন" : "Top Margin (mm)"}
            </Label>
            <Input
              type="number"
              min="0"
              max="30"
              step="0.5"
              value={hwConfig.marginTopMm}
              onChange={(e) => updateHw({ marginTopMm: Math.max(0, Number(e.target.value) || 0) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "নিচের মার্জিন" : "Bottom Margin (mm)"}
            </Label>
            <Input
              type="number"
              min="0"
              max="40"
              step="0.5"
              value={hwConfig.marginBottomMm}
              onChange={(e) => updateHw({ marginBottomMm: Math.max(0, Number(e.target.value) || 0) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "বাম মার্জিন" : "Left Margin (mm)"}
            </Label>
            <Input
              type="number"
              min="0"
              max="25"
              step="0.5"
              value={hwConfig.marginLeftMm}
              onChange={(e) => updateHw({ marginLeftMm: Math.max(0, Number(e.target.value) || 0) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "ডান মার্জিন" : "Right Margin (mm)"}
            </Label>
            <Input
              type="number"
              min="0"
              max="25"
              step="0.5"
              value={hwConfig.marginRightMm}
              onChange={(e) => updateHw({ marginRightMm: Math.max(0, Number(e.target.value) || 0) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "প্রিন্ট স্কেল" : "Print Scale (%)"}
            </Label>
            <Input
              type="number"
              min="50"
              max="200"
              step="5"
              value={hwConfig.printScale}
              onChange={(e) => updateHw({ printScale: Math.min(200, Math.max(50, Number(e.target.value) || 100)) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "কপি সংখ্যা" : "Copies"}
            </Label>
            <Input
              type="number"
              min="1"
              max="10"
              step="1"
              value={hwConfig.copies}
              onChange={(e) => updateHw({ copies: Math.min(10, Math.max(1, Number(e.target.value) || 1)) }, true)}
              className="h-9 text-xs font-mono font-bold bg-background"
            />
          </div>
        </div>
      </div>

      {/* Row 4: Invoice Texts Customization (দোকানের নাম, ঠিকানা, ফোন, শর্তাবলী ইত্যাদি) */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-3.5">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
            <FileText className="size-4 text-primary" />
            <span>
              {lang === "bn" ? "রসিদ ও ইনভয়েসের টেক্সট পরিবর্তন" : "Customize Invoice Texts"}
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {lang === "bn"
              ? "ইনভয়েসে প্রদর্শিত দোকানের নাম, স্লোগান, ঠিকানা, ফোন নম্বর ও ফুটার শর্তাবলী সরাসরি পরিবর্তন করুন"
              : "Directly change shop header name, tagline, address, phone numbers and return policy terms"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "দোকান / ব্যবসার নাম" : "Shop / Business Name"}
            </Label>
            <Input
              value={hwConfig.customHeaderTitle ?? ""}
              onChange={(e) => updateHw({ customHeaderTitle: e.target.value }, true)}
              placeholder={lang === "bn" ? "ডিফল্ট নাম (যেমন: CLASSIC WORLD)" : "Shop Name"}
              className="h-9 text-xs font-bold bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "ট্যাগলাইন বা স্লোগান" : "Tagline / Subtitle"}
            </Label>
            <Input
              value={hwConfig.customSubtitle ?? ""}
              onChange={(e) => updateHw({ customSubtitle: e.target.value }, true)}
              placeholder={lang === "bn" ? "যেমন: এক্সক্লুসিভ ফ্যাশন কালেকশন" : "Tagline"}
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "দোকানের ঠিকানা" : "Shop Address"}
            </Label>
            <Input
              value={hwConfig.customAddress ?? ""}
              onChange={(e) => updateHw({ customAddress: e.target.value }, true)}
              placeholder={lang === "bn" ? "দোকান নং #১২, নিউ মার্কেট, ঢাকা" : "Shop Address"}
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "মোবাইল নম্বর" : "Shop Phone Number(s)"}
            </Label>
            <Input
              value={hwConfig.customPhone ?? ""}
              onChange={(e) => updateHw({ customPhone: e.target.value }, true)}
              placeholder={lang === "bn" ? "01712-345678, 01898-765432" : "Phone Numbers"}
              className="h-9 text-xs font-mono bg-background"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "ফুটার নোট বা ধন্যবাদ বার্তা" : "Footer Note / Thank You Note"}
            </Label>
            <Input
              value={hwConfig.customFooterNote ?? ""}
              onChange={(e) => updateHw({ customFooterNote: e.target.value }, true)}
              placeholder={lang === "bn" ? "আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!" : "Thank you for shopping with us!"}
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[11px] font-semibold flex items-center justify-between">
              <span>{lang === "bn" ? "পণ্য পরিবর্তন সংক্রান্ত শর্তাবলী / পলিসি নোট" : "Exchange / Return Policy Line"}</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                {lang === "bn" ? "(রসিদের নিচে মুদ্রিত হবে)" : "(Printed at bottom of receipt)"}
              </span>
            </Label>
            <Input
              value={hwConfig.customPolicyNote ?? DEFAULT_POLICY_NOTE}
              onChange={(e) => updateHw({ customPolicyNote: e.target.value }, true)}
              placeholder={DEFAULT_POLICY_NOTE}
              className="h-9 text-xs bg-background font-medium"
            />
          </div>
        </div>
      </div>

      {/* Row 5: Standard Lines Visibility (Hide / Show Existing Lines) */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-3.5">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
            <Layers className="size-4 text-primary" />
            <span>
              {lang === "bn" ? "ইনভয়েসের বিদ্যমান লাইনসমূহ মুছুন বা দেখান (অন/অফ)" : "Hide or Show Existing Invoice Lines"}
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {lang === "bn"
              ? "রসিদ থেকে যেকোনো লাইন বন্ধ (হাইড) করতে সুইচটি অফ করে দিন"
              : "Toggle any standard receipt line on or off to match your desired receipt layout"}
          </p>
        </div>

        {(() => {
          const vis = { ...DEFAULT_VISIBILITY_SETTINGS, ...(hwConfig.visibility || {}) };
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "দোকানের নাম" : "Shop Name"}</span>
                <Switch
                  checked={vis.showShopName !== false}
                  onCheckedChange={(c) => updateVisibility({ showShopName: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ট্যাগলাইন" : "Tagline"}</span>
                <Switch
                  checked={vis.showTagline !== false}
                  onCheckedChange={(c) => updateVisibility({ showTagline: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "দোকানের ঠিকানা" : "Shop Address"}</span>
                <Switch
                  checked={vis.showShopAddress !== false}
                  onCheckedChange={(c) => updateVisibility({ showShopAddress: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ফোন নম্বর" : "Shop Phone"}</span>
                <Switch
                  checked={vis.showShopPhone !== false}
                  onCheckedChange={(c) => updateVisibility({ showShopPhone: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ইনভয়েস নম্বর" : "Invoice No"}</span>
                <Switch
                  checked={vis.showInvoiceNo !== false}
                  onCheckedChange={(c) => updateVisibility({ showInvoiceNo: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "তারিখ ও সময়" : "Date & Time"}</span>
                <Switch
                  checked={vis.showDateTime !== false}
                  onCheckedChange={(c) => updateVisibility({ showDateTime: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ক্যাশিয়ার নাম" : "Cashier Name"}</span>
                <Switch
                  checked={vis.showCashierName !== false && vis.showCashier !== false}
                  onCheckedChange={(c) => updateVisibility({ showCashierName: c, showCashier: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ক্রেতার তথ্য" : "Customer Details"}</span>
                <Switch
                  checked={vis.showCustomerDetails !== false && vis.showCustomer !== false}
                  onCheckedChange={(c) => updateVisibility({ showCustomerDetails: c, showCustomer: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "আইটেম টেবিল হেডার" : "Item Table Header"}</span>
                <Switch
                  checked={vis.showItemHeader !== false && vis.showItemsHeader !== false}
                  onCheckedChange={(c) => updateVisibility({ showItemHeader: c, showItemsHeader: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "মোট মূল্য" : "Subtotal"}</span>
                <Switch
                  checked={vis.showSubtotal !== false}
                  onCheckedChange={(c) => updateVisibility({ showSubtotal: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ডিসকাউন্ট" : "Discount"}</span>
                <Switch
                  checked={vis.showDiscount !== false}
                  onCheckedChange={(c) => updateVisibility({ showDiscount: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "সর্বমোট টাকা" : "Total"}</span>
                <Switch
                  checked={vis.showTotal !== false}
                  onCheckedChange={(c) => updateVisibility({ showTotal: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "পরিশোধ" : "Paid"}</span>
                <Switch
                  checked={vis.showPaid !== false}
                  onCheckedChange={(c) => updateVisibility({ showPaid: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "বকেয়া" : "Due"}</span>
                <Switch
                  checked={vis.showDue !== false}
                  onCheckedChange={(c) => updateVisibility({ showDue: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "ফেরত টাকা" : "Change Return"}</span>
                <Switch
                  checked={vis.showChangeReturn !== false}
                  onCheckedChange={(c) => updateVisibility({ showChangeReturn: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Mode"}</span>
                <Switch
                  checked={vis.showPaymentMode !== false}
                  onCheckedChange={(c) => updateVisibility({ showPaymentMode: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "শর্তাবলী ও ফুটার" : "Terms & Policy"}</span>
                <Switch
                  checked={vis.showTerms !== false}
                  onCheckedChange={(c) => updateVisibility({ showTerms: c })}
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border/60 cursor-pointer">
                <span className="font-semibold">{lang === "bn" ? "পণ্য পরিবর্তন পলিসি লাইন" : "Exchange Policy Line"}</span>
                <Switch
                  checked={vis.showPolicyNote !== false}
                  onCheckedChange={(c) => updateVisibility({ showPolicyNote: c })}
                />
              </label>
            </div>
          );
        })()}
      </div>

      {/* Row 6: Custom Lines Manager (Add & Remove Custom Invoice Lines) */}
      <div className="p-4 rounded-2xl bg-muted/20 border border-border/70 space-y-3.5">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
            <Plus className="size-4 text-primary" />
            <span>
              {lang === "bn" ? "কাস্টম লাইন যোগ ও পরিচালনা" : "Add & Manage Custom Lines"}
            </span>
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {lang === "bn"
              ? "রসিদের উপরে, আইটেমের আগে, পরে বা নিচে যেকোনো অতিরিক্ত তথ্য, নোটিশ বা লাইন যোগ করুন"
              : "Add custom announcements, payment notice, or remarks at header, before/after items, or footer"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
          <div className="sm:col-span-5 space-y-1">
            <Label className="text-[11px] font-semibold">{lang === "bn" ? "লাইনের টেক্সট" : "Line Text"}</Label>
            <Input
              value={newLineText}
              onChange={(e) => setNewLineText(e.target.value)}
              placeholder={lang === "bn" ? "যেমন: বিকাশ মার্চেন্ট নং 01700..." : "Enter line text"}
              className="h-9 text-xs bg-background"
            />
          </div>

          <div className="sm:col-span-3 space-y-1">
            <Label className="text-[11px] font-semibold">{lang === "bn" ? "অবস্থান" : "Position"}</Label>
            <Select value={newLinePos} onValueChange={(v: any) => setNewLinePos(v)}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">{lang === "bn" ? "হেডার (উপরে)" : "Header"}</SelectItem>
                <SelectItem value="before_items">{lang === "bn" ? "আইটেমের পূর্বে" : "Before Items"}</SelectItem>
                <SelectItem value="after_items">{lang === "bn" ? "আইটেমের পরে" : "After Items"}</SelectItem>
                <SelectItem value="footer">{lang === "bn" ? "ফুটার (নিচে)" : "Footer"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label className="text-[11px] font-semibold">{lang === "bn" ? "অ্যালাইনমেন্ট" : "Align"}</Label>
            <Select value={newLineAlign} onValueChange={(v: any) => setNewLineAlign(v)}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder="Align" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="center">{lang === "bn" ? "মাঝখানে" : "Center"}</SelectItem>
                <SelectItem value="left">{lang === "bn" ? "বামে" : "Left"}</SelectItem>
                <SelectItem value="right">{lang === "bn" ? "ডানে" : "Right"}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 flex items-center justify-between gap-1 bg-background px-3 h-9 rounded-xl border border-input">
            <span className="text-xs font-bold">{lang === "bn" ? "বোল্ড" : "Bold"}</span>
            <Switch checked={newLineBold} onCheckedChange={setNewLineBold} />
          </div>

          <div className="sm:col-span-12">
            <Button
              type="button"
              onClick={handleAddCustomLine}
              size="sm"
              className="w-full h-9 text-xs font-bold gap-1.5 cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>{lang === "bn" ? "ইনভয়েসে লাইনটি যোগ করুন" : "Add Line to Invoice"}</span>
            </Button>
          </div>
        </div>

        {/* List of Configured Custom Lines */}
        {hwConfig.customLines && hwConfig.customLines.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <Label className="text-xs font-bold text-foreground">
              {lang === "bn" ? "যুক্ত করা কাস্টম লাইনসমূহ:" : "Configured Custom Lines:"}
            </Label>
            <div className="space-y-1.5">
              {hwConfig.customLines.map((l) => (
                <div
                  key={l.id}
                  className="p-2.5 rounded-xl bg-background border border-border/70 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="text-[10px] shrink-0 font-mono">
                      {l.position === "header"
                        ? lang === "bn" ? "হেডার" : "Header"
                        : l.position === "before_items"
                        ? lang === "bn" ? "আইটেমের পূর্বে" : "Before Items"
                        : l.position === "after_items"
                        ? lang === "bn" ? "আইটেমের পরে" : "After Items"
                        : lang === "bn" ? "ফুটার" : "Footer"}
                    </Badge>
                    <span className={`truncate ${l.bold ? "font-bold" : ""}`}>{l.text}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveCustomLine(l.id)}
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 cursor-pointer shrink-0"
                    title={lang === "bn" ? "লাইন মুছে ফেলুন" : "Delete Line"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action / Test Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="rounded-xl h-9 text-xs font-bold gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 cursor-pointer shadow-sm"
          >
            <Eye className="size-3.5" />
            <span>
              {lang === "bn"
                ? "রসিদ লাইভ প্রিভিউ ও কাস্টমাইজ"
                : "Live Receipt Preview & Customizer"}
            </span>
          </Button>

          <Button
            type="button"
            onClick={() => setLabelDialogOpen(true)}
            className="rounded-xl h-9 text-xs font-bold gap-2 bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer shadow-sm"
          >
            <Barcode className="size-3.5" />
            <span>
              {lang === "bn"
                ? "বারকোড ও প্রাইস লেবেল প্রিন্ট"
                : "Barcode & Price Label Print"}
            </span>
          </Button>

          <Button
            type="button"
            onClick={() => handleTestPrint(false)}
            disabled={testingPrint}
            className="rounded-xl h-9 text-xs font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            <Printer className={`size-3.5 ${testingPrint ? "animate-pulse" : ""}`} />
            <span>
              {hwConfig.automatePrinting
                ? lang === "bn"
                  ? "১-ক্লিক সাইলেন্ট টেস্ট প্রিন্ট"
                  : "Test 1-Click Silent Print"
                : lang === "bn"
                  ? "টেস্ট প্রিন্ট করুন"
                  : "Test Print Receipt"}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleTestPrint(true)}
            disabled={testingDialogPrint}
            className="rounded-xl h-9 text-xs font-semibold gap-2 border-primary/30 cursor-pointer"
          >
            <Sliders className="size-3.5 text-primary" />
            <span>
              {lang === "bn"
                ? "প্রিন্ট ডায়ালগ সহ টেস্ট প্রিন্ট"
                : "Test Print with Windows Dialog"}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleTestCashDrawer}
            disabled={testingDrawer}
            className="rounded-xl h-9 text-xs font-semibold gap-2 cursor-pointer"
          >
            <Zap className="size-3.5 text-amber-500" />
            <span>{lang === "bn" ? "ক্যাশ ড্রয়ার টেস্ট" : "Test Cash Drawer"}</span>
          </Button>
        </div>

        <Badge variant="outline" className="text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          ✓ {lang === "bn" ? "থার্মাল প্রিন্টারে সকল টেক্সট বোল্ড সক্রিয়" : "All-Bold Thermal Text Active"}
        </Badge>
      </div>

      {/* Invoice Live Preview & Customizer Dialog */}
      <InvoicePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        lang={lang}
      />

      {/* Easy Product Barcode & Price Label Printing Dialog */}
      <LabelPrintDialog
        open={labelDialogOpen}
        onOpenChange={setLabelDialogOpen}
        shopName={hwConfig.customHeaderTitle || "CLASSIC WORLD"}
        lang={lang}
      />
    </Card>
  );
}
