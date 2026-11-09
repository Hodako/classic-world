import type { Product } from "@/lib/queries";

export type ReceiptPrintMode = "manual" | "automatic";

export type InvoiceSectionId =
  | "header"
  | "meta"
  | "before_items"
  | "items"
  | "after_items"
  | "totals"
  | "footer";

export const DEFAULT_INVOICE_SECTION_ORDER: InvoiceSectionId[] = [
  "header",
  "meta",
  "before_items",
  "items",
  "after_items",
  "totals",
  "footer",
];

export interface CustomInvoiceLine {
  id: string;
  text: string;
  position: "header" | "before_items" | "after_items" | "footer";
  align?: "left" | "center" | "right";
  bold?: boolean;
  fontSizePt?: number;
}

export interface InvoiceVisibilitySettings {
  showShopName?: boolean;
  showShopAddress?: boolean;
  showShopPhone?: boolean;
  showTagline?: boolean;
  showInvoiceNo?: boolean;
  showDateTime?: boolean;
  showCashier?: boolean;
  showCashierName?: boolean;
  showCustomer?: boolean;
  showCustomerDetails?: boolean;
  showPaymentMode?: boolean;
  showChangeReturn?: boolean;
  showTerms?: boolean;
  showPolicyNote?: boolean;
  showItemsHeader?: boolean;
  showItemHeader?: boolean;
  showDiscount?: boolean;
  showSubtotal?: boolean;
  showTotal?: boolean;
  showPaid?: boolean;
  showDue?: boolean;
}

export type LabelPrintMode = "thermal" | "a4_sheet";
export type BarcodeSymbology = "CODE128" | "EAN13" | "UPCA" | "CODE39" | "QR";
export type LabelUnit = "mm" | "cm" | "in";
export type LabelElementType = "text" | "barcode" | "qrcode" | "box" | "line" | "image";

export interface LabelElement {
  id: string;
  type: LabelElementType;
  /** User-facing layer label in the Label LIVE Layers list */
  layerName?: string;
  /** Millimeter coordinates & dimensions on the physical sticker */
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  rotation?: 0 | 90 | 180 | 270;
  locked?: boolean;
  hidden?: boolean;
  /** Text string, {variable} expression, barcode data, or image dataUrl */
  content: string;
  /** Typography properties */
  fontFamily?: "sans" | "mono" | "serif" | "condensed";
  fontSizePt?: number;
  fontWeight?: "normal" | "semibold" | "bold" | "black";
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  inverted?: boolean;
  autoFit?: boolean;
  wrap?: boolean;
  letterSpacingEm?: number;
  /** Barcode / QR properties */
  symbology?: BarcodeSymbology;
  showCodeText?: boolean;
  /** Shape / Box / Line properties */
  borderWidthMm?: number;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderRadiusMm?: number;
  filled?: boolean;
  lineOrientation?: "horizontal" | "vertical";
}

export interface LabelSavedTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm?: number;
  elements: LabelElement[];
  updatedAt: string;
}

export interface PosLabelSettings {
  mode: LabelPrintMode;
  printerName: string;
  barcodeFormat: BarcodeSymbology;
  unit: LabelUnit;
  widthMm: number;
  heightMm: number;
  cornerRadiusMm: number;
  defaultCopies: number;
  rollColumns: number;
  columnGapMm: number;
  rowGapMm: number;
  offsetTopMm: number;
  offsetLeftMm: number;
  a4Columns: number;
  fontSizePt: number;
  barcodeHeightPx: number;
  barcodeWidthPct: number;
  showShopName: boolean;
  showProductName: boolean;
  showPrice: boolean;
  showMrp: boolean;
  showBarcode: boolean;
  showCodeText: boolean;
  showCategory: boolean;
  showVariant: boolean;
  showBorder: boolean;
  customFooterText: string;
  currencyPrefix: string;
  silentPrint: boolean;
  snapToGrid: boolean;
  gridStepMm: number;
  feedDirection: "up" | "down" | "left" | "right";
  /** Label LIVE freeform 2D canvas elements (starts empty — zero forced default texts!) */
  canvasElements: LabelElement[];
  /** User's saved custom label designs */
  savedTemplates: LabelSavedTemplate[];
}

export const DEFAULT_LABEL_SETTINGS: PosLabelSettings = {
  mode: "thermal",
  printerName: "",
  barcodeFormat: "CODE128",
  unit: "mm",
  widthMm: 50,
  heightMm: 30,
  cornerRadiusMm: 1.5,
  defaultCopies: 1,
  rollColumns: 1,
  columnGapMm: 2,
  rowGapMm: 2.5,
  offsetTopMm: 0,
  offsetLeftMm: 0,
  a4Columns: 4,
  fontSizePt: 9,
  barcodeHeightPx: 30,
  barcodeWidthPct: 94,
  showShopName: false,
  showProductName: false,
  showPrice: false,
  showMrp: false,
  showBarcode: false,
  showCodeText: true,
  showCategory: false,
  showVariant: false,
  showBorder: false,
  customFooterText: "",
  currencyPrefix: "৳",
  silentPrint: true,
  snapToGrid: true,
  gridStepMm: 0.5,
  feedDirection: "up",
  canvasElements: [],
  savedTemplates: [],
};

export interface PosHardwareSettings {
  printMode: ReceiptPrintMode;
  scannerSuffix: "Enter" | "Tab";
  /** When true, prints directly in 1-click without showing Windows print dialog. When false, opens Windows Print Preferences dialog. */
  automatePrinting: boolean;
  /** Per-device default printer name (empty string = Windows system default printer) */
  devicePrinterName: string;
  /** Thermal paper margins in millimeters (per-device). Default is 0mm as requested */
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  /** Print scale percentage (50 to 200, typed by user) */
  printScale: number;
  /** Number of receipt copies per print */
  copies: number;

  /** Paper width in millimeters: e.g. 80, 76, 70, 58, 50, 20 or custom typed mm */
  paperWidthMm: number;
  /** Paper height in millimeters: "auto" (content height) or specific number like 40, 50, 60, 70, 80, 100, 150 etc. */
  paperHeightMm: number | "auto";
  /** Auto fit mode to make invoice contents fit inside the roll perfectly */
  fitToWidth: boolean;
  /** Base font size in points (e.g. 7.0pt default, adjustable 4.5 to 18pt) */
  fontSizePt: number;
  /** Title font size in points (e.g. 9.5pt default, adjustable 6 to 26pt) */
  titleFontSizePt: number;
  /** Internal one-time flag migrating oversized legacy font defaults */
  typographyV3Migrated?: boolean;
  typographyV4Migrated?: boolean;
  /** Custom header text override */
  customHeaderTitle?: string;
  /** Custom subtitle / tagline */
  customSubtitle?: string;
  /** Custom address override */
  customAddress?: string;
  /** Custom phone override */
  customPhone?: string;
  /** Custom footer note */
  customFooterNote?: string;
  /** Exchange / return policy line printed at the very bottom (empty string hides it) */
  customPolicyNote?: string;
  /** Toggle visibility of standard invoice lines */
  visibility: InvoiceVisibilitySettings;
  /** Drag-and-drop section order for invoice blocks */
  invoiceSectionOrder?: InvoiceSectionId[];
  /** Custom lines added by admin */
  customLines: CustomInvoiceLine[];
  /** Barcode / Custom-Size Label LIVE Sticker Studio settings */
  labelSettings: PosLabelSettings;
}

const STORAGE_KEY = "classicworld_pos_hardware_v1";

export const DEFAULT_VISIBILITY_SETTINGS: InvoiceVisibilitySettings = {
  showShopName: true,
  showShopAddress: true,
  showShopPhone: true,
  showTagline: true,
  showInvoiceNo: true,
  showDateTime: true,
  showCashier: true,
  showCashierName: true,
  showCustomer: true,
  showCustomerDetails: true,
  showPaymentMode: true,
  showChangeReturn: true,
  showTerms: true,
  showPolicyNote: true,
  showItemsHeader: true,
  showItemHeader: true,
  showDiscount: true,
  showSubtotal: true,
  showTotal: true,
  showPaid: true,
  showDue: true,
};

/** Default exchange / return policy line shown at the bottom of the receipt */
export const DEFAULT_POLICY_NOTE = "* ৭ দিনের মধ্যে ইনভয়েস সহ পণ্য পরিবর্তন প্রযোজ্য *";

export const DEFAULT_HARDWARE_SETTINGS: PosHardwareSettings = {
  printMode: "manual",
  scannerSuffix: "Enter",
  automatePrinting: true,
  devicePrinterName: "",
  marginTopMm: 0,
  marginBottomMm: 0,
  marginLeftMm: 0,
  marginRightMm: 0,
  printScale: 100,
  copies: 1,
  paperWidthMm: 80,
  paperHeightMm: "auto",
  fitToWidth: true,
  fontSizePt: 6.5,
  titleFontSizePt: 8.8,
  typographyV3Migrated: true,
  visibility: DEFAULT_VISIBILITY_SETTINGS,
  invoiceSectionOrder: DEFAULT_INVOICE_SECTION_ORDER,
  customLines: [],
  labelSettings: DEFAULT_LABEL_SETTINGS,
};

/** Keyboard/HID scanners need no browser Bluetooth permission: the OS delivers keys. */
export function createHidScanBuffer(suffix: "Enter" | "Tab" | "None" = "Enter", maxGapMs = 250) {
  let buffer = "";
  let lastKeyAt = 0;
  let flushTimer: any = null;
  return {
    reset() {
      buffer = "";
      lastKeyAt = 0;
      if (flushTimer) clearTimeout(flushTimer);
    },
    clear() {
      buffer = "";
      lastKeyAt = 0;
      if (flushTimer) clearTimeout(flushTimer);
    },
    push(key: string, at: number): string | null {
      const isSuffix =
        key === suffix ||
        key === "Enter" ||
        key === "\r" ||
        key === "\n" ||
        key === "Tab";

      if (isSuffix) {
        if (flushTimer) clearTimeout(flushTimer);
        if (at - lastKeyAt > 1200) {
          buffer = "";
          return null;
        }
        const code = buffer.trim();
        buffer = "";
        return code.length >= 1 ? code : null;
      }

      if (at - lastKeyAt > maxGapMs) {
        buffer = "";
      }
      lastKeyAt = at;

      if (key.length === 1 && buffer.length < 4096) {
        buffer += key;
      } else if (
        key !== "Shift" &&
        key !== "Control" &&
        key !== "Alt" &&
        key !== "Meta" &&
        key !== "CapsLock"
      ) {
        buffer = "";
      }
      return null;
    },
    consumeKey(e: KeyboardEvent, onAutoFlush?: (code: string) => void): string | null {
      if (e.ctrlKey || e.altKey || e.metaKey) return null;
      const now = Date.now();
      const res = this.push(e.key, now);
      if (res) return res;
      if (onAutoFlush && buffer.length >= 3) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          const code = buffer.trim();
          buffer = "";
          if (code.length >= 3) {
            onAutoFlush(code);
          }
        }, 220);
      }
      return null;
    },
  };
}

