"use client";

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
        marginMm: Number(parsed.marginMm) ?? 1,
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

export function printPwaPosReceipt(data: {
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
  const width = config.widthMm || 58;
  const canvasW = config.canvasWidthMm || 82;
  const heightStr = config.heightMm === "auto" ? "auto" : `${config.heightMm || 40}mm`;
  const margin = config.marginMm ?? 1;

  const itemsRows = data.items
    .map(
      (item, idx) => `
      <tr style="border-bottom: 1px dashed #d1d5db;">
        <td style="padding: 4px 0; text-align: left; vertical-align: top;">
          <div style="font-weight: 700; font-size: 11px; color: #000000; line-height: 1.2;">${idx + 1}. ${item.name}</div>
          <div style="font-size: 9px; color: #4b5563; font-family: monospace;">${item.qty} x ৳${item.price.toLocaleString()}</div>
        </td>
        <td style="padding: 4px 0; text-align: right; vertical-align: top; font-family: monospace; font-weight: 700; font-size: 11px; color: #000000;">
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700;800&family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <title>POS Invoice ${data.invoiceNo}</title>
  <style>
    @page {
      size: ${width}mm ${heightStr};
      margin: 0 ${margin}mm;
    }
    *, *:before, *:after {
      box-sizing: border-box !important;
      margin: 0;
      padding: 0;
      font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-scheme: light !important;
    }
    html, body {
      width: 100% !important;
      max-width: ${canvasW}mm !important;
      margin: 0 auto !important;
      padding: 6px ${margin}mm !important;
      background: #ffffff !important;
      color: #000000 !important;
      font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Kalpurush', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 10px !important;
      line-height: 1.3 !important;
    }
    .divider {
      border-bottom: 1px dashed #000000 !important;
      margin: 6px 0 !important;
      height: 1px !important;
    }
    .solid-divider {
      border-bottom: 1.5px solid #000000 !important;
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
    ${data.tagline ? `<div style="font-size: 9px; color: #374151; margin-top: 1px;">${data.tagline}</div>` : ""}
    ${data.phone ? `<div style="font-size: 9px; color: #374151; font-family: monospace;">Mobile: ${data.phone}</div>` : ""}
  </div>

  <div class="solid-divider"></div>

  <!-- Meta Info Table -->
  <table class="data-table" style="font-size: 9px; color: #111827;">
    <tr>
      <td style="padding: 1px 0; text-align: left;"><strong>Invoice:</strong> #${data.invoiceNo}</td>
      <td style="padding: 1px 0; text-align: right; font-family: monospace;">${data.date}</td>
    </tr>
    ${
      data.customerName
        ? `<tr>
            <td colspan="2" style="padding: 1px 0; text-align: left;"><strong>Customer:</strong> ${data.customerName} ${data.customerPhone ? `(${data.customerPhone})` : ""}</td>
          </tr>`
        : ""
    }
  </table>

  <div class="divider"></div>

  <!-- Items Table -->
  <table class="data-table">
    <thead>
      <tr style="border-bottom: 1.5px solid #000000;">
        <th style="text-align: left; padding-bottom: 3px; font-size: 10px; text-transform: uppercase;">Item Description</th>
        <th style="text-align: right; padding-bottom: 3px; font-size: 10px; text-transform: uppercase;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="divider"></div>

  <!-- Financial Summary Table -->
  <table class="data-table" style="font-size: 10px;">
    <tr>
      <td style="padding: 2px 0; text-align: left; color: #374151;">Subtotal:</td>
      <td style="padding: 2px 0; text-align: right; font-family: monospace; font-weight: 600;">৳${data.subtotal.toLocaleString()}</td>
    </tr>
    ${
      data.discount > 0
        ? `<tr>
            <td style="padding: 2px 0; text-align: left; color: #dc2626;">Discount:</td>
            <td style="padding: 2px 0; text-align: right; font-family: monospace; color: #dc2626;">-৳${data.discount.toLocaleString()}</td>
          </tr>`
        : ""
    }
    <tr style="border-top: 1.5px solid #000000; border-bottom: 1.5px solid #000000;">
      <td style="padding: 4px 0; text-align: left; font-weight: 800; font-size: 12px; text-transform: uppercase;">Total Payable:</td>
      <td style="padding: 4px 0; text-align: right; font-family: monospace; font-weight: 900; font-size: 12px;">৳${data.total.toLocaleString()}</td>
    </tr>
    <tr>
      <td style="padding: 2px 0; text-align: left; color: #059669; font-weight: 600;">Paid Amount:</td>
      <td style="padding: 2px 0; text-align: right; font-family: monospace; color: #059669; font-weight: 700;">৳${data.paid}</td>
    </tr>
    ${
      data.due > 0
        ? `<tr>
            <td style="padding: 2px 0; text-align: left; color: #dc2626; font-weight: 700;">Due Amount:</td>
            <td style="padding: 2px 0; text-align: right; font-family: monospace; color: #dc2626; font-weight: 800;">৳${data.due.toLocaleString()}</td>
          </tr>`
        : ""
    }
  </table>

  <div class="solid-divider"></div>

  <!-- Footer -->
  <div style="text-align: center; margin-top: 6px; font-size: 9px; color: #4b5563;">
    <div style="font-weight: 700; color: #000000;">Thank you for your business!</div>
  </div>
</body>
</html>`;

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
