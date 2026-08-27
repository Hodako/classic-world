import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Expense, Purchase, Sale, Somiti, CashboxEntry } from "@/lib/queries";

export interface ReportPdfData {
  bizName: string;
  bizPhone?: string;
  bizAddress?: string;
  from: string;
  to: string;
  lang: "bn" | "en";
  totalSalesVal: number;
  totalSalesProfitVal: number;
  totalSalesDueVal: number;
  totalSalesItemsCount: number;
  filteredSales: Sale[];
  cashSalesTotal: number;
  cashSalesCount: number;
  bkashSalesTotal: number;
  bkashSalesCount: number;
  creditSalesTotal: number;
  creditSalesCount: number;
  creditSalesDueTotal: number;
  onlineSalesTotal: number;
  onlineSalesCount: number;
  totalPurchaseVal: number;
  totalPurchaseQty: number;
  filteredPurchases: Purchase[];
  totalExpenseVal: number;
  categoryExpenses: { categoryKey: string; label: string; count: number; total: number }[];
  filteredExpenses: Expense[];
  netBusinessProfit: number;
  somitiNetVal: number;
  somitiCount: number;
  somitiDepositTotal?: number;
  somitiWithdrawTotal?: number;
  ownerWalletTotal?: number;
  ownerWalletCount?: number;
  cashboxIn: number;
  cashboxOut: number;
}

const EXPENSE_ENG_MAP: Record<string, string> = {
  rent: "Shop Rent",
  salary: "Staff Salary",
  utility: "Electricity & Utility Bills",
  refreshment: "Tea, Snacks & Food",
  travel: "Travel & Commute",
  transport: "Transport & Shipping",
  purchase: "Product Purchase & Restock",
  marketing: "Marketing & Promotion",
  other: "General & Miscellaneous Expenses",
};

/**
 * 100% Authentic Bengali PDF Generator
 * Renders complete Bengali words, conjuncts, matras, and typography.
 */
