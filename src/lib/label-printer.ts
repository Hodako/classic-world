"use client";

import {
  QRCodeEncoder,
  QRCodeDecoderErrorCorrectionLevel,
} from "@zxing/library";
import type { Product } from "@/lib/queries";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import {
  getPosHardwareSettings,
  DEFAULT_LABEL_SETTINGS,
  type PosLabelSettings,
  type BarcodeSymbology,
} from "@/lib/pos-hardware";

export interface LabelQueueItem {
  id: string;
  productId?: string;
  name: string;
  code: string;
  price: number;
  mrp?: number;
  category?: string;
  variantText?: string;
  copies: number;
}

export interface LabelPreset {
  id: string;
  labelEn: string;
  labelBn: string;
  mode: "thermal" | "a4_sheet";
  widthMm: number;
  heightMm: number;
  rollColumns?: number;
  columnGapMm?: number;
  a4Columns?: number;
}

export const LABEL_PRESETS: LabelPreset[] = [
  {
    id: "25x15",
    labelEn: "25×15mm (Mini / Jewelry)",
    labelBn: "২৫×১৫ মিমি (জুয়েলারি / মিনি)",
    mode: "thermal",
    widthMm: 25,
    heightMm: 15,
    rollColumns: 1,
  },
  {
    id: "30x20",
    labelEn: "30×20mm (Small Sticker)",
    labelBn: "৩০×২০ মিমি (ছোট স্টিকার)",
    mode: "thermal",
    widthMm: 30,
    heightMm: 20,
    rollColumns: 1,
  },
  {
    id: "38x25",
    labelEn: "38×25mm (Standard Sticker)",
    labelBn: "৩৮×২৫ মিমি (স্ট্যান্ডার্ড স্টিকার)",
    mode: "thermal",
    widthMm: 38,
    heightMm: 25,
    rollColumns: 1,
  },
  {
    id: "38x25_2col",
    labelEn: "38×25mm • 2-Column Roll",
    labelBn: "৩৮×২৫ মিমি • ২-কলাম রোল",
    mode: "thermal",
    widthMm: 38,
    heightMm: 25,
    rollColumns: 2,
    columnGapMm: 2,
  },
  {
    id: "40x30",
    labelEn: "40×30mm (Garments Tag)",
    labelBn: "৪০×৩০ মিমি (গার্মেন্টস ট্যাগ)",
    mode: "thermal",
    widthMm: 40,
    heightMm: 30,
    rollColumns: 1,
  },
  {
    id: "50x25",
    labelEn: "50×25mm (Medium Sticker)",
    labelBn: "৫০×২৫ মিমি (মিডিয়াম স্টিকার)",
    mode: "thermal",
    widthMm: 50,
    heightMm: 25,
    rollColumns: 1,
  },
  {
    id: "50x30",
    labelEn: "50×30mm (Retail Tag)",
    labelBn: "৫০×৩০ মিমি (রিটেইল প্রাইস ট্যাগ)",
    mode: "thermal",
    widthMm: 50,
    heightMm: 30,
    rollColumns: 1,
  },
  {
    id: "58x40",
    labelEn: "58×40mm (Large Label)",
    labelBn: "৫৮×৪০ মিমি (বড় লেবেল)",
    mode: "thermal",
    widthMm: 58,
    heightMm: 40,
    rollColumns: 1,
  },
  {
    id: "60x40",
    labelEn: "60×40mm (Wide Label)",
    labelBn: "৬০×৪০ মিমি (চওড়া স্টিকার)",
    mode: "thermal",
    widthMm: 60,
    heightMm: 40,
    rollColumns: 1,
  },
  {
    id: "100x150",
    labelEn: "100×150mm (Parcel / Shipping)",
    labelBn: "১০০×১৫০ মিমি (পার্সেল / কুরিয়ার)",
    mode: "thermal",
    widthMm: 100,
    heightMm: 150,
    rollColumns: 1,
  },
  {
    id: "a4_5col",
    labelEn: "A4 Sheet (5 Col • 65/page)",
    labelBn: "A4 শীট (৫ কলাম • পেজে ৬৫টি)",
    mode: "a4_sheet",
    widthMm: 38,
    heightMm: 21,
    a4Columns: 5,
  },
  {
    id: "a4_4col",
    labelEn: "A4 Sheet (4 Col • 40/page)",
    labelBn: "A4 শীট (৪ কলাম • পেজে ৪০টি)",
    mode: "a4_sheet",
    widthMm: 48,
    heightMm: 26,
    a4Columns: 4,
  },
  {
    id: "a4_3col",
    labelEn: "A4 Sheet (3 Col • 24/page)",
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

// ISO/IEC 16388 Code-39 Patterns (9 elements: n=1, w=3; alternating bar/space)
const CODE39_MAP: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", "A": "wnnnnwnnw", "B": "nnwnnwnnw",
  "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn", "F": "nnwnwwnnn",
  "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn", "J": "nnnnwwwnn",
  "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww",
  "O": "wnnnwnnwn", "P": "nnwnwnnwn", "Q": "nnnnnnwww", "R": "wnnnnnwwn",
  "S": "nnwnnnwwn", "T": "nnnnwnwwn", "U": "wwnnnnnnw", "V": "nwwnnnnnw",
  "W": "wwwnnnnnn", "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

// ISO/IEC 15420 EAN-13 Tables
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = [
  "LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG",
  "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL",
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
 * Formats product attributes (e.g., { Size: "XL", Color: "Black" }) into a compact sticker subtitle
 */
export function resolveProductVariantText(product: Partial<Product>): string {
  if (!product.attributes || typeof product.attributes !== "object") return "";
  const parts = Object.entries(product.attributes)
    .filter(([k, v]) => k && v)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.slice(0, 3).join(" • ");
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
    if (cleaned.length >= 1 && cleaned.length <= 32) {
      return cleaned;
    }
  }
  return "89400001";
}

/**
 * Computes valid 13-digit EAN-13 string (with modulo-10 check digit) from numeric digits.
 */
export function normalizeEan13Digits(rawDigits: string): string {
  const digitsOnly = String(rawDigits || "").replace(/\D/g, "");
  const base12 = (digitsOnly.length >= 12 ? digitsOnly.slice(0, 12) : ("894" + digitsOnly).padEnd(12, "0")).slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(base12[i]) || 0;
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return base12 + String(check);
}

/**
 * Generates a guaranteed-unique barcode for a product (EAN-13 13-digit or compact Code-128 SKU).
 */
export function generateUniqueBarcode(
  format: BarcodeSymbology = "CODE128",
  existingCodes?: Iterable<string>,
  prefix = "894"
): string {
  const used = new Set<string>();
  if (existingCodes) {
    for (const c of existingCodes) {
      if (c) used.add(String(c).trim().toUpperCase());
    }
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    let candidate = "";
    if (format === "EAN13") {
      const rand9 = String(Math.floor(100000000 + Math.random() * 900000000));
      candidate = normalizeEan13Digits("894" + rand9);
    } else if (format === "CODE39") {
      const rand6 = String(Math.floor(100000 + Math.random() * 900000));
      const cleanPfx = prefix.replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 4) || "SKU";
      candidate = `${cleanPfx}-${rand6}`;
    } else {
      // Compact 8-digit numeric Code-128C (ultra-wide bars, scans fastest even on tiny 25x15mm stickers!)
      candidate = String(Math.floor(10000000 + Math.random() * 90000000));
    }
    if (!used.has(candidate.toUpperCase())) {
      return candidate;
    }
  }
  return String(Date.now()).slice(-8);
}

/**
 * Generates a crisp ISO/IEC 15417 Code-128 vector SVG barcode (Code-128C for even digits, Code-128B for ASCII).
 */
export function generateCode128Svg(rawText: string, heightPx = 30, widthPct = 96): string {
  const clean =
    String(rawText || "89400001")
      .trim()
      .replace(/[^\x20-\x7E]/g, "")
      .slice(0, 32) || "89400001";

  const codes: number[] = [];
  if (/^\d+$/.test(clean) && clean.length >= 4 && clean.length % 2 === 0) {
    codes.push(105); // Start C
    for (let i = 0; i < clean.length; i += 2) {
      codes.push(parseInt(clean.slice(i, i + 2), 10));
    }
  } else {
    codes.push(104); // Start B
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
  codes.push(106); // Stop

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
  const safeH = Math.max(12, Math.min(110, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates an ISO/IEC 16388 Code-39 vector SVG barcode.
 */
export function generateCode39Svg(rawText: string, heightPx = 30, widthPct = 96): string {
  const upper = String(rawText || "ITEM01")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, "")
    .slice(0, 20) || "ITEM01";

  const full = `*${upper}*`;
  const quietZone = 10;
  let x = quietZone;
  const rects: string[] = [];

  for (let c = 0; c < full.length; c++) {
    const pat = CODE39_MAP[full[c]] || CODE39_MAP["0"];
    for (let i = 0; i < pat.length; i++) {
      const w = pat[i] === "w" ? 3 : 1;
      if (i % 2 === 0) {
        rects.push(`<rect x="${x}" y="0" width="${w}" height="100" fill="#000000" />`);
      }
      x += w;
    }
    x += 1; // inter-character narrow gap
  }

  const totalWidth = x + quietZone;
  const safeH = Math.max(12, Math.min(110, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates an ISO/IEC 15420 EAN-13 vector SVG barcode (falls back to Code-128 if non-numeric).
 */
export function generateEan13Svg(rawText: string, heightPx = 30, widthPct = 96): string {
  const trimmed = String(rawText || "").trim();
  if (!/^\d{6,14}$/.test(trimmed)) {
    return generateCode128Svg(trimmed || "894000000001", heightPx, widthPct);
  }
  const ean = normalizeEan13Digits(trimmed);
  const first = Number(ean[0]) || 0;
  const parity = EAN_PARITY[first] || EAN_PARITY[0];

  let bits = "101"; // Left guard
  for (let i = 0; i < 6; i++) {
    const d = Number(ean[i + 1]) || 0;
    bits += parity[i] === "G" ? EAN_G[d] : EAN_L[d];
  }
  bits += "01010"; // Center guard
  for (let i = 7; i < 13; i++) {
    const d = Number(ean[i]) || 0;
    bits += EAN_R[d];
  }
  bits += "101"; // Right guard

  const quietZone = 11;
  let x = quietZone;
  const rects: string[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === "1") {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === "1") run++;
      rects.push(`<rect x="${x}" y="0" width="${run}" height="100" fill="#000000" />`);
      x += run;
      i += run;
    } else {
      x += 1;
      i += 1;
    }
  }

  const totalWidth = x + quietZone;
  const safeH = Math.max(12, Math.min(110, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates a crisp offline ISO/IEC 18004 QR Code vector SVG using @zxing/library's QRCodeEncoder.
 */
export function generateQrCodeSvg(rawText: string, sizePx = 38): string {
  const content = String(rawText || "ITEM001").trim() || "ITEM001";
  try {
    const qr = QRCodeEncoder.encode(content, QRCodeDecoderErrorCorrectionLevel.M);
    const matrix = qr.getMatrix();
    const w = matrix.getWidth();
    const h = matrix.getHeight();
    const quiet = 2;
    const total = w + quiet * 2;
    const rects: string[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (matrix.get(x, y) === 1) {
          rects.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1" fill="#000000" />`);
        }
      }
    }
    const safePx = Math.max(20, Math.min(140, Number(sizePx) || 38));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" style="width: ${safePx}px; height: ${safePx}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
  } catch {
    return generateCode128Svg(content, sizePx, 92);
  }
}

/**
 * Unified Barcode / QR SVG dispatcher supporting CODE128, EAN13, CODE39, and QR.
 */
export function generateStickerGraphicSvg(
  rawText: string,
  format: BarcodeSymbology = "CODE128",
  heightPx = 30,
  widthPct = 94
): { svg: string; displayCode: string } {
  const clean = String(rawText || "89400001").trim() || "89400001";
  if (format === "QR") {
    return { svg: generateQrCodeSvg(clean, heightPx + 10), displayCode: clean };
  }
  if (format === "EAN13") {
    const displayCode = /^\d{6,14}$/.test(clean) ? normalizeEan13Digits(clean) : clean;
    return { svg: generateEan13Svg(clean, heightPx, widthPct), displayCode };
  }
  if (format === "CODE39") {
    const displayCode = clean.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "") || "ITEM01";
    return { svg: generateCode39Svg(displayCode, heightPx, widthPct), displayCode };
  }
  return { svg: generateCode128Svg(clean, heightPx, widthPct), displayCode: clean };
}

export interface BuildLabelsOptions {
  shopName?: string;
  settings?: Partial<PosLabelSettings>;
  forcePrintDialog?: boolean;
}

/**
 * Computes physical page/row dimensions in millimeters for thermal rolls (1-up, 2-up, 3-up) and A4 sheets.
 */
export function computeStickerLayoutMetrics(cfg: PosLabelSettings) {
  const isA4 = cfg.mode === "a4_sheet";
  const widthMm = Math.max(15, Math.min(210, Number(cfg.widthMm) || 38));
  const heightMm = Math.max(10, Math.min(297, Number(cfg.heightMm) || 25));
  const rollCols = Math.max(1, Math.min(4, Math.floor(Number(cfg.rollColumns) || 1)));
  const colGapMm = Math.max(0, Math.min(15, Number(cfg.columnGapMm) ?? 2));
  const rowGapMm = Math.max(0, Math.min(15, Number(cfg.rowGapMm) ?? 2.5));
  const a4Cols = Math.max(1, Math.min(6, Math.floor(Number(cfg.a4Columns) || 4)));

  const totalRowWidthMm = isA4
    ? 210
    : Number((widthMm * rollCols + colGapMm * (rollCols - 1)).toFixed(2));

  return {
    isA4,
    widthMm,
    heightMm,
    rollCols,
    colGapMm,
    rowGapMm,
    a4Cols,
    totalRowWidthMm,
  };
}

/**
 * Builds pixel-accurate HTML for Custom-Size Thermal Roll Stickers (1-Up, 2-Up, 3-Up)
 * or A4 Multi-Sticker Sheets with calibration offsets and multi-symbology barcodes.
 */
export function buildLabelsHtml(items: LabelQueueItem[], options?: BuildLabelsOptions): string {
  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const shopName = escapeHtml(options?.shopName || hw.customHeaderTitle || "CLASSIC WORLD");
  const {
    isA4,
    widthMm,
    heightMm,
    rollCols,
    colGapMm,
    rowGapMm,
    a4Cols,
    totalRowWidthMm,
  } = computeStickerLayoutMetrics(cfg);

  const offsetTopMm = Math.max(-8, Math.min(12, Number(cfg.offsetTopMm) || 0));
  const offsetLeftMm = Math.max(-8, Math.min(12, Number(cfg.offsetLeftMm) || 0));
  const barcodeFormat: BarcodeSymbology = cfg.barcodeFormat || "CODE128";
  const barcodeWidthPct = Math.max(45, Math.min(100, Number(cfg.barcodeWidthPct) || 94));
  const customFooter = cfg.customFooterText ? escapeHtml(cfg.customFooterText.trim()) : "";

  // Smart auto-scaling font bounds relative to custom sticker height
  const maxFontForSticker =
    heightMm <= 16
      ? 5.8
      : heightMm <= 22
      ? 6.8
      : heightMm <= 26
      ? 8.0
      : heightMm <= 34
      ? 9.5
      : heightMm <= 50
      ? 12.0
      : 16.0;
  const basePt = Math.max(5, Math.min(Number(cfg.fontSizePt) || 8, maxFontForSticker));
  const shopPt = Math.max(5, Number((basePt - 0.9).toFixed(1)));
  const pricePt = Number((basePt + 1.4).toFixed(1));
  const codePt = Math.max(5, Number((basePt - 1.1).toFixed(1)));

  const activeTextRows =
    (cfg.showShopName ? 1 : 0) +
    (cfg.showProductName ? 1 : 0) +
    (cfg.showPrice ? 1 : 0) +
    (cfg.showCodeText && cfg.showBarcode ? 1 : 0) +
    (cfg.showCategory || cfg.showVariant ? 1 : 0) +
    (customFooter ? 1 : 0);

  const maxBarcodePx = Math.max(
    12,
    Math.floor(heightMm * 3.78 - activeTextRows * (basePt * 1.42) - (heightMm <= 18 ? 4 : 8))
  );
  const effectiveBarcodePx = Math.min(Number(cfg.barcodeHeightPx) || 30, maxBarcodePx);

  const expandedStickers: LabelQueueItem[] = [];
  for (const item of items) {
    const count = Math.max(1, Math.min(500, Math.floor(Number(item.copies) || 1)));
    for (let c = 0; c < count; c++) {
      expandedStickers.push(item);
    }
  }

  const renderSingleStickerInner = (item: LabelQueueItem) => {
    const { svg: barcodeSvg, displayCode } = cfg.showBarcode
      ? generateStickerGraphicSvg(item.code, barcodeFormat, effectiveBarcodePx, barcodeWidthPct)
      : { svg: "", displayCode: item.code };
    const currency = escapeHtml(cfg.currencyPrefix || "৳");

    const metaParts: string[] = [];
    if (cfg.showCategory && item.category) metaParts.push(item.category);
    if (cfg.showVariant && item.variantText) metaParts.push(item.variantText);
    const metaLine = metaParts.join(" • ");

    const hasMrp = cfg.showMrp && item.mrp && Number(item.mrp) > Number(item.price || 0);

    return `
      <div class="sticker-inner ${cfg.showBorder ? "with-border" : ""}">
        ${cfg.showShopName ? `<div class="st-shop">${shopName}</div>` : ""}
        ${cfg.showProductName ? `<div class="st-name">${escapeHtml(item.name)}</div>` : ""}
        ${metaLine ? `<div class="st-cat">${escapeHtml(metaLine)}</div>` : ""}
        ${cfg.showBarcode ? `<div class="st-bar">${barcodeSvg}</div>` : ""}
        ${cfg.showBarcode && cfg.showCodeText ? `<div class="st-code">${escapeHtml(displayCode)}</div>` : ""}
        ${
          cfg.showPrice
            ? `<div class="st-price">${
                hasMrp
                  ? `<span class="st-mrp">${currency}${Number(item.mrp).toLocaleString()}</span> `
                  : ""
              }${currency}${Number(item.price || 0).toLocaleString()}</div>`
            : ""
        }
        ${customFooter ? `<div class="st-footer">${customFooter}</div>` : ""}
      </div>
    `;
  };

  const sharedInnerCss = `
    .sticker-inner {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
      padding: ${heightMm <= 18 ? "0.5mm 0.8mm" : "0.9mm 1.2mm"};
      transform: translate(${offsetLeftMm}mm, ${offsetTopMm}mm);
    }
    .sticker-inner.with-border {
      border: 0.35mm solid #000000 !important;
      border-radius: 0.8mm;
    }
    .st-shop { font-size: ${shopPt}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.25px; line-height: 1.05; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-name { font-size: ${basePt}pt; font-weight: 800; line-height: 1.08; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-cat { font-size: ${codePt}pt; font-weight: 700; line-height: 1.04; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-bar { width: 100%; margin: 0.3px auto; flex-shrink: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .st-code { font-size: ${codePt}pt; font-family: 'Consolas', 'Courier New', monospace !important; font-weight: 800; letter-spacing: 0.35px; line-height: 1; }
    .st-price { font-size: ${pricePt}pt; font-weight: 900; line-height: 1.08; white-space: nowrap; }
    .st-mrp { font-size: ${codePt}pt; font-weight: 700; text-decoration: line-through; opacity: 0.85; margin-right: 2px; }
    .st-footer { font-size: ${Math.max(4.8, codePt - 0.5)}pt; font-weight: 700; line-height: 1; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  `;

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
      grid-template-columns: repeat(${a4Cols}, 1fr);
      column-gap: ${colGapMm}mm;
      row-gap: ${rowGapMm}mm;
      width: 100%;
    }
    .a4-cell {
      height: ${heightMm}mm;
      border: 0.4px dashed #94a3b8;
      border-radius: 1.2mm;
      padding: 0.6mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #ffffff !important;
    }
    ${sharedInnerCss}
  </style>
</head>
<body>
  <div class="a4-grid">
    ${expandedStickers.map((st) => `<div class="a4-cell">${renderSingleStickerInner(st)}</div>`).join("\n")}
  </div>
</body>
</html>`;
  }

  // Group stickers into rows of `rollCols` (1-Up, 2-Up, or 3-Up across the thermal sticker roll!)
  const rows: LabelQueueItem[][] = [];
  for (let i = 0; i < expandedStickers.length; i += rollCols) {
    rows.push(expandedStickers.slice(i, i + rollCols));
  }

  return `<!DOCTYPE html>
<html lang="bn" data-pos-label-mode="thermal" data-label-width-mm="${totalRowWidthMm}" data-label-height-mm="${heightMm}" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8" />
  <title>Thermal Barcode Stickers (${totalRowWidthMm}x${heightMm}mm)</title>
  <style>
    @page {
      size: ${totalRowWidthMm}mm ${heightMm}mm !important;
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
      width: ${totalRowWidthMm}mm !important;
    }
    .pos-label-page {
      width: ${totalRowWidthMm}mm !important;
      height: ${heightMm}mm !important;
      background: #ffffff !important;
      overflow: hidden !important;
      display: grid !important;
      grid-template-columns: repeat(${rollCols}, ${widthMm}mm) !important;
      column-gap: ${colGapMm}mm !important;
      align-items: stretch !important;
      justify-content: start !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .pos-label-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .thermal-sticker-slot {
      width: ${widthMm}mm !important;
      height: ${heightMm}mm !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    ${sharedInnerCss}
  </style>
</head>
<body>
  ${rows
    .map(
      (row) =>
        `<div class="pos-label-page">${Array.from({ length: rollCols })
          .map((_, idx) =>
            row[idx]
              ? `<div class="thermal-sticker-slot">${renderSingleStickerInner(row[idx])}</div>`
              : `<div class="thermal-sticker-slot"></div>`
          )
          .join("")}</div>`
    )
    .join("\n")}
</body>
</html>`;
}

/**
 * 1-Click Print Product Barcode / Custom-Size Stickers on Dedicated Sticker Printers or A4 Sheets
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
  const { isA4, heightMm, totalRowWidthMm } = computeStickerLayoutMetrics(cfg);
  const targetPrinter = cfg.printerName || hw.devicePrinterName || "";
  const useSilent = options?.forcePrintDialog
    ? false
    : cfg.silentPrint !== undefined
    ? Boolean(cfg.silentPrint)
    : hw.automatePrinting !== false;

  const printedDirect = await executeDirectSilentPrint(html, targetPrinter || undefined, {
    printerName: targetPrinter || undefined,
    silent: useSilent,
    copies: 1,
    scaleFactor: 100,
    pageSize: isA4 ? "a4" : `${totalRowWidthMm}mm`,
    paperWidthMm: isA4 ? 210 : totalRowWidthMm,
    paperHeightMm: isA4 ? "auto" : heightMm,
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

/**
 * Prints a 1-Sticker Size & Alignment Calibration Test to verify custom dimensions & gap sensors.
 */
export async function printCalibrationSticker(options?: BuildLabelsOptions): Promise<void> {
  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  await printProductLabels(
    [
      {
        id: "calibration_test",
        name: `${cfg.widthMm}×${cfg.heightMm}mm TEST`,
        code: cfg.barcodeFormat === "EAN13" ? "894123456789" : "TEST1234",
        price: 990,
        variantText: "ALIGN OK",
        copies: Math.max(1, cfg.rollColumns || 1),
      },
    ],
    {
      ...options,
      settings: {
        ...cfg,
        showBorder: true,
      },
    }
  );
}

/**
 * Exports Custom-Size Thermal Stickers or A4 Sticker Sheets as a print-ready exact-millimeter PDF!
 */
export async function downloadLabelsPdf(
  items: LabelQueueItem[],
  options?: BuildLabelsOptions,
  fileName?: string
): Promise<void> {
  if (!items.length || typeof document === "undefined") return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const html = buildLabelsHtml(items, options);
  const { isA4, heightMm, totalRowWidthMm } = computeStickerLayoutMetrics(cfg);

  const host = document.createElement("iframe");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = isA4 ? "210mm" : `${totalRowWidthMm}mm`;
  host.style.height = isA4 ? "297mm" : `${Math.max(120, heightMm * 4)}mm`;
  host.style.border = "none";
  document.body.appendChild(host);

  try {
    const doc = host.contentWindow?.document || host.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((r) => setTimeout(r, 180));

    if (isA4) {
      const target = doc.body;
      const canvas = await html2canvas(target, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = 198;
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 6, 6, pdfW, Math.min(285, pdfH));
      pdf.save(fileName || `barcode-stickers-a4-${Date.now()}.pdf`);
      return;
    }

    const pageNodes = Array.from(doc.querySelectorAll(".pos-label-page")) as HTMLElement[];
    if (!pageNodes.length) return;

    const orientation = totalRowWidthMm >= heightMm ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: [totalRowWidthMm, heightMm],
    });

    for (let i = 0; i < pageNodes.length; i++) {
      if (i > 0) {
        pdf.addPage([totalRowWidthMm, heightMm], orientation);
      }
      const canvas = await html2canvas(pageNodes[i], {
        scale: 3.5,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, totalRowWidthMm, heightMm);
    }

    pdf.save(fileName || `stickers-${cfg.widthMm}x${cfg.heightMm}mm-${Date.now()}.pdf`);
  } finally {
    try {
      if (document.body.contains(host)) document.body.removeChild(host);
    } catch {}
  }
}
