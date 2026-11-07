import { getPrintableWidthMm, getPrintScale, setReceiptPageSize } from "@/lib/print-layout";
import { fmtDateTime } from "@/lib/format";
import { executeDirectSilentPrint } from "@/lib/pos-print";
import {
  getPosHardwareSettings,
  DEFAULT_VISIBILITY_SETTINGS,
  DEFAULT_POLICY_NOTE,
  DEFAULT_INVOICE_SECTION_ORDER,
  type InvoiceSectionId,
  type PosHardwareSettings,
} from "@/lib/pos-hardware";

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

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Clean Thermal POS Receipt Print Engine (Optimized for 20mm/50mm/58mm/70mm/80mm Thermal Printers & A4)
 * All texts are rendered BOLD & pure black (#000000) for crisp thermal printing.
 * Respects per-device default printer, automated printing toggle, custom width, margins, font sizes, and custom lines.
 */
export function buildInvoiceHtml(data: PrintInvoiceParams, settingsOverride?: Partial<PosHardwareSettings>): string {
  const hw = { ...getPosHardwareSettings(), ...(settingsOverride || {}) };
  const vis = { ...DEFAULT_VISIBILITY_SETTINGS, ...(hw.visibility || {}) };

  const isExplicitA4 = String(data.pageSize || "").toLowerCase() === "a4" && !settingsOverride?.paperWidthMm && hw.paperWidthMm === 80;
  const widthMm = isExplicitA4 ? 210 : (Number(hw.paperWidthMm) || (data.pageSize === "58mm" ? 58 : 80));

  const printableWidthMm = getPrintableWidthMm(widthMm);
  // Reflow larger text inside the same physical head width.
  const targetWidth = `${printableWidthMm * 100 / getPrintScale(hw.printScale)}mm`;

  const heightMm =
    hw.paperHeightMm !== undefined && hw.paperHeightMm !== "auto" && Number(hw.paperHeightMm) > 0
      ? Number(hw.paperHeightMm)
      : undefined;
  const pageSizeRule = widthMm >= 180 ? "A4 portrait" : (heightMm ? `${widthMm}mm ${heightMm}mm` : "auto");

  const topMm = hw.marginTopMm ?? 0;
  const bottomMm = hw.marginBottomMm ?? 0;
  const leftMm = hw.marginLeftMm ?? 0;
  const rightMm = hw.marginRightMm ?? 0;
  const scalePct = getPrintScale(hw.printScale);
  const contentWidthMm = Math.max(8, printableWidthMm * 100 / scalePct - leftMm - rightMm);

  const userBasePt = Number(hw.fontSizePt) || 7.0;
  const userTitlePt = Number(hw.titleFontSizePt) || 9.5;

  // Respect user font adjustments while preventing physical roll overflow when fitToWidth is enabled
  const maxSafeBasePt =
    widthMm <= 25 ? 5.5 :
    widthMm <= 50 ? 6.8 :
    widthMm <= 58 ? 8.0 :
    widthMm <= 72 ? 9.0 :
    widthMm < 148 ? 10.5 :
    13.0;

  const maxSafeTitlePt =
    widthMm <= 25 ? 7.0 :
    widthMm <= 50 ? 8.8 :
    widthMm <= 58 ? 10.5 :
    widthMm <= 72 ? 12.0 :
    widthMm < 148 ? 14.5 :
    18.0;

  const baseFontPt = hw.fitToWidth !== false ? Math.min(userBasePt, maxSafeBasePt) : userBasePt;
  const rawTitlePt = hw.fitToWidth !== false ? Math.min(userTitlePt, maxSafeTitlePt) : userTitlePt;
  const shopNameRaw = String(hw.customHeaderTitle || data.businessName || "CLASSIC WORLD");
  const longestTitleWord = Math.max(1, ...shopNameRaw.split(/\s+/).map((w) => w.length));
  const autoTitleCapPt = hw.fitToWidth !== false
    ? Math.max(baseFontPt + 1, Math.floor((contentWidthMm / (longestTitleWord * 0.62)) * (72 / 25.4) * 10) / 10)
    : rawTitlePt;
  const titleFontPt = Math.min(rawTitlePt, autoTitleCapPt);
  const smallFontPt = Math.max(4.5, Number((baseFontPt - 1.0).toFixed(1)));
  const largeFontPt = Number((baseFontPt + 1.0).toFixed(1));

  // Choose columns from usable space at the requested text scale, not roll size alone.
  const amountChars = Math.max(6, ...data.items.map(item => ("৳" + (item.qty * item.sellPrice).toLocaleString()).length));
  const qtyChars = Math.max(3, ...data.items.map(item => String(item.qty).length));
  const charWidthMm = baseFontPt * 25.4 / 72 * 0.62;
  const isNarrow = contentWidthMm < 52 || amountChars * charWidthMm > contentWidthMm * 0.30
    || qtyChars * charWidthMm + 1 > contentWidthMm * 0.20;

  const shopName = escapeHtml(shopNameRaw);
  const tagline = escapeHtml(hw.customSubtitle !== undefined ? hw.customSubtitle : (data.tagline || ""));
  const address = escapeHtml(hw.customAddress !== undefined ? hw.customAddress : (data.shopAddress || ""));
  const phone = escapeHtml(hw.customPhone !== undefined ? hw.customPhone : (data.shopPhoneNumbers || ""));
  const terms = hw.customFooterNote !== undefined ? hw.customFooterNote : data.terms;
  const rawPolicyNote = (hw.customPolicyNote !== undefined ? hw.customPolicyNote : DEFAULT_POLICY_NOTE).trim();
  const policyNote = escapeHtml(rawPolicyNote);
  const normalizeLine = (s: string) => s.replace(/[*\s]/g, "");
  const termLines = (terms !== undefined && terms !== null ? String(terms) : "আমাদের সাথে কেনাকাটা করার জন্য ধন্যবাদ!")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !rawPolicyNote || normalizeLine(l) !== normalizeLine(rawPolicyNote))
    .map((l) => escapeHtml(l));
  const dateStr = escapeHtml(data.invoiceDate || fmtDateTime(new Date()));

  const showItemsHeader = vis.showItemsHeader !== false && vis.showItemHeader !== false;
  const showCustomerInfo = vis.showCustomer !== false && vis.showCustomerDetails !== false;
  const showCashierInfo = vis.showCashier !== false && vis.showCashierName !== false;

  const customLines = hw.customLines || [];
  const renderCustomLines = (pos: "header" | "before_items" | "after_items" | "footer") => {
    const lines = customLines.filter((l) => l.position === pos && String(l.text || "").trim().length > 0);
    if (!lines.length) return "";
    return lines
      .map(
        (l) =>
          `<div style="text-align: ${l.align || "center"}; font-weight: ${
            l.bold ? "700" : "600"
          }; font-size: ${l.fontSizePt || baseFontPt}pt; color: #000000; margin: 1px 0; word-break: break-word;">${escapeHtml(l.text)}</div>`
      )
      .join("");
  };

  const itemsHtml = isNarrow
    ? data.items
        .map(
          (item, idx) => `
      <div class="receipt-item" style="padding: 1.5px 0; border-bottom: 1px dotted #000000;">
        <div style="font-weight: 600; font-size: ${baseFontPt}pt; word-break: break-word; line-height: 1.18;">
          ${idx + 1}. ${escapeHtml(item.product.name)}
        </div>
        <div class="receipt-row" style="display: flex; justify-content: space-between; font-size: ${smallFontPt}pt; font-family: monospace; margin-top: 1px;">
          <span>${item.qty} × ৳${Number(item.sellPrice || 0).toLocaleString()}</span>
          <span style="font-weight: 700;">৳${(Number(item.qty || 0) * Number(item.sellPrice || 0)).toLocaleString()}</span>
        </div>
      </div>`
        )
        .join("")
    : `
      <table style="table-layout: fixed !important; width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; margin: 1.5px 0 !important;">
        <colgroup>
          <col style="width: 52%;" />
          <col style="width: 20%;" />
          <col style="width: 28%;" />
        </colgroup>
        ${
          showItemsHeader
            ? `<thead>
                <tr style="border-bottom: 1px dashed #000000;">
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
              <td style="padding: 1.5px 0; text-align: left; vertical-align: top; font-weight: 600; font-size: ${baseFontPt}pt; color: #000000; width: 52%; word-break: break-word; overflow-wrap: break-word; line-height: 1.18;">
                ${idx + 1}. ${escapeHtml(item.product.name)}
              </td>
              <td style="padding: 1.5px 2px; text-align: center; vertical-align: top; font-family: monospace; font-size: ${baseFontPt}pt; font-weight: 600; color: #000000; width: 20%;">
                ${item.qty}
              </td>
              <td style="padding: 1.5px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 600; font-size: ${baseFontPt}pt; color: #000000; width: 28%; white-space: nowrap;">
                ৳${(Number(item.qty || 0) * Number(item.sellPrice || 0)).toLocaleString()}
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

  const headerInner = [
    vis.showShopName !== false && shopName
      ? `<div style="font-size: ${titleFontPt}pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #000000; line-height: 1.18;">${shopName}</div>`
      : "",
    vis.showTagline !== false && tagline
      ? `<div style="font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">${tagline}</div>`
      : "",
    vis.showShopAddress !== false && address
      ? `<div style="font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">${address}</div>`
      : "",
    vis.showShopPhone !== false && phone
      ? `<div style="font-size: ${smallFontPt}pt; font-family: monospace; font-weight: 700; color: #000000; margin-top: 1px;">মোবাইল: ${phone}</div>`
      : "",
    data.userEmail
      ? `<div style="font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">${escapeHtml(data.userEmail)}</div>`
      : "",
    renderCustomLines("header"),
  ]
    .filter(Boolean)
    .join("");

  const metaInner = [
    vis.showInvoiceNo !== false || vis.showDateTime !== false
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; align-items: center; font-family: monospace; font-weight: 600;">
          ${vis.showInvoiceNo !== false ? `<span style="font-weight: 700;">ইনভয়েস: ${escapeHtml(data.invoiceNo)}</span>` : "<span></span>"}
          ${vis.showDateTime !== false ? `<span style="font-weight: 600;">${dateStr}</span>` : ""}
        </div>`
      : "",
    showCustomerInfo && data.customerName
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; align-items: baseline; gap: 4px; margin-top: 1px; font-weight: 600;">
          <span style="font-weight: 600;">ক্রেতা: <strong style="font-weight: 700;">${escapeHtml(data.customerName)}</strong></span>
          <span style="font-family: monospace; font-weight: 600;">${escapeHtml(data.customerPhone || "")}</span>
        </div>`
      : "",
    showCashierInfo && data.cashierName
      ? `<div style="font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">ক্যাশিয়ার: ${escapeHtml(data.cashierName)}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const totalsInner = [
    vis.showSubtotal !== false
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>মোট মূল্য:</span>
          <span style="font-family: monospace; font-weight: 600;">৳${data.subtotal.toLocaleString()}</span>
        </div>`
      : "",
    vis.showDiscount !== false && data.discountAmount > 0
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600; color: #000000;">
          <span>বিশেষ ছাড়:</span>
          <span style="font-family: monospace; font-weight: 600;">-৳${data.discountAmount.toLocaleString()}</span>
        </div>`
      : "",
    vis.showTotal !== false
      ? `<div class="receipt-row" style="border-top: 1px solid #000000; border-bottom: 1px solid #000000; padding: 1.5px 0; margin: 1.5px 0; display: flex; justify-content: space-between; font-size: ${largeFontPt}pt; font-weight: 700;">
          <span style="font-weight: 700;">সর্বমোট:</span>
          <span style="font-family: monospace; font-weight: 700;">৳${data.total.toLocaleString()}</span>
        </div>`
      : "",
    vis.showPaid !== false
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600; color: #000000;">
          <span>পরিশোধ:</span>
          <span style="font-family: monospace; font-weight: 600;">৳${data.paidAmount.toLocaleString()}</span>
        </div>`
      : "",
    vis.showPaid !== false && data.splitCash !== undefined && (data.splitCash > 0 || (data.splitBkash && data.splitBkash > 0) || (data.splitBank && data.splitBank > 0))
      ? `<div style="background: #ffffff; border: 1px dashed #000000; padding: 2px 4px; border-radius: 3px; margin: 1.5px 0; font-size: ${smallFontPt}pt; font-weight: 600; color: #000000;">
          ${data.splitCash > 0 ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;"><span>• নগদ:</span><span style="font-family: monospace; font-weight: 600;">৳${data.splitCash.toLocaleString()}</span></div>` : ""}
          ${data.splitBkash && data.splitBkash > 0 ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;"><span>• বিকাশ:</span><span style="font-family: monospace; font-weight: 600;">৳${data.splitBkash.toLocaleString()}</span></div>` : ""}
          ${data.splitBank && data.splitBank > 0 ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;"><span>• ব্যাংক:</span><span style="font-family: monospace; font-weight: 600;">৳${data.splitBank.toLocaleString()}</span></div>` : ""}
        </div>`
      : "",
    vis.showDue !== false
      ? data.due > 0
        ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 700; color: #000000;">
            <span>বকেয়া:</span>
            <span style="font-family: monospace; font-weight: 700;">৳${data.due.toLocaleString()}</span>
          </div>`
        : `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;">
            <span>বকেয়া:</span>
            <span style="font-family: monospace; font-weight: 600;">৳0</span>
          </div>`
      : "",
    vis.showChangeReturn !== false && (data.changeAmount || 0) > 0
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-weight: 600;">
          <span>ফেরত:</span>
          <span style="font-family: monospace; font-weight: 600;">৳${data.changeAmount?.toLocaleString()}</span>
        </div>`
      : "",
    vis.showPaymentMode !== false
      ? `<div class="receipt-row" style="display: flex; justify-content: space-between; font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">
          <span>পেমেন্ট মাধ্যম:</span>
          <span style="font-weight: 700; color: #000000;">${escapeHtml(data.paymentMode || (data.due > 0 ? "বাকী" : "নগদ"))}</span>
        </div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const footerInner = [
    renderCustomLines("footer"),
    vis.showTerms !== false
      ? termLines
          .map(
            (line, i) =>
              `<div style="font-size: ${i === 0 ? baseFontPt : smallFontPt}pt; font-weight: ${i === 0 ? 700 : 600}; color: #000000; margin-top: ${i === 0 ? 0 : 1}px;">${line}</div>`
          )
          .join("")
      : "",
    vis.showPolicyNote !== false && policyNote
      ? `<div style="font-size: ${smallFontPt}pt; font-weight: 600; color: #000000; margin-top: 1px;">${policyNote}</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const sectionBlocks: Record<InvoiceSectionId, string> = {
    header: headerInner ? `<div style="text-align: center; margin: 0 0 2px 0; padding-top: 0;">${headerInner}</div>` : "",
    meta: metaInner ? `<div style="font-size: ${smallFontPt}pt; line-height: 1.25; font-weight: 600; color: #000000;">${metaInner}</div>` : "",
    before_items: renderCustomLines("before_items"),
    items: itemsHtml,
    after_items: renderCustomLines("after_items"),
    totals: totalsInner ? `<div style="font-size: ${baseFontPt}pt; line-height: 1.3; font-weight: 600; color: #000000;">${totalsInner}</div>` : "",
    footer: footerInner ? `<div style="text-align: center; margin-top: 2px; font-weight: 600; color: #000000;">${footerInner}</div>` : "",
  };

  const rawOrder = Array.isArray(hw.invoiceSectionOrder) && hw.invoiceSectionOrder.length > 0
    ? hw.invoiceSectionOrder
    : DEFAULT_INVOICE_SECTION_ORDER;
  const fullOrder: InvoiceSectionId[] = [
    ...rawOrder,
    ...DEFAULT_INVOICE_SECTION_ORDER.filter((s) => !rawOrder.includes(s)),
  ];

  const orderedBodyHtml = fullOrder
    .map((secId) => sectionBlocks[secId])
    .filter((html) => html && html.trim().length > 0)
    .join('\n    <div class="dashed-line"></div>\n    ');

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
      font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Segoe UI', 'Nirmala UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif !important; 
      color: #000000 !important;
      word-break: normal !important;
      overflow-wrap: anywhere !important;
      -webkit-print-color-adjust: exact !important; 
      print-color-adjust: exact !important; 
      color-scheme: light !important; 
    }
    html, body { 
      background: #ffffff !important; 
      color: #000000 !important; 
      font-weight: 600;
      width: ${targetWidth};
      height: auto !important;
      min-height: 0 !important;
      margin: 0 !important; 
      padding: 0 !important; 
      font-size: ${baseFontPt}pt; 
      line-height: 1.18; 
      vertical-align: top !important;
      writing-mode: horizontal-tb !important;
      direction: ltr !important;
    }
    @media print {
      html, body {
        width: auto !important;
        max-width: none !important;
      }
    }
    html { zoom: 1 !important; }
    body { zoom: ${scalePct}% !important; }
    .receipt-wrap > *:first-child {
      margin-top: 0 !important;
      padding-top: 0 !important;
    }
    .receipt-wrap { 
      width: ${targetWidth} !important; 
      max-width: 100% !important; 
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important; /* Left-aligned: never auto-center (prevents big left margin) */
      padding: ${topMm}mm ${rightMm}mm ${bottomMm}mm ${leftMm}mm !important; 
      box-sizing: border-box !important; 
      background: #ffffff; 
      position: relative;
      font-weight: 600;
      color: #000000 !important;
      display: flow-root !important; /* Prevents margin collapse at top and bottom */
      overflow: visible !important;
    }
    .dashed-line { 
      border-top: 1px dashed #000000 !important; 
      margin: 2px 0 !important; 
      height: 0; 
    }
    .solid-line { 
      border-top: 1px solid #000000 !important; 
      margin: 2px 0 !important; 
      height: 0; 
    }
    table { 
      width: 100% !important; 
      max-width: 100% !important;
      border-collapse: collapse !important; 
      margin: 1.5px 0 !important; 
      table-layout: fixed !important;
    }
    th, td, span, div, p, strong, b { 
      color: #000000 !important; 
      word-break: break-word !important;
    }
    strong, b {
      font-weight: 700;
    }
    .receipt-row {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: baseline !important;
      gap: 1px 6px;
      break-inside: avoid;
    }
    .receipt-row > span {
      min-width: 0;
      max-width: 100%;
      white-space: normal !important;
    }
    .receipt-row > span:first-child { flex: 1 1 45%; min-width: min(100%, 10ch); }
    .receipt-row > span:last-child:not(:first-child) {
      flex: 0 0 auto;
      margin-left: auto;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
    .receipt-item, tr { break-inside: avoid; }
    thead { display: table-header-group; }
    td, th { white-space: normal !important; }
    td { vertical-align: top; }
    th { 
      font-size: ${smallFontPt}pt !important; 
      font-weight: 700 !important; 
      padding-bottom: 1.5px !important; 
      color: #000000 !important; 
    }
  </style>
</head>
<body><div class="receipt-wrap">
    ${orderedBodyHtml}
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

  const isExplicitA4 = String(data.pageSize || "").toLowerCase() === "a4" && !settingsOverride?.paperWidthMm && hw.paperWidthMm === 80;
  const widthMm = isExplicitA4 ? 210 : (Number(hw.paperWidthMm) || (data.pageSize === "58mm" ? 58 : 80));
  const resolvedSize = widthMm >= 180 ? "a4" : `${widthMm}mm`;

  const topMm = hw.marginTopMm ?? 0;
  const bottomMm = hw.marginBottomMm ?? 0;
  const leftMm = hw.marginLeftMm ?? 0;
  const rightMm = hw.marginRightMm ?? 0;
  const scalePct = getPrintScale(hw.printScale);

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
  iframe.style.left = "-9999px";
  iframe.style.top = "0";
  iframe.style.width = `${Math.max(240, Math.ceil(widthMm * 3.78))}px`;
  iframe.style.height = "800px";
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
            setReceiptPageSize(idoc, widthMm);
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
 * Generate and Download High-Resolution Bangla + English PDF Invoice
 * Renders exact customized POS receipt via html2canvas (supporting full Bangla Unicode, ৳ symbol, and custom lines),
 * with vector fallback if offscreen DOM capture is unavailable.
 */
export async function downloadPwaInvoicePdf(data: PrintInvoiceParams, openInNewTab = false): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  if (typeof document !== "undefined") {
    try {
      const { default: html2canvas } = await import("html2canvas");
      const hw = getPosHardwareSettings();
      const html = buildInvoiceHtml(data, hw);
      const widthMm = Number(hw.paperWidthMm) || (data.pageSize === "58mm" ? 58 : data.pageSize === "A4" ? 210 : 80);

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = `${Math.max(320, Math.ceil(widthMm * 4.2))}px`;
      iframe.style.height = "1600px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(html);
          doc.close();

          await new Promise((r) => setTimeout(r, 220));
          const targetEl = (doc.querySelector(".receipt-wrap") || doc.body) as HTMLElement;
          const canvas = await html2canvas(targetEl, {
            scale: 3,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
          });

          const imgData = canvas.toDataURL("image/png");
          const pdfWidthMm = Math.max(48, widthMm);
          const padMm = pdfWidthMm >= 180 ? 10 : 3;
          const innerW = pdfWidthMm - padMm * 2;
          const innerH = (canvas.height / canvas.width) * innerW;
          const pdfHeightMm = Math.max(innerH + padMm * 2, pdfWidthMm >= 180 ? 297 : innerH + padMm * 2);

          const pdf = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: [pdfWidthMm, pdfHeightMm],
          });
          pdf.addImage(imgData, "PNG", padMm, padMm, innerW, innerH);

          const filename = `Invoice_${data.invoiceNo}.pdf`;
          if (openInNewTab) {
            const blobUrl = pdf.output("bloburl");
            window.open(blobUrl, "_blank");
          } else {
            pdf.save(filename);
          }
          return;
        }
      } finally {
        try {
          if (document.body.contains(iframe)) document.body.removeChild(iframe);
        } catch (_) {}
      }
    } catch (canvasErr) {
      console.warn("Canvas PDF generation fallback:", canvasErr);
    }
  }

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
