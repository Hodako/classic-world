"use client";

import type { Product } from "@/lib/queries";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import {
  getPosHardwareSettings,
  DEFAULT_LABEL_SETTINGS,
  type PosLabelSettings,
} from "@/lib/pos-hardware";

export interface LabelQueueItem {
  id: string;
  productId?: string;
  name: string;
  code: string;
  price: number;
  category?: string;
  copies: number;
}

export interface LabelPreset {
  id: string;
  labelEn: string;
  labelBn: string;
  mode: "thermal" | "a4_sheet";
  widthMm: number;
  heightMm: number;
  a4Columns?: number;
}

export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: "38x25",
    labelEn: "38×25mm (Standard Sticker)",
    labelBn: "৩৮×২৫ মিমি (স্ট্যান্ডার্ড স্টিকার)",
    mode: "thermal",
    widthMm: 38,
    heightMm: 25,
  },
  {
    id: "50x30",
    labelEn: "50×30mm (Retail Tag)",
    labelBn: "৫০×৩০ মিমি (রিটেইল প্রাইস ট্যাগ)",
    mode: "thermal",
    widthMm: 50,
    heightMm: 30,
  },
  {
    id: "50x25",
    labelEn: "50×25mm (Medium Sticker)",
    labelBn: "৫০×২৫ মিমি (মিডিয়াম স্টিকার)",
    mode: "thermal",
    widthMm: 50,
    heightMm: 25,
  },
  {
    id: "40x30",
    labelEn: "40×30mm (Apparel Tag)",
    labelBn: "৪০×৩০ মিমি (গার্মেন্টস ট্যাগ)",
    mode: "thermal",
    widthMm: 40,
    heightMm: 30,
  },
  {
    id: "58x40",
    labelEn: "58×40mm (Large Label)",
    labelBn: "৫৮×৪০ মিমি (বড় লেবেল)",
    mode: "thermal",
    widthMm: 58,
    heightMm: 40,
  },
  {
    id: "a4_4col",
    labelEn: "A4 Sheet (4 Columns • 40/page)",
    labelBn: "A4 শীট (৪ কলাম • পেজে ৪০টি)",
    mode: "a4_sheet",
    widthMm: 48,
    heightMm: 26,
    a4Columns: 4,
  },
  {
    id: "a4_3col",
    labelEn: "A4 Sheet (3 Columns • 24/page)",
    labelBn: "A4 শীট (৩ কলাম • পেজে ২৪টি)",
    mode: "a4_sheet",
    widthMm: 64,
    heightMm: 33,
    a4Columns: 3,
  },
];

// ISO/IEC 15417 Code-128 Bar/Space Width Patterns (0..106)
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolves a clean, scanner-ready ASCII barcode string for any product,
 * automatically falling back to SKU/code/short-ID when no barcode is set.
 */
export function resolveProductBarcode(product: Partial<Product> & { id?: string }): string {
  const candidates = [
    product.barcode,
    product.sku,
    product.code,
    product.product_number != null ? String(product.product_number) : "",
    product.qr_code,
    product.id ? product.id.slice(-8).toUpperCase() : "",
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = String(raw)
      .trim()
      .replace(/[^\x20-\x7E]/g, "");
    if (cleaned.length >= 1 && cleaned.length <= 28) {
      return cleaned;
    }
  }
  return "ITEM001";
}

/**
 * Generates a crisp, dependency-free ISO/IEC 15417 Code-128 vector SVG barcode.
 * Uses Code-128C for even-length pure numeric codes (compact wide bars) and Code-128B for general ASCII.
 */
export function generateCode128Svg(rawText: string, heightPx = 30): string {
  const clean = String(rawText || "ITEM001")
    .trim()
    .replace(/[^\x20-\x7E]/g, "")
    .slice(0, 32) || "ITEM001";

  const codes: number[] = [];
  if (/^\d+$/.test(clean) && clean.length >= 4 && clean.length % 2 === 0) {
    // Code-128 Subset C (2 digits per symbol -> ultra-scannable wide bars)
    codes.push(105);
    for (let i = 0; i < clean.length; i += 2) {
      codes.push(parseInt(clean.slice(i, i + 2), 10));
    }
  } else {
    // Code-128 Subset B (full printable ASCII 32..126)
    codes.push(104);
    for (let i = 0; i < clean.length; i++) {
      const val = clean.charCodeAt(i) - 32;
      codes.push(val >= 0 && val <= 94 ? val : 0);
    }
  }

  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop pattern

  const quietZone = 10;
  let x = quietZone;
  const rects: string[] = [];

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const w = Number(pattern[j]) || 1;
      if (j % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${w}" height="100" fill="#000000" />`);
      }
      x += w;
    }
  }

  const totalWidth = x + quietZone;
  const safeH = Math.max(14, Math.min(80, Number(heightPx) || 30));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: 100%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

export interface BuildLabelsOptions {
  shopName?: string;
  settings?: Partial<PosLabelSettings>;
  forcePrintDialog?: boolean;
}

/**
 * Builds pixel-accurate HTML for either Thermal Roll Stickers (1 per die-cut label)
 * or A4 Multi-Sticker Sheets (grid layout for standard office printers).
 */
export function buildLabelsHtml(items: LabelQueueItem[], options?: BuildLabelsOptions): string {
  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const shopName = escapeHtml(options?.shopName || hw.customHeaderTitle || "CLASSIC WORLD");
  const isA4 = cfg.mode === "a4_sheet";
  const widthMm = Math.max(20, Math.min(120, Number(cfg.widthMm) || 38));
  const heightMm = Math.max(15, Math.min(100, Number(cfg.heightMm) || 25));
  const cols = Math.max(1, Math.min(6, Number(cfg.a4Columns) || 4));

  // Auto-fit font sizes to sticker height & width so text never clips
  const maxFontForSticker = heightMm <= 22 ? 6.5 : heightMm <= 26 ? 7.8 : heightMm <= 32 ? 9.0 : 10.5;
  const basePt = Math.min(Number(cfg.fontSizePt) || 8, maxFontForSticker);
  const shopPt = Math.max(5.5, Number((basePt - 1.0).toFixed(1)));
  const pricePt = Number((basePt + 1.4).toFixed(1));
  const codePt = Math.max(5.5, Number((basePt - 1.2).toFixed(1)));

  // Scale barcode height cleanly to fit inside the sticker
  const activeTextRows =
    (cfg.showShopName ? 1 : 0) +
    (cfg.showProductName ? 1 : 0) +
    (cfg.showPrice ? 1 : 0) +
    (cfg.showCodeText && cfg.showBarcode ? 1 : 0) +
    (cfg.showCategory ? 1 : 0);
  const maxBarcodePx = Math.max(
    14,
    Math.floor(heightMm * 3.78 - activeTextRows * (basePt * 1.45) - 10)
  );
  const effectiveBarcodePx = Math.min(Number(cfg.barcodeHeightPx) || 28, maxBarcodePx);

  const expandedStickers: LabelQueueItem[] = [];
  for (const item of items) {
    const count = Math.max(1, Math.min(500, Math.floor(Number(item.copies) || 1)));
    for (let c = 0; c < count; c++) {
      expandedStickers.push(item);
    }
  }

  const renderSingleStickerInner = (item: LabelQueueItem) => {
    const barcodeSvg = cfg.showBarcode ? generateCode128Svg(item.code, effectiveBarcodePx) : "";
    const currency = escapeHtml(cfg.currencyPrefix || "৳");
    return `
      <div class="sticker-inner">
        ${cfg.showShopName ? `<div class="st-shop">${shopName}</div>` : ""}
        ${cfg.showProductName ? `<div class="st-name">${escapeHtml(item.name)}</div>` : ""}
        ${cfg.showCategory && item.category ? `<div class="st-cat">${escapeHtml(item.category)}</div>` : ""}
        ${cfg.showBarcode ? `<div class="st-bar">${barcodeSvg}</div>` : ""}
        ${cfg.showBarcode && cfg.showCodeText ? `<div class="st-code">${escapeHtml(item.code)}</div>` : ""}
        ${cfg.showPrice ? `<div class="st-price">${currency}${Number(item.price || 0).toLocaleString()}</div>` : ""}
      </div>
    `;
  };

  if (isA4) {
    return `<!DOCTYPE html>
<html lang="bn" data-pos-label-mode="a4_sheet" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8" />
  <title>Product Barcode Labels (A4 Sheet)</title>
  <style>
    @page {
      size: A4 portrait !important;
      margin: 6mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      color: #000000 !important;
      font-family: 'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'Segoe UI', Arial, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      width: 100% !important;
    }
    .a4-grid {
      display: grid;
      grid-template-columns: repeat(${cols}, 1fr);
      gap: 2.5mm;
      width: 100%;
    }
    .a4-cell {
      height: ${heightMm}mm;
      border: 0.5px dashed #94a3b8;
      border-radius: 1.5mm;
      padding: 1.2mm 1.5mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #ffffff !important;
    }
    .sticker-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
    }
    .st-shop { font-size: ${shopPt}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.05; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-name { font-size: ${basePt}pt; font-weight: 800; line-height: 1.1; max-width: 100%; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
    .st-cat { font-size: ${codePt}pt; font-weight: 700; line-height: 1.05; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-bar { width: 96%; margin: 0.5px auto; flex-shrink: 1; overflow: hidden; }
    .st-code { font-size: ${codePt}pt; font-family: monospace !important; font-weight: 800; letter-spacing: 0.4px; line-height: 1; }
    .st-price { font-size: ${pricePt}pt; font-weight: 900; line-height: 1.1; }
  </style>
</head>
<body>
  <div class="a4-grid">
    ${expandedStickers.map((st) => `<div class="a4-cell">${renderSingleStickerInner(st)}</div>`).join("\n")}
  </div>
</body>
</html>`;
  }

  return `<!DOCTYPE html>
<html lang="bn" data-pos-label-mode="thermal" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8" />
  <title>Thermal Barcode Labels (${widthMm}x${heightMm}mm)</title>
  <style>
    @page {
      size: ${widthMm}mm ${heightMm}mm !important;
      margin: 0mm !important;
      padding: 0mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      color: #000000 !important;
      font-family: 'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'Segoe UI', Arial, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
      width: ${widthMm}mm !important;
    }
    .pos-label-page {
      width: ${widthMm}mm !important;
      height: ${heightMm}mm !important;
      padding: 1.2mm 1.5mm !important;
      background: #ffffff !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .pos-label-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .sticker-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
    }
    .st-shop { font-size: ${shopPt}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.3px; line-height: 1.05; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-name { font-size: ${basePt}pt; font-weight: 800; line-height: 1.1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-cat { font-size: ${codePt}pt; font-weight: 700; line-height: 1.05; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-bar { width: 96%; margin: 0.4px auto; flex-shrink: 1; overflow: hidden; }
    .st-code { font-size: ${codePt}pt; font-family: monospace !important; font-weight: 800; letter-spacing: 0.4px; line-height: 1; }
    .st-price { font-size: ${pricePt}pt; font-weight: 900; line-height: 1.1; }
  </style>
</head>
<body>
  ${expandedStickers.map((st) => `<div class="pos-label-page">${renderSingleStickerInner(st)}</div>`).join("\n")}
</body>
</html>`;
}

