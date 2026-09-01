"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar, Printer, ArrowLeft,
  TrendingUp, ShoppingCart, Receipt, PiggyBank,
  Banknote, Users, CheckCircle2, DollarSign,
  FileSpreadsheet, Sparkles, Filter, ChevronRight, Wallet
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import {
  getSales, getPurchases, getExpenses,
  getSomiti, getParties, getOwnerWallet,
  type Expense, type Purchase, type Sale, type Customer, type Somiti, type CashboxEntry, type OwnerWalletEntry
} from "@/lib/queries";
import { getBusinessSettingsFn } from "@/lib/rpc-admin";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { playTapSound } from "@/lib/audio";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { generateBusinessReportPdf } from "@/lib/pdf-report-generator";
import { FileText, Download, Loader2, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Expense Category Map for Bengali / English
const EXPENSE_CATEGORIES: Record<string, { bn: string; en: string }> = {
  rent: { bn: "দোকান ভাড়া", en: "Shop Rent" },
  salary: { bn: "স্টাফ বেতন", en: "Staff Salary" },
  utility: { bn: "বিদ্যুৎ ও ইউটিলিটি বিল", en: "Utility & Electricity Bills" },
  refreshment: { bn: "চা-নাস্তা ও আপ্যায়ন", en: "Snacks & Entertainment" },
  travel: { bn: "যাতায়াত খরচ", en: "Travel & Commute" },
  transport: { bn: "পরিবহন ও মাল আনা", en: "Transport & Shipping" },
  purchase: { bn: "পণ্য ক্রয় সংক্রান্ত", en: "Product Purchase" },
  marketing: { bn: "প্রচার ও বিজ্ঞাপন", en: "Marketing & Promo" },
  other: { bn: "অন্যান্য বিবিধ খরচ", en: "General / Other Expenses" },
};

function getCategoryInfo(exp: Expense, lang: "bn" | "en") {
  if (exp.category && EXPENSE_CATEGORIES[exp.category]) {
    return EXPENSE_CATEGORIES[exp.category][lang];
  }
  if (exp.title?.startsWith("Product Purchase:") || exp.note?.includes("Purchased")) {
    return lang === "bn" ? "পণ্য ক্রয় সংক্রান্ত" : "Product Purchase";
  }
  return lang === "bn" ? "অন্যান্য বিবিধ খরচ" : "General / Other";
}

export default function ReportsGeneratorPage() {
  const { lang, t } = useT();

  // Date range state - Defaults to Today
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(todayStr);
  const [to, setTo] = useState(todayStr);
  const [activePreset, setActivePreset] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  const [activeTab, setActiveTab] = useState<"summary" | "expenses" | "sales" | "purchases" | "dues" | "cashbox">("summary");

  // Pagination states
  const [salesPage, setSalesPage] = useState(1);
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const [duesPage, setDuesPage] = useState(1);
  const [cashboxPage, setCashboxPage] = useState(1);
  const pageSize = 15;

  // Queries
  const { data: bizSettings } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const salesQuery = useCachedQuery(["sales"], getSales);
  const purchasesQuery = useCachedQuery(["purchases"], getPurchases);
  const expensesQuery = useCachedQuery(["expenses"], getExpenses);
  const somitiQuery = useCachedQuery(["somiti"], getSomiti);
  const ownerWalletQuery = useCachedQuery(["owner_wallet"], getOwnerWallet);
  const cashboxQuery = useCashboxQuery();
  const partiesQuery = useCachedQuery(["parties"], getParties);

  const bizName = bizSettings?.business?.name || "Classic World";
  const bizPhone = bizSettings?.business?.phone || "";
  const bizAddress = bizSettings?.business?.address || "";

  // Date Range Presets
  const setPreset = (type: "today" | "yesterday" | "week" | "month" | "all") => {
    setActivePreset(type);
    setSalesPage(1);
    setPurchasesPage(1);
    setExpensesPage(1);
    setDuesPage(1);
    setCashboxPage(1);
    const now = new Date();
    if (type === "today") {
      const d = now.toLocaleDateString("en-CA");
      setFrom(d);
      setTo(d);
    } else if (type === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const d = y.toLocaleDateString("en-CA");
      setFrom(d);
      setTo(d);
    } else if (type === "week") {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      setFrom(w.toLocaleDateString("en-CA"));
      setTo(now.toLocaleDateString("en-CA"));
    } else if (type === "month") {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      setFrom(m.toLocaleDateString("en-CA"));
      setTo(now.toLocaleDateString("en-CA"));
    } else if (type === "all") {
      setFrom("2020-01-01");
      setTo(now.toLocaleDateString("en-CA"));
    }
  };

  // Helper date filtering supporting strings, Timestamps, and Date objects
  const inDateRange = (dateInput: any) => {
    if (!dateInput) return false;
    let dStr = "";
    if (typeof dateInput?.toDate === "function") {
      dStr = dateInput.toDate().toLocaleDateString("en-CA");
    } else if (dateInput?.seconds !== undefined) {
      dStr = new Date(dateInput.seconds * 1000).toLocaleDateString("en-CA");
    } else if (typeof dateInput === "string") {
      dStr = dateInput.slice(0, 10);
    } else {
      const d = new Date(dateInput);
      dStr = !isNaN(d.getTime()) ? d.toLocaleDateString("en-CA") : "";
    }
    return Boolean(dStr && dStr >= from && dStr <= to);
  };

  // Filtered datasets
  const filteredSales = useMemo(() => (salesQuery.data ?? []).filter(s => !s.returned && inDateRange(s.created_at)), [salesQuery.data, from, to]);
  const filteredPurchases = useMemo(() => (purchasesQuery.data ?? []).filter(p => inDateRange(p.created_at)), [purchasesQuery.data, from, to]);
  const filteredExpenses = useMemo(() => (expensesQuery.data ?? []).filter(e => inDateRange(e.created_at)), [expensesQuery.data, from, to]);
  const filteredCashbox = useMemo(() => (cashboxQuery.data ?? []).filter(c => inDateRange(c.created_at)), [cashboxQuery.data, from, to]);
  const filteredSomiti = useMemo(() => (somitiQuery.data ?? []).filter(s => inDateRange(s.created_at)), [somitiQuery.data, from, to]);
  const filteredOwnerWallet = useMemo(() => (ownerWalletQuery.data ?? []).filter(w => inDateRange(w.created_at)), [ownerWalletQuery.data, from, to]);

  // Totals calculations
  const totalSalesVal = useMemo(() => filteredSales.reduce((a, s) => {
    const lineTotal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1);
    return a + Math.max(lineTotal, 0);
  }, 0), [filteredSales]);
  const totalSalesProfitVal = useMemo(() => filteredSales.reduce((a, s) => a + Number(s.profit || 0), 0), [filteredSales]);
  const totalSalesDueVal = useMemo(() => filteredSales.reduce((a, s) => a + Number(s.due_amount || 0), 0), [filteredSales]);
  const totalSalesItemsCount = useMemo(() => filteredSales.reduce((a, s) => a + Number(s.qty || 0), 0), [filteredSales]);

  // Sales by payment type
  const cashSales = useMemo(() => filteredSales.filter(s => s.type === "cash" || (s.type as string) === "nagad" || (s.type as string) === "hand_cash" || (s.type as string) === "pos"), [filteredSales]);
  const bkashSales = useMemo(() => filteredSales.filter(s => (s as any).payment_method === "bkash" || (s.type as string) === "bkash"), [filteredSales]);
  const creditSales = useMemo(() => filteredSales.filter(s => s.type === "credit"), [filteredSales]);
  const onlineSales = useMemo(() => filteredSales.filter(s => s.type === "online"), [filteredSales]);

  const cashSalesTotal = useMemo(() => cashSales.reduce((a, s) => {
    const lineTotal = (Number(s.sell_price) || 0) * (Number(s.qty) || 1);
    return a + Math.max(lineTotal, 0);
  }, 0), [cashSales]);
  const bkashSalesTotal = useMemo(() => bkashSales.reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1)), 0), [bkashSales]);
  const creditSalesTotal = useMemo(() => creditSales.reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1)), 0), [creditSales]);
  const creditSalesDueTotal = useMemo(() => creditSales.reduce((a, s) => a + Number(s.due_amount || 0), 0), [creditSales]);
  const onlineSalesTotal = useMemo(() => onlineSales.reduce((a, s) => a + ((Number(s.sell_price) || 0) * (Number(s.qty) || 1)), 0), [onlineSales]);

  // Purchases totals
  const totalPurchaseVal = useMemo(() => filteredPurchases.reduce((a, p) => a + Number(p.total || 0), 0), [filteredPurchases]);
  const totalPurchaseQty = useMemo(() => filteredPurchases.reduce((a, p) => a + Number(p.qty || 0), 0), [filteredPurchases]);

  // Expenses totals & Category Breakdown
  const totalExpenseVal = useMemo(() => filteredExpenses.reduce((a, e) => a + Number(e.amount || 0), 0), [filteredExpenses]);

  const categoryExpenses = useMemo(() => {
    const map: Record<string, { categoryKey: string; label: string; count: number; total: number }> = {};

    filteredExpenses.forEach(exp => {
      let catKey = exp.category || "other";
      if (!exp.category && (exp.title?.startsWith("Product Purchase:") || exp.note?.includes("Purchased"))) {
        catKey = "purchase";
      }
      const label = EXPENSE_CATEGORIES[catKey] ? EXPENSE_CATEGORIES[catKey][lang] : (lang === "bn" ? "অন্যান্য" : "Other");

      if (!map[catKey]) {
        map[catKey] = { categoryKey: catKey, label, count: 0, total: 0 };
      }
      map[catKey].count += 1;
      map[catKey].total += Number(exp.amount || 0);
    });

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredExpenses, lang]);

  // Somiti totals & breakdowns
  const somitiDepositTotal = useMemo(() => {
    return filteredSomiti.filter(s => s.kind === "deposit").reduce((a, s) => a + Number(s.amount || 0), 0);
  }, [filteredSomiti]);

  const somitiWithdrawTotal = useMemo(() => {
    return filteredSomiti.filter(s => s.kind === "withdraw").reduce((a, s) => a + Number(s.amount || 0), 0);
  }, [filteredSomiti]);

  const somitiNetVal = somitiDepositTotal - somitiWithdrawTotal;

  // Owner's Wallet personal withdrawals
  const ownerWalletTotal = useMemo(() => {
    return filteredOwnerWallet.reduce((a, w) => a + Number(w.amount || 0), 0);
  }, [filteredOwnerWallet]);

  // Cashbox net movement
  const cashboxIn = useMemo(() => {
    return filteredCashbox.filter(c => c.kind === "deposit" || c.kind === "sale").reduce((a, c) => a + Number(c.amount || 0), 0);
  }, [filteredCashbox]);
  const cashboxOut = useMemo(() => {
    return filteredCashbox.filter(c => c.kind === "withdraw" || c.kind === "expense").reduce((a, c) => a + Number(c.amount || 0), 0);
  }, [filteredCashbox]);

  // Net Profit (Sales Profit - Operating Expenses excluding pure inventory product purchase duplicates)
  const nonProductExpenses = useMemo(() => {
    return filteredExpenses.filter(e => {
      const isProductExp = e.category === "purchase" || e.title?.startsWith("Product Purchase:") || e.note?.includes("Purchased");
      return !isProductExp;
    }).reduce((a, e) => a + Number(e.amount || 0), 0);
  }, [filteredExpenses]);

  const netBusinessProfit = totalSalesProfitVal - nonProductExpenses;

  // Paginated Slices for On-Screen Display
  const { items: pagedSales, totalPages: salesTotalPages, safePage: safeSalesPage } = paginate(filteredSales, salesPage, pageSize);
  const { items: pagedPurchases, totalPages: purchasesTotalPages, safePage: safePurchasesPage } = paginate(filteredPurchases, purchasesPage, pageSize);
  const { items: pagedExpenses, totalPages: expensesTotalPages, safePage: safeExpensesPage } = paginate(filteredExpenses, expensesPage, pageSize);
  const { items: pagedDues, totalPages: duesTotalPages, safePage: safeDuesPage } = paginate(creditSales, duesPage, pageSize);
  const { items: pagedCashbox, totalPages: cashboxTotalPages, safePage: safeCashboxPage } = paginate(filteredCashbox, cashboxPage, pageSize);

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Direct High-Resolution PDF Download (Zero Web-Preview, Bilingual Support)
  const handleGeneratePdf = async (openInNewTab: boolean, targetLang: "bn" | "en" = lang) => {
    playTapSound();
    setIsGeneratingPdf(true);
    try {
      await generateBusinessReportPdf({
        bizName,
        bizPhone,
        bizAddress,
        from,
        to,
        lang: targetLang,
        totalSalesVal,
        totalSalesProfitVal,
        totalSalesDueVal,
        totalSalesItemsCount,
        filteredSales,
        cashSalesTotal,
        cashSalesCount: cashSales.length,
        bkashSalesTotal,
        bkashSalesCount: bkashSales.length,
        creditSalesTotal,
        creditSalesCount: creditSales.length,
        creditSalesDueTotal,
        onlineSalesTotal,
        onlineSalesCount: onlineSales.length,
        totalPurchaseVal,
        totalPurchaseQty,
        filteredPurchases,
        totalExpenseVal,
        categoryExpenses,
        filteredExpenses,
        netBusinessProfit,
        somitiNetVal,
        somitiCount: filteredSomiti.length,
        somitiDepositTotal,
        somitiWithdrawTotal,
        ownerWalletTotal,
        ownerWalletCount: filteredOwnerWallet.length,
        cashboxIn,
        cashboxOut,
      }, openInNewTab, targetLang);

      if (openInNewTab) {
        toast.success(targetLang === "bn" ? "পিডিএফ ভিউ প্রস্তুত হচ্ছে!" : "Opening PDF preview!");
      } else {
        toast.success(targetLang === "bn" ? "পিডিএফ রিপোর্ট সফলভাবে ডাউনলোড হয়েছে!" : "Official PDF report downloaded successfully!");
      }
    } catch (err: any) {
      toast.error(targetLang === "bn" ? "পিডিএফ তৈরি করতে সমস্যা হয়েছে: " + (err?.message || "") : "Failed to generate PDF: " + (err?.message || ""));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Instant Full Multi-Category CSV Download (Bilingual Support)
  const handleDownloadCSV = (langCode: "en" | "bn" = lang) => {
    playTapSound();
    const isBn = langCode === "bn";
    const rows: (string | number)[][] = [];

    // Header & Info
    rows.push([isBn ? `${bizName} - ক্যাটাগরি অনুযায়ী ব্যবসায়িক প্রতিবেদন` : `${bizName} - Category-wise Business Statement Report`]);
    rows.push([isBn ? "সময়কাল" : "Period", `${from} ${isBn ? "হতে" : "to"} ${to}`]);
    rows.push([isBn ? "প্রস্তুত সময়" : "Generated At", new Date().toLocaleString()]);
    rows.push([]);

    // 1. Executive Financial Summary
    rows.push([isBn ? "--- ১. সার্বিক অর্থনৈতিক সারসংক্ষেপ ---" : "--- 1. EXECUTIVE FINANCIAL SUMMARY ---"]);
    rows.push([isBn ? "আর্থিক খাত" : "Financial Metric", isBn ? "পরিমাণ (টাকা)" : "Amount (BDT)", isBn ? "মন্তব্য" : "Remarks"]);
    rows.push([isBn ? "মোট বিক্রয়মূল্য" : "Total Sales Value", totalSalesVal, `${filteredSales.length} ${isBn ? "টি চালান" : "orders"} (${totalSalesItemsCount} ${isBn ? "পিস" : "items"})`]);
    rows.push([isBn ? "বিক্রয় হতে মোট লাভ" : "Gross Profit from Sales", totalSalesProfitVal, isBn ? "বিক্রয়মূল্য - ক্রয়মূল্য" : "Margin before overheads"]);
    rows.push([isBn ? "দোকান পরিচালনা খরচ" : "Total Operating Expenses", totalExpenseVal, `${filteredExpenses.length} ${isBn ? "টি ভাউচার" : "expense vouchers"}`]);
    rows.push([isBn ? "পণ্য ক্রয় ও স্টক" : "Total Product Purchases", totalPurchaseVal, `${filteredPurchases.length} ${isBn ? "টি চালান" : "purchase invoices"} (${totalPurchaseQty} ${isBn ? "পিস" : "pcs"})`]);
    rows.push([isBn ? "নিট আনুমানিক লাভ" : "Net Estimated Profit", netBusinessProfit, isBn ? "মোট লাভ - দোকান খরচ" : "Gross Profit - Overhead Expenses"]);
    rows.push([isBn ? "এই সময়ের নতুন বাকী" : "Total Dues on Period Sales", totalSalesDueVal, isBn ? "গ্রাহকদের কাছে পাওনা" : "Outstanding credit receivables"]);
    rows.push([isBn ? "সমিতি নিট সঞ্চয়" : "Somiti Net Savings", somitiNetVal, isBn ? "জমা - উত্তোলন" : "Total deposited - withdrawn"]);
    rows.push([]);

    // 2. Expenses Category Breakdown
    rows.push([isBn ? "--- ২. ক্যাটাগরি ভিত্তিক খরচের বিবরণী ---" : "--- 2. EXPENSES BREAKDOWN BY CATEGORY ---"]);
    rows.push([isBn ? "ক্যাটাগরি" : "Category", isBn ? "ভাউচার সংখ্যা" : "Vouchers Count", isBn ? "মোট খরচ (টাকা)" : "Total Spent (BDT)", isBn ? "শতকরা হার (%)" : "Share %"]);
    categoryExpenses.forEach(cat => {
      const pct = totalExpenseVal > 0 ? ((cat.total / totalExpenseVal) * 100).toFixed(1) + "%" : "0%";
      const catName = isBn ? (EXPENSE_CATEGORIES[cat.categoryKey]?.bn || cat.label) : (EXPENSE_CATEGORIES[cat.categoryKey]?.en || cat.label);
      rows.push([catName, cat.count, cat.total, pct]);
    });
    rows.push([isBn ? "সর্বমোট পরিচালন খরচ" : "Total Overhead Expenses", filteredExpenses.length, totalExpenseVal, "100%"]);
    rows.push([]);

    // 3. Sales Breakdown by Payment Type
    rows.push([isBn ? "--- ৩. পেমেন্ট পদ্ধতি ভিত্তিক বিক্রয় ---" : "--- 3. SALES BY PAYMENT TYPE ---"]);
    rows.push([isBn ? "পেমেন্ট পদ্ধতি" : "Payment Method", isBn ? "চালান সংখ্যা" : "Orders Count", isBn ? "মোট বিক্রয় (টাকা)" : "Total Value (BDT)", isBn ? "বকেয়া বাকী (টাকা)" : "Due Amount (BDT)"]);
    rows.push([isBn ? "নগদ বিক্রয় (Cash)" : "Cash Sales", cashSales.length, cashSalesTotal, 0]);
    rows.push([isBn ? "বিকাশ বিক্রয় (bKash)" : "bKash Sales", bkashSales.length, bkashSalesTotal, 0]);
    rows.push([isBn ? "বাকী বিক্রয় (Credit)" : "Credit Sales", creditSales.length, creditSalesTotal, creditSalesDueTotal]);
    rows.push([isBn ? "অনলাইন বিক্রয় (Online)" : "Online Sales", onlineSales.length, onlineSalesTotal, 0]);
    rows.push([isBn ? "সর্বমোট বিক্রয়" : "Total Sales", filteredSales.length, totalSalesVal, totalSalesDueVal]);
    rows.push([]);

    // 4. Detailed Purchases Restock
    rows.push([isBn ? "--- ৪. পণ্য ক্রয় ও ইনভেন্টরি তালিকা ---" : "--- 4. PRODUCT PURCHASES / RESTOCK LIST ---"]);
    rows.push([isBn ? "তারিখ" : "Date", isBn ? "পণ্যের নাম" : "Product Name", isBn ? "পরিমাণ" : "Quantity", isBn ? "একক ক্রয়মূল্য (টাকা)" : "Unit Cost (BDT)", isBn ? "মোট খরচ (টাকা)" : "Total Cost (BDT)", isBn ? "নোট / সরবরাহকারী" : "Supplier / Note"]);
    filteredPurchases.forEach(p => {
      rows.push([
        p.created_at.slice(0, 10),
        p.product_name,
        p.qty,
        p.unit_cost,
        p.total,
        p.note || ""
      ]);
    });
    rows.push([]);

    // 5. Customer Dues from Period
    rows.push([isBn ? "--- ৫. বকেয়া বাকী ও কাস্টমার তালিকা ---" : "--- 5. CREDIT SALES / DUES LIST ---"]);
    rows.push([isBn ? "তারিখ" : "Date", isBn ? "কাস্টমারের নাম" : "Customer Name", isBn ? "পণ্যের নাম" : "Product", isBn ? "মোট মূল্য (টাকা)" : "Total Price (BDT)", isBn ? "পরিশোধ (টাকা)" : "Paid (BDT)", isBn ? "বকেয়া পরিমাণ (টাকা)" : "Due Amount (BDT)"]);
    creditSales.forEach(s => {
      const paid = Number(s.sell_price) * s.qty - Number(s.due_amount || 0);
      rows.push([
        s.created_at.slice(0, 10),
        s.parties?.name || (isBn ? "সাধারণ কাস্টমার" : "Walk-in Customer"),
        s.product_name,
        Number(s.sell_price) * s.qty,
        paid,
        Number(s.due_amount || 0)
      ]);
    });

    // 6. Cashbox, Somiti & Owners Wallet Money Flow
    rows.push([isBn ? "--- ৬. ক্যাশবাক্স, সমিতি ও মালিকের ওয়ালেট অর্থপ্রবাহ ---" : "--- 6. CASHBOX, SOMITI & OWNER'S WALLET MONEY FLOW ---"]);
    rows.push([isBn ? "খাত" : "Fund Metric", isBn ? "জমা / ক্যাশ ইন" : "Inflow", isBn ? "খরচ / উত্তোলন" : "Outflow", isBn ? "নিট প্রভাব (টাকা)" : "Net Impact (BDT)"]);
    rows.push([isBn ? "ক্যাশবাক্স নগদ প্রবাহ" : "Cashbox Movement", cashboxIn, cashboxOut, cashboxIn - cashboxOut]);
    rows.push([isBn ? "সমিতি সঞ্চয় ও কিস্তি" : "Samity Fund", somitiDepositTotal, somitiWithdrawTotal, somitiNetVal]);
    rows.push([isBn ? "মালিকের ব্যক্তিগত ওয়ালেট" : "Owner Personal Wallet", 0, ownerWalletTotal, -ownerWalletTotal]);
    rows.push([]);

    const headers = [
      isBn ? "বিবরণী খাত / কলাম" : "Section / Column",
      isBn ? "মূল্য / পরিমাণ" : "Value",
      isBn ? "অতিরিক্ত বিবরণ ১" : "Detail 1",
      isBn ? "অতিরিক্ত বিবরণ ২" : "Detail 2",
      isBn ? "অতিরিক্ত বিবরণ ৩" : "Detail 3",
      isBn ? "অতিরিক্ত বিবরণ ৪" : "Detail 4",
    ];

    downloadCsv(`Business_Report_${from}_to_${to}_${langCode}.csv`, headers, rows);
    toast.success(isBn ? "রিপোর্ট এক্সেল/CSV সফলভাবে ডাউনলোড হয়েছে!" : "Report CSV downloaded successfully!");
  };

  return (
    <div className="space-y-5 pb-12">
      {/* ── Screen Controls Header (Hidden in Print) ── */}
      <div className="print:hidden space-y-4">
        {/* Top bar with navigation & main action buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="size-9 rounded-xl cursor-pointer">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold font-serif text-foreground">
                {lang === "bn" ? "ব্যবসায়িক প্রতিবেদন ও ক্যাটাগরি রিপোর্ট" : "Business & Category Report"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {lang === "bn"
                  ? `${bizName} · নির্বাচিত তারিখ: ${from === to ? from : `${from} হতে ${to}`}`
                  : `${bizName} · Range: ${from === to ? from : `${from} to ${to}`}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-semibold rounded-xl beveled-button gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{lang === "bn" ? "এক্সেল / CSV" : "Download CSV"}</span>
                  <ChevronDown className="size-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDownloadCSV("bn")}>
                  Bangla (বাংলা স্প্রেডশিট)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownloadCSV("en")}>
                  English (ইংরেজি Spreadsheet)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isGeneratingPdf}
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs font-bold rounded-xl beveled-button gap-1.5 cursor-pointer shadow-xs border-sky-500/40 text-sky-700 dark:text-sky-300"
                >
                  <Printer className="size-4 text-sky-600 dark:text-sky-400" />
                  <span>{lang === "bn" ? "পিডিএফ ভিউ" : "PDF Preview"}</span>
                  <ChevronDown className="size-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleGeneratePdf(true, "bn")}>
                  Bangla (বাংলা প্রিভিউ)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePdf(true, "en")}>
                  English (ইংরেজি Preview)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={isGeneratingPdf}
                  size="sm"
                  className="h-9 text-xs font-bold rounded-xl beveled-button bg-primary text-primary-foreground gap-1.5 cursor-pointer shadow-xs"
                >
                  {isGeneratingPdf ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  <span>{isGeneratingPdf ? (lang === "bn" ? "পিডিএফ তৈরি হচ্ছে..." : "Generating...") : (lang === "bn" ? "ডাউনলোড PDF" : "Download PDF")}</span>
                  <ChevronDown className="size-3 opacity-70 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleGeneratePdf(false, "bn")}>
                  Bangla PDF (বাংলা পিডিএফ)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePdf(false, "en")}>
                  English PDF (ইংরেজি পিডিএফ)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Date Filter Toolbar: Default is "Today" */}
        <Card className="p-4 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Calendar className="size-4 text-primary" />
              <span>{lang === "bn" ? "তারিখ ফিল্টার (ডিফল্ট: আজ):" : "Date Filter (Default: Today):"}</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setPreset("today")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activePreset === "today"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {lang === "bn" ? "আজ (Today)" : "Today"}
              </button>
              <button
                type="button"
                onClick={() => setPreset("yesterday")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activePreset === "yesterday"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {lang === "bn" ? "গতকাল" : "Yesterday"}
              </button>
              <button
                type="button"
                onClick={() => setPreset("week")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activePreset === "week"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {lang === "bn" ? "গত ৭ দিন" : "Last 7 Days"}
              </button>
              <button
                type="button"
                onClick={() => setPreset("month")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activePreset === "month"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {lang === "bn" ? "চলতি মাস" : "This Month"}
              </button>
              <button
                type="button"
                onClick={() => setPreset("all")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activePreset === "all"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {lang === "bn" ? "সকল সময়" : "All Time"}
              </button>
            </div>
          </div>

          {/* Custom Date Range Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 border-t border-border/50">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "হতে (From)" : "From Date"}</Label>
              <Input
                type="date"
                value={from}
                onChange={e => { setFrom(e.target.value); setActivePreset("custom"); }}
                className="h-8 text-xs rounded-xl bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "পর্যন্ত (To)" : "To Date"}</Label>
              <Input
                type="date"
                value={to}
                onChange={e => { setTo(e.target.value); setActivePreset("custom"); }}
                className="h-8 text-xs rounded-xl bg-background"
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <div className="text-[11px] text-muted-foreground bg-muted/50 p-2 rounded-xl w-full flex items-center justify-between">
                <span>{lang === "bn" ? "মোট রেকর্ড পাওয়া গেছে:" : "Records in Range:"}</span>
                <span className="font-bold text-foreground">
                  {filteredSales.length} {lang === "bn" ? "বিক্রি" : "sales"} · {filteredExpenses.length} {lang === "bn" ? "খরচ" : "exp"} · {filteredPurchases.length} {lang === "bn" ? "ক্রয়" : "buy"}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* 4 Bento Top KPI Summary Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 beveled-kpi bg-card rounded-none border-emerald-500/20 shadow-xs space-y-1 relative overflow-hidden">
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "মোট বিক্রয়" : "Total Sales"}</div>
            <div className="text-lg md:text-xl font-bold font-serif text-emerald-600 dark:text-emerald-400">
              {fmtMoney(totalSalesVal)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {filteredSales.length} {lang === "bn" ? "টি চালান" : "invoices"}
            </div>
          </Card>

          <Card className="p-4 beveled-kpi bg-card rounded-none border-rose-500/20 shadow-xs space-y-1 relative overflow-hidden">
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "পরিচালন খরচ" : "Overhead Expenses"}</div>
            <div className="text-lg md:text-xl font-bold font-serif text-rose-600 dark:text-rose-400">
              {fmtMoney(totalExpenseVal)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {categoryExpenses.length} {lang === "bn" ? "টি ক্যাটাগরিতে" : "categories"}
            </div>
          </Card>

          <Card className="p-4 beveled-kpi bg-card rounded-none border-sky-500/20 shadow-xs space-y-1 relative overflow-hidden">
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "পণ্য ক্রয় (ইনভেন্টরি)" : "Product Purchases"}</div>
            <div className="text-lg md:text-xl font-bold font-serif text-sky-600 dark:text-sky-400">
              {fmtMoney(totalPurchaseVal)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {totalPurchaseQty} {lang === "bn" ? "পিস সামগ্রী" : "units restocked"}
            </div>
          </Card>

          <Card className="p-4 beveled-kpi bg-card rounded-none border-amber-500/20 shadow-xs space-y-1 relative overflow-hidden">
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "নিট অর্জিত লাভ" : "Estimated Net Profit"}</div>
            <div className={`text-lg md:text-xl font-bold font-serif ${netBusinessProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {fmtMoney(netBusinessProfit)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {lang === "bn" ? "বিক্রয় লাভ − খরচ" : "Gross profit − expenses"}
            </div>
          </Card>
        </div>

        {/* Category-wise Interactive Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto p-1 bg-muted/60 rounded-xl gap-1">
            <TabsTrigger value="summary" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "আর্থিক সারসংক্ষেপ" : "Summary"}
            </TabsTrigger>
            <TabsTrigger value="expenses" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "খরচ ক্যাটাগরি" : "Expenses"} ({categoryExpenses.length})
            </TabsTrigger>
            <TabsTrigger value="sales" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "বিক্রয় প্রতিবেদন" : "Sales"} ({filteredSales.length})
            </TabsTrigger>
            <TabsTrigger value="purchases" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "পণ্য ক্রয়" : "Purchases"} ({filteredPurchases.length})
            </TabsTrigger>
            <TabsTrigger value="dues" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "বাকী ও পাওনা" : "Dues"} ({creditSales.length})
            </TabsTrigger>
            <TabsTrigger value="cashbox" className="text-xs py-2 rounded-lg font-bold">
              {lang === "bn" ? "ক্যাশ ও তহবিল" : "Cashbox"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ── Official Structured Statement Document ── */}
      {/* (Visible on Screen as clean document card & Formatted for High-Resolution Printing & PDF Export) */}
      <div id="official-report-document" className="bg-card print:bg-white text-foreground print:text-black p-6 sm:p-8 rounded-2xl border border-border/80 print:border-none shadow-sm print:shadow-none space-y-6 font-['Hind_Siliguri',sans-serif]">
        
        {/* Document Official Header */}
        <div className="border-b-2 border-primary/20 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary print:bg-black inline-block" />
              <h2 className="text-2xl sm:text-3xl font-extrabold font-serif tracking-tight text-foreground print:text-black uppercase">
                {bizName}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground print:text-gray-600 mt-1">
              {bizAddress && `${bizAddress} · `}{bizPhone && `ফোন: ${bizPhone}`}
            </p>
            <div className="text-sm font-bold text-primary print:text-black mt-1.5">
              {lang === "bn" ? "অফিসিয়াল ব্যবসায়িক ও ক্যাটাগরি প্রতিবেদন" : "Official Business & Category Statement"}
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-muted-foreground print:text-gray-700 space-y-1">
            <div className="px-2.5 py-1 bg-primary/10 print:bg-gray-100 rounded-lg text-primary print:text-black font-bold inline-block">
              {lang === "bn" ? "সময়কাল:" : "Period:"} {from} {from !== to ? `হতে ${to}` : "(একদিন)"}
            </div>
            <div>{lang === "bn" ? "প্রস্তুত সময়:" : "Generated:"} {fmtDateTime(new Date().toISOString())}</div>
          </div>
        </div>

        {/* ── Section 1: Executive Financial Summary Table ── */}
        {(activeTab === "summary" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "summary" ? "hidden print:block" : ""}`}>
            <div className="flex items-center gap-2 border-b border-border/60 pb-1.5">
              <span className="size-2 rounded-full bg-emerald-500 print:bg-black" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                {lang === "bn" ? "১. সার্বিক অর্থনৈতিক সারসংক্ষেপ" : "1. Executive Financial Summary"}
              </h3>
            </div>

            <div className="overflow-x-auto border border-zinc-300 dark:border-zinc-700 print:border-black shadow-xs">
              <table className="w-full text-xs text-left border-collapse border border-zinc-300 dark:border-zinc-700 print:border-black">
                <thead className="bg-muted/90 print:bg-gray-200 text-foreground print:text-black font-bold uppercase">
                  <tr className="border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "আর্থিক বিবরণী খাত" : "Financial Metric"}</th>
                    <th className="p-2.5 text-center border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "সংখ্যা / ভাউচার" : "Count"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মোট পরিমাণ (টাকা)" : "Amount (BDT)"}</th>
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মন্তব্য" : "Remarks"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 dark:divide-zinc-700 print:divide-black">
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মোট বিক্রয়মূল্য" : "Total Sales Revenue"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredSales.length} {lang === "bn" ? "টি" : "orders"}</td>
                    <td className="p-2.5 text-right font-bold font-serif text-emerald-600 dark:text-emerald-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesVal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{totalSalesItemsCount} {lang === "bn" ? "পিস পণ্য বিক্রি" : "items sold"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "বিক্রয় হতে অর্জিত লাভ" : "Gross Profit from Sales"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">—</td>
                    <td className="p-2.5 text-right font-bold font-serif text-emerald-600 dark:text-emerald-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesProfitVal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "বিক্রয়মূল্য − ক্রয়মূল্য" : "Selling Price − Buy Cost"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "দোকান পরিচালনা খরচ" : "Overhead Operating Expenses"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredExpenses.length} {lang === "bn" ? "টি ভাউচার" : "vouchers"}</td>
                    <td className="p-2.5 text-right font-bold font-serif text-rose-600 dark:text-rose-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">−{fmtMoney(totalExpenseVal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{categoryExpenses.length} {lang === "bn" ? "টি ক্যাটাগরির খরচ" : "expense categories"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "পণ্য ক্রয় ও ইনভেন্টরি ব্যয়" : "Product Purchases / Restock"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredPurchases.length} {lang === "bn" ? "টি চালান" : "invoices"}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-sky-600 dark:text-sky-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalPurchaseVal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{totalPurchaseQty} {lang === "bn" ? "পিস নতুন পণ্য সংযোজন" : "units restocked"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "সমিতিতে সঞ্চয় ও কিস্তি জমা" : "Samity Deposits (Savings)"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredSomiti.filter(s => s.kind === "deposit").length} {lang === "bn" ? "টি" : "entries"}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-sky-600 dark:text-sky-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(somitiDepositTotal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "সমিতি সঞ্চয় ফান্ড জমা" : "Savings deposits into Somiti"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মালিকের ব্যক্তিগত ওয়ালেট খরচ" : "Owner's Personal Wallet"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredOwnerWallet.length} {lang === "bn" ? "টি" : "entries"}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-rose-600 dark:text-rose-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">−{fmtMoney(ownerWalletTotal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "পরিবার ও ব্যক্তিগত খরচ (ক্যাশ ও লাভ কর্তিত)" : "Personal withdrawals (cash & profit deducted)"}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "এই সময়ের নতুন বকেয়া বাকী" : "Period Sales Dues"}</td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{creditSales.length} {lang === "bn" ? "টি" : "due sales"}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-amber-600 dark:text-amber-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesDueVal)}</td>
                    <td className="p-2.5 text-muted-foreground print:text-gray-600 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "গ্রাহকদের কাছে পাওনা" : "Customer receivable"}</td>
                  </tr>
                  <tr className="bg-primary/10 dark:bg-primary/20 print:bg-gray-200 font-bold border-t-2 border-zinc-400 dark:border-zinc-600 print:border-black">
                    <td className="p-3 text-sm font-extrabold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "নিট আনুমানিক ব্যবসায়িক লাভ" : "Net Estimated Business Profit"}</td>
                    <td className="p-3 text-center font-bold border border-zinc-300 dark:border-zinc-700 print:border-black">—</td>
                    <td className={`p-3 text-sm text-right font-extrabold font-serif border border-zinc-300 dark:border-zinc-700 print:border-black ${netBusinessProfit >= 0 ? "text-emerald-600 dark:text-emerald-400 print:text-black" : "text-rose-600 dark:text-rose-400 print:text-black"}`}>
                      {fmtMoney(netBusinessProfit)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground dark:text-muted-foreground print:text-gray-800 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মোট লাভ − দোকান ও ব্যক্তিগত খরচ" : "Gross Profit − Expenses"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 2: Expenses Breakdown by Category ── */}
        {(activeTab === "expenses" || activeTab === "summary" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "expenses" && activeTab !== "summary" ? "hidden print:block" : ""}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-500 print:bg-black" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                  {lang === "bn" ? "২. ক্যাটাগরি ভিত্তিক খরচের বিবরণী" : "2. Expenses by Category"}
                </h3>
              </div>
              <span className="text-xs font-bold text-rose-600 print:text-black">
                {lang === "bn" ? "মোট খরচ: " : "Total: "}{fmtMoney(totalExpenseVal)}
              </span>
            </div>

            <div className="overflow-x-auto border border-zinc-300 dark:border-zinc-700 print:border-black shadow-xs">
              <table className="w-full text-xs text-left border-collapse border border-zinc-300 dark:border-zinc-700 print:border-black">
                <thead className="bg-muted/90 print:bg-gray-200 text-foreground print:text-black font-bold uppercase">
                  <tr className="border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <th className="p-2.5 text-center border border-zinc-300 dark:border-zinc-700 print:border-black">#</th>
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "খরচের ক্যাটাগরি" : "Expense Category"}</th>
                    <th className="p-2.5 text-center border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "ভাউচার সংখ্যা" : "Count"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মোট খরচ (টাকা)" : "Amount (BDT)"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "শতকরা হার" : "Share %"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 dark:divide-zinc-700 print:divide-black">
                  {categoryExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground border border-zinc-300 dark:border-zinc-700 print:border-black">
                        {lang === "bn" ? "এই সময়কালে কোনো খরচের রেকর্ড নেই" : "No expense records in this range"}
                      </td>
                    </tr>
                  ) : (
                    categoryExpenses.map((cat, idx) => {
                      const sharePct = totalExpenseVal > 0 ? ((cat.total / totalExpenseVal) * 100).toFixed(1) : "0";
                      return (
                        <tr key={cat.categoryKey} className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                          <td className="p-2.5 text-center text-muted-foreground font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{cat.label}</td>
                          <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{cat.count} {lang === "bn" ? "টি" : ""}</td>
                          <td className="p-2.5 text-right font-bold font-serif text-rose-600 dark:text-rose-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(cat.total)}</td>
                          <td className="p-2.5 text-right font-semibold text-muted-foreground print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{sharePct}%</td>
                        </tr>
                      );
                    })
                  )}
                  <tr className="bg-muted/40 print:bg-gray-100 font-bold border-t-2 border-zinc-400 dark:border-zinc-600 print:border-black">
                    <td colSpan={3} className="p-2.5 text-right uppercase border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "সর্বমোট পরিচালন খরচ:" : "Total Overhead Expenses:"}</td>
                    <td className="p-2.5 text-right font-serif text-rose-600 dark:text-rose-400 print:text-black font-extrabold border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalExpenseVal)}</td>
                    <td className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 3: Sales by Payment Type ── */}
        {(activeTab === "sales" || activeTab === "summary" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "sales" && activeTab !== "summary" ? "hidden print:block" : ""}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-sky-500 print:bg-black" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                  {lang === "bn" ? "৩. পেমেন্ট পদ্ধতি ভিত্তিক বিক্রয় বিবরণী" : "3. Sales by Payment Type"}
                </h3>
              </div>
              <span className="text-xs font-bold text-emerald-600 print:text-black">
                {lang === "bn" ? "মোট বিক্রয়: " : "Total Sales: "}{fmtMoney(totalSalesVal)}
              </span>
            </div>

            <div className="overflow-x-auto border border-zinc-300 dark:border-zinc-700 print:border-black shadow-xs">
              <table className="w-full text-xs text-left border-collapse border border-zinc-300 dark:border-zinc-700 print:border-black">
                <thead className="bg-muted/90 print:bg-gray-200 text-foreground print:text-black font-bold uppercase">
                  <tr className="border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "পেমেন্ট পদ্ধতি" : "Payment Method"}</th>
                    <th className="p-2.5 text-center border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "চালান সংখ্যা" : "Orders"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "মোট বিক্রয়মূল্য" : "Total Sold"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "আদায়কৃত টাকা" : "Collected"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "বকেয়া বাকী" : "Due Amount"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 dark:divide-zinc-700 print:divide-black">
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 print:border-black">
                      <span className="size-2 rounded-full bg-emerald-500 inline-block" />
                      {lang === "bn" ? "নগদ বিক্রয়" : "Cash Sales"}
                    </td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{cashSales.length}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-emerald-600 dark:text-emerald-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(cashSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-emerald-600 dark:text-emerald-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(cashSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-muted-foreground border border-zinc-300 dark:border-zinc-700 print:border-black">৳০</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 print:border-black">
                      <span className="size-2 rounded-full bg-pink-500 inline-block" />
                      {lang === "bn" ? "বিকাশ বিক্রয়" : "bKash Sales"}
                    </td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{bkashSales.length}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-pink-600 dark:text-pink-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(bkashSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-pink-600 dark:text-pink-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(bkashSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-muted-foreground border border-zinc-300 dark:border-zinc-700 print:border-black">৳০</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 print:border-black">
                      <span className="size-2 rounded-full bg-amber-500 inline-block" />
                      {lang === "bn" ? "বাকী বিক্রয়" : "Credit Sales"}
                    </td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{creditSales.length}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-amber-600 dark:text-amber-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(creditSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-emerald-600 dark:text-emerald-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(creditSalesTotal - creditSalesDueTotal)}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-rose-600 dark:text-rose-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(creditSalesDueTotal)}</td>
                  </tr>
                  <tr className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700 print:border-black">
                    <td className="p-2.5 font-bold text-foreground print:text-black flex items-center gap-1.5 border border-zinc-300 dark:border-zinc-700 print:border-black">
                      <span className="size-2 rounded-full bg-sky-500 inline-block" />
                      {lang === "bn" ? "অনলাইন বিক্রয়" : "Online Sales"}
                    </td>
                    <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700 print:border-black">{onlineSales.length}</td>
                    <td className="p-2.5 text-right font-serif font-bold text-sky-600 dark:text-sky-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(onlineSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-sky-600 dark:text-sky-400 print:text-black border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(onlineSalesTotal)}</td>
                    <td className="p-2.5 text-right font-serif text-muted-foreground border border-zinc-300 dark:border-zinc-700 print:border-black">৳০</td>
                  </tr>
                  <tr className="bg-muted/40 print:bg-gray-100 font-bold border-t-2 border-zinc-400 dark:border-zinc-600 print:border-black">
                    <td className="p-2.5 uppercase font-bold border border-zinc-300 dark:border-zinc-700 print:border-black">{lang === "bn" ? "সর্বমোট বিক্রয়:" : "Total Sales:"}</td>
                    <td className="p-2.5 text-center font-bold border border-zinc-300 dark:border-zinc-700 print:border-black">{filteredSales.length}</td>
                    <td className="p-2.5 text-right font-serif text-emerald-600 dark:text-emerald-400 print:text-black font-extrabold border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesVal)}</td>
                    <td className="p-2.5 text-right font-serif text-emerald-600 dark:text-emerald-400 print:text-black font-extrabold border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesVal - totalSalesDueVal)}</td>
                    <td className="p-2.5 text-right font-serif text-rose-600 dark:text-rose-400 print:text-black font-extrabold border border-zinc-300 dark:border-zinc-700 print:border-black">{fmtMoney(totalSalesDueVal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 4: Product Purchases Restock Statement ── */}
        {(activeTab === "purchases" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "purchases" ? "hidden print:block" : ""}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-indigo-500 print:bg-black" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                  {lang === "bn" ? "৪. পণ্য ক্রয় ও ইনভেন্টরি স্টক বিবরণী" : "4. Product Purchases & Restock"}
                </h3>
              </div>
              <span className="text-xs font-bold text-sky-600 print:text-black">
                {lang === "bn" ? "মোট ক্রয়: " : "Total: "}{fmtMoney(totalPurchaseVal)}
              </span>
            </div>

            {/* Screen View (Paginated) */}
            <div className="print:hidden overflow-x-auto border border-zinc-300 dark:border-zinc-700 shadow-xs">
              <table className="w-full text-xs text-left border-collapse border border-zinc-300 dark:border-zinc-700">
                <thead className="bg-muted/90 text-foreground font-bold uppercase">
                  <tr className="border-b border-zinc-300 dark:border-zinc-700">
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "তারিখ" : "Date"}</th>
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "পণ্যের নাম" : "Product Name"}</th>
                    <th className="p-2.5 text-center border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "পরিমাণ" : "Qty"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "একক ক্রয়মূল্য" : "Unit Cost"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "মোট খরচ" : "Total Cost"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 dark:divide-zinc-700">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground border border-zinc-300 dark:border-zinc-700">
                        {lang === "bn" ? "এই সময়কালে কোনো পণ্য ক্রয়ের রেকর্ড নেই" : "No purchase records in this range"}
                      </td>
                    </tr>
                  ) : (
                    pagedPurchases.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700">
                        <td className="p-2.5 text-muted-foreground font-medium border border-zinc-300 dark:border-zinc-700">{p.created_at.slice(0, 10)}</td>
                        <td className="p-2.5 font-bold text-foreground border border-zinc-300 dark:border-zinc-700">{p.product_name}</td>
                        <td className="p-2.5 text-center font-medium border border-zinc-300 dark:border-zinc-700">{p.qty} {lang === "bn" ? "টি" : "pcs"}</td>
                        <td className="p-2.5 text-right font-serif border border-zinc-300 dark:border-zinc-700">{fmtMoney(p.unit_cost)}</td>
                        <td className="p-2.5 text-right font-serif font-bold text-sky-600 dark:text-sky-400 border border-zinc-300 dark:border-zinc-700">{fmtMoney(p.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Screen Pagination */}
            <div className="print:hidden">
              {filteredPurchases.length > pageSize && (
                <PaginationBar
                  page={safePurchasesPage}
                  totalPages={purchasesTotalPages}
                  total={filteredPurchases.length}
                  pageSize={pageSize}
                  onPageChange={setPurchasesPage}
                />
              )}
            </div>

            {/* Print View (Full Table with All Rows) */}
            <div className="hidden print:block overflow-x-auto border border-black">
              <table className="w-full text-xs text-left border-collapse border border-black">
                <thead className="bg-gray-200 text-black font-bold uppercase">
                  <tr className="border-b border-black">
                    <th className="p-2 border border-black">{lang === "bn" ? "তারিখ" : "Date"}</th>
                    <th className="p-2 border border-black">{lang === "bn" ? "পণ্যের নাম" : "Product Name"}</th>
                    <th className="p-2 text-center border border-black">{lang === "bn" ? "পরিমাণ" : "Qty"}</th>
                    <th className="p-2 text-right border border-black">{lang === "bn" ? "একক ক্রয়মূল্য" : "Unit Cost"}</th>
                    <th className="p-2 text-right border border-black">{lang === "bn" ? "মোট খরচ" : "Total Cost"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {filteredPurchases.map((p) => (
                    <tr key={p.id} className="border-b border-black">
                      <td className="p-2 text-gray-700 border border-black">{p.created_at.slice(0, 10)}</td>
                      <td className="p-2 font-bold text-black border border-black">{p.product_name}</td>
                      <td className="p-2 text-center font-medium border border-black">{p.qty}</td>
                      <td className="p-2 text-right font-serif border border-black">{fmtMoney(p.unit_cost)}</td>
                      <td className="p-2 text-right font-serif font-bold text-black border border-black">{fmtMoney(p.total)}</td>
                    </tr>
                  ))}
                  {filteredPurchases.length > 0 && (
                    <tr className="bg-gray-100 font-bold border-t-2 border-black">
                      <td colSpan={2} className="p-2 uppercase border border-black">{lang === "bn" ? "সর্বমোট ক্রয়কৃত পণ্য:" : "Total Purchased Items:"}</td>
                      <td className="p-2 text-center font-bold border border-black">{totalPurchaseQty} {lang === "bn" ? "টি" : "pcs"}</td>
                      <td className="p-2 text-right font-serif border border-black">—</td>
                      <td className="p-2 text-right font-serif text-black font-extrabold border border-black">{fmtMoney(totalPurchaseVal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 5: Customer Dues / Credit Sales ── */}
        {(activeTab === "dues" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "dues" ? "hidden print:block" : ""}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-500 print:bg-black" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                  {lang === "bn" ? "৫. বকেয়া বাকী ও কাস্টমার পাওনা বিবরণী" : "5. Credit Sales & Receivables"}
                </h3>
              </div>
              <span className="text-xs font-bold text-rose-600 print:text-black">
                {lang === "bn" ? "মোট বকেয়া: " : "Total Dues: "}{fmtMoney(totalSalesDueVal)}
              </span>
            </div>

            {/* Screen View (Paginated) */}
            <div className="print:hidden overflow-x-auto border border-zinc-300 dark:border-zinc-700 shadow-xs">
              <table className="w-full text-xs text-left border-collapse border border-zinc-300 dark:border-zinc-700">
                <thead className="bg-muted/90 text-foreground font-bold uppercase">
                  <tr className="border-b border-zinc-300 dark:border-zinc-700">
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "তারিখ" : "Date"}</th>
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "কাস্টমার" : "Customer"}</th>
                    <th className="p-2.5 border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "পণ্যের বিবরণ" : "Item"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "মোট মূল্য" : "Total Price"}</th>
                    <th className="p-2.5 text-right border border-zinc-300 dark:border-zinc-700">{lang === "bn" ? "বকেয়া পরিমাণ" : "Due Amount"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 dark:divide-zinc-700">
                  {creditSales.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground border border-zinc-300 dark:border-zinc-700">
                        {lang === "bn" ? "এই সময়কালে কোনো বাকী বিক্রির রেকর্ড নেই" : "No credit sales in this range"}
                      </td>
                    </tr>
                  ) : (
                    pagedDues.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/20 border-b border-zinc-300 dark:border-zinc-700">
                        <td className="p-2.5 text-muted-foreground font-medium border border-zinc-300 dark:border-zinc-700">{s.created_at.slice(0, 10)}</td>
                        <td className="p-2.5 font-bold text-foreground border border-zinc-300 dark:border-zinc-700">{s.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer")}</td>
                        <td className="p-2.5 border border-zinc-300 dark:border-zinc-700">{s.product_name} × {s.qty}</td>
                        <td className="p-2.5 text-right font-serif border border-zinc-300 dark:border-zinc-700">{fmtMoney(Number(s.sell_price) * s.qty)}</td>
                        <td className="p-2.5 text-right font-serif font-bold text-rose-600 dark:text-rose-400 border border-zinc-300 dark:border-zinc-700">{fmtMoney(s.due_amount || 0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Screen Pagination */}
            <div className="print:hidden">
              {creditSales.length > pageSize && (
                <PaginationBar
                  page={safeDuesPage}
                  totalPages={duesTotalPages}
                  total={creditSales.length}
                  pageSize={pageSize}
                  onPageChange={setDuesPage}
                />
              )}
            </div>

            {/* Print View (Full Table with All Rows) */}
            <div className="hidden print:block overflow-x-auto border border-black">
              <table className="w-full text-xs text-left border-collapse border border-black">
                <thead className="bg-gray-200 text-black font-bold uppercase">
                  <tr className="border-b border-black">
                    <th className="p-2 border border-black">{lang === "bn" ? "তারিখ" : "Date"}</th>
                    <th className="p-2 border border-black">{lang === "bn" ? "কাস্টমার" : "Customer"}</th>
                    <th className="p-2 border border-black">{lang === "bn" ? "পণ্যের বিবরণ" : "Item"}</th>
                    <th className="p-2 text-right border border-black">{lang === "bn" ? "মোট মূল্য" : "Total Price"}</th>
                    <th className="p-2 text-right border border-black">{lang === "bn" ? "বকেয়া পরিমাণ" : "Due Amount"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {creditSales.map((s) => (
                    <tr key={s.id} className="border-b border-black">
                      <td className="p-2 text-gray-700 border border-black">{s.created_at.slice(0, 10)}</td>
                      <td className="p-2 font-bold text-black border border-black">{s.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer")}</td>
                      <td className="p-2 border border-black">{s.product_name} × {s.qty}</td>
                      <td className="p-2 text-right font-serif border border-black">{fmtMoney(Number(s.sell_price) * s.qty)}</td>
                      <td className="p-2 text-right font-serif font-bold text-black border border-black">{fmtMoney(s.due_amount || 0)}</td>
                    </tr>
                  ))}
                  {creditSales.length > 0 && (
                    <tr className="bg-gray-100 font-bold border-t-2 border-black">
                      <td colSpan={4} className="p-2 text-right uppercase border border-black">{lang === "bn" ? "সর্বমোট পাওনা বাকী:" : "Total Outstanding Due:"}</td>
                      <td className="p-2 text-right font-serif text-black font-extrabold border border-black">{fmtMoney(totalSalesDueVal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 6: Cashbox, Somiti & Owner Wallet Movement ── */}
        {(activeTab === "cashbox" || typeof window !== "undefined") && (
          <div className={`space-y-3 ${activeTab !== "cashbox" ? "hidden print:block" : ""}`}>
            <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-teal-500 print:bg-black" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
                  {lang === "bn" ? "৬. ক্যাশবাক্স, সমিতি ও মালিকের ওয়ালেট তহবিল বিবরণী" : "6. Cashbox, Samity & Owner's Wallet Movement"}
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg border border-border/80 print:border-gray-500 bg-muted/20 space-y-2">
                <div className="text-xs font-bold uppercase text-foreground print:text-black flex items-center gap-1.5 border-b border-border/60 pb-1">
                  <Banknote className="size-4 text-emerald-600" />
                  {lang === "bn" ? "ক্যাশবাক্স নগদ প্রবাহ" : "Cashbox Flow"}
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{lang === "bn" ? "নগদ জমা / বিক্রি:" : "Cash In:"}</span>
                  <span className="font-bold text-emerald-600 font-serif">+{fmtMoney(cashboxIn)}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{lang === "bn" ? "নগদ খরচ / উত্তোলন:" : "Cash Out:"}</span>
                  <span className="font-bold text-rose-600 font-serif">−{fmtMoney(cashboxOut)}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">{lang === "bn" ? "নিট নগদ পরিবর্তন:" : "Net Flow:"}</span>
                  <span className="font-bold text-foreground font-serif">{fmtMoney(cashboxIn - cashboxOut)}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-border/80 print:border-gray-500 bg-muted/20 space-y-2">
                <div className="text-xs font-bold uppercase text-foreground print:text-black flex items-center gap-1.5 border-b border-border/60 pb-1">
                  <PiggyBank className="size-4 text-sky-600" />
                  {lang === "bn" ? "সমিতি সঞ্চয় ও কিস্তি" : "Samity Fund"}
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{lang === "bn" ? "মোট সমিতি জমা:" : "Deposited:"}</span>
                  <span className="font-bold text-sky-600 font-serif">+{fmtMoney(somitiDepositTotal)}</span>
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{lang === "bn" ? "সমিতি হতে উত্তোলন:" : "Withdrawn:"}</span>
                  <span className="font-bold text-amber-600 font-serif">−{fmtMoney(somitiWithdrawTotal)}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">{lang === "bn" ? "নিট সঞ্চয় স্থিতি:" : "Net Balance:"}</span>
                  <span className="font-bold text-sky-600 font-serif">{fmtMoney(somitiNetVal)}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-border/80 print:border-gray-500 bg-muted/20 space-y-2">
                <div className="text-xs font-bold uppercase text-foreground print:text-black flex items-center gap-1.5 border-b border-border/60 pb-1">
                  <Wallet className="size-4 text-amber-600" />
                  {lang === "bn" ? "মালিকের ব্যক্তিগত ওয়ালেট" : "Owner's Wallet"}
                </div>
                <div className="flex justify-between text-xs py-1 border-b border-border/40">
                  <span className="text-muted-foreground">{lang === "bn" ? "ব্যক্তিগত খরচ সংখ্যা:" : "Entries:"}</span>
                  <span className="font-bold text-foreground font-serif">{filteredOwnerWallet.length} {lang === "bn" ? "টি" : ""}</span>
                </div>
                <div className="flex justify-between text-xs py-1">
                  <span className="text-muted-foreground">{lang === "bn" ? "মোট ব্যক্তিগত উত্তোলন:" : "Total Personal:"}</span>
                  <span className="font-bold text-rose-600 font-serif">−{fmtMoney(ownerWalletTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Official Document Signatures Block */}
        <div className="pt-10 border-t border-border/70 print:border-gray-400 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground print:text-black">
          <div className="space-y-1">
            <div className="border-t border-dashed border-border/80 print:border-gray-700 pt-2 font-semibold">
              {lang === "bn" ? "হিসাবরক্ষকের স্বাক্ষর" : "Accountant Signature"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="border-t border-dashed border-border/80 print:border-gray-700 pt-2 font-semibold">
              {lang === "bn" ? "ব্যবস্থাপকের স্বাক্ষর" : "Manager Signature"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="border-t border-dashed border-border/80 print:border-gray-700 pt-2 font-semibold">
              {lang === "bn" ? "স্বত্বাধিকারীর স্বাক্ষর" : "Proprietor Signature"}
            </div>
          </div>
        </div>

        {/* Print Disclaimer Stamp */}
        <div className="text-[10px] text-center text-muted-foreground/80 print:text-gray-500 pt-2">
          {lang === "bn"
            ? `এটি ${bizName} সফটওয়্যার সিস্টেম দ্বারা স্বয়ংক্রিয়ভাবে প্রস্তুতকৃত ক্যাটাগরি ভিত্তিক ব্যবসায়িক রিপোর্ট।`
            : `This official category-wise business report is generated automatically by ${bizName} POS system.`}
        </div>
      </div>
    </div>
  );
}