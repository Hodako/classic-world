import type { Product } from "@/lib/queries";

export type ReceiptPrintMode = "manual" | "automatic";

export interface CustomInvoiceLine {
  id: string;
  text: string;
  position: "header" | "before_items" | "after_items" | "footer";
  align?: "left" | "center" | "right";
  bold?: boolean;
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
  showItemsHeader?: boolean;
  showItemHeader?: boolean;
  showDiscount?: boolean;
  showSubtotal?: boolean;
  showTotal?: boolean;
  showPaid?: boolean;
  showDue?: boolean;
}

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
  /** Base font size in points (e.g. 8.5pt, can be increased/decreased e.g. 6 to 16pt) */
  fontSizePt: number;
  /** Title font size in points (e.g. 12pt) */
  titleFontSizePt: number;
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
  /** Toggle visibility of standard invoice lines */
  visibility: InvoiceVisibilitySettings;
  /** Custom lines added by admin */
  customLines: CustomInvoiceLine[];
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
  showItemsHeader: true,
  showItemHeader: true,
  showDiscount: true,
  showSubtotal: true,
  showTotal: true,
  showPaid: true,
  showDue: true,
};

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
  fontSizePt: 8.5,
  titleFontSizePt: 12,
  visibility: DEFAULT_VISIBILITY_SETTINGS,
  customLines: [],
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
      // Handle Enter / Carriage Return or Tab suffix
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
    return {
      printMode: saved?.printMode === "automatic" ? "automatic" : "manual",
      scannerSuffix: saved?.scannerSuffix === "Tab" ? "Tab" : "Enter",
      automatePrinting: saved?.automatePrinting !== undefined ? Boolean(saved.automatePrinting) : true,
      devicePrinterName: typeof saved?.devicePrinterName === "string" ? saved.devicePrinterName : "",
      marginTopMm: saved?.marginTopMm !== undefined && Number.isFinite(Number(saved.marginTopMm)) ? Math.max(0, Number(saved.marginTopMm)) : 0,
      marginBottomMm: saved?.marginBottomMm !== undefined && Number.isFinite(Number(saved.marginBottomMm)) ? Math.max(0, Number(saved.marginBottomMm)) : 0,
      marginLeftMm: saved?.marginLeftMm !== undefined && Number.isFinite(Number(saved.marginLeftMm)) ? Math.max(0, Number(saved.marginLeftMm)) : 0,
      marginRightMm: saved?.marginRightMm !== undefined && Number.isFinite(Number(saved.marginRightMm)) ? Math.max(0, Number(saved.marginRightMm)) : 0,
      printScale: saved?.printScale !== undefined && Number.isFinite(Number(saved.printScale)) ? Math.min(250, Math.max(30, Number(saved.printScale))) : 100,
      copies: saved?.copies !== undefined && Number.isFinite(Number(saved.copies)) ? Math.min(10, Math.max(1, Number(saved.copies))) : 1,

      paperWidthMm: saved?.paperWidthMm !== undefined && Number.isFinite(Number(saved.paperWidthMm)) ? Math.max(15, Math.min(300, Number(saved.paperWidthMm))) : 80,
      paperHeightMm: saved?.paperHeightMm !== undefined && saved?.paperHeightMm !== "auto" && Number.isFinite(Number(saved.paperHeightMm)) && Number(saved.paperHeightMm) > 0 ? Number(saved.paperHeightMm) : "auto",
      fitToWidth: saved?.fitToWidth !== undefined ? Boolean(saved.fitToWidth) : true,
      fontSizePt: saved?.fontSizePt !== undefined && Number.isFinite(Number(saved.fontSizePt)) ? Math.max(5, Math.min(24, Number(saved.fontSizePt))) : 8.5,
      titleFontSizePt: saved?.titleFontSizePt !== undefined && Number.isFinite(Number(saved.titleFontSizePt)) ? Math.max(8, Math.min(32, Number(saved.titleFontSizePt))) : 12,
      customHeaderTitle: typeof saved?.customHeaderTitle === "string" ? saved.customHeaderTitle : undefined,
      customSubtitle: typeof saved?.customSubtitle === "string" ? saved.customSubtitle : undefined,
      customAddress: typeof saved?.customAddress === "string" ? saved.customAddress : undefined,
      customPhone: typeof saved?.customPhone === "string" ? saved.customPhone : undefined,
      customFooterNote: typeof saved?.customFooterNote === "string" ? saved.customFooterNote : undefined,
      visibility: {
        ...DEFAULT_VISIBILITY_SETTINGS,
        ...(saved?.visibility || {}),
      },
      customLines: Array.isArray(saved?.customLines) ? saved.customLines : [],
    };
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

  // 3. Match against QR code, SKU, code, product_number, or ID
  const otherMatches = active.filter((product) => {
    return [
      product.qr_code,
      product.code,
      product.sku,
      product.product_number,
      product.id,
    ].some((value) => {
      if (!value) return false;
      const v = value.trim().toLowerCase();
      return v === scanned || (stripped && v.replace(/^0+/, "") === stripped);
    });
  });

  return otherMatches;
}
