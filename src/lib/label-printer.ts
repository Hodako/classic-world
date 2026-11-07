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
  type LabelElement,
  type LabelUnit,
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
  /** Custom product weight measurement (e.g. "250g", "1.5 kg", "500 gm") */
  weight?: string;
  /** Custom product height / length measurement (e.g. "42 in", "110 cm") */
  heightText?: string;
  /** Custom product width / chest measurement (e.g. "38 in") */
  widthText?: string;
  /** Combined size / measurement tag (e.g. "XL • 42×38 in") */
  measurement?: string;
  mfgDate?: string;
  expDate?: string;
  serialStart?: number;
  custom1?: string;
  custom2?: string;
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
    id: "75x50",
    labelEn: "75×50mm (3×2 inch Tag)",
    labelBn: "৭৫×৫০ মিমি (৩×২ ইঞ্চি ট্যাগ)",
    mode: "thermal",
    widthMm: 75,
    heightMm: 50,
    rollColumns: 1,
  },
  {
    id: "100x150",
    labelEn: "100×150mm (4×6 in Shipping)",
    labelBn: "১০০×১৫০ মিমি (৪×৬ ইঞ্চি কুরিয়ার)",
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

/** Unit conversion helpers for Label LIVE mm / cm / inch measurements */
export function mmToUnit(mm: number, unit: LabelUnit = "mm"): number {
  if (unit === "cm") return Number((mm / 10).toFixed(2));
  if (unit === "in") return Number((mm / 25.4).toFixed(2));
  return Number(mm.toFixed(1));
}

export function unitToMm(val: number, unit: LabelUnit = "mm"): number {
  if (!Number.isFinite(val)) return 0;
  if (unit === "cm") return Number((val * 10).toFixed(2));
  if (unit === "in") return Number((val * 25.4).toFixed(2));
  return Number(val.toFixed(2));
}

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
 * Extracts weight or height/size attributes from product.attributes if present
 */
export function extractProductMeasurements(product: Partial<Product>): {
  weight: string;
  heightText: string;
  widthText: string;
  measurement: string;
} {
  const attrs = product.attributes && typeof product.attributes === "object" ? product.attributes : {};
  let weight = "";
  let heightText = "";
  let widthText = "";
  let measurement = "";

  for (const [k, v] of Object.entries(attrs)) {
    const key = k.trim().toLowerCase();
    const val = String(v || "").trim();
    if (!val) continue;
    if (key.includes("weight") || key.includes("wt") || key.includes("ওজন")) {
      weight = val;
    } else if (key.includes("height") || key.includes("length") || key.includes("উচ্চতা") || key.includes("লম্বা")) {
      heightText = val;
    } else if (key.includes("width") || key.includes("chest") || key.includes("চওড়া")) {
      widthText = val;
    } else if (key.includes("size") || key.includes("সাইজ") || key.includes("মাপ")) {
      measurement = val;
    }
  }
  return { weight, heightText, widthText, measurement };
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
 * Computes valid 12-digit UPC-A string (with modulo-10 check digit) from numeric digits.
 */
export function normalizeUpcaDigits(rawDigits: string): string {
  const digitsOnly = String(rawDigits || "").replace(/\D/g, "");
  const base11 = (digitsOnly.length >= 11 ? digitsOnly.slice(0, 11) : digitsOnly.padStart(11, "0")).slice(0, 11);
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(base11[i]) || 0;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  const check = (10 - (sum % 10)) % 10;
  return base11 + String(check);
}

/**
 * Generates a guaranteed-unique barcode for a product (EAN-13, UPC-A, Code-39, or compact Code-128).
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
    } else if (format === "UPCA") {
      const rand10 = String(Math.floor(1000000000 + Math.random() * 9000000000));
      candidate = normalizeUpcaDigits("0" + rand10);
    } else if (format === "CODE39") {
      const rand6 = String(Math.floor(100000 + Math.random() * 900000));
      const cleanPfx = prefix.replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 4) || "SKU";
      candidate = `${cleanPfx}-${rand6}`;
    } else {
      candidate = String(Math.floor(10000000 + Math.random() * 90000000));
    }
    if (!used.has(candidate.toUpperCase())) {
      return candidate;
    }
  }
  return String(Date.now()).slice(-8);
}

/**
 * Resolves Label LIVE dynamic {variables} against a LabelQueueItem row!
 * Never injects any default text — returns ONLY what the user wrote / bound.
 */
export function resolveLabelVariables(
  rawExpression: string,
  row?: Partial<LabelQueueItem> | null,
  copyIndex = 0,
  currencyPrefix = "৳"
): string {
  if (!rawExpression) return "";
  if (!rawExpression.includes("{")) return rawExpression;

  const r = row || {};
  const serialNum = (Number(r.serialStart) || 1) + copyIndex;

  return rawExpression.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, rawKey) => {
    const key = String(rawKey).toLowerCase();
    switch (key) {
      case "name":
      case "product":
        return r.name ? String(r.name) : "";
      case "price":
        return r.price != null && !Number.isNaN(Number(r.price))
          ? `${currencyPrefix}${Number(r.price).toLocaleString()}`
          : "";
      case "raw_price":
        return r.price != null && !Number.isNaN(Number(r.price))
          ? String(r.price)
          : "";
      case "mrp":
        return r.mrp != null && Number(r.mrp) > 0
          ? `${currencyPrefix}${Number(r.mrp).toLocaleString()}`
          : "";
      case "barcode":
      case "code":
      case "sku":
        return r.code ? String(r.code) : "";
      case "variant":
      case "attributes":
        return r.variantText ? String(r.variantText) : "";
      case "category":
        return r.category ? String(r.category) : "";
      case "weight":
      case "wt":
        return r.weight ? String(r.weight) : "";
      case "height":
        return r.heightText ? String(r.heightText) : "";
      case "width":
        return r.widthText ? String(r.widthText) : "";
      case "measurement":
      case "size":
        return r.measurement || r.variantText || "";
      case "date":
      case "mfg_date":
        return r.mfgDate || new Date().toLocaleDateString("en-GB");
      case "exp_date":
        return r.expDate || "";
      case "serial":
        return String(serialNum).padStart(4, "0");
      case "custom1":
        return r.custom1 || "";
      case "custom2":
        return r.custom2 || "";
      default:
        return match;
    }
  });
}

