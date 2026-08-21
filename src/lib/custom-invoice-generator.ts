"use client";

import { getPosPaperConfig } from "./pos-print";

export interface CustomInvoiceData {
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
}

/**
 * Custom-made High-Resolution POS Receipt Canvas Generator
 * Renders a pixel-perfect graphic receipt onto an offscreen canvas at 300 DPI,
 * eliminating browser layout bugs, font mismatches, and theme interference.
 */
export function generateCustomPosInvoiceCanvas(data: CustomInvoiceData): HTMLCanvasElement {
  const config = getPosPaperConfig();
  const targetWidthMm = config.widthMm || 58;
  
  // 300 DPI conversion: 1mm ~ 11.81 pixels
  const scale = 3; // 3x pixel density for crystal clear thermal printing
  const canvasWidthPx = Math.round(targetWidthMm * 3.7795 * scale); // e.g. ~656px for 58mm
  
  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  
  // Estimate height dynamically based on items count
  const baseHeightPx = 320 * scale;
  const itemHeightPx = 45 * scale;
  const estimatedHeightPx = baseHeightPx + data.items.length * itemHeightPx;
  
  canvas.width = canvasWidthPx;
  canvas.height = estimatedHeightPx;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Watermark (faded rotated stamp)
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((-25 * Math.PI) / 180);
  ctx.font = `900 ${22 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.due > 0 ? "PAID BY: CREDIT" : "PAID BY: CASH", 0, 0);
  ctx.restore();

  // Drawing Utilities
  const pad = Math.round(4 * scale);
  const contentWidth = canvas.width - pad * 2;
  let y = pad + 15 * scale;

  function drawText(text: string, x: number, currentY: number, options: {
    font?: string;
    align?: CanvasTextAlign;
    color?: string;
    weight?: string;
    sizePx?: number;
  } = {}) {
    const size = options.sizePx || (11 * scale);
    const weight = options.weight || "normal";
    const font = options.font || "sans-serif";
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ${font}`;
    ctx.fillStyle = options.color || "#000000";
    ctx.textAlign = options.align || "left";
    ctx.fillText(text, x, currentY);
  }

  function drawDashedLine(currentY: number) {
    ctx.beginPath();
    ctx.setLineDash([4 * scale, 3 * scale]);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1 * scale;
    ctx.moveTo(pad, currentY);
    ctx.lineTo(canvas.width - pad, currentY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawSolidLine(currentY: number, width = 1.5) {
    ctx.beginPath();
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = width * scale;
    ctx.moveTo(pad, currentY);
    ctx.lineTo(canvas.width - pad, currentY);
    ctx.stroke();
  }

  // 1. BUSINESS HEADER
  drawText(data.businessName.toUpperCase(), canvas.width / 2, y, {
    align: "center",
    weight: "900",
    sizePx: 16 * scale,
  });
  y += 18 * scale;

  if (data.tagline) {
    drawText(data.tagline, canvas.width / 2, y, {
      align: "center",
      sizePx: 9.5 * scale,
      color: "#374151",
    });
    y += 14 * scale;
  }

  if (data.phone) {
    drawText(`Mobile: ${data.phone}`, canvas.width / 2, y, {
      align: "center",
      sizePx: 9.5 * scale,
      font: "monospace",
      color: "#374151",
    });
    y += 14 * scale;
  }

  drawSolidLine(y, 2);
  y += 12 * scale;

  // 2. INVOICE META
  drawText(data.date, canvas.width - pad, y, { align: "right", font: "monospace", sizePx: 10 * scale });
  y += 14 * scale;

  if (data.customerName) {
    const custText = `CUST: ${data.customerName} ${data.customerPhone ? `(${data.customerPhone})` : ""}`;
    drawText(custText, pad, y, { sizePx: 9.5 * scale, color: "#111827" });
    y += 14 * scale;
  }

  drawDashedLine(y);
  y += 12 * scale;

  // 3. TABLE HEADERS
  drawText("ITEM", pad, y, { weight: "bold", sizePx: 10 * scale });
  drawText("PRICE", canvas.width - pad, y, { align: "right", weight: "bold", sizePx: 10 * scale });
  y += 6 * scale;

  drawSolidLine(y, 1);
  y += 12 * scale;

  // 4. ITEMS LIST
  data.items.forEach((item) => {
    // Truncate long item names
    let name = item.name;
    if (name.length > 28) name = name.substring(0, 26) + "..";

    drawText(name, pad, y, { weight: "bold", sizePx: 10.5 * scale });
    
    const lineTotal = (item.qty * item.price).toLocaleString();
    drawText(`৳${lineTotal}`, canvas.width - pad, y, {
      align: "right",
      weight: "bold",
      font: "monospace",
      sizePx: 10.5 * scale,
    });
    y += 12 * scale;

    drawText(`${item.qty} x ৳${item.price.toLocaleString()}`, pad, y, {
      sizePx: 9 * scale,
      font: "monospace",
      color: "#4b5563",
    });
    y += 16 * scale;

    drawDashedLine(y - 6 * scale);
  });

  y += 4 * scale;

  // 5. SUMMARY SECTION
  drawText("Subtotal:", pad, y, { weight: "bold", sizePx: 10 * scale, color: "#111827" });
  drawText(`৳${data.subtotal.toLocaleString()}`, canvas.width - pad, y, {
    align: "right",
    font: "monospace",
    weight: "bold",
    sizePx: 10 * scale,
  });
  y += 14 * scale;

  if (data.discount > 0) {
    drawText("Discount:", pad, y, { sizePx: 10 * scale, color: "#dc2626" });
    drawText(`-৳${data.discount.toLocaleString()}`, canvas.width - pad, y, {
      align: "right",
      font: "monospace",
      color: "#dc2626",
      sizePx: 10 * scale,
    });
    y += 14 * scale;
  }

  // PAID & DUE
  drawText("Paid Amount:", pad, y, { weight: "bold", sizePx: 10 * scale, color: "#059669" });
  drawText(`৳${data.paid.toLocaleString()}`, canvas.width - pad, y, {
    align: "right",
    font: "monospace",
    weight: "bold",
    sizePx: 10 * scale,
    color: "#059669",
  });
  y += 14 * scale;

  if (data.due > 0) {
    drawText("Due Amount:", pad, y, { weight: "bold", sizePx: 10 * scale, color: "#dc2626" });
    drawText(`৳${data.due.toLocaleString()}`, canvas.width - pad, y, {
      align: "right",
      font: "monospace",
      weight: "bold",
      sizePx: 10 * scale,
      color: "#dc2626",
    });
    y += 14 * scale;
  }

  drawSolidLine(y, 1);
  y += 16 * scale;

  // 6. FOOTER
  drawText("Thank you for your purchase!", canvas.width / 2, y, {
    align: "center",
    weight: "bold",
    sizePx: 9.5 * scale,
  });

  return canvas;
}

/**
 * Custom-made Invoice Printing Pipeline
 * Renders the canvas invoice as an image and triggers pixel-perfect printing
 */
export function printCustomPosInvoice(data: CustomInvoiceData) {
  const canvas = generateCustomPosInvoiceCanvas(data);
  const dataUrl = canvas.toDataURL("image/png");
  const config = getPosPaperConfig();
  const widthMm = config.widthMm || 58;
  const canvasWidthMm = config.canvasWidthMm || 82;
  const marginMm = config.marginMm ?? 1;

  const html = `<!DOCTYPE html>
<html lang="en" style="color-scheme: light !important;">
<head>
  <meta charset="utf-8">
  <title>POS Invoice ${data.invoiceNo}</title>
  <style>
    @page {
      size: ${widthMm}mm auto;
      margin: 0 ${marginMm}mm;
    }
    *, *:before, *:after {
      box-sizing: border-box !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: 100% !important;
      max-width: ${canvasWidthMm}mm !important;
      margin: 0 auto !important;
      padding: 0 !important;
      background: #ffffff !important;
      text-align: center !important;
    }
    img.receipt-img {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" class="receipt-img" alt="POS Invoice" />
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.zIndex = "-9999";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        window.print();
      }
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch (_) {}
      }, 1000);
    }, 250);
  } else {
    window.print();
  }
}

/**
 * Direct POS Invoice PDF Downloader (Zero Web-Preview)
 * Generates and downloads a clean, standalone .pdf file immediately.
 */
export async function downloadCustomInvoicePdf(data: CustomInvoiceData): Promise<void> {
  const canvas = generateCustomPosInvoiceCanvas(data);
  const imgData = canvas.toDataURL("image/png");

  const { default: jsPDF } = await import("jspdf");

  const targetWidthMm = getPosPaperConfig().widthMm || 80;
  const canvasAspect = canvas.height / canvas.width;
  const targetHeightMm = targetWidthMm * canvasAspect;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [targetWidthMm, Math.max(targetHeightMm, 120)],
  });

  pdf.addImage(imgData, "PNG", 0, 0, targetWidthMm, targetHeightMm);
  pdf.save(`Invoice_${data.invoiceNo || Date.now()}.pdf`);
}