export async function generateBanglaReportPdf(data: ReportPdfData, openInNewTab = false): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "794px"; // A4 at 96 DPI
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "'Hind Siliguri', 'Siyam Rupali', sans-serif";
  container.style.padding = "36px 32px";
  container.style.boxSizing = "border-box";
  container.style.zIndex = "-1000";

  container.innerHTML = `
    <div style="font-family: 'Hind Siliguri', 'Siyam Rupali', sans-serif; color: #0f172a; line-height: 1.45;">
      <!-- Top Accent Bar & Header -->
      <div style="border-top: 5px solid #0f172a; padding-top: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${data.bizName || "ড্রিম ফ্যাশন"}</h1>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">
            ${[data.bizAddress, data.bizPhone ? `ফোন: ${data.bizPhone}` : ""].filter(Boolean).join(" | ") || "স্মার্ট পিওএস ও অ্যাকাউন্টিং সিস্টেম"}
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">ব্যবসায়িক প্রতিবেদন ও ক্যাটাগরি রিপোর্ট</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 3px;">সময়কাল: ${data.from} হতে ${data.to}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">প্রস্তুত তারিখ: ${new Date().toLocaleDateString("bn-BD")} (${new Date().toLocaleTimeString("bn-BD")})</div>
        </div>
      </div>

      <!-- 1. Executive Financial Summary -->
      <div style="margin-bottom: 22px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
          ১. সার্বিক অর্থনৈতিক সারসংক্ষেপ
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background-color: #1e293b; color: #ffffff;">
              <th style="padding: 6px 8px; border: 1px solid #1e293b;">আর্থিক বিবরণী খাত</th>
              <th style="padding: 6px 8px; border: 1px solid #1e293b; text-align: center;">রেকর্ড সংখ্যা</th>
              <th style="padding: 6px 8px; border: 1px solid #1e293b; text-align: right;">টাকার পরিমাণ</th>
              <th style="padding: 6px 8px; border: 1px solid #1e293b;">মন্তব্য</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #e2e8f0;">মোট বিক্রয়মূল্য</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.filteredSales.length} টি চালান (${data.totalSalesItemsCount} পিস)</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.totalSalesVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; color: #64748b; border: 1px solid #e2e8f0;">নির্বাচিত সময়ের মোট বিক্রয় টার্নওভার</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;">
              <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #e2e8f0;">বিক্রয় হতে মোট লাভ</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #e2e8f0;">-</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #059669; border: 1px solid #e2e8f0;">৳${data.totalSalesProfitVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; color: #64748b; border: 1px solid #e2e8f0;">বিক্রয়মূল্য বিয়োগ ক্রয়মূল্য</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #e2e8f0;">দোকান পরিচালন খরচ</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.filteredExpenses.length} টি ভাউচার</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #e11d48; border: 1px solid #e2e8f0;">-৳${data.totalExpenseVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; color: #64748b; border: 1px solid #e2e8f0;">${data.categoryExpenses.length} টি ক্যাটাগরিতে ব্যয়</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;">
              <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #e2e8f0;">পণ্য ক্রয় ও স্টক মজুদ</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.filteredPurchases.length} টি চালান (${data.totalPurchaseQty} পিস)</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.totalPurchaseVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; color: #64748b; border: 1px solid #e2e8f0;">দোকানের নতুন মালামাল ক্রয় বাবদ ব্যয়</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 6px 8px; font-weight: 600; border: 1px solid #e2e8f0;">কাস্টমারদের কাছে বকেয়া বাকী</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.creditSalesCount} টি বাকী চালান</td>
              <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: #d97706; border: 1px solid #e2e8f0;">৳${data.totalSalesDueVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; color: #64748b; border: 1px solid #e2e8f0;">এই সময়ের অনাদায় পাওনা</td>
            </tr>
            <tr style="background-color: #f1f5f9; font-weight: 700;">
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; font-size: 11.5px;">প্রকৃত আনুমানিক নিট লাভ</td>
              <td style="padding: 7px 8px; text-align: center; border: 1px solid #cbd5e1;">-</td>
              <td style="padding: 7px 8px; text-align: right; border: 1px solid #cbd5e1; font-size: 12px; color: ${data.netBusinessProfit >= 0 ? "#059669" : "#e11d48"};">৳${data.netBusinessProfit.toLocaleString()}</td>
              <td style="padding: 7px 8px; border: 1px solid #cbd5e1; color: #475569;">মোট লাভ বিয়োগ দোকান খরচ</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 2. Expenses Category Breakdown -->
      <div style="margin-bottom: 22px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
          ২. ক্যাটাগরি ভিত্তিক খরচের বিবরণী
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background-color: #be123c; color: #ffffff;">
              <th style="padding: 6px 8px; border: 1px solid #be123c; width: 40px; text-align: center;">#</th>
              <th style="padding: 6px 8px; border: 1px solid #be123c;">খরচের ক্যাটাগরি</th>
              <th style="padding: 6px 8px; border: 1px solid #be123c; text-align: center;">ভাউচার সংখ্যা</th>
              <th style="padding: 6px 8px; border: 1px solid #be123c; text-align: right;">মোট ব্যয় (৳)</th>
              <th style="padding: 6px 8px; border: 1px solid #be123c; text-align: right;">শতকরা হার (%)</th>
            </tr>
          </thead>
          <tbody>
            ${data.categoryExpenses.length > 0 ? data.categoryExpenses.map((cat, idx) => {
              const share = data.totalExpenseVal > 0 ? ((cat.total / data.totalExpenseVal) * 100).toFixed(1) + "%" : "0%";
              return `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? "background-color: #fff1f2;" : ""}">
                  <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${idx + 1}</td>
                  <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">${cat.label}</td>
                  <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${cat.count} টি</td>
                  <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${cat.total.toLocaleString()}</td>
                  <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">${share}</td>
                </tr>
              `;
            }).join("") : `
              <tr><td colspan="5" style="padding: 8px; text-align: center; color: #64748b; border: 1px solid #e2e8f0;">এই সময়ে কোনো খরচের রেকর্ড পাওয়া যায়নি</td></tr>
            `}
            <tr style="background-color: #ffe4e6; font-weight: 700;">
              <td colspan="2" style="padding: 6px 8px; border: 1px solid #fecdd3;">সর্বমোট পরিচালন খরচ</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #fecdd3;">${data.filteredExpenses.length} টি</td>
              <td style="padding: 6px 8px; text-align: right; border: 1px solid #fecdd3;">৳${data.totalExpenseVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; text-align: right; border: 1px solid #fecdd3;">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 3. Sales by Payment Type -->
      <div style="margin-bottom: 22px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
          ৩. পেমেন্ট মাধ্যম অনুযায়ী বিক্রয় বিবরণী
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background-color: #0369a1; color: #ffffff;">
              <th style="padding: 6px 8px; border: 1px solid #0369a1;">পেমেন্ট মাধ্যম</th>
              <th style="padding: 6px 8px; border: 1px solid #0369a1; text-align: center;">অর্ডার সংখ্যা</th>
              <th style="padding: 6px 8px; border: 1px solid #0369a1; text-align: right;">মোট বিক্রয় (৳)</th>
              <th style="padding: 6px 8px; border: 1px solid #0369a1; text-align: right;">আদায় (৳)</th>
              <th style="padding: 6px 8px; border: 1px solid #0369a1; text-align: right;">বকেয়া বাকী (৳)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">নগদ বিক্রয় (Cash)</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.cashSalesCount} টি</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.cashSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳${data.cashSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳0</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">বিকাশ বিক্রয় (bKash)</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.bkashSalesCount} টি</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.bkashSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳${data.bkashSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳0</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">বাকী বিক্রয় (Credit)</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.creditSalesCount} টি</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.creditSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳${(data.creditSalesTotal - data.creditSalesDueTotal).toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #e11d48; border: 1px solid #e2e8f0;">৳${data.creditSalesDueTotal.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">অনলাইন / ব্যাংক বিক্রয়</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${data.onlineSalesCount} টি</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${data.onlineSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳${data.onlineSalesTotal.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; border: 1px solid #e2e8f0;">৳0</td>
            </tr>
            <tr style="background-color: #e0f2fe; font-weight: 700;">
              <td style="padding: 6px 8px; border: 1px solid #bae6fd;">সর্বমোট বিক্রয় সারসংক্ষেপ</td>
              <td style="padding: 6px 8px; text-align: center; border: 1px solid #bae6fd;">${data.filteredSales.length} টি</td>
              <td style="padding: 6px 8px; text-align: right; border: 1px solid #bae6fd;">৳${data.totalSalesVal.toLocaleString()}</td>
              <td style="padding: 6px 8px; text-align: right; border: 1px solid #bae6fd;">৳${(data.totalSalesVal - data.totalSalesDueVal).toLocaleString()}</td>
              <td style="padding: 6px 8px; text-align: right; color: #e11d48; border: 1px solid #bae6fd;">৳${data.totalSalesDueVal.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 4. Purchases List -->
      ${data.filteredPurchases.length > 0 ? `
        <div style="margin-bottom: 22px;">
          <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
            ৪. পণ্য ক্রয় ও ইনভেন্টরি তালিকা
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
            <thead>
              <tr style="background-color: #4338ca; color: #ffffff;">
                <th style="padding: 5px 7px; border: 1px solid #4338ca;">তারিখ</th>
                <th style="padding: 5px 7px; border: 1px solid #4338ca;">পণ্যের নাম</th>
                <th style="padding: 5px 7px; border: 1px solid #4338ca; text-align: center;">পরিমাণ</th>
                <th style="padding: 5px 7px; border: 1px solid #4338ca; text-align: right;">একক মূল্য (৳)</th>
                <th style="padding: 5px 7px; border: 1px solid #4338ca; text-align: right;">মোট টাকা (৳)</th>
                <th style="padding: 5px 7px; border: 1px solid #4338ca;">সরবরাহকারী / নোট</th>
              </tr>
            </thead>
            <tbody>
              ${data.filteredPurchases.slice(0, 50).map((p, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? "background-color: #f8fafc;" : ""}">
                  <td style="padding: 4px 7px; border: 1px solid #e2e8f0;">${p.created_at.slice(0, 10)}</td>
                  <td style="padding: 4px 7px; font-weight: 600; border: 1px solid #e2e8f0;">${p.product_name}</td>
                  <td style="padding: 4px 7px; text-align: center; border: 1px solid #e2e8f0;">${p.qty} টি</td>
                  <td style="padding: 4px 7px; text-align: right; border: 1px solid #e2e8f0;">৳${Number(p.unit_cost).toLocaleString()}</td>
                  <td style="padding: 4px 7px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${Number(p.total).toLocaleString()}</td>
                  <td style="padding: 4px 7px; color: #64748b; border: 1px solid #e2e8f0;">${p.note || "-"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}

      <!-- 5. Credit Dues List -->
      ${data.creditSalesCount > 0 ? `
        <div style="margin-bottom: 22px;">
          <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
            ৫. বাকী বিক্রয় ও কাস্টমার দেনা বিবরণী
          </h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
            <thead>
              <tr style="background-color: #b45309; color: #ffffff;">
                <th style="padding: 5px 7px; border: 1px solid #b45309;">তারিখ</th>
                <th style="padding: 5px 7px; border: 1px solid #b45309;">কাস্টমারের নাম</th>
                <th style="padding: 5px 7px; border: 1px solid #b45309;">পণ্যের বিবরণ</th>
                <th style="padding: 5px 7px; border: 1px solid #b45309; text-align: right;">মোট মূল্য (৳)</th>
                <th style="padding: 5px 7px; border: 1px solid #b45309; text-align: right;">বকেয়া পরিমাণ (৳)</th>
              </tr>
            </thead>
            <tbody>
              ${data.filteredSales.filter(s => s.type === "credit").slice(0, 50).map((s, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? "background-color: #fefce8;" : ""}">
                  <td style="padding: 4px 7px; border: 1px solid #e2e8f0;">${s.created_at.slice(0, 10)}</td>
                  <td style="padding: 4px 7px; font-weight: 600; border: 1px solid #e2e8f0;">${s.parties?.name || "সাধারণ কাস্টমার"}</td>
                  <td style="padding: 4px 7px; border: 1px solid #e2e8f0;">${s.product_name} (${s.qty} টি)</td>
                  <td style="padding: 4px 7px; text-align: right; border: 1px solid #e2e8f0;">৳${(Number(s.sell_price) * s.qty).toLocaleString()}</td>
                  <td style="padding: 4px 7px; text-align: right; font-weight: 700; color: #e11d48; border: 1px solid #e2e8f0;">৳${Number(s.due_amount || 0).toLocaleString()}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : ""}

      <!-- 6. Cashbox, Somiti & Owners Wallet Money Flow -->
      <div style="margin-bottom: 28px;">
        <h2 style="font-size: 13px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px;">
          ৬. ক্যাশবাক্স, সমিতি ও মালিকের ওয়ালেট অর্থপ্রবাহ (Money Flow)
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
          <thead>
            <tr style="background-color: #0f766e; color: #ffffff;">
              <th style="padding: 6px 8px; border: 1px solid #0f766e;">ফান্ড / অর্থপ্রবাহ খাত</th>
              <th style="padding: 6px 8px; border: 1px solid #0f766e;">জমা / ক্যাশ ইন</th>
              <th style="padding: 6px 8px; border: 1px solid #0f766e;">খরচ / উত্তোলন</th>
              <th style="padding: 6px 8px; border: 1px solid #0f766e; text-align: right;">নিট স্থিতি / প্রভাব (৳)</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">ক্যাশব্যাক্স লেনদেন (Cashbox)</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">জমা: ৳${data.cashboxIn.toLocaleString()}</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">খরচ: -৳${data.cashboxOut.toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0;">৳${(data.cashboxIn - data.cashboxOut).toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0; background-color: #f8fafc;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">সমিতি ফান্ড (Samity Savings & DPS)</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">জমা: ৳${(data.somitiDepositTotal || 0).toLocaleString()}</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">উত্তোলন: -৳${(data.somitiWithdrawTotal || 0).toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #059669; border: 1px solid #e2e8f0;">৳${data.somitiNetVal.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">মালিকের ওয়ালেট (Owner Personal Wallet)</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">${data.ownerWalletCount || 0} টি এন্ট্রি</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">ব্যক্তিগত উত্তোলন: -৳${(data.ownerWalletTotal || 0).toLocaleString()}</td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; color: #e11d48; border: 1px solid #e2e8f0;">-৳${(data.ownerWalletTotal || 0).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Signatures -->
      <div style="margin-top: 36px; padding-top: 14px; display: flex; justify-content: space-between; text-align: center; font-size: 11px; color: #475569;">
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          প্রস্তুতকারক (হিসাবরক্ষক)
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          যাচাইকারী (ব্যবস্থাপক)
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          অনুমোদনকারী (স্বত্বাধিকারী)
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = `Business_Report_${data.from}_to_${data.to}_Bangla.pdf`;
    if (openInNewTab) {
      const blobUrl = pdf.output("bloburl");
      window.open(blobUrl, "_blank");
    } else {
      pdf.save(filename);
    }
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Standard English Vector PDF Generator
 */
export function generateEnglishReportPdf(data: ReportPdfData, openInNewTab = false): jsPDF {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const fmtCurrency = (num: number) => {
    return "Tk " + Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  let currentY = 15;

  // ── Header Section ──────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text((data.bizName || "Classic World").toUpperCase(), 14, currentY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const contactText = [data.bizAddress, data.bizPhone ? `Phone: ${data.bizPhone}` : ""].filter(Boolean).join(" | ");
  doc.text(contactText || "POS & Accounting System", 14, currentY + 9);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text("OFFICIAL BUSINESS REPORT", pageWidth - 14, currentY + 3, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Period: ${data.from} to ${data.to}`, pageWidth - 14, currentY + 8, { align: "right" });
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, currentY + 12, { align: "right" });

  currentY += 17;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(14, currentY, pageWidth - 14, currentY);

  currentY += 6;

  // ── 1. Executive Financial Summary ───────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("1. EXECUTIVE FINANCIAL SUMMARY", 14, currentY);
  currentY += 2;

  const summaryBody = [
    ["Total Sales Revenue", `${data.filteredSales.length} orders (${data.totalSalesItemsCount} items)`, fmtCurrency(data.totalSalesVal), "Total sales turnover"],
    ["Gross Profit from Sales", "-", fmtCurrency(data.totalSalesProfitVal), "Selling price - Cost price"],
    ["Overhead Operating Expenses", `${data.filteredExpenses.length} vouchers`, `-${fmtCurrency(data.totalExpenseVal)}`, `${data.categoryExpenses.length} categories`],
    ["Product Purchases / Restock", `${data.filteredPurchases.length} invoices`, fmtCurrency(data.totalPurchaseVal), `${data.totalPurchaseQty} inventory units`],
    ["Credit Sales Dues (Receivable)", `${data.creditSalesCount} credit orders`, fmtCurrency(data.totalSalesDueVal), "Period customer receivables"],
    ["Net Estimated Business Profit", "-", fmtCurrency(data.netBusinessProfit), "Gross profit - Overhead expenses"],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["Financial Metric", "Record Count", "Amount (BDT)", "Remarks"]],
    body: summaryBody,
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
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { halign: "center", cellWidth: 35 },
      2: { halign: "right", fontStyle: "bold", cellWidth: 35 },
      3: { cellWidth: "auto", textColor: [100, 116, 139] },
    },
    didParseCell: function (cellData) {
      if (cellData.row.index === 5 && cellData.section === "body") {
        cellData.cell.styles.fillColor = [241, 245, 249];
        cellData.cell.styles.fontStyle = "bold";
      }
    },
  });

  // @ts-ignore
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── 2. Expenses Breakdown by Category ────────────────────────────────────────
  if (currentY > pageHeight - 60) {
    doc.addPage();
    currentY = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("2. OVERHEAD EXPENSES BREAKDOWN BY CATEGORY", 14, currentY);
  currentY += 2;

  const categoryBody = data.categoryExpenses.map((cat, idx) => {
    const share = data.totalExpenseVal > 0 ? ((cat.total / data.totalExpenseVal) * 100).toFixed(1) + "%" : "0%";
    const label = EXPENSE_ENG_MAP[cat.categoryKey] || cat.label || "Expense Category";
    return [String(idx + 1), label, `${cat.count} vouchers`, fmtCurrency(cat.total), share];
  });

  categoryBody.push([
    "",
    "TOTAL OVERHEAD EXPENSES",
    `${data.filteredExpenses.length} vouchers`,
    fmtCurrency(data.totalExpenseVal),
    "100%",
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["#", "Expense Category", "Vouchers", "Amount (BDT)", "Share (%)"]],
    body: categoryBody.length > 1 ? categoryBody : [["-", "No expense records in this period", "-", fmtCurrency(0), "0%"]],
    theme: "grid",
    headStyles: {
      fillColor: [225, 29, 72],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
      lineWidth: 0.35,
      lineColor: [190, 18, 60],
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
      1: { fontStyle: "bold", cellWidth: 65 },
      2: { halign: "center", cellWidth: 30 },
      3: { halign: "right", fontStyle: "bold", cellWidth: 40 },
      4: { halign: "right", cellWidth: "auto" },
    },
    didParseCell: function (cellData) {
      if (cellData.row.index === categoryBody.length - 1 && cellData.section === "body" && categoryBody.length > 1) {
        cellData.cell.styles.fillColor = [255, 241, 242];
        cellData.cell.styles.fontStyle = "bold";
      }
    },
  });

  // @ts-ignore
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── 3. Sales by Payment Type ────────────────────────────────────────────────
  if (currentY > pageHeight - 55) {
    doc.addPage();
    currentY = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("3. SALES STATEMENT BY PAYMENT METHOD", 14, currentY);
  currentY += 2;

  const salesTypeBody = [
    ["Cash Sales (Cash)", `${data.cashSalesCount} orders`, fmtCurrency(data.cashSalesTotal), fmtCurrency(data.cashSalesTotal), fmtCurrency(0)],
    ["bKash Sales (bKash)", `${data.bkashSalesCount} orders`, fmtCurrency(data.bkashSalesTotal), fmtCurrency(data.bkashSalesTotal), fmtCurrency(0)],
    ["Credit Sales (Due / Receivable)", `${data.creditSalesCount} orders`, fmtCurrency(data.creditSalesTotal), fmtCurrency(data.creditSalesTotal - data.creditSalesDueTotal), fmtCurrency(data.creditSalesDueTotal)],
    ["Online Sales (Bank / Card)", `${data.onlineSalesCount} orders`, fmtCurrency(data.onlineSalesTotal), fmtCurrency(data.onlineSalesTotal), fmtCurrency(0)],
    ["TOTAL SALES SUMMARY", `${data.filteredSales.length} orders`, fmtCurrency(data.totalSalesVal), fmtCurrency(data.totalSalesVal - data.totalSalesDueVal), fmtCurrency(data.totalSalesDueVal)],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["Payment Method", "Orders", "Total Sold (BDT)", "Collected (BDT)", "Due Amount (BDT)"]],
    body: salesTypeBody,
    theme: "grid",
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
      lineWidth: 0.35,
      lineColor: [3, 105, 161],
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { halign: "center", cellWidth: 30 },
      2: { halign: "right", fontStyle: "bold", cellWidth: 35 },
      3: { halign: "right", cellWidth: 35 },
      4: { halign: "right", fontStyle: "bold", cellWidth: "auto" },
    },
    didParseCell: function (cellData) {
      if (cellData.row.index === 4 && cellData.section === "body") {
        cellData.cell.styles.fillColor = [240, 249, 255];
        cellData.cell.styles.fontStyle = "bold";
      }
    },
  });

  // @ts-ignore
  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── 4. Itemized Product Purchases Restock ────────────────────────────────────
  if (data.filteredPurchases.length > 0) {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("4. PRODUCT PURCHASES / RESTOCK LIST", 14, currentY);
    currentY += 2;

    const purchaseRows = data.filteredPurchases.slice(0, 100).map(p => [
      p.created_at.slice(0, 10),
      p.product_name,
      `${p.qty} pcs`,
      fmtCurrency(p.unit_cost),
      fmtCurrency(p.total),
      p.note || "-",
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head: [["Date", "Product Name", "Qty", "Unit Cost (BDT)", "Total (BDT)", "Supplier / Note"]],
      body: purchaseRows,
      theme: "grid",
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 2,
        lineWidth: 0.35,
        lineColor: [67, 56, 202],
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.35,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { fontStyle: "bold", cellWidth: 55 },
        2: { halign: "center", cellWidth: 18 },
        3: { halign: "right", cellWidth: 28 },
        4: { halign: "right", fontStyle: "bold", cellWidth: 28 },
        5: { cellWidth: "auto", textColor: [100, 116, 139] },
      },
    });

    // @ts-ignore
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 5. Customer Credit Sales / Dues ──────────────────────────────────────────
  const creditSalesItems = data.filteredSales.filter(s => s.type === "credit");
  if (creditSalesItems.length > 0) {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = 18;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("5. CREDIT SALES / RECEIVABLES STATEMENT", 14, currentY);
    currentY += 2;

    const duesRows = creditSalesItems.slice(0, 100).map(s => [
      s.created_at.slice(0, 10),
      s.parties?.name || "Walk-in Customer",
      `${s.product_name} (x${s.qty})`,
      fmtCurrency(Number(s.sell_price) * s.qty),
      fmtCurrency(s.due_amount || 0),
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: 14, right: 14 },
      head: [["Date", "Customer Name", "Item Details", "Total Value", "Due Amount (BDT)"]],
      body: duesRows,
      theme: "grid",
      headStyles: {
        fillColor: [217, 119, 6],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: 2,
        lineWidth: 0.35,
        lineColor: [180, 83, 9],
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.35,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { fontStyle: "bold", cellWidth: 50 },
        2: { cellWidth: 55 },
        3: { halign: "right", cellWidth: 28 },
        4: { halign: "right", fontStyle: "bold", cellWidth: "auto", textColor: [225, 29, 72] },
      },
    });

    // @ts-ignore
    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── 6. Cashbox, Somiti & Owners Wallet Money Flow ──────────────────────────
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("6. CASHBOX, SOMITI & OWNER'S WALLET MONEY FLOW", 14, currentY);
  currentY += 2;

  const fundBody = [
    ["Cashbox Flow (Cash In / Out)", `In: ${fmtCurrency(data.cashboxIn)}`, `Out: -${fmtCurrency(data.cashboxOut)}`, `Net Movement: ${fmtCurrency(data.cashboxIn - data.cashboxOut)}`],
    ["Somiti Fund (Savings Reserve)", `Deposited: ${fmtCurrency(data.somitiDepositTotal || 0)}`, `Withdrawn: -${fmtCurrency(data.somitiWithdrawTotal || 0)}`, `Net Savings: ${fmtCurrency(data.somitiNetVal)}`],
    ["Owner's Wallet (Personal)", `${data.ownerWalletCount || 0} entries`, `Withdrawn: -${fmtCurrency(data.ownerWalletTotal || 0)}`, `Cash Impact: -${fmtCurrency(data.ownerWalletTotal || 0)}`],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["Fund Account", "Inflow / Deposit", "Outflow / Withdrawal", "Net Balance (BDT)"]],
    body: fundBody,
    theme: "grid",
    headStyles: {
      fillColor: [13, 148, 136],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      cellPadding: 2.5,
      lineWidth: 0.35,
      lineColor: [15, 118, 110],
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.35,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 55 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40 },
      3: { halign: "right", fontStyle: "bold", cellWidth: "auto" },
    },
  });

  // @ts-ignore
  currentY = (doc as any).lastAutoTable.finalY + 14;

  // ── Signatures & Footer ─────────────────────────────────────────────────────
  if (currentY > pageHeight - 35) {
    doc.addPage();
    currentY = pageHeight - 35;
  } else {
    currentY = Math.max(currentY, pageHeight - 35);
  }

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);

  const sigY = currentY + 10;
  const col1 = 20;
  const col2 = pageWidth / 2;
  const col3 = pageWidth - 20;

  doc.line(col1 - 10, sigY, col1 + 35, sigY);
  doc.line(col2 - 25, sigY, col2 + 25, sigY);
  doc.line(col3 - 35, sigY, col3 + 10, sigY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Prepared By (Accountant)", col1 + 12, sigY + 4, { align: "center" });
  doc.text("Verified By (Manager)", col2, sigY + 4, { align: "center" });
  doc.text("Authorized Signature", col3 - 12, sigY + 4, { align: "center" });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Official Business Statement | ${data.bizName || "Classic World"} | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 5,
      { align: "center" }
    );
  }

  const filename = `Business_Report_${data.from}_to_${data.to}_English.pdf`;
  if (openInNewTab) {
    const blobUrl = doc.output("bloburl");
    window.open(blobUrl, "_blank");
  } else {
    doc.save(filename);
  }
  return doc;
}

