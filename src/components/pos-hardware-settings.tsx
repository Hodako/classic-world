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
} from "lucide-react";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import {
  getPosHardwareSettings,
  savePosHardwareSettings,
  DEFAULT_HARDWARE_SETTINGS,
  type PosHardwareSettings as PosHwConfig,
} from "@/lib/pos-hardware";
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

  const [hwConfig, setHwConfig] = useState<PosHwConfig>(DEFAULT_HARDWARE_SETTINGS);

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
          ? "প্রিন্টার এবং প্রিন্টিং প্রেফারেন্স সংরক্ষিত হয়েছে!"
          : "Printer & printing preferences saved for this device!"
      );
    }
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

  const buildTestReceiptHtml = () => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { size: 80mm auto; margin: 0mm !important; }
        *, body, div, span, p, strong {
          font-family: 'Nirmala UI', 'Hind Siliguri', 'Segoe UI', Arial, sans-serif !important;
          font-weight: 800 !important;
          color: #000000 !important;
          box-sizing: border-box !important;
        }
        body {
          width: 100%;
          max-width: 74mm;
          margin: 0 auto;
          padding: ${hwConfig.marginTopMm}mm ${hwConfig.marginRightMm}mm ${hwConfig.marginBottomMm}mm ${hwConfig.marginLeftMm}mm !important;
          background: #ffffff !important;
          color: #000000 !important;
          font-size: 12px;
          text-align: center;
          zoom: ${hwConfig.printScale || 100}%;
        }
        .title { font-size: 16px; font-weight: 900 !important; margin-bottom: 4px; }
        .divider { border-top: 1.5px dashed #000000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800 !important; margin: 3px 0; }
      </style>
    </head>
    <body>
      <div class="title">POS THERMAL PRINT TEST</div>
      <div style="font-size: 11px; font-weight: 800;">ALL TEXTS BOLD & CRISP</div>
      <div class="divider"></div>
      <div class="row"><span>Printer:</span><span>${activeTargetPrinter || "Windows Default"}</span></div>
      <div class="row"><span>Mode:</span><span>${hwConfig.automatePrinting ? "AUTO SILENT" : "PREFERENCE DIALOG"}</span></div>
      <div class="row"><span>Margins (T/B/L/R):</span><span>${hwConfig.marginTopMm}/${hwConfig.marginBottomMm}/${hwConfig.marginLeftMm}/${hwConfig.marginRightMm}mm</span></div>
      <div class="row"><span>Scale / Copies:</span><span>${hwConfig.printScale}% / ${hwConfig.copies}x</span></div>
      <div class="row"><span>Time:</span><span>${new Date().toLocaleTimeString()}</span></div>
      <div class="divider"></div>
      <div style="font-size: 10.5px; font-weight: 800; margin-top: 6px;">Windows OS Thermal Printer Ready!</div>
    </body>
    </html>
  `;

  const handleTestPrint = async (forceDialog = false) => {
    if (forceDialog) setTestingDialogPrint(true);
    else setTestingPrint(true);

    const html = buildTestReceiptHtml();
    try {
      const success = await executeDirectSilentPrint(html, activeTargetPrinter, {
        silent: forceDialog ? false : hwConfig.automatePrinting !== false,
        copies: hwConfig.copies,
        scaleFactor: hwConfig.printScale,
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
            setTimeout(() => document.body.removeChild(iframe), 1500);
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
        await electronPOS.openCashDrawer(activeTargetPrinter);
        toast.success(lang === "bn" ? "ক্যাশ ড্রয়ার সিগন্যাল পাঠানো হয়েছে!" : "Cash drawer kick pulse sent!");
      } else {
        const res = await fetch("http://127.0.0.1:9123/open-drawer", { method: "POST" });
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
                  ? "বিক্রি সম্পন্ন হলেই অটো-প্রিন্ট (Auto-Print on Sale)"
                  : "Auto-Print Receipt After Recording Sale"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hwConfig.printMode === "automatic"
                ? lang === "bn"
                  ? "চালু আছে: বিক্রয় রেকর্ড করার সাথে সাথেই স্বয়ংক্রিয়ভাবে রসিদ প্রিন্ট হবে।"
                  : "ON: Completing a sale automatically triggers receipt printing."
                : lang === "bn"
                  ? "বন্ধ আছে: শুধুমাত্র প্রিন্ট [Space] বাটনে ক্লিক করলে রসিদ প্রিন্ট হবে।"
                  : "OFF: Prints only when you click the Print [Space] button."}
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
                  ? "এই ডিভাইসের ডিফল্ট প্রিন্টার নির্বাচন ও Windows OS কন্ট্রোল"
                  : "Device Default Printer & Real Windows OS Printer Controls"}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "প্রতিটি কম্পিউটারের জন্য আলাদা প্রিন্টার সিলেক্ট করতে পারবেন এবং সরাসরি Windows Printing Preferences ওপেন করতে পারবেন"
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
              {lang === "bn" ? "প্রিন্টার নির্বাচন করুন (Select Printer for this PC)" : "Select Printer for This Device"}
            </Label>
            <select
              value={hwConfig.devicePrinterName}
              onChange={(e) => updateHw({ devicePrinterName: e.target.value })}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-xs font-semibold text-foreground cursor-pointer"
            >
              <option value="">
                {lang === "bn"
                  ? `সিস্টেম ডিফল্ট প্রিন্টার (${status.defaultPrinter || "Windows Default"})`
                  : `Windows System Default (${status.defaultPrinter || "Auto"})`}
              </option>
              {status.printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isDefault ? "(Windows Default)" : ""}
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
              <span>{lang === "bn" ? "Windows ডিফল্ট করুন" : "Set as Windows Default"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenWindowsPreferences}
              className="h-10 rounded-xl text-xs font-bold gap-1.5 border-primary/40 text-primary hover:bg-primary/10 cursor-pointer"
            >
              <Sliders className="size-3.5" />
              <span>{lang === "bn" ? "Windows প্রিন্টিং প্রেফারেন্স" : "Windows Printing Preferences"}</span>
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
                  ? "থার্মাল প্রিন্টিং মার্জিন, স্কেল এবং কপি সেটিংস"
                  : "Thermal Printing Margins (mm), Scale & Copies"}
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {lang === "bn"
                ? "প্রিন্টার অনুযায়ী রসিদের চারপাশের মার্জিন (মিলিমিটারে) ও জুম স্কেল কাস্টমাইজ করুন (সকল টেক্সট অটোমেটিক বোল্ড হবে)"
                : "Adjust top, bottom, left, and right receipt margins in millimeters to match your thermal printer roll"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              updateHw({
                marginTopMm: 2,
                marginBottomMm: 4,
                marginLeftMm: 2,
                marginRightMm: 2,
                printScale: 100,
                copies: 1,
              })
            }
            className="h-7 px-2.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="size-3" />
            <span>{lang === "bn" ? "ডিফল্ট মার্জিন" : "Reset Defaults"}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold">
              {lang === "bn" ? "উপরের মার্জিন (Top mm)" : "Top Margin (mm)"}
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
              {lang === "bn" ? "নিচের মার্জিন (Bottom mm)" : "Bottom Margin (mm)"}
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
              {lang === "bn" ? "বাম মার্জিন (Left mm)" : "Left Margin (mm)"}
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
              {lang === "bn" ? "ডান মার্জিন (Right mm)" : "Right Margin (mm)"}
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
              {lang === "bn" ? "প্রিন্ট স্কেল (Scale %)" : "Print Scale (%)"}
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
              {lang === "bn" ? "কপি সংখ্যা (Copies)" : "Copies"}
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

      {/* Action / Test Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
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
          ✓ {lang === "bn" ? "থার্মাল প্রিন্টারে সকল টেক্সট বোল্ড (Bold) সক্রিয়" : "All-Bold Thermal Text Active"}
        </Badge>
      </div>
    </Card>
  );
}