/**
 * Generates a crisp ISO/IEC 15417 Code-128 vector SVG barcode.
 */
export function generateCode128Svg(
  rawText: string,
  heightPx = 30,
  widthPct = 96,
  fillContainer = false
): string {
  const clean =
    String(rawText || "89400001")
      .trim()
      .replace(/[^\x20-\x7E]/g, "")
      .slice(0, 36) || "89400001";

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

  const quietZone = 8;
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
  if (fillContainer) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: 100%; height: 100%; display: block; background: transparent;">${rects.join("")}</svg>`;
  }
  const safeH = Math.max(12, Math.min(160, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates an ISO/IEC 16388 Code-39 vector SVG barcode.
 */
export function generateCode39Svg(
  rawText: string,
  heightPx = 30,
  widthPct = 96,
  fillContainer = false
): string {
  const upper =
    String(rawText || "ITEM01")
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z\-. $/+%]/g, "")
      .slice(0, 24) || "ITEM01";

  const full = `*${upper}*`;
  const quietZone = 8;
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
    x += 1;
  }

  const totalWidth = x + quietZone;
  if (fillContainer) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: 100%; height: 100%; display: block; background: transparent;">${rects.join("")}</svg>`;
  }
  const safeH = Math.max(12, Math.min(160, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates an ISO/IEC 15420 EAN-13 (or UPC-A via leading 0) vector SVG barcode.
 */
export function generateEan13Svg(
  rawText: string,
  heightPx = 30,
  widthPct = 96,
  fillContainer = false
): string {
  const trimmed = String(rawText || "").trim();
  if (!/^\d{6,14}$/.test(trimmed)) {
    return generateCode128Svg(trimmed || "894000000001", heightPx, widthPct, fillContainer);
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

  const quietZone = 9;
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
  if (fillContainer) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: 100%; height: 100%; display: block; background: transparent;">${rects.join("")}</svg>`;
  }
  const safeH = Math.max(12, Math.min(160, Number(heightPx) || 30));
  const safeW = Math.max(40, Math.min(100, Number(widthPct) || 96));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width: ${safeW}%; max-width: 100%; height: ${safeH}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
}

/**
 * Generates an offline ISO/IEC 18004 QR Code vector SVG using @zxing/library.
 */
export function generateQrCodeSvg(
  rawText: string,
  sizePx = 38,
  fillContainer = false
): string {
  const content = String(rawText || "ITEM001").trim() || "ITEM001";
  try {
    const qr = QRCodeEncoder.encode(content, QRCodeDecoderErrorCorrectionLevel.M);
    const matrix = qr.getMatrix();
    const w = matrix.getWidth();
    const h = matrix.getHeight();
    const quiet = 1;
    const total = w + quiet * 2;
    const rects: string[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (matrix.get(x, y) === 1) {
          rects.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1" fill="#000000" />`);
        }
      }
    }
    if (fillContainer) {
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" style="width: 100%; height: 100%; display: block; background: transparent;">${rects.join("")}</svg>`;
    }
    const safePx = Math.max(20, Math.min(180, Number(sizePx) || 38));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" style="width: ${safePx}px; height: ${safePx}px; display: block; margin: 0 auto; background: #ffffff;">${rects.join("")}</svg>`;
  } catch {
    return generateCode128Svg(content, sizePx, 92, fillContainer);
  }
}

/**
 * Unified Barcode / QR SVG dispatcher supporting CODE128, EAN13, UPCA, CODE39, and QR.
 */
export function generateStickerGraphicSvg(
  rawText: string,
  format: BarcodeSymbology = "CODE128",
  heightPx = 30,
  widthPct = 94,
  fillContainer = false
): { svg: string; displayCode: string } {
  const clean = String(rawText || "89400001").trim() || "89400001";
  if (format === "QR") {
    return { svg: generateQrCodeSvg(clean, heightPx + 10, fillContainer), displayCode: clean };
  }
  if (format === "UPCA") {
    const upc = normalizeUpcaDigits(clean);
    return { svg: generateEan13Svg("0" + upc, heightPx, widthPct, fillContainer), displayCode: upc };
  }
  if (format === "EAN13") {
    const displayCode = /^\d{6,14}$/.test(clean) ? normalizeEan13Digits(clean) : clean;
    return { svg: generateEan13Svg(clean, heightPx, widthPct, fillContainer), displayCode };
  }
  if (format === "CODE39") {
    const displayCode = clean.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "") || "ITEM01";
    return { svg: generateCode39Svg(displayCode, heightPx, widthPct, fillContainer), displayCode };
  }
  return { svg: generateCode128Svg(clean, heightPx, widthPct, fillContainer), displayCode: clean };
}