/**
 * Universal Business Report PDF Dispatcher
 */
export async function generateBusinessReportPdf(data: ReportPdfData, openInNewTab = false, targetLang: "bn" | "en" = data.lang): Promise<void> {
  if (targetLang === "bn") {
    await generateBanglaReportPdf(data, openInNewTab);
  } else {
    generateEnglishReportPdf(data, openInNewTab);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Party / Supplier Statement PDF Generator
// ─────────────────────────────────────────────────────────────────────────────
export interface PartyStatementData {
  bizName: string;
  bizPhone?: string;
  bizAddress?: string;
  partyName: string;
  partyPhone?: string;
  partyAddress?: string;
  lang: "bn" | "en";
  payableTotal: number;
  settledTotal: number;
  payableOutstanding: number;
  entries: {
    date: string;
    label: string;
    kind: string;
    amount: number;
    runningBalance?: number;
  }[];
}

export async function generatePartyStatementPdf(data: PartyStatementData, openInNewTab = false): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "794px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "'Hind Siliguri', 'Siyam Rupali', sans-serif";
  container.style.padding = "36px 32px";
  container.style.boxSizing = "border-box";
  container.style.zIndex = "-1000";

  const isBn = data.lang === "bn";

  container.innerHTML = `
    <div style="font-family: 'Hind Siliguri', 'Siyam Rupali', sans-serif; color: #0f172a; line-height: 1.45;">
      <div style="border-top: 5px solid #0284c7; padding-top: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">${data.bizName || "Classic World"}</h1>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">
            ${[data.bizAddress, data.bizPhone ? `ফোন: ${data.bizPhone}` : ""].filter(Boolean).join(" | ")}
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 700; color: #0284c7;">
            ${isBn ? "সাপ্লায়ার / মহাজন লেজার স্টেটমেন্ট" : "Supplier & Vendor Ledger Statement"}
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
            ${isBn ? "প্রস্তুত তারিখ:" : "Date:"} ${new Date().toLocaleDateString(isBn ? "bn-BD" : "en-US")}
          </div>
        </div>
      </div>

      <!-- Party Profile Box -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; font-size: 11.5px;">
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${data.partyName}</div>
          <div style="color: #64748b; margin-top: 2px;">${[data.partyPhone ? (isBn ? `ফোন: ${data.partyPhone}` : `Phone: ${data.partyPhone}`) : "", data.partyAddress].filter(Boolean).join(" · ") || (isBn ? "ঠিকানা দেওয়া নেই" : "No address specified")}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase;">${isBn ? "বর্তমান বকেয়া পাওনা" : "Net Payable Outstanding"}</div>
          <div style="font-size: 16px; font-weight: 800; color: #e11d48;">৳${data.payableOutstanding.toLocaleString()}</div>
        </div>
      </div>

      <!-- KPI 3 Summary Badges -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background-color: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 600;">${isBn ? "মোট মালামাল ক্রয় / পাওনা" : "Total Purchases / Payable"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">৳${data.payableTotal.toLocaleString()}</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background-color: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 600;">${isBn ? "মোট পরিশোধ / পরিশোধিত" : "Total Paid / Settled"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #059669; margin-top: 2px;">৳${data.settledTotal.toLocaleString()}</div>
        </div>
        <div style="border: 1px solid #fecdd3; border-radius: 6px; padding: 8px 10px; background-color: #fff1f2;">
          <div style="font-size: 10px; color: #9f1239; font-weight: 600;">${isBn ? "বকেয়া পাওনা স্থিতি" : "Balance Due"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #e11d48; margin-top: 2px;">৳${data.payableOutstanding.toLocaleString()}</div>
        </div>
      </div>

      <!-- Ledger Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #0f172a; color: #ffffff;">
            <th style="padding: 6px 8px; border: 1px solid #0f172a; width: 35px; text-align: center;">#</th>
            <th style="padding: 6px 8px; border: 1px solid #0f172a; width: 85px;">${isBn ? "তারিখ" : "Date"}</th>
            <th style="padding: 6px 8px; border: 1px solid #0f172a;">${isBn ? "লেনদেনের বিবরণ" : "Description"}</th>
            <th style="padding: 6px 8px; border: 1px solid #0f172a; text-align: center; width: 80px;">${isBn ? "ধরন" : "Type"}</th>
            <th style="padding: 6px 8px; border: 1px solid #0f172a; text-align: right; width: 95px;">${isBn ? "টাকার পরিমাণ" : "Amount (BDT)"}</th>
          </tr>
        </thead>
        <tbody>
          ${data.entries.length > 0 ? data.entries.map((e, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? "background-color: #f8fafc;" : ""}">
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${idx + 1}</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">${e.date.slice(0, 10)}</td>
              <td style="padding: 5px 8px; font-weight: 600; border: 1px solid #e2e8f0;">${e.label}</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0; font-size: 10px;">
                <span style="padding: 2px 6px; border-radius: 4px; ${e.kind === "payable" || e.kind === "receivable" ? "background-color: #fee2e2; color: #991b1b;" : "background-color: #dcfce7; color: #166534;"}">
                  ${e.kind === "payable" ? (isBn ? "পাওনা যোগ" : "Payable Added") : e.kind === "settlement" ? (isBn ? "টাকা পরিশোধ" : "Settlement") : e.kind}
                </span>
              </td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0; color: ${e.kind === "settlement" || e.kind === "payment" ? "#059669" : "#e11d48"};">
                ${e.kind === "settlement" || e.kind === "payment" ? "−" : "+"}৳${e.amount.toLocaleString()}
              </td>
            </tr>
          `).join("") : `
            <tr><td colspan="5" style="padding: 10px; text-align: center; color: #64748b; border: 1px solid #e2e8f0;">${isBn ? "কোনো লেনদেনের রেকর্ড পাওয়া যায়নি" : "No transaction records found"}</td></tr>
          `}
        </tbody>
      </table>

      <!-- Signatures -->
      <div style="margin-top: 36px; padding-top: 14px; display: flex; justify-content: space-between; text-align: center; font-size: 11px; color: #475569;">
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "হিসাবরক্ষকের স্বাক্ষর" : "Accountant Signature"}
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "পার্টি / সাপ্লায়ারের স্বাক্ষর" : "Party / Supplier Signature"}
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "স্বত্বাধিকারীর অনুমোদন" : "Proprietor Signature"}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = `Party_Statement_${data.partyName.replace(/\s+/g, "_")}.pdf`;
    if (openInNewTab) {
      const blobUrl = pdf.output("bloburl");
      window.open(blobUrl, "_blank");
    } else {
      pdf.save(filename);
    }
  } finally {
    document.body.removeChild(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Samity Bank-Statement Style PDF Generator
// ─────────────────────────────────────────────────────────────────────────────
export interface SamityStatementData {
  bizName: string;
  bizPhone?: string;
  bizAddress?: string;
  samityName: string;
  samityPhone?: string;
  samityAccountNo?: string;
  openingDate?: string;
  lang: "bn" | "en";
  totalDeposited: number;
  totalWithdrawn: number;
  netBalance: number;
  entries: {
    date: string;
    kind: "deposit" | "withdraw";
    amount: number;
    runningBalance: number;
    note?: string;
  }[];
}

export async function generateSamityStatementPdf(data: SamityStatementData, openInNewTab = false): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "794px";
  container.style.backgroundColor = "#ffffff";
  container.style.color = "#0f172a";
  container.style.fontFamily = "'Hind Siliguri', 'Siyam Rupali', sans-serif";
  container.style.padding = "36px 32px";
  container.style.boxSizing = "border-box";
  container.style.zIndex = "-1000";

  const isBn = data.lang === "bn";

  container.innerHTML = `
    <div style="font-family: 'Hind Siliguri', 'Siyam Rupali', sans-serif; color: #0f172a; line-height: 1.45;">
      <div style="border-top: 5px solid #0d9488; padding-top: 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">${data.bizName || "Classic World"}</h1>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">
            ${[data.bizAddress, data.bizPhone ? `ফোন: ${data.bizPhone}` : ""].filter(Boolean).join(" | ")}
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 700; color: #0d9488;">
            ${isBn ? "সমিতি সঞ্চয় ও ডিপিএস ব্যাংক স্টেটমেন্ট" : "Samity Savings Account Bank Statement"}
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">
            ${isBn ? "প্রস্তুত তারিখ:" : "Date:"} ${new Date().toLocaleDateString(isBn ? "bn-BD" : "en-US")}
          </div>
        </div>
      </div>

      <!-- Account Info Header -->
      <div style="background-color: #f0fdfa; border: 1px solid #ccfbf1; border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; font-size: 11.5px;">
        <div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${isBn ? "হিসাবের নাম:" : "Account:"} ${data.samityName}</div>
          <div style="color: #0f766e; margin-top: 2px;">
            ${[data.samityAccountNo ? (isBn ? `হিসাব নং: ${data.samityAccountNo}` : `Acc No: ${data.samityAccountNo}`) : "", data.samityPhone ? (isBn ? `ফোন: ${data.samityPhone}` : `Phone: ${data.samityPhone}`) : ""].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #0f766e; font-weight: 600; text-transform: uppercase;">${isBn ? "বর্তমান সঞ্চয় স্থিতি (ব্যালেন্স)" : "Current Net Balance"}</div>
          <div style="font-size: 17px; font-weight: 800; color: #0d9488;">৳${data.netBalance.toLocaleString()}</div>
        </div>
      </div>

      <!-- Summary KPI 3 Badges -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px;">
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background-color: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 600;">${isBn ? "সর্বমোট সঞ্চয় জমা" : "Total Deposited"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #059669; margin-top: 2px;">+৳${data.totalDeposited.toLocaleString()}</div>
        </div>
        <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background-color: #ffffff;">
          <div style="font-size: 10px; color: #64748b; font-weight: 600;">${isBn ? "সর্বমোট উত্তোলন" : "Total Withdrawn"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #e11d48; margin-top: 2px;">−৳${data.totalWithdrawn.toLocaleString()}</div>
        </div>
        <div style="border: 1px solid #99f6e4; border-radius: 6px; padding: 8px 10px; background-color: #ccfbf1;">
          <div style="font-size: 10px; color: #115e59; font-weight: 600;">${isBn ? "বর্তমান সঞ্চয় স্থিতি" : "Net Balance"}</div>
          <div style="font-size: 14px; font-weight: 700; color: #0f766e; margin-top: 2px;">৳${data.netBalance.toLocaleString()}</div>
        </div>
      </div>

      <!-- Bank Statement Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #115e59; color: #ffffff;">
            <th style="padding: 6px 8px; border: 1px solid #115e59; width: 35px; text-align: center;">#</th>
            <th style="padding: 6px 8px; border: 1px solid #115e59; width: 85px;">${isBn ? "তারিখ" : "Date"}</th>
            <th style="padding: 6px 8px; border: 1px solid #115e59; text-align: center; width: 80px;">${isBn ? "লেনদেন ধরন" : "Type"}</th>
            <th style="padding: 6px 8px; border: 1px solid #115e59; text-align: right; width: 100px;">${isBn ? "জমা / উত্তোলন (৳)" : "Amount (BDT)"}</th>
            <th style="padding: 6px 8px; border: 1px solid #115e59; text-align: right; width: 110px;">${isBn ? "চলতি ব্যালেন্স (৳)" : "Running Balance"}</th>
            <th style="padding: 6px 8px; border: 1px solid #115e59;">${isBn ? "রেফারেন্স / নোট" : "Reference / Note"}</th>
          </tr>
        </thead>
        <tbody>
          ${data.entries.length > 0 ? data.entries.map((e, idx) => `
            <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? "background-color: #f8fafc;" : ""}">
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0;">${idx + 1}</td>
              <td style="padding: 5px 8px; border: 1px solid #e2e8f0;">${e.date.slice(0, 10)}</td>
              <td style="padding: 5px 8px; text-align: center; border: 1px solid #e2e8f0; font-size: 10px;">
                <span style="padding: 2px 6px; border-radius: 4px; ${e.kind === "deposit" ? "background-color: #dcfce7; color: #166534;" : "background-color: #fee2e2; color: #991b1b;"}">
                  ${e.kind === "deposit" ? (isBn ? "জমা (Deposit)" : "Deposit") : (isBn ? "উত্তোলন (Withdraw)" : "Withdraw")}
                </span>
              </td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0; color: ${e.kind === "deposit" ? "#059669" : "#e11d48"};">
                ${e.kind === "deposit" ? "+" : "−"}৳${e.amount.toLocaleString()}
              </td>
              <td style="padding: 5px 8px; text-align: right; font-weight: 700; border: 1px solid #e2e8f0; color: #0f766e;">
                ৳${e.runningBalance.toLocaleString()}
              </td>
              <td style="padding: 5px 8px; color: #64748b; border: 1px solid #e2e8f0;">${e.note || "—"}</td>
            </tr>
          `).join("") : `
            <tr><td colspan="6" style="padding: 10px; text-align: center; color: #64748b; border: 1px solid #e2e8f0;">${isBn ? "কোনো লেনদেনের রেকর্ড নেই" : "No transaction records found"}</td></tr>
          `}
        </tbody>
      </table>

      <!-- Signatures -->
      <div style="margin-top: 36px; padding-top: 14px; display: flex; justify-content: space-between; text-align: center; font-size: 11px; color: #475569;">
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "হিসাব পরিচালকের স্বাক্ষর" : "Officer Signature"}
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "যাচাইকারী কর্মকর্তার স্বাক্ষর" : "Verified By"}
        </div>
        <div style="width: 170px; border-top: 1.5px solid #94a3b8; padding-top: 6px; font-weight: 600;">
          ${isBn ? "কর্তৃপক্ষের অনুমোদন ও সিল" : "Authority Stamp & Sign"}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = `Samity_Statement_${data.samityName.replace(/\s+/g, "_")}.pdf`;
    if (openInNewTab) {
      const blobUrl = pdf.output("bloburl");
      window.open(blobUrl, "_blank");
    } else {
      pdf.save(filename);
    }
  } finally {
    document.body.removeChild(container);
  }
}