/**
 * 1-Click Print Product Barcode / Price Labels on Thermal Label Printers or A4 Sheets
 */
export async function printProductLabels(items: LabelQueueItem[], options?: BuildLabelsOptions): Promise<void> {
  if (!items.length) return;

  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const html = buildLabelsHtml(items, options);
  const isA4 = cfg.mode === "a4_sheet";
  const targetPrinter = cfg.printerName || hw.devicePrinterName || "";

  const printedDirect = await executeDirectSilentPrint(html, targetPrinter || undefined, {
    printerName: targetPrinter || undefined,
    silent: options?.forcePrintDialog ? false : hw.automatePrinting !== false,
    copies: 1,
    scaleFactor: 100,
    pageSize: isA4 ? "a4" : `${cfg.widthMm}mm`,
    paperWidthMm: isA4 ? 210 : cfg.widthMm,
    paperHeightMm: isA4 ? "auto" : cfg.heightMm,
    margins: { topMm: 0, bottomMm: 0, leftMm: 0, rightMm: 0 },
    isLabel: true,
  });

  if (printedDirect) return;

  if (typeof document === "undefined") return;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "none";
  iframe.style.opacity = "0.01";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        setTimeout(() => {
          try {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
          } catch {}
        }, 1500);
      }
    }, 250);
  }
}
