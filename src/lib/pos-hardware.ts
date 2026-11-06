import type { Product } from "@/lib/queries";

export type ReceiptPrintMode = "manual" | "automatic";

export interface PosHardwareSettings {
  printMode: ReceiptPrintMode;
  scannerSuffix: "Enter" | "Tab";
}

const STORAGE_KEY = "classicworld_pos_hardware_v1";
const DEFAULT_SETTINGS: PosHardwareSettings = { printMode: "manual", scannerSuffix: "Enter" };

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
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      printMode: saved?.printMode === "automatic" ? "automatic" : "manual",
      scannerSuffix: saved?.scannerSuffix === "Tab" ? "Tab" : "Enter",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function savePosHardwareSettings(settings: Partial<PosHardwareSettings>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getPosHardwareSettings(), ...settings }));
  window.dispatchEvent(new Event("pos-hardware-settings-changed"));
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