export function getPosHardwareSettings(): PosHardwareSettings {
  if (typeof window === "undefined") return DEFAULT_HARDWARE_SETTINGS;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const savedLabel = saved?.labelSettings || {};

    let rawFontPt = saved?.fontSizePt !== undefined && Number.isFinite(Number(saved.fontSizePt))
      ? Math.max(4.5, Math.min(24, Number(saved.fontSizePt)))
      : 6.5;
    let rawTitlePt = saved?.titleFontSizePt !== undefined && Number.isFinite(Number(saved.titleFontSizePt))
      ? Math.max(6, Math.min(32, Number(saved.titleFontSizePt)))
      : 8.8;
    let rawScale = saved?.printScale !== undefined && Number.isFinite(Number(saved.printScale))
      ? Math.min(250, Math.max(30, Number(saved.printScale)))
      : 100;

    const resolved: PosHardwareSettings = {
      printMode: saved?.printMode === "automatic" ? "automatic" : "manual",
      scannerSuffix: saved?.scannerSuffix === "Tab" ? "Tab" : "Enter",
      automatePrinting: saved?.automatePrinting !== undefined ? Boolean(saved.automatePrinting) : true,
      devicePrinterName: typeof saved?.devicePrinterName === "string" ? saved.devicePrinterName : "",
      marginTopMm: saved?.marginTopMm !== undefined && Number.isFinite(Number(saved.marginTopMm)) ? Math.max(0, Number(saved.marginTopMm)) : 0,
      marginBottomMm: saved?.marginBottomMm !== undefined && Number.isFinite(Number(saved.marginBottomMm)) ? Math.max(0, Number(saved.marginBottomMm)) : 0,
      marginLeftMm: saved?.marginLeftMm !== undefined && Number.isFinite(Number(saved.marginLeftMm)) ? Math.max(0, Number(saved.marginLeftMm)) : 0,
      marginRightMm: saved?.marginRightMm !== undefined && Number.isFinite(Number(saved.marginRightMm)) ? Math.max(0, Number(saved.marginRightMm)) : 0,
      printScale: rawScale,
      copies: saved?.copies !== undefined && Number.isFinite(Number(saved.copies)) ? Math.min(10, Math.max(1, Number(saved.copies))) : 1,

      paperWidthMm: saved?.paperWidthMm !== undefined && Number.isFinite(Number(saved.paperWidthMm)) ? Math.max(15, Math.min(300, Number(saved.paperWidthMm))) : 80,
      paperHeightMm: saved?.paperHeightMm !== undefined && saved?.paperHeightMm !== "auto" && Number.isFinite(Number(saved.paperHeightMm)) && Number(saved.paperHeightMm) > 0 ? Number(saved.paperHeightMm) : "auto",
      fitToWidth: saved?.fitToWidth !== undefined ? Boolean(saved.fitToWidth) : true,
      fontSizePt: rawFontPt,
      titleFontSizePt: rawTitlePt,
      typographyV3Migrated: true,
      typographyV4Migrated: true,
      customHeaderTitle: typeof saved?.customHeaderTitle === "string" ? saved.customHeaderTitle : undefined,
      customSubtitle: typeof saved?.customSubtitle === "string" ? saved.customSubtitle : undefined,
      customAddress: typeof saved?.customAddress === "string" ? saved.customAddress : undefined,
      customPhone: typeof saved?.customPhone === "string" ? saved.customPhone : undefined,
      customFooterNote: typeof saved?.customFooterNote === "string" ? saved.customFooterNote : undefined,
      customPolicyNote: typeof saved?.customPolicyNote === "string" ? saved.customPolicyNote : undefined,
      visibility: {
        ...DEFAULT_VISIBILITY_SETTINGS,
        ...(saved?.visibility || {}),
      },
      invoiceSectionOrder: Array.isArray(saved?.invoiceSectionOrder) && saved.invoiceSectionOrder.length > 0
        ? saved.invoiceSectionOrder
        : DEFAULT_INVOICE_SECTION_ORDER,
      customLines: Array.isArray(saved?.customLines) ? saved.customLines : [],
      labelSettings: {
        ...DEFAULT_LABEL_SETTINGS,
        ...savedLabel,
        mode: savedLabel?.mode === "a4_sheet" ? "a4_sheet" : "thermal",
        unit: savedLabel?.unit === "cm" || savedLabel?.unit === "in" ? savedLabel.unit : "mm",
        widthMm: Number(savedLabel?.widthMm) >= 10 ? Math.min(300, Number(savedLabel.widthMm)) : DEFAULT_LABEL_SETTINGS.widthMm,
        heightMm: Number(savedLabel?.heightMm) >= 8 ? Math.min(400, Number(savedLabel.heightMm)) : DEFAULT_LABEL_SETTINGS.heightMm,
        cornerRadiusMm: Number.isFinite(Number(savedLabel?.cornerRadiusMm)) ? Math.max(0, Math.min(20, Number(savedLabel.cornerRadiusMm))) : DEFAULT_LABEL_SETTINGS.cornerRadiusMm,
        defaultCopies: Number(savedLabel?.defaultCopies) >= 1 ? Math.min(10000, Math.floor(Number(savedLabel.defaultCopies))) : DEFAULT_LABEL_SETTINGS.defaultCopies,
        a4Columns: Number(savedLabel?.a4Columns) >= 1 ? Math.min(6, Math.max(1, Number(savedLabel.a4Columns))) : DEFAULT_LABEL_SETTINGS.a4Columns,
        fontSizePt: Number(savedLabel?.fontSizePt) >= 4 ? Math.min(48, Math.max(4, Number(savedLabel.fontSizePt))) : DEFAULT_LABEL_SETTINGS.fontSizePt,
        barcodeHeightPx: Number(savedLabel?.barcodeHeightPx) >= 10 ? Math.min(200, Math.max(10, Number(savedLabel.barcodeHeightPx))) : DEFAULT_LABEL_SETTINGS.barcodeHeightPx,
        canvasElements: Array.isArray(savedLabel?.canvasElements) ? savedLabel.canvasElements : [],
        savedTemplates: Array.isArray(savedLabel?.savedTemplates) ? savedLabel.savedTemplates : [],
      },
    };
    return resolved;
  } catch {
    return DEFAULT_HARDWARE_SETTINGS;
  }
}

export function savePosHardwareSettings(settings: Partial<PosHardwareSettings>): PosHardwareSettings {
  const updated = { ...getPosHardwareSettings(), ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("pos-hardware-settings-changed"));
  }
  return updated;
}

export function findProductsByScannedCode(products: Product[], code: string): Product[] {
  const scanned = (code || "").trim().toLowerCase();
  if (!scanned) return [];
  const stripped = scanned.replace(/^0+/, "");

  const active = products.filter((product) => !product.archived);

  // 1. Exact match on barcode
  const exactBarcode = active.filter(
    (p) => p.barcode && p.barcode.trim().toLowerCase() === scanned
  );
  if (exactBarcode.length) return exactBarcode;

  // 2. Match with stripped leading zeroes
  if (stripped) {
    const strippedBarcode = active.filter(
      (p) =>
        p.barcode &&
        p.barcode.trim().toLowerCase().replace(/^0+/, "") === stripped
    );
    if (strippedBarcode.length) return strippedBarcode;
  }

  // 3. Match against QR code, SKU, code, product_number, ID, or auto-generated 8-char label code
  const otherMatches = active.filter((product) => {
    const shortId = product.id ? product.id.slice(-8) : "";
    return [
      product.qr_code,
      product.code,
      product.sku,
      product.product_number != null ? String(product.product_number) : undefined,
      product.id,
      shortId,
    ].some((value) => {
      if (!value) return false;
      const v = String(value).trim().toLowerCase();
      return v === scanned || (stripped && v.replace(/^0+/, "") === stripped);
    });
  });

  return otherMatches;
}
