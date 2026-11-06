import { fmtDateTime } from "@/lib/format";
import { executeDirectSilentPrint, getPosPaperConfig } from "@/lib/pos-print";
import { getPosHardwareSettings, DEFAULT_VISIBILITY_SETTINGS, DEFAULT_POLICY_NOTE, type PosHardwareSettings } from "@/lib/pos-hardware";

export interface InvoiceItemData {
  product: {
    id?: string;
    name: string;
  };
  qty: number;
  sellPrice: number;
}

export interface PrintInvoiceParams {
  businessName: string;
  userEmail?: string;
  shopAddress?: string;
  shopPhoneNumbers?: string;
  pageSize?: string;
  pageWidth?: string;
  pageHeight?: string;
  tagline?: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceTime?: string;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  items: InvoiceItemData[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paidAmount: number;
  due: number;
  changeAmount?: number;
  splitCash?: number;
  splitBkash?: number;
  splitBank?: number;
  paymentStatus?: string;
  paymentMode?: string;
  colorTheme?: string;
  terms?: string;
  invoiceFontSize?: string;
  invoiceScale?: string;
  invoiceLineSpacing?: string;
  forcePrintDialog?: boolean;
}

/**
 * Clean Thermal POS Receipt Print Engine (Optimized for 20mm/50mm/58mm/70mm/80mm Thermal Printers & A4)
 * All texts are rendered BOLD & pure black (#000000) for crisp thermal printing.
 * Respects per-device default printer, automated printing toggle, custom width, margins, font sizes, and custom lines.
 */
export function buildInvoiceHtml(data: PrintInvoiceParams, settingsOverride?: Partial<PosHardwareSettings>): string {
  const hw = { ...getPosHardwareSettings(), ...(settingsOverride || {}) };
  const vis = { ...DEFAULT_VISIBILITY_SETTINGS, ...(hw.visibility || {}) };

  const widthMm = Number(hw.paperWidthMm) || (data.pageSize === "58mm" ? 58 : 80);
  const isNarrow = widthMm <= 58;

  // Safe printable width within physical thermal printer head boundaries:
  // 80mm roll has a ~72mm print head; 58mm roll has a ~48mm print head.
  let printableWidthMm = widthMm;
  if (widthMm >= 80) printableWidthMm = Math.min(72, widthMm - 6);
  else if (widthMm >= 70) printableWidthMm = Math.min(63, widthMm - 6);
  else if (widthMm >= 56) printableWidthMm = Math.min(48, widthMm - 8);
  else if (widthMm >= 48) printableWidthMm = Math.min(42, widthMm - 6);
  else printableWidthMm = Math.max(16, widthMm - 4);

  const targetWidth = `${printableWidthMm}mm`;

  const heightMm =
    hw.paperHeightMm !== undefined && hw.paperHeightMm !== "auto" && Number(hw.paperHeightMm) > 0
      ? Number(hw.paperHeightMm)
      : undefined;
  const targetHeight = heightMm ? `${heightMm}mm` : "auto";
  const pageSizeRule = heightMm ? `${widthMm}mm ${heightMm}mm portrait` : `${widthMm}mm auto portrait`;

  const topMm = hw.marginTopMm ?? 0;
  const bottomMm = hw.marginBottomMm ?? 0;
  const leftMm = hw.marginLeftMm ?? 0;
  const rightMm = hw.marginRightMm ?? 0;
  const scalePct = hw.printScale || 100;

  // Auto-decrease font size if text exceeds the roll boundary
  const userBasePt = Number(hw.fontSizePt) || 8.5;
  const userTitlePt = Number(hw.titleFontSizePt) || 12;

  // Maximum safe font size based on roll width
  const maxSafeBasePt =
    widthMm <= 25 ? 5.5 :
    widthMm <= 50 ? 6.5 :
    widthMm <= 58 ? 7.2 :
    widthMm <= 72 ? 8.0 :
    8.5;

  const maxSafeTitlePt =
    widthMm <= 25 ? 7.5 :
    widthMm <= 50 ? 8.5 :
    widthMm <= 58 ? 9.5 :
    widthMm <= 72 ? 10.5 :
    12.0;

  // Decrease font size if it exceeds the roll boundary limit
  const baseFontPt = Math.min(userBasePt, maxSafeBasePt);
  const titleFontPt = Math.min(userTitlePt, maxSafeTitlePt);
  const smallFontPt = Math.max(5.0, Number((baseFontPt - 1.2).toFixed(1)));
  const largeFontPt = Number((baseFontPt + 1.5).toFixed(1));

  const shopName = hw.customHeaderTitle || data.businessName;
  const tagline = hw.customSubtitle !== undefined ? hw.customSubtitle : data.tagline;
  const address = hw.customAddress !== undefined ? hw.customAddress : data.shopAddress;
  const phone = hw.customPhone !== undefined ? hw.customPhone : data.shopPhoneNumbers;
  const terms = hw.customFooterNote !== undefined ? hw.customFooterNote : data.terms;
  const policyNote = (hw.customPolicyNote !== undefined ? hw.customPolicyNote : DEFAULT_POLICY_NOTE).trim();
  const normalizeLine = (s: string) => s.replace(/[*\s]/g, "");
  const termLines = (terms !== undefined && terms !== null ? String(terms) : "আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // Avoid printing the policy line twice when it is also part of the footer note
    .filter((l) => !policyNote || normalizeLine(l) !== normalizeLine(policyNote));
  const dateStr = data.invoiceDate || fmtDateTime(new Date());

  const customLines = hw.customLines || [];
  const renderCustomLines = (pos: "header" | "before_items" | "after_items" | "footer") => {
    const lines = customLines.filter((l) => l.position === pos);
    if (!lines.length) return "";
    return lines
      .map(
        (l) =>
          `<div style="text-align: ${l.align || "center"}; font-weight: ${
            l.bold ? "900" : "800"
          }; font-size: ${baseFontPt}pt; color: #000000; margin: 1.5px 0; word-break: break-word;">${l.text}</div>`
      )
      .join("");
  };

  const itemsHtml = isNarrow
    ? data.items
        .map(
          (item, idx) => `
      <div style="padding: 2.5px 0; border-bottom: 1px dotted #000000;">
        <div style="font-weight: 800; font-size: ${baseFontPt}pt; word-break: break-word; line-height: 1.2;">
          ${idx + 1}. ${item.product.name}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: ${smallFontPt}pt; font-family: monospace; margin-top: 1.5px;">
          <span>${item.qty} × ৳${item.sellPrice.toLocaleString()}</span>
          <span style="font-weight: 900;">৳${(item.qty * item.sellPrice).toLocaleString()}</span>
        </div>
      </div>`
        )
        .join("")
    : `
      <table style="table-layout: fixed !important; width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; margin: 2px 0 !important;">
        <colgroup>
          <col style="width: 52%;" />
          <col style="width: 20%;" />
          <col style="width: 28%;" />
        </colgroup>
        ${
          vis.showItemsHeader !== false
            ? `<thead>
                <tr style="border-bottom: 1.5px dashed #000000;">
                  <th style="text-align: left; font-size: ${smallFontPt}pt; width: 52%; word-break: break-word;">বিবরণ</th>
                  <th style="text-align: center; font-size: ${smallFontPt}pt; width: 20%;">পরিমাণ</th>
                  <th style="text-align: right; font-size: ${smallFontPt}pt; width: 28%;">মূল্য</th>
                </tr>
              </thead>`
            : ""
        }
        <tbody>
          ${data.items
            .map(
              (item, idx) => `
            <tr>
              <td style="padding: 2.5px 0; text-align: left; vertical-align: top; font-weight: 800; font-size: ${baseFontPt}pt; color: #000000; width: 52%; word-break: break-word; overflow-wrap: break-word; line-height: 1.2;">
                ${idx + 1}. ${item.product.name}
              </td>
              <td style="padding: 2.5px 2px; text-align: center; vertical-align: top; font-family: monospace; font-size: ${baseFontPt}pt; font-weight: 800; color: #000000; width: 20%;">
                ${item.qty}
              </td>
              <td style="padding: 2.5px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 800; font-size: ${baseFontPt}pt; color: #000000; width: 28%; white-space: nowrap;">
                ৳${(item.qty * item.sellPrice).toLocaleString()}
              </td>
            </tr>
            ${
              idx < data.items.length - 1
                ? `<tr><td colspan="3" style="border-top: 1px dotted #000000; height: 1px; padding: 0; margin: 0;"></td></tr>`
                : ""
            }`
            )
            .join("")}
        </tbody>
      </table>`;

  return `<!DOCTYPE html>
<html lang="bn" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${data.invoiceNo}</title>
  <style>
    @page { 
      size: ${pageSizeRule} !important;
      margin: 0mm !important; 
      padding: 0mm !important;
    }
    *, *:before, *:after { 
      box-sizing: border-box !important; 
      margin: 0; 
      padding: 0; 
      font-family: 'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; 
      font-weight: 800 !important;
      color: #000000 !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
      -webkit-print-color-adjust: exact !important; 
      print-color-adjust: exact !important; 
      color-scheme: light !important; 
    }
    html, body { 
      background: #ffffff !important; 
      color: #000000 !important; 
      font-weight: 800 !important;
      width: 100% !important; 
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important; 
      padding: 0 !important; 
      font-size: ${baseFontPt}pt; 
      line-height: 1.2; 
      vertical-align: top !important;
      writing-mode: horizontal-tb !important;
      direction: ltr !important;
    }
    body { zoom: ${scalePct}% !important; }
    body > *:first-child, .receipt-wrap > *:first-child {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    .receipt-wrap { 
      width: ${targetWidth} !important; 
      max-width: 100% !important; 
      ${heightMm ? `height: ${targetHeight} !important; max-height: ${targetHeight} !important; overflow: hidden !important;` : "height: auto !important; min-height: 0 !important;"}
      margin: 0 !important; /* Left-aligned: never auto-center (prevents big left margin) */
      padding: ${topMm}mm ${rightMm}mm ${bottomMm}mm ${leftMm}mm !important; 
      box-sizing: border-box !important; 
      background: #ffffff; 
      position: relative;
      font-weight: 800 !important;
      color: #000000 !important;
      display: flow-root !important; /* Prevents margin collapse at top and bottom */
      overflow: hidden !important;
    }
    .dashed-line { 
      border-top: 1.5px dashed #000000 !important; 
      margin: 3px 0 !important; 
      height: 0; 
    }
    .solid-line { 
      border-top: 1.5px solid #000000 !important; 
      margin: 3px 0 !important; 
      height: 0; 
    }
    table { 
      width: 100% !important; 
      max-width: 100% !important;
      border-collapse: collapse !important; 
      margin: 2px 0 !important; 
      table-layout: fixed !important;
    }
    th, td, span, div, p, strong, b { 
      font-weight: 800 !important; 
      color: #000000 !important; 
      word-break: break-word !important;
    }
    th { 
      font-size: ${smallFontPt}pt !important; 
      font-weight: 900 !important; 
      padding-bottom: 2px !important; 
      color: #000000 !important; 
    }
  </style>
</head>
<body><div class="receipt-wrap">
    <!-- Header -->
    <div style="text-align: center; margin: 0 0 3px 0; padding-top: 0;">
      ${
        vis.showShopName !== false
          ? `<div style="font-size: ${titleFontPt}pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; line-height: 1.2;">
              ${shopName}
            </div>`
          : ""
      }
      ${
        vis.showTagline !== false && tagline
          ? `<div style="font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 1px;">${tagline}</div>`
          : ""
      }
      ${
        vis.showShopAddress !== false && address
          ? `<div style="font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 1px;">${address}</div>`
          : ""
      }
      ${
        vis.showShopPhone !== false && phone
          ? `<div style="font-size: ${baseFontPt}pt; font-family: monospace; font-weight: 900; color: #000000; margin-top: 1px;">মোবাইল: ${phone}</div>`
          : ""
      }
      ${
        data.userEmail
          ? `<div style="font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 1px;">${data.userEmail}</div>`
          : ""
      }
      ${renderCustomLines("header")}
    </div>

    <div class="dashed-line"></div>

    <!-- Meta info -->
    <div style="font-size: ${smallFontPt}pt; line-height: 1.35; font-weight: 800; color: #000000;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-family: monospace; font-weight: 800;">
        ${vis.showInvoiceNo !== false ? `<span style="font-weight: 900;">ইনভয়েস: ${data.invoiceNo}</span>` : "<span></span>"}
        ${vis.showDateTime !== false ? `<span style="font-weight: 800;">${dateStr}</span>` : ""}
      </div>
      ${
        vis.showCustomer !== false && data.customerName
          ? `<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 4px; margin-top: 2px; font-weight: 800;">
              <span style="font-weight: 800;">ক্রেতা: <strong style="font-weight: 900;">${data.customerName}</strong></span>
              <span style="font-family: monospace; font-weight: 800; shrink-0;">${data.customerPhone || ""}</span>
            </div>`
          : ""
      }
      ${
        vis.showCashier !== false && data.cashierName
          ? `<div style="font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 1px;">ক্যাশিয়ার: ${data.cashierName}</div>`
          : ""
      }
    </div>

    ${renderCustomLines("before_items")}

    <div class="dashed-line"></div>

    <!-- Items table -->
    ${itemsHtml}

    ${renderCustomLines("after_items")}

    <div class="dashed-line"></div>

    <!-- Financial Totals -->
    <div style="font-size: ${baseFontPt}pt; line-height: 1.4; font-weight: 800; color: #000000;">
      ${
        vis.showSubtotal !== false
          ? `<div style="display: flex; justify-content: space-between; font-weight: 800;">
              <span>মোট মূল্য:</span>
              <span style="font-family: monospace; font-weight: 800;">৳${data.subtotal.toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        vis.showDiscount !== false && data.discountAmount > 0
          ? `<div style="display: flex; justify-content: space-between; font-weight: 800; color: #000000;">
              <span>বিশেষ ছাড়:</span>
              <span style="font-family: monospace; font-weight: 800;">-৳${data.discountAmount.toLocaleString()}</span>
            </div>`
          : ""
      }

      <!-- Boxed Total Payable -->
      ${
        vis.showTotal !== false
          ? `<div style="border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000; padding: 2px 0; margin: 2px 0; display: flex; justify-content: space-between; font-size: ${largeFontPt}pt; font-weight: 900;">
              <span style="font-weight: 900;">সর্বমোট:</span>
              <span style="font-family: monospace; font-weight: 900;">৳${data.total.toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        vis.showPaid !== false
          ? `<div style="display: flex; justify-content: space-between; font-weight: 800; color: #000000;">
              <span>পরিশোধ:</span>
              <span style="font-family: monospace; font-weight: 800;">৳${data.paidAmount.toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        vis.showPaid !== false && data.splitCash !== undefined && (data.splitCash > 0 || (data.splitBkash && data.splitBkash > 0) || (data.splitBank && data.splitBank > 0))
          ? `
            <div style="background: #ffffff; border: 1px dashed #000000; padding: 2px 4px; border-radius: 4px; margin: 2px 0; font-size: ${smallFontPt}pt; font-weight: 800; color: #000000;">
              ${data.splitCash > 0 ? `<div style="display: flex; justify-content: space-between; font-weight: 800;"><span>• নগদ:</span><span style="font-family: monospace; font-weight: 800;">৳${data.splitCash.toLocaleString()}</span></div>` : ""}
              ${data.splitBkash && data.splitBkash > 0 ? `<div style="display: flex; justify-content: space-between; font-weight: 800;"><span>• বিকাশ:</span><span style="font-family: monospace; font-weight: 800;">৳${data.splitBkash.toLocaleString()}</span></div>` : ""}
              ${data.splitBank && data.splitBank > 0 ? `<div style="display: flex; justify-content: space-between; font-weight: 800;"><span>• ব্যাংক:</span><span style="font-family: monospace; font-weight: 800;">৳${data.splitBank.toLocaleString()}</span></div>` : ""}
            </div>
          `
          : ""
      }

      ${
        vis.showDue !== false
          ? data.due > 0
            ? `<div style="display: flex; justify-content: space-between; font-weight: 900; color: #000000;">
                <span>বকেয়া:</span>
                <span style="font-family: monospace; font-weight: 900;">৳${data.due.toLocaleString()}</span>
              </div>`
            : `<div style="display: flex; justify-content: space-between; font-weight: 800;">
                <span>বকেয়া:</span>
                <span style="font-family: monospace; font-weight: 800;">৳0</span>
              </div>`
          : ""
      }

      ${
        vis.showChangeReturn !== false && (data.changeAmount || 0) > 0
          ? `<div style="display: flex; justify-content: space-between; font-weight: 800;">
              <span>ফেরত:</span>
              <span style="font-family: monospace; font-weight: 800;">৳${data.changeAmount?.toLocaleString()}</span>
            </div>`
          : ""
      }

      ${
        vis.showPaymentMode !== false
          ? `<div style="display: flex; justify-content: space-between; font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 2px;">
              <span>পেমেন্ট মাধ্যম:</span>
              <span style="font-weight: 900; color: #000000;">${data.paymentMode || (data.due > 0 ? "বাকী" : "নগদ")}</span>
            </div>`
          : ""
      }
    </div>

    <div class="dashed-line"></div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 3px; font-weight: 800; color: #000000;">
      ${renderCustomLines("footer")}
      ${
        vis.showTerms !== false
          ? termLines
              .map(
                (line, i) =>
                  `<div style="font-size: ${i === 0 ? baseFontPt : smallFontPt}pt; font-weight: ${i === 0 ? 900 : 800}; color: #000000; margin-top: ${i === 0 ? 0 : 1}px;">${line}</div>`
              )
              .join("")
          : ""
      }
      ${
        vis.showPolicyNote !== false && policyNote
          ? `<div style="font-size: ${smallFontPt}pt; font-weight: 800; color: #000000; margin-top: 1px;">${policyNote}</div>`
          : ""
      }
    </div>
  </div>
</body>
</html>`;
}

/**
 * Clean Thermal POS Receipt Print Engine (Optimized for 20mm/50mm/58mm/70mm/80mm Thermal Printers & A4)
 * All texts are rendered BOLD & pure black (#000000) for crisp thermal printing.
 * Respects per-device default printer, automated printing toggle, margins, custom width, scale and custom lines.
 */
export async function printPwaInvoice(data: PrintInvoiceParams, settingsOverride?: Partial<PosHardwareSettings>) {
  const hw = { ...getPosHardwareSettings(), ...(settingsOverride || {}) };
  const html = buildInvoiceHtml(data, hw);

  const widthMm = Number(hw.paperWidthMm) || (data.pageSize === "58mm" ? 58 : 80);
  const resolvedSize = data.pageSize || `${widthMm}mm`;

  const topMm = hw.marginTopMm ?? 0;
  const bottomMm = hw.marginBottomMm ?? 0;
  const leftMm = hw.marginLeftMm ?? 0;
  const rightMm = hw.marginRightMm ?? 0;
  const scalePct = hw.printScale || 100;

  // 1-Click Direct Silent Printing (or Windows Print Dialog if automatePrinting is false / forcePrintDialog is true)
  const printedDirect = await executeDirectSilentPrint(html, hw.devicePrinterName || undefined, {
    silent: data.forcePrintDialog ? false : hw.automatePrinting !== false,
    copies: hw.copies || 1,
    scaleFactor: scalePct,
    margins: {
      topMm,
      bottomMm,
      leftMm,
      rightMm,
    },
    pageSize: resolvedSize,
    paperWidthMm: widthMm,
    paperHeightMm: hw.paperHeightMm || "auto",
  });
  if (printedDirect) {
    return;
  }

  // Fallback to hidden iframe print
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

  try {
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      const triggerPrint = () => {
        try {
          const idoc = iframe.contentWindow?.document || iframe.contentDocument;
          if (idoc && (!hw.paperHeightMm || hw.paperHeightMm === "auto")) {
            const wrap = idoc.querySelector(".receipt-wrap");
            if (wrap) {
              const hMm = Math.ceil(wrap.getBoundingClientRect().height * 0.264583) + topMm + bottomMm + 2;
              const exactStyle = idoc.createElement("style");
              exactStyle.id = "pwa-exact-roll-height";
              exactStyle.textContent = `@page { size: ${widthMm}mm ${hMm}mm portrait !important; margin: 0 !important; }`;
              idoc.head.appendChild(exactStyle);
            }
          }
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          window.print();
        } finally {
          setTimeout(() => {
            try {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            } catch (_) {}
          }, 1500);
        }
      };

      if (iframe.contentWindow) {
        if (iframe.contentWindow.document.readyState === "complete") {
          setTimeout(triggerPrint, 200);
        } else {
          iframe.contentWindow.onload = () => setTimeout(triggerPrint, 200);
        }
      } else {
        setTimeout(triggerPrint, 250);
      }
    } else {
      window.print();
    }
  } catch (err) {
    console.warn("Direct iframe print failed, falling back to window.print():", err);
    window.print();
  }
}

/**
 * Generate and Download Standalone Clean Vector PDF Invoice (Zero Web-Preview)
 * Supports Thermal POS formats (58mm, 80mm) and standard (A4, A5) formats.
 */
export async function downloadPwaInvoicePdf(data: PrintInvoiceParams, openInNewTab = false): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const isThermal80 = data.pageSize === "80mm";
  const isThermal58 = data.pageSize === "58mm";
  const isA5 = data.pageSize === "A5";

  let pdf: InstanceType<typeof jsPDF>;
  let pageWidth = 210;
  let margin = 14;

  if (isThermal58) {
    pageWidth = 58;
    margin = 4;
    const estHeight = Math.max(130, 70 + data.items.length * 8);
    pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [58, estHeight],
    });
  } else if (isThermal80) {
    pageWidth = 80;
    margin = 5;
    const estHeight = Math.max(140, 80 + data.items.length * 8);
    pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, estHeight],
    });
  } else if (isA5) {
    pageWidth = 148;
    margin = 10;
    pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a5",
    });
  } else {
    pageWidth = 210;
    margin = 14;
    pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
  }

  let currentY = isThermal58 || isThermal80 ? 6 : 15;

  if (isThermal58 || isThermal80) {
    // ── Thermal POS Receipt Layout (58mm / 80mm) - ALL TEXT BOLD ──────────
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isThermal58 ? 12 : 14);
    pdf.setTextColor(0, 0, 0);
    pdf.text((data.businessName || "CLASSIC WORLD").toUpperCase(), pageWidth / 2, currentY, { align: "center" });
    currentY += 4.5;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isThermal58 ? 7 : 8);
    pdf.setTextColor(0, 0, 0);

    if (data.tagline) {
      pdf.text(data.tagline, pageWidth / 2, currentY, { align: "center" });
      currentY += 3.5;
    }
    if (data.shopAddress) {
      pdf.text(data.shopAddress, pageWidth / 2, currentY, { align: "center" });
      currentY += 3.5;
    }
    if (data.shopPhoneNumbers) {
      pdf.text(`Phone: ${data.shopPhoneNumbers}`, pageWidth / 2, currentY, { align: "center" });
      currentY += 3.5;
    }

    // Divider
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.35);
    pdf.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 4;

    // Meta Info
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isThermal58 ? 6.5 : 7.5);
    pdf.text(`Inv: ${data.invoiceNo}`, margin, currentY);
    pdf.text(data.invoiceDate || new Date().toLocaleDateString(), pageWidth - margin, currentY, { align: "right" });
    currentY += 3.5;

    if (data.customerName) {
      pdf.text(`Cust: ${data.customerName} ${data.customerPhone ? `(${data.customerPhone})` : ""}`, margin, currentY);
      currentY += 3.5;
    }

    // Items
    const tableRows = data.items.map((item, idx) => [
      `${idx + 1}. ${item.product.name}`,
      String(item.qty),
      `Tk ${(item.qty * item.sellPrice).toLocaleString()}`,
    ]);

    autoTable(pdf, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [["Item", "Qty", "Total"]],
      body: tableRows,
      theme: "plain",
      headStyles: {
        textColor: [0, 0, 0],
        fontStyle: "bold",
        fontSize: isThermal58 ? 6.5 : 7.5,
        cellPadding: 1,
        lineWidth: { bottom: 0.35 },
        lineColor: [0, 0, 0],
      },
      styles: {
        fontSize: isThermal58 ? 6.5 : 7.5,
        fontStyle: "bold",
        cellPadding: 1,
        textColor: [0, 0, 0],
      },
      columnStyles: {
        0: { cellWidth: "auto", fontStyle: "bold" },
        1: { halign: "center", fontStyle: "bold", cellWidth: isThermal58 ? 10 : 14 },
        2: { halign: "right", fontStyle: "bold", cellWidth: isThermal58 ? 16 : 22 },
      },
    });

    // @ts-ignore
    currentY = (pdf as any).lastAutoTable.finalY + 3;

    // Divider
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.35);
    pdf.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 3.5;

    // Totals (All Bold)
    pdf.setFontSize(isThermal58 ? 7 : 8);
    pdf.setFont("helvetica", "bold");
    pdf.text("Subtotal:", margin, currentY);
    pdf.text(`Tk ${data.subtotal.toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 3.5;

    if (data.discountAmount > 0) {
      pdf.text("Discount:", margin, currentY);
      pdf.text(`-Tk ${data.discountAmount.toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
      currentY += 3.5;
    }

    pdf.setFont("helvetica", "bold");
    pdf.text("Total:", margin, currentY);
    pdf.text(`Tk ${data.total.toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 3.5;

    pdf.text("Paid:", margin, currentY);
    pdf.text(`Tk ${data.paidAmount.toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 3.5;

    if (data.due > 0) {
      pdf.text("Due:", margin, currentY);
      pdf.text(`Tk ${data.due.toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
      currentY += 3.5;
    }

    if ((data.changeAmount || 0) > 0) {
      pdf.text("Change:", margin, currentY);
      pdf.text(`Tk ${(data.changeAmount || 0).toLocaleString()}`, pageWidth - margin, currentY, { align: "right" });
      currentY += 3.5;
    }

    // Payment method
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(isThermal58 ? 6.5 : 7.5);
    pdf.text(`Paid via: ${data.paymentMode || (data.due > 0 ? "Credit" : "Cash")}`, margin, currentY);
    currentY += 5;

    // Footer
    pdf.setFont("helvetica", "bold");
    pdf.text(data.terms || "Thank you for shopping with us!", pageWidth / 2, currentY, { align: "center" });

  } else {
    // ── Standard A4 / A5 Clean Invoice Layout ─────────────────────────────
    pdf.setFillColor(15, 23, 42);
    pdf.rect(0, 0, pageWidth, 4, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.setTextColor(15, 23, 42);
    pdf.text((data.businessName || "CLASSIC WORLD").toUpperCase(), margin, currentY + 4);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    const contactText = [data.shopAddress, data.shopPhoneNumbers ? `Phone: ${data.shopPhoneNumbers}` : ""].filter(Boolean).join(" | ");
    pdf.text(contactText || "Sales Invoice & Cash Receipt", margin, currentY + 9);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(15, 23, 42);
    pdf.text("SALES INVOICE", pageWidth - margin, currentY + 4, { align: "right" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Invoice No: ${data.invoiceNo}`, pageWidth - margin, currentY + 9, { align: "right" });
    pdf.text(`Date: ${data.invoiceDate || new Date().toLocaleDateString()}`, pageWidth - margin, currentY + 13, { align: "right" });

    currentY += 18;

    // Customer Info Box
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(margin, currentY, pageWidth - margin * 2, 14, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Customer: ${data.customerName || "Walk-in Customer"}`, margin + 4, currentY + 6);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    if (data.customerPhone) {
      pdf.text(`Mobile: ${data.customerPhone}`, margin + 4, currentY + 10);
    }
    pdf.text(`Payment: ${data.paymentMode || "Cash"}`, pageWidth - margin - 4, currentY + 6, { align: "right" });

    currentY += 18;

    // Items Table
    const tableRows = data.items.map((item, idx) => [
      String(idx + 1),
      `${idx + 1}. ${item.product.name}`,
      String(item.qty),
      `Tk ${item.sellPrice.toLocaleString()}`,
      `Tk ${(item.qty * item.sellPrice).toLocaleString()}`,
    ]);

    autoTable(pdf, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [["#", "Item Description", "Qty", "Unit Price", "Total Amount"]],
      body: tableRows,
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        cellPadding: 2.5,
        lineWidth: 0.35,
        lineColor: [15, 23, 42],
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.35,
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 10 },
        1: { fontStyle: "bold", cellWidth: "auto" },
        2: { halign: "center", cellWidth: 20 },
        3: { halign: "right", cellWidth: 32 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 35 },
      },
    });

    // @ts-ignore
    currentY = (pdf as any).lastAutoTable.finalY + 6;

    // Summary Totals
    const rightCol = pageWidth - margin;
    const labelCol = pageWidth - margin - 46;

    pdf.setFontSize(8.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(100, 116, 139);
    pdf.text("Subtotal:", labelCol, currentY);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text(`Tk ${data.subtotal.toLocaleString()}`, rightCol, currentY, { align: "right" });
    currentY += 5;

    if (data.discountAmount > 0) {
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(225, 29, 72);
      pdf.text("Discount:", labelCol, currentY);
      pdf.setFont("helvetica", "bold");
      pdf.text(`-Tk ${data.discountAmount.toLocaleString()}`, rightCol, currentY, { align: "right" });
      currentY += 5;
    }

    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 23, 42);
    pdf.text("Grand Total:", labelCol, currentY);
    pdf.text(`Tk ${data.total.toLocaleString()}`, rightCol, currentY, { align: "right" });
    currentY += 5;

    pdf.setTextColor(5, 150, 105);
    pdf.text("Paid Amount:", labelCol, currentY);
    pdf.text(`Tk ${data.paidAmount.toLocaleString()}`, rightCol, currentY, { align: "right" });
    currentY += 5;

    if (data.due > 0) {
      pdf.setTextColor(225, 29, 72);
      pdf.text("Due Amount:", labelCol, currentY);
      pdf.text(`Tk ${data.due.toLocaleString()}`, rightCol, currentY, { align: "right" });
      currentY += 5;
    }

    if ((data.changeAmount || 0) > 0) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(217, 119, 6);
      pdf.text("Change Return:", labelCol, currentY);
      pdf.text(`Tk ${(data.changeAmount || 0).toLocaleString()}`, rightCol, currentY, { align: "right" });
      currentY += 5;
    }

    // Footer note
    currentY += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(data.terms || "Thank you for your business!", pageWidth / 2, currentY, { align: "center" });
  }

  const filename = `Invoice_${data.invoiceNo}.pdf`;
  if (openInNewTab) {
    const blobUrl = pdf.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    pdf.save(filename);
  }
}
