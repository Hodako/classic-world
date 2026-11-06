"use client";

import { getPosHardwareSettings } from "@/lib/pos-hardware";

export interface PosPaperSettings {
  widthMm: number;
  heightMm: number | "auto";
  canvasWidthMm: number;
  marginMm: number;
}

export const DEFAULT_POS_CONFIG: PosPaperSettings = {
  widthMm: 58,
  heightMm: 40,
  canvasWidthMm: 82,
  marginMm: 1,
};

export function getPosPaperConfig(): PosPaperSettings {
  if (typeof window === "undefined") return DEFAULT_POS_CONFIG;
  try {
    const saved = localStorage.getItem("dreamfashion_pos_paper_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        widthMm: Number(parsed.widthMm) || 58,
        heightMm: parsed.heightMm === "auto" ? "auto" : (Number(parsed.heightMm) || 40),
        canvasWidthMm: Number(parsed.canvasWidthMm) || 82,
        marginMm: parsed.marginMm != null && Number.isFinite(Number(parsed.marginMm)) && Number(parsed.marginMm) >= 0 ? Number(parsed.marginMm) : 1,
      };
    }
  } catch (e) {}
  return DEFAULT_POS_CONFIG;
}

export function savePosPaperConfig(config: Partial<PosPaperSettings>): PosPaperSettings {
  const current = getPosPaperConfig();
  const updated: PosPaperSettings = {
    ...current,
    ...config,
  };
  if (typeof window !== "undefined") {
    localStorage.setItem("dreamfashion_pos_paper_config", JSON.stringify(updated));
    window.dispatchEvent(new Event("hz-pos-config-updated"));
  }
  return updated;
}

export interface DirectPrintOptions {
  printerName?: string;
  silent?: boolean;
  copies?: number;
  scaleFactor?: number;
  margins?: {
    topMm?: number;
    bottomMm?: number;
    leftMm?: number;
    rightMm?: number;
  };
  pageSize?: string;
}

/**
 * 1-Click Direct Silent Print or Dialog Print via Electron Native Bridge OR Local Windows POS Bridge (Port 9123)
 * Respects per-device default printer, automated printing toggle, and margins.
 */
export async function executeDirectSilentPrint(
  html: string,
  printerName?: string,
  overrideOptions?: DirectPrintOptions
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const hw = getPosHardwareSettings();
  const effectivePrinter =
    overrideOptions?.printerName !== undefined
      ? overrideOptions.printerName
      : printerName || hw.devicePrinterName || "";
  const effectiveSilent =
    overrideOptions?.silent !== undefined ? overrideOptions.silent : hw.automatePrinting !== false;
  const effectiveCopies = overrideOptions?.copies || hw.copies || 1;
  const effectiveScale = overrideOptions?.scaleFactor || hw.printScale || 100;
  const effectiveMargins = {
    topMm: overrideOptions?.margins?.topMm ?? hw.marginTopMm ?? 0,
    bottomMm: overrideOptions?.margins?.bottomMm ?? hw.marginBottomMm ?? 0,
    leftMm: overrideOptions?.margins?.leftMm ?? hw.marginLeftMm ?? 0,
    rightMm: overrideOptions?.margins?.rightMm ?? hw.marginRightMm ?? 0,
  };

  // 1. Check if running inside our Electron Windows POS Desktop App
  const electronPOS = (window as any).electronPOS;
  if (electronPOS && typeof electronPOS.printSilent === "function") {
    try {
      const res = await electronPOS.printSilent({
        html,
        printerName: effectivePrinter,
        silent: effectiveSilent,
        copies: effectiveCopies,
        scaleFactor: effectiveScale,
        margins: effectiveMargins,
        pageSize: overrideOptions?.pageSize,
        paperWidthMm: hw.paperWidthMm || 80,
      });
      if (res && res.success) return true;
    } catch (e) {
      console.warn("[POS Print] Electron print error:", e);
    }
  }

  // 2. Check if Local Windows POS Hardware Bridge is running on http://127.0.0.1:9123
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch("http://127.0.0.1:9123/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        printerName: effectivePrinter,
        silent: effectiveSilent,
        copies: effectiveCopies,
        scaleFactor: effectiveScale,
        margins: effectiveMargins,
        pageSize: overrideOptions?.pageSize,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) return true;
    }
  } catch (_) {
    // Bridge not running, fall back to browser print
  }

  return false;
}