export interface BuildLabelsOptions {
  shopName?: string;
  settings?: Partial<PosLabelSettings>;
  forcePrintDialog?: boolean;
}

/**
 * Computes physical page/row dimensions in millimeters for thermal rolls (1-up..4-up) and A4 sheets.
 */
export function computeStickerLayoutMetrics(cfg: PosLabelSettings) {
  const isA4 = cfg.mode === "a4_sheet";
  const widthMm = Math.max(10, Math.min(300, Number(cfg.widthMm) || 50));
  const heightMm = Math.max(8, Math.min(400, Number(cfg.heightMm) || 30));
  const rollCols = Math.max(1, Math.min(4, Math.floor(Number(cfg.rollColumns) || 1)));
  const colGapMm = Math.max(0, Math.min(20, Number(cfg.columnGapMm) ?? 2));
  const rowGapMm = Math.max(0, Math.min(20, Number(cfg.rowGapMm) ?? 2.5));
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

function getFontFamilyStack(family?: LabelElement["fontFamily"]): string {
  switch (family) {
    case "mono":
      return "'Consolas', 'Courier New', monospace";
    case "serif":
      return "'Georgia', 'Times New Roman', serif";
    case "condensed":
      return "'Arial Narrow', 'Roboto Condensed', 'Nirmala UI', sans-serif";
    default:
      return "'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'Segoe UI', Arial, sans-serif";
  }
}

/**
 * Computes Label LIVE smart auto-shrink font size so text fits inside its wMm × hMm box cleanly.
 */
export function computeEffectiveFontPt(
  el: LabelElement,
  resolvedText: string
): number {
  const requested = Math.max(4, Math.min(72, Number(el.fontSizePt) || 9));
  if (el.autoFit === false) return requested;

  const boxWmm = Math.max(2, Number(el.wMm) || 20);
  const boxHmm = Math.max(2, Number(el.hMm) || 6);
  const len = Math.max(1, resolvedText.trim().length);

  // 1pt ≈ 0.3528mm; average glyph width ≈ 0.56 * pt in mm
  const maxByHeight = el.wrap
    ? (boxHmm / 0.42) * 1.4
    : (boxHmm / 0.41);
  const maxByWidth = el.wrap
    ? (boxWmm * 2.2) / (Math.max(1, len) * 0.2)
    : boxWmm / (Math.max(1, len) * 0.21);

  return Number(Math.max(4.5, Math.min(requested, maxByHeight, maxByWidth)).toFixed(1));
}

/**
 * Renders a single sticker's exact 2D freeform Label LIVE canvas elements as HTML.
 * Zero default texts are ever injected — ONLY elements in `elements` are rendered!
 */
export function renderCanvasElementsHtml(
  elements: LabelElement[],
  cfg: PosLabelSettings,
  row?: Partial<LabelQueueItem> | null,
  copyIndex = 0
): string {
  const visible = (elements || []).filter((el) => !el.hidden);
  const offsetTopMm = Math.max(-15, Math.min(15, Number(cfg.offsetTopMm) || 0));
  const offsetLeftMm = Math.max(-15, Math.min(15, Number(cfg.offsetLeftMm) || 0));
  const currency = cfg.currencyPrefix || "৳";
  const radius = Math.max(0, Number(cfg.cornerRadiusMm) || 0);

  const renderedChildren = visible
    .map((el) => {
      const x = Number(el.xMm) || 0;
      const y = Number(el.yMm) || 0;
      const w = Math.max(1, Number(el.wMm) || 10);
      const h = Math.max(0.4, Number(el.hMm) || 5);
      const rot = el.rotation || 0;

      const basePosStyle = `position:absolute;left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm;${
        rot ? `transform:rotate(${rot}deg);transform-origin:center center;` : ""
      }`;

      if (el.type === "box") {
        const bw = Math.max(0.2, Number(el.borderWidthMm) || 0.4);
        const bs = el.borderStyle || "solid";
        const br = Math.max(0, Number(el.borderRadiusMm) || 0);
        const bg = el.filled ? "#000000" : "transparent";
        return `<div style="${basePosStyle}border:${bw}mm ${bs} #000000;border-radius:${br}mm;background:${bg};pointer-events:none;"></div>`;
      }

      if (el.type === "line") {
        const thickness = Math.max(0.2, Number(el.borderWidthMm) || 0.4);
        const bs = el.borderStyle || "solid";
        const isVert = el.lineOrientation === "vertical";
        return isVert
          ? `<div style="${basePosStyle}display:flex;justify-content:center;"><div style="height:100%;border-left:${thickness}mm ${bs} #000000;"></div></div>`
          : `<div style="${basePosStyle}display:flex;align-items:center;"><div style="width:100%;border-top:${thickness}mm ${bs} #000000;"></div></div>`;
      }

      if (el.type === "image") {
        if (!el.content) return "";
        return `<div style="${basePosStyle}display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${escapeHtml(
          el.content
        )}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;filter:contrast(1.35) grayscale(1);" /></div>`;
      }

      if (el.type === "qrcode") {
        const resolved = resolveLabelVariables(el.content || "{barcode}", row, copyIndex, currency).trim();
        if (!resolved) return "";
        const svg = generateQrCodeSvg(resolved, 60, true);
        return `<div style="${basePosStyle}display:flex;align-items:center;justify-content:center;overflow:hidden;padding:0.2mm;">${svg}</div>`;
      }

      if (el.type === "barcode") {
        const resolved = resolveLabelVariables(el.content || "{barcode}", row, copyIndex, currency).trim();
        if (!resolved) return "";
        const sym = el.symbology || cfg.barcodeFormat || "CODE128";
        const showCode = el.showCodeText !== false;
        const codeFontPt = Math.max(4.5, Math.min(14, Number(el.fontSizePt) || 6.5));
        const { svg, displayCode } = generateStickerGraphicSvg(resolved, sym, 40, 100, true);
        return `<div style="${basePosStyle}display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;overflow:hidden;">
          <div style="flex:1 1 auto;min-height:0;width:100%;overflow:hidden;">${svg}</div>
          ${
            showCode && sym !== "QR"
              ? `<div style="flex:0 0 auto;text-align:center;font-family:'Consolas','Courier New',monospace !important;font-size:${codeFontPt}pt;font-weight:800;line-height:1.05;letter-spacing:0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-top:0.2mm;">${escapeHtml(
                  displayCode
                )}</div>`
              : ""
          }
        </div>`;
      }

      // Text element
      const resolvedText = resolveLabelVariables(el.content, row, copyIndex, currency);
      if (!resolvedText.trim()) return "";

      const effPt = computeEffectiveFontPt(el, resolvedText);
      const weightVal =
        el.fontWeight === "normal"
          ? 500
          : el.fontWeight === "semibold"
          ? 700
          : el.fontWeight === "black"
          ? 900
          : 800;
      const align = el.align || "center";
      const justifyFlex =
        align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
      const vAlign =
        el.verticalAlign === "top"
          ? "flex-start"
          : el.verticalAlign === "bottom"
          ? "flex-end"
          : "center";
      const decos: string[] = [];
      if (el.underline) decos.push("underline");
      if (el.strikethrough) decos.push("line-through");
      const br = Math.max(0, Number(el.borderRadiusMm) ?? (el.inverted ? 0.8 : 0));

      return `<div class="${el.inverted ? "lbl-inverted" : ""}" style="${basePosStyle}display:flex;align-items:${vAlign};justify-content:${justifyFlex};text-align:${align};overflow:hidden;padding:${
        el.inverted ? "0.3mm 0.8mm" : "0 0.2mm"
      };border-radius:${br}mm;${el.inverted ? "background:#000000 !important;" : ""}">
        <span style="font-family:${getFontFamilyStack(
          el.fontFamily
        )} !important;font-size:${effPt}pt;font-weight:${weightVal};font-style:${
        el.italic ? "italic" : "normal"
      };text-decoration:${decos.length ? decos.join(" ") : "none"};line-height:1.08;letter-spacing:${
        el.letterSpacingEm ? `${el.letterSpacingEm}em` : "0"
      };${
        el.wrap
          ? "white-space:pre-wrap;word-break:break-word;"
          : "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
      }max-width:100%;${el.inverted ? "color:#ffffff !important;" : "color:#000000 !important;"}">${escapeHtml(
        resolvedText
      )}</span>
      </div>`;
    })
    .join("\n");

  return `<div class="sticker-canvas-inner ${cfg.showBorder ? "with-outer-border" : ""}" style="width:100%;height:100%;position:relative;overflow:hidden;border-radius:${radius}mm;transform:translate(${offsetLeftMm}mm,${offsetTopMm}mm);">${renderedChildren}</div>`;
}

/**
 * Builds pixel-accurate HTML for Custom-Size Thermal Roll Stickers (1-Up..4-Up)
 * or A4 Multi-Sticker Sheets using the Label LIVE 2D canvas elements.
 */
export function buildLabelsHtml(items: LabelQueueItem[], options?: BuildLabelsOptions): string {
  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

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

  const elements: LabelElement[] = Array.isArray(cfg.canvasElements) ? cfg.canvasElements : [];

  // Expand copies into individual sticker jobs with copyIndex for auto-incrementing {serial}
  const expandedStickers: { item: LabelQueueItem; copyIndex: number }[] = [];
  if (items.length === 0) {
    // Allow printing pure custom static stickers even when no inventory row is queued!
    const fallbackCopies = Math.max(1, Math.min(10000, Math.floor(Number(cfg.defaultCopies) || 1)));
    const blankRow: LabelQueueItem = {
      id: "static_job",
      name: "",
      code: "",
      price: 0,
      copies: fallbackCopies,
    };
    for (let c = 0; c < fallbackCopies; c++) {
      expandedStickers.push({ item: blankRow, copyIndex: c });
    }
  } else {
    let globalIdx = 0;
    for (const item of items) {
      const count = Math.max(1, Math.min(10000, Math.floor(Number(item.copies) || 1)));
      for (let c = 0; c < count; c++) {
        expandedStickers.push({ item, copyIndex: globalIdx++ });
      }
    }
  }

  const sharedCanvasCss = `
    .sticker-canvas-inner.with-outer-border {
      border: 0.35mm solid #000000 !important;
    }
    .lbl-inverted, .lbl-inverted * {
      background-color: #000000 !important;
      color: #ffffff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  `;

  if (isA4) {
    return `<!DOCTYPE html>
<html lang="bn" data-pos-label-mode="a4_sheet" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8" />
  <title>Label Printing (A4 Sheet)</title>
  <style>
    @page {
      size: A4 portrait !important;
      margin: 6mm !important;
    }
    *, *::before, *::after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      width: 100% !important;
      color: #000000;
    }
    .a4-grid {
      display: grid;
      grid-template-columns: repeat(${a4Cols}, ${widthMm}mm);
      justify-content: center;
      column-gap: ${colGapMm}mm;
      row-gap: ${rowGapMm}mm;
      width: 100%;
    }
    .a4-cell {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      border: 0.3px dashed #94a3b8;
      position: relative;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #ffffff !important;
    }
    ${sharedCanvasCss}
  </style>
</head>
<body>
  <div class="a4-grid">
    ${expandedStickers
      .map(
        ({ item, copyIndex }) =>
          `<div class="a4-cell">${renderCanvasElementsHtml(elements, cfg, item, copyIndex)}</div>`
      )
      .join("\n")}
  </div>
</body>
</html>`;
  }

  const rows: { item: LabelQueueItem; copyIndex: number }[][] = [];
  for (let i = 0; i < expandedStickers.length; i += rollCols) {
    rows.push(expandedStickers.slice(i, i + rollCols));
  }

  return `<!DOCTYPE html>
<html lang="bn" data-pos-label-mode="thermal" data-label-width-mm="${totalRowWidthMm}" data-label-height-mm="${heightMm}" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8" />
  <title>Thermal Stickers (${totalRowWidthMm}x${heightMm}mm)</title>
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
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: #ffffff !important;
      margin: 0 !important;
      padding: 0 !important;
      width: ${totalRowWidthMm}mm !important;
      color: #000000;
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
      position: relative !important;
      overflow: hidden !important;
      background: #ffffff !important;
    }
    ${sharedCanvasCss}
  </style>
</head>
<body>
  ${rows
    .map(
      (row) =>
        `<div class="pos-label-page">${Array.from({ length: rollCols })
          .map((_, idx) =>
            row[idx]
              ? `<div class="thermal-sticker-slot">${renderCanvasElementsHtml(
                  elements,
                  cfg,
                  row[idx].item,
                  row[idx].copyIndex
                )}</div>`
              : `<div class="thermal-sticker-slot"></div>`
          )
          .join("")}</div>`
    )
    .join("\n")}
</body>
</html>`;
}

/**
 * 1-Click Print Custom-Size Stickers on Dedicated Sticker Printers or A4 Sheets
 */
export async function printProductLabels(items: LabelQueueItem[], options?: BuildLabelsOptions): Promise<void> {
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
 * Prints a 1-Sticker Size & Alignment Calibration Test without altering user's canvas.
 */
export async function printCalibrationSticker(options?: BuildLabelsOptions): Promise<void> {
  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const w = Math.max(15, Number(cfg.widthMm) || 50);
  const h = Math.max(10, Number(cfg.heightMm) || 30);

  const calibElements: LabelElement[] = [
    {
      id: "cal_border",
      type: "box",
      xMm: 1,
      yMm: 1,
      wMm: w - 2,
      hMm: h - 2,
      content: "",
      borderWidthMm: 0.4,
      borderStyle: "solid",
      borderRadiusMm: 0.8,
    },
    {
      id: "cal_size",
      type: "text",
      xMm: 2,
      yMm: 2,
      wMm: w - 4,
      hMm: Math.min(6, h * 0.28),
      content: `${w} × ${h} mm`,
      fontSizePt: 8,
      fontWeight: "black",
      align: "center",
    },
    {
      id: "cal_bar",
      type: "barcode",
      xMm: Math.max(2, w * 0.1),
      yMm: Math.max(6, h * 0.32),
      wMm: w * 0.8,
      hMm: Math.max(6, h * 0.52),
      content: "89401234",
      symbology: "CODE128",
      showCodeText: true,
      fontSizePt: 6.5,
    },
  ];

  await printProductLabels(
    [
      {
        id: "calibration_test",
        name: "",
        code: "89401234",
        price: 0,
        copies: Math.max(1, cfg.rollColumns || 1),
      },
    ],
    {
      ...options,
      settings: {
        ...cfg,
        canvasElements: calibElements,
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
  if (typeof document === "undefined") return;

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
      pdf.save(fileName || `labels-a4-${Date.now()}.pdf`);
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

    pdf.save(fileName || `labels-${cfg.widthMm}x${cfg.heightMm}mm-${Date.now()}.pdf`);
  } finally {
    try {
      if (document.body.contains(host)) document.body.removeChild(host);
    } catch {}
  }
}

/**
 * Exports High-DPI (300 DPI equivalent) PNG image of the designed sticker — just like Label LIVE!
 */
export async function downloadLabelPng(
  items: LabelQueueItem[],
  options?: BuildLabelsOptions,
  fileName?: string
): Promise<void> {
  if (typeof document === "undefined") return;
  const { default: html2canvas } = await import("html2canvas");

  const hw = getPosHardwareSettings();
  const cfg: PosLabelSettings = {
    ...DEFAULT_LABEL_SETTINGS,
    ...(hw.labelSettings || {}),
    ...(options?.settings || {}),
  };

  const singleItem = items.length ? [{ ...items[0], copies: 1 }] : [];
  const html = buildLabelsHtml(singleItem, {
    ...options,
    settings: { ...cfg, mode: "thermal", rollColumns: 1, defaultCopies: 1 },
  });

  const host = document.createElement("iframe");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${cfg.widthMm}mm`;
  host.style.height = `${cfg.heightMm}mm`;
  host.style.border = "none";
  document.body.appendChild(host);

  try {
    const doc = host.contentWindow?.document || host.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((r) => setTimeout(r, 160));
    const target = (doc.querySelector(".thermal-sticker-slot") || doc.body) as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 4,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const link = document.createElement("a");
    link.download = fileName || `sticker-${cfg.widthMm}x${cfg.heightMm}mm-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } finally {
    try {
      if (document.body.contains(host)) document.body.removeChild(host);
    } catch {}
  }
}