export async function printPwaPosReceipt(data: {
  businessName: string;
  tagline?: string;
  phone?: string;
  invoiceNo: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  due: number;
}) {
  const config = getPosPaperConfig();
  const hw = getPosHardwareSettings();
  const width = config.widthMm || 58;
  const canvasW = config.canvasWidthMm || 82;
  const heightStr = config.heightMm === "auto" ? "auto" : `${config.heightMm || 40}mm`;
  const topMm = hw.marginTopMm ?? 2;
  const bottomMm = hw.marginBottomMm ?? 4;
  const leftMm = hw.marginLeftMm ?? config.marginMm ?? 2;
  const rightMm = hw.marginRightMm ?? config.marginMm ?? 2;

  const itemsRows = data.items
    .map(
      (item, idx) => `
      <tr style="border-bottom: 1px dashed #000000;">
        <td style="padding: 4px 0; text-align: left; vertical-align: top;">
          <div style="font-weight: 800; font-size: 11px; color: #000000; line-height: 1.2;">${idx + 1}. ${item.name}</div>
          <div style="font-size: 9.5px; font-weight: 800; color: #000000; font-family: monospace;">${item.qty} x ৳${item.price.toLocaleString()}</div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 800; font-size: 11px; color: #000000;">
          ৳${(item.qty * item.price).toLocaleString()}
        </td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="bn" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>POS Invoice ${data.invoiceNo}</title>
  <style>
    @page {
      size: ${width}mm ${heightStr};
      margin: 0mm;
    }
    *, *:before, *:after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      font-family: 'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-weight: 800 !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-scheme: light !important;
    }
    html, body {
      width: 100% !important;
      max-width: ${canvasW}mm !important;
      margin: 0 auto !important;
      padding: ${topMm}mm ${rightMm}mm ${bottomMm}mm ${leftMm}mm !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-weight: 800 !important;
      font-size: 10.5px !important;
      line-height: 1.3 !important;
      zoom: ${hw.printScale || 100}% !important;
    }
    .divider {
      border-bottom: 1.5px dashed #000000 !important;
      margin: 6px 0 !important;
      height: 1px !important;
    }
    .solid-divider {
      border-bottom: 2px solid #000000 !important;
      margin: 6px 0 !important;
      height: 1px !important;
    }
    table.data-table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 4px 0 !important;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="text-align: center; margin-bottom: 4px;">
    <div style="font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000000;">
      ${data.businessName}
    </div>
    ${data.tagline ? `<div style="font-size: 9.5px; font-weight: 800; color: #000000; margin-top: 1px;">${data.tagline}</div>` : ""}
    ${data.phone ? `<div style="font-size: 9.5px; font-weight: 800; color: #000000; font-family: monospace;">Mobile: ${data.phone}</div>` : ""}
  </div>

  <div class="solid-divider"></div>

  <!-- Meta Info Table -->
  <table class="data-table" style="font-size: 9.5px; font-weight: 800; color: #000000;">
    <tr>
      <td style="padding: 1px 0; text-align: left; font-weight: 800;"><strong>Invoice:</strong> #${data.invoiceNo}</td>
      <td style="padding: 1px 0; text-align: right; font-family: monospace; font-weight: 800;">${data.date}</td>
    </tr>
    ${
      data.customerName
        ? `<tr>
            <td colspan="2" style="padding: 1px 0; text-align: left; font-weight: 800;"><strong>Customer:</strong> ${data.customerName} ${data.customerPhone ? `(${data.customerPhone})` : ""}</td>
          </tr>`
        : ""
    }
  </table>

  <div class="divider"></div>

  <!-- Items Table -->
  <table class="data-table">
    <thead>
      <tr style="border-bottom: 1.5px solid #000000;">
        <th style="text-align: left; padding-bottom: 3px; font-size: 10px; font-weight: 900; text-transform: uppercase;">Item Description</th>
        <th style="text-align: right; padding-bottom: 3px; font-size: 10px; font-weight: 900; text-transform: uppercase;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Financial Summary Table -->
  <table class="data-table" style="font-size: 10px; font-weight: 800;">
    <tr>
      <td style="padding: 2px 0; text-align: left; font-weight: 800; color: #000000;">Subtotal:</td>
      <td style="padding: 2px 0; text-align: right; font-family: monospace; font-weight: 800; color: #000000;">৳${data.subtotal.toLocaleString()}</td>
    </tr>
    ${
      data.discount > 0
        ? `<tr>
            <td style="padding: 2px 0; text-align: left; font-weight: 800; color: #000000;">Discount:</td>
            <td style="padding: 2px 0; text-align: right; font-family: monospace; font-weight: 800; color: #000000;">-৳${data.discount.toLocaleString()}</td>
          </tr>`
        : ""
    }
    <tr style="border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000;">
      <td style="padding: 4px 0; text-align: left; font-weight: 900; font-size: 12px; text-transform: uppercase;">Total Payable:</td>
      <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: 900; font-size: 12px;">৳${data.total.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="padding: 2px 0; text-align: left; color: #000000; font-weight: 800;">Paid Amount:</td>
      <td style="padding: 2px 0; text-align: right; font-family: monospace; color: #000000; font-weight: 800;">৳${data.paid}</td>
    </tr>
    ${
      data.due > 0
        ? `<tr>
            <td style="padding: 2px 0; text-align: left; color: #000000; font-weight: 800;">Due Amount:</td>
            <td style="padding: 2px 0; text-align: right; font-family: monospace; color: #000000; font-weight: 900;">৳${data.due.toLocaleString()}</td>
          </tr>`
        : ""
    }
  </table>

  <div class="solid-divider"></div>

  <!-- Footer -->
  <div style="text-align: center; margin-top: 6px; font-size: 9.5px; font-weight: 800; color: #000000;">
    <div style="font-weight: 900; color: #000000;">Thank you for your business!</div>
  </div>
</body>
</html>`;

  // Try direct 1-click silent/dialog print first (Electron or Local POS Bridge)
  const printedDirect = await executeDirectSilentPrint(html);
  if (printedDirect) {
    return;
  }

  // Fallback to hidden iframe print
  const blob = new Blob([html], { type: "text/html; charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  iframe.src = blobUrl;

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      } finally {
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
          } catch (_) {}
        }, 1000);
      }
    }, 300);
  };
}
