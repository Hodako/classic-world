"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getProducts, getParties, type Product } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductSearchSelect } from "@/components/product-search";
import { toast } from "sonner";
import {
  Plus,
  Minus,
  Trash2,
  Printer,
  ArrowLeft,
  RefreshCw,
  ShoppingCart,
  UserCheck,
  FileText,
  Eye,
  Edit3,
  Sparkles,
  Share2,
  FileDown,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { getBusinessSettingsFn } from "@/lib/rpc-admin";
import { createSaleFn } from "@/lib/rpc";
import { safeUUID } from "@/lib/utils";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";

type InvoiceItem = {
  product: Product;
  qty: number;
  sellPrice: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified Pixel-Perfect Thermal POS Receipt Document View
// ─────────────────────────────────────────────────────────────────────────────
interface InvoiceDocumentViewProps {
  businessName: string;
  userEmail: string;
  tagline: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerPhone: string;
  items: InvoiceItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  paidAmount: number;
  due: number;
  changeAmount: number;
  paymentStatus: string;
  colorClasses: any;
  biz: any;
  t: (key: any) => string;
  isPrintOnly?: boolean;
}

function InvoiceDocumentView({
  businessName,
  userEmail,
  tagline,
  invoiceNo,
  invoiceDate,
  customerName,
  customerPhone,
  items,
  subtotal,
  discountAmount,
  total,
  paidAmount,
  due,
  changeAmount,
  paymentStatus,
  colorClasses,
  biz,
  t,
  isPrintOnly = false,
}: InvoiceDocumentViewProps) {
  const rawScale = biz?.invoice_scale || "100%";
  const numScale = parseInt(rawScale.replace(/[^0-9]/g, ""), 10) || 100;
  const scaleRatio = numScale / 100;

  return (
    <div
      style={{
        transform: scaleRatio !== 1 ? `scale(${scaleRatio})` : undefined,
        transformOrigin: "top center",
      }}
      className={`invoice-print-container bg-white text-black font-sans text-xs relative overflow-hidden flex flex-col justify-between transition-all ${
        isPrintOnly
          ? "p-0 pb-12 border-none shadow-none rounded-none w-full"
          : "p-5 sm:p-6 pb-10 sm:pb-14 rounded-2xl border border-zinc-200/80 shadow-lg w-full max-w-[360px] sm:max-w-[380px] mx-auto"
      }`}
    >
      {/* Background Watermark */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none z-0">
        <span className="text-black/[0.08] font-black text-3xl sm:text-4xl uppercase tracking-widest rotate-[-25deg] border-2 border-black/[0.08] py-1.5 px-4 rounded-xl whitespace-nowrap">
          {paymentStatus === "DUE" ? "PAID BY: CREDIT" : "PAID BY: CASH"}
        </span>
      </div>

      <div className="space-y-3 relative z-10">
        {/* Header - Centered */}
        <div className="text-center space-y-0.5">
          <h1 className="text-lg font-black uppercase tracking-wide text-black">
            {businessName}
          </h1>
          {tagline && <p className="text-[11px] font-medium text-black">{tagline}</p>}
          {biz?.address && (
            <p className="text-[11px] text-black leading-tight">
              {biz.address}
            </p>
          )}
          {biz?.phone_numbers && (
            <p className="text-[11px] font-mono font-semibold text-black">
              Phone: {biz.phone_numbers}
            </p>
          )}
          {(biz?.emails || userEmail) && (
            <p className="text-[10px] text-zinc-700">{biz?.emails || userEmail}</p>
          )}
        </div>

        {/* Dashed Separator */}
        <div className="border-t border-dashed border-black my-1.5" />

        {/* Invoice Meta Section */}
        <div className="text-[11px] leading-snug space-y-0.5 text-black">
          <div className="flex justify-end">
            <span className="font-mono text-[10.5px]">{invoiceDate}</span>
          </div>
          {customerName && (
            <div className="flex justify-between items-baseline gap-1.5 whitespace-nowrap overflow-hidden pt-0.5">
              <span className="truncate whitespace-nowrap">Customer: <strong>{customerName}</strong></span>
              <span className="font-mono shrink-0 whitespace-nowrap">{customerPhone}</span>
            </div>
          )}
        </div>

        {/* Dashed Separator */}
        <div className="border-t border-dashed border-black my-1.5" />

        {/* Items Table */}
        <table className="w-full text-left border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="py-1 text-left font-bold uppercase text-[10px]">Item</th>
              <th className="py-1 text-center font-bold uppercase text-[10px] w-8">Qty</th>
              <th className="py-1 text-right font-bold uppercase text-[10px] w-16">Price</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-zinc-500 italic text-[11px]">
                  No items added yet.
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={`${item.product.id}-${index}`} className="border-b border-dotted border-zinc-300">
                  <td className="py-1.5 pr-1 font-semibold text-black break-words leading-tight" style={{ wordBreak: "normal", overflowWrap: "break-word" }}>
                    {item.product.name}
                  </td>
                  <td className="py-1.5 px-1 text-center font-mono font-medium text-black">
                    {item.qty}
                  </td>
                  <td className="py-1.5 text-right font-mono font-bold text-black">
                    ৳{(item.qty * item.sellPrice).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Dashed Separator */}
        <div className="border-t border-dashed border-black my-1.5" />

        {/* Totals Section */}
        <div className="space-y-1 text-[11px] text-black">
          <div className="flex justify-between font-bold">
            <span>Subtotal</span>
            <span className="font-mono">৳{subtotal.toLocaleString()}</span>
          </div>

          {discountAmount > 0 && (
            <div className="flex justify-between text-black">
              <span>Discount</span>
              <span className="font-mono">-৳{discountAmount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between font-medium pt-1">
            <span>Cash Received</span>
            <span className="font-mono font-semibold">৳{paidAmount.toLocaleString()}</span>
          </div>

          {due > 0 && (
            <div className="flex justify-between font-bold">
              <span>Due Amount</span>
              <span className="font-mono">৳{due.toLocaleString()}</span>
            </div>
          )}

          {changeAmount > 0 && (
            <div className="flex justify-between">
              <span>Change Return</span>
              <span className="font-mono font-semibold">৳{changeAmount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between text-[10px] pt-1">
            <span>Paid By:</span>
            <span className="font-bold uppercase">{paymentStatus === "DUE" ? "Credit" : "Cash"}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2.5 border-t border-dashed border-black text-center text-black space-y-1 mt-3 relative z-10">
        {biz?.invoice_terms ? (
          <p className="text-xs font-bold whitespace-pre-line leading-snug text-black">
            {biz.invoice_terms}
          </p>
        ) : (
          <div>
            <p className="font-black text-xs uppercase tracking-wider">Thank You!</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function InvoicePage() {
  const { lang, t } = useT();
  const { user } = useAuth();

  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: parties = [] } = useCachedQuery(["parties"], getParties);

  // Form State
  const [selectedPartyId, setSelectedPartyId] = useState<string>("walk-in");
  const [customName, setCustomName] = useState("");
  const [customPhone, setCustomPhone] = useState("");

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);

  // Draft product selector state
  const [draftProduct, setDraftProduct] = useState<string>("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftPrice, setDraftPrice] = useState("");

  const [discount, setDiscount] = useState("0");
  const [paid, setPaid] = useState("");

  // Mobile View Toggle ("editor" vs "preview")
  const [mobileTab, setMobileTab] = useState<"editor" | "preview">("editor");

  // Fetch Business Branding & Settings
  const settingsQuery = useQuery({
    queryKey: ["business-settings"],
    queryFn: getBusinessSettingsFn,
  });
  const biz = settingsQuery.data?.business;

  // Auto-fill sell price when selecting a product
  function handleProductChange(prodId: string) {
    setDraftProduct(prodId);
    const p = products.find((x) => x.id === prodId);
    if (p) {
      setDraftPrice(String(p.sell_price || ""));
    }
  }

  function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!draftProduct) return toast.error(t("select_product"));

    const p = products.find((x) => x.id === draftProduct);
    if (!p) return;

    const qty = Number(draftQty) || 0;
    if (qty <= 0) return toast.error(t("qty") + " > 0");

    const price = Number(draftPrice) || 0;
    if (price <= 0) return toast.error(t("sell_price") + " > 0");

    const existingIndex = invoiceItems.findIndex((item) => item.product.id === p.id);
    if (existingIndex > -1) {
      setInvoiceItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, qty: item.qty + qty, sellPrice: price } : item
        )
      );
    } else {
      setInvoiceItems((prev) => [...prev, { product: p, qty, sellPrice: price }]);
    }

    toast.success(t("item_added"));
    setDraftProduct("");
    setDraftQty("1");
    setDraftPrice("");
  }

  function handleUpdateQty(productId: string, delta: number) {
    setInvoiceItems((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as InvoiceItem[]
    );
  }

  function handleUpdatePrice(productId: string, newPriceStr: string) {
    const newPrice = Number(newPriceStr) || 0;
    setInvoiceItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, sellPrice: newPrice } : item
      )
    );
  }

  function handleRemoveItem(productId: string) {
    setInvoiceItems((prev) => prev.filter((item) => item.product.id !== productId));
  }

  // Calculations
  const subtotal = invoiceItems.reduce((acc, item) => acc + item.qty * item.sellPrice, 0);
  const discountAmount = Math.min(Number(discount) || 0, subtotal);
  const total = Math.max(subtotal - discountAmount, 0);
  const paidAmount = Number(paid) || 0;
  const due = Math.max(total - paidAmount, 0);
  const changeAmount = Math.max(paidAmount - total, 0);

  const paymentStatus = useMemo(() => {
    if (total <= 0) return "PAID";
    if (paidAmount >= total) return "PAID";
    if (paidAmount === 0) return "DUE";
    return "PARTIAL";
  }, [total, paidAmount]);

  // Color Theme styling
  const colorTheme = biz?.invoice_color || "black";
  const colorClasses = useMemo(() => {
    switch (colorTheme) {
      case "emerald":
        return {
          text: "text-emerald-700 dark:text-emerald-400",
          border: "border-emerald-500",
          bg: "bg-emerald-50/70 dark:bg-emerald-950/30",
          headerBg: "bg-emerald-100/70 dark:bg-emerald-900/40",
          accentText: "text-emerald-800 dark:text-emerald-300",
          borderLight: "border-emerald-200/60 dark:border-emerald-800/40",
        };
      case "indigo":
        return {
          text: "text-indigo-700 dark:text-indigo-400",
          border: "border-indigo-500",
          bg: "bg-indigo-50/70 dark:bg-indigo-950/30",
          headerBg: "bg-indigo-100/70 dark:bg-indigo-900/40",
          accentText: "text-indigo-800 dark:text-indigo-300",
          borderLight: "border-indigo-200/60 dark:border-indigo-800/40",
        };
      case "rose":
        return {
          text: "text-rose-700 dark:text-rose-400",
          border: "border-rose-500",
          bg: "bg-rose-50/70 dark:bg-rose-950/30",
          headerBg: "bg-rose-100/70 dark:bg-rose-900/40",
          accentText: "text-rose-800 dark:text-rose-300",
          borderLight: "border-rose-200/60 dark:border-rose-800/40",
        };
      default:
        return {
          text: "text-zinc-800 dark:text-zinc-200",
          border: "border-zinc-400 dark:border-zinc-600",
          bg: "bg-zinc-50 dark:bg-zinc-900/40",
          headerBg: "bg-zinc-100 dark:bg-zinc-800/60",
          accentText: "text-zinc-900 dark:text-zinc-100",
          borderLight: "border-zinc-200 dark:border-zinc-700",
        };
    }
  }, [colorTheme]);

  const activeCustomerName = useMemo(() => {
    if (selectedPartyId === "walk-in") return customName.trim() || t("walk_in_customer");
    const p = parties.find((x) => x.id === selectedPartyId);
    return p ? p.name : t("walk_in_customer");
  }, [selectedPartyId, customName, parties, t]);

  const activeCustomerPhone = useMemo(() => {
    if (selectedPartyId === "walk-in") return customPhone.trim() || "—";
    const p = parties.find((x) => x.id === selectedPartyId);
    return p ? p.phone || "—" : "—";
  }, [selectedPartyId, customPhone, parties]);

  const invoiceNo = useMemo(() => {
    return `INV-${Date.now().toString().slice(-6)}`;
  }, [invoiceItems.length === 0]);

  const businessName = user?.business_name || "HakimQzz";
  const userEmail = user?.email || "";
  const tagline = t("tagline") || "Quality Products & Service";
  const invoiceDate = fmtDateTime(new Date().toISOString());

  async function handlePrint() {
    if (invoiceItems.length === 0) return toast.error(t("no_items_in_cart"));

    // Save sales record to database for all items in the invoice
    try {
      const cartId = safeUUID();
      const duePerItem = due > 0 ? due / invoiceItems.length : 0;
      const paidPerItem = due > 0 ? paidAmount / invoiceItems.length : 0;

      for (const item of invoiceItems) {
        const lineSell = item.sellPrice * item.qty;
        const buyPrice = item.product.buy_price || 0;
        const profit = (item.sellPrice - buyPrice) * item.qty;

        await createSaleFn({
          data: {
            product_id: item.product.id || null,
            product_name: item.product.name,
            qty: item.qty,
            buy_price: buyPrice,
            sell_price: item.sellPrice,
            profit,
            type: due > 0 ? "credit" : "cash",
            party_id: selectedPartyId !== "walk-in" ? selectedPartyId : null,
            paid_amount: due > 0 ? paidPerItem : lineSell,
            due_amount: due > 0 ? duePerItem : 0,
            cart_id: cartId,
          },
        });
      }
      toast.success(t("record_sale"));
    } catch (err) {
      console.warn("Failed to automatically persist sale record:", err);
    }

    try {
      printPwaInvoice({
        businessName,
        userEmail: biz?.emails || user?.business_emails || userEmail,
        shopAddress: biz?.address || user?.business_address || "",
        shopPhoneNumbers: biz?.phone_numbers || user?.business_phone_numbers || "",
        pageSize: biz?.invoice_page_size || user?.invoice_page_size || "80mm",
        pageWidth: biz?.invoice_page_width || user?.invoice_page_width || "",
        pageHeight: biz?.invoice_page_height || user?.invoice_page_height || "",
        invoiceFontSize: biz?.invoice_font_size || user?.invoice_font_size || "16px",
        invoiceScale: biz?.invoice_scale || user?.invoice_scale || "100%",
        invoiceLineSpacing: biz?.invoice_line_spacing || user?.invoice_line_spacing || "3px",
        tagline,
        invoiceNo,
        invoiceDate,
        customerName: activeCustomerName,
        customerPhone: activeCustomerPhone,
        items: invoiceItems,
        subtotal,
        discountAmount,
        total,
        paidAmount,
        due,
        changeAmount,
        paymentStatus,
        colorTheme,
        terms: biz?.invoice_terms || "",
      });
      toast.success(lang === "bn" ? "ইনভয়েস প্রিন্ট প্রস্তুত হচ্ছে!" : "Opening invoice print view!");
    } catch (err: any) {
      toast.error(lang === "bn" ? "প্রিন্ট সমস্যা: " + (err?.message || "") : "Failed to open print: " + (err?.message || ""));
    }
  }

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Standalone Clean PDF File Download (Zero Web-Preview)
  async function handleDownloadPdf() {
    if (invoiceItems.length === 0) return toast.error(t("no_items_in_cart"));
    setIsDownloadingPdf(true);
    try {
      await downloadPwaInvoicePdf({
        businessName,
        userEmail: biz?.emails || user?.business_emails || userEmail,
        shopAddress: biz?.address || user?.business_address || "",
        shopPhoneNumbers: biz?.phone_numbers || user?.business_phone_numbers || "",
        pageSize: biz?.invoice_page_size || user?.invoice_page_size || "80mm",
        tagline,
        invoiceNo,
        invoiceDate,
        customerName: activeCustomerName,
        customerPhone: activeCustomerPhone,
        items: invoiceItems,
        subtotal,
        discountAmount,
        total,
        paidAmount,
        due,
        changeAmount,
        paymentStatus,
        colorTheme,
        terms: biz?.invoice_terms || "",
      }, false);
      toast.success(lang === "bn" ? "ইনভয়েস PDF সফলভাবে ডাউনলোড হয়েছে!" : "Invoice PDF downloaded successfully!");
    } catch (err: any) {
      toast.error(lang === "bn" ? "PDF ডাউনলোড ত্রুটি: " + (err?.message || "") : "Failed to download PDF: " + (err?.message || ""));
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  // Web Share / Mobile PWA Share
  async function handleShareInvoice() {
    if (invoiceItems.length === 0) return toast.error(t("no_items_in_cart"));
    const textSummary = `Invoice #${invoiceNo}\nCustomer: ${activeCustomerName}\nTotal Payable: ৳${total.toLocaleString()}\nPaid: ৳${paidAmount.toLocaleString()}\nStatus: ${paymentStatus}`;

    if (navigator?.share) {
      try {
        await navigator.share({
          title: `Invoice #${invoiceNo} - ${businessName}`,
          text: textSummary,
        });
        toast.success("Invoice details shared!");
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(textSummary);
        toast.success("Invoice summary copied to clipboard!");
      } catch (_) {
        toast.error("Share not supported on this browser.");
      }
    }
  }

  function handleReset() {
    setInvoiceItems([]);
    setSelectedPartyId("walk-in");
    setCustomName("");
    setCustomPhone("");
    setDiscount("0");
    setPaid("");
    setDraftProduct("");
    setDraftQty("1");
    setDraftPrice("");
    toast.success(t("clear"));
  }

  function handleFullPay() {
    setPaid(String(total));
  }

  return (
    <div className="space-y-4 pb-8 max-w-7xl mx-auto">
      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* Top Header & Actions Toolbar (Non-Printable)                           */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print bg-card p-3.5 rounded-xl border border-border/80 shadow-xs">
        <div className="flex items-center gap-2">
          <Link href="/more">
            <Button variant="ghost" size="sm" className="h-8 px-2.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4 mr-1" />
              {t("more")}
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div>
            <h1 className="font-semibold text-base flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              {t("invoice_generator")}
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Create & print clean single-page invoices
            </p>
          </div>
        </div>

        {/* Action Controls & Mobile Tab Switcher */}
        <div className="flex items-center justify-between sm:justify-end gap-2">
          {/* Mobile Tab Switcher */}
          <div className="flex sm:hidden rounded-lg bg-muted p-0.5 border border-border/60">
            <button
              type="button"
              onClick={() => setMobileTab("editor")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                mobileTab === "editor" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              <Edit3 className="size-3.5" /> Editor
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                mobileTab === "preview" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              <Eye className="size-3.5" /> Preview
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleReset} className="h-8 px-2.5 text-xs">
              <RefreshCw className="size-3.5 mr-1" />
              {t("clear")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleShareInvoice}
              disabled={invoiceItems.length === 0}
              className="h-8 px-2.5 text-xs hidden sm:inline-flex"
            >
              <Share2 className="size-3.5 mr-1" /> Share
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={invoiceItems.length === 0 || isDownloadingPdf}
              className="h-8 px-3 text-xs font-semibold bg-sky-500/10 hover:bg-sky-500/20 text-sky-800 dark:text-sky-300 border-sky-500/30 shadow-xs"
            >
              {isDownloadingPdf ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FileDown className="size-3.5 mr-1.5" />}
              {isDownloadingPdf ? (lang === "bn" ? "ডাউনলোড..." : "Downloading...") : (lang === "bn" ? "PDF ডাউনলোড" : "Download PDF")}
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              disabled={invoiceItems.length === 0}
              className="h-8 px-3.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              <Printer className="size-3.5 mr-1.5" />
              {t("print")}
            </Button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* Main Single Page Workspace Grid                                        */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 no-print items-start">
        {/* ── LEFT COLUMN: Input Form & Cart Controls ── */}
        <div
          className={`lg:col-span-6 xl:col-span-5 space-y-4 ${
            mobileTab === "preview" ? "hidden lg:block" : "block"
          }`}
        >
          {/* Section 1: Customer & Invoice Info */}
          <Card className="p-4 space-y-3.5 border-border/80 shadow-2xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-primary" />
                {t("customer_details")}
              </h2>
              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                {invoiceNo}
              </span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">{t("select_customer")}</Label>
                <Select value={selectedPartyId} onValueChange={setSelectedPartyId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t("walk_in_customer")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk-in">{t("walk_in_customer")}</SelectItem>
                    {parties
                      .filter((p) => !p.archived)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.phone || "No phone"})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPartyId === "walk-in" ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t("full_name")}</Label>
                    <Input
                      placeholder={t("walk_in_customer")}
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      className="h-8.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{t("phone")}</Label>
                    <Input
                      type="tel"
                      placeholder="017..."
                      value={customPhone}
                      onChange={(e) => setCustomPhone(e.target.value)}
                      className="h-8.5 text-xs"
                      inputMode="tel"
                      pattern="[0-9]*"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-lg bg-muted/40 text-xs space-y-1 border border-border/40">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("party_name")}:</span>
                    <span className="font-medium text-foreground">{activeCustomerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("phone")}:</span>
                    <span className="font-mono text-foreground">{activeCustomerPhone}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Section 2: Add Product to Invoice */}
          <Card className="p-4 space-y-3 border-border/80 shadow-2xs">
            <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShoppingCart className="size-3.5 text-primary" />
              {t("add_item")}
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draftProduct) {
                  handleAddItem(e);
                } else if (invoiceItems.length > 0) {
                  handlePrint();
                }
              }}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">{t("select_product")}</Label>
                <ProductSearchSelect
                  products={products.filter((p) => !p.archived && p.stock > 0)}
                  value={draftProduct}
                  onChange={handleProductChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{t("qty")}</Label>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8.5 rounded-r-none border-r-0 shrink-0"
                      onClick={() => setDraftQty((q) => String(Math.max(1, (Number(q) || 1) - 1)))}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={draftQty}
                      onChange={(e) => setDraftQty(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (draftProduct) handleAddItem(e);
                          else if (invoiceItems.length > 0) handlePrint();
                        }
                      }}
                      className="h-8.5 text-xs text-center rounded-none font-mono"
                      inputMode="numeric"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-8.5 rounded-l-none border-l-0 shrink-0"
                      onClick={() => setDraftQty((q) => String((Number(q) || 0) + 1))}
                    >
                      <Plus className="size-3" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{t("sell_price")} (৳)</Label>
                  <Input
                    type="number"
                    value={draftPrice}
                    onChange={(e) => setDraftPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (draftProduct) handleAddItem(e);
                        else if (invoiceItems.length > 0) handlePrint();
                      }
                    }}
                    className="h-8.5 text-xs font-mono"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>

              <Button type="submit" size="sm" className="w-full h-8.5 text-xs font-medium">
                <Plus className="size-3.5 mr-1" />
                {t("add_item")}
              </Button>
            </form>
          </Card>

          {/* Section 3: Cart Item List Table */}
          <Card className="p-4 space-y-3 border-border/80 shadow-2xs">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                {t("cart")} ({invoiceItems.length})
              </h2>
              {invoiceItems.length > 0 && (
                <span className="text-xs font-semibold text-primary">
                  Total: {fmtMoney(subtotal)}
                </span>
              )}
            </div>

            {invoiceItems.length === 0 ? (
              <div className="text-center py-8 px-4 rounded-lg border border-dashed border-border/80 bg-muted/20">
                <ShoppingCart className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground font-medium">{t("no_items_in_cart")}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Select a product above to build your invoice</p>
              </div>
            ) : (
              <div className="divide-y divide-border border rounded-lg overflow-hidden text-xs bg-card">
                {invoiceItems.map((item) => (
                  <div key={item.product.id} className="p-2.5 flex items-center justify-between gap-2 hover:bg-muted/20 transition-colors">
                    {/* Item Details */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{item.product.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                        <span>৳</span>
                        <input
                          type="number"
                          value={item.sellPrice}
                          onChange={(e) => handleUpdatePrice(item.product.id, e.target.value)}
                          className="w-16 h-5 px-1 py-0 border rounded text-xs font-mono bg-background text-foreground"
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    {/* Inline Qty Controls */}
                    <div className="flex items-center border rounded-md overflow-hidden bg-background">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.product.id, -1)}
                        className="px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Minus className="size-3" />
                      </button>
                      <span className="px-2 font-mono font-semibold text-xs min-w-[20px] text-center">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.product.id, 1)}
                        className="px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Plus className="size-3" />
                      </button>
                    </div>

                    {/* Item Total & Delete */}
                    <div className="text-right pl-1 min-w-[65px]">
                      <div className="font-semibold text-foreground font-mono">{fmtMoney(item.qty * item.sellPrice)}</div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => handleRemoveItem(item.product.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Section 4: Payments & Discounts */}
          {invoiceItems.length > 0 && (
            <Card className="p-4 space-y-3 border-border/80 shadow-2xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{t("discount")} (৳)</Label>
                  <Input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    className="h-8.5 text-xs font-mono"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <Label className="text-[11px] text-muted-foreground">{t("paid_amount")} (৳)</Label>
                    <button
                      type="button"
                      onClick={handleFullPay}
                      className="text-[10px] text-primary hover:underline font-medium flex items-center gap-0.5"
                    >
                      <Sparkles className="size-2.5" /> Full Pay
                    </button>
                  </div>
                  <Input
                    type="number"
                    value={paid}
                    onChange={(e) => setPaid(e.target.value)}
                    className="h-8.5 text-xs font-mono"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Financial Calculation Summary */}
              <div className="bg-muted/30 p-3 rounded-lg text-xs space-y-1.5 border border-border/60 font-medium">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("subtotal")}</span>
                  <span className="font-mono">{fmtMoney(subtotal)}</span>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between text-rose-500">
                    <span>{t("discount")}</span>
                    <span className="font-mono">-{fmtMoney(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-bold border-t border-border/80 pt-1.5 text-foreground">
                  <span>{t("payable_amount")}</span>
                  <span className="font-mono text-primary">{fmtMoney(total)}</span>
                </div>

                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>{t("paid_amount")}</span>
                  <span className="font-mono">{fmtMoney(paidAmount)}</span>
                </div>

                {due > 0 && (
                  <div className="flex justify-between text-rose-600 dark:text-rose-400 border-t border-dashed border-rose-200 dark:border-rose-900/60 pt-1">
                    <span>{t("due_amount")}</span>
                    <span className="font-mono font-bold">{fmtMoney(due)}</span>
                  </div>
                )}

                {changeAmount > 0 && (
                  <div className="flex justify-between text-sky-600 dark:text-sky-400 border-t border-dashed border-sky-200 dark:border-sky-900/60 pt-1">
                    <span>Change Return</span>
                    <span className="font-mono font-bold">{fmtMoney(changeAmount)}</span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* ── RIGHT COLUMN: PC Live Document Preview (Identical to Print View) ── */}
        <div
          className={`lg:col-span-6 xl:col-span-7 ${
            mobileTab === "editor" ? "hidden lg:block" : "block"
          }`}
        >
          <div className="sticky top-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Eye className="size-3.5 text-primary" /> Live Document Preview
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                  paymentStatus === "PAID"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
                    : paymentStatus === "DUE"
                    ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800"
                    : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
                }`}
              >
                {paymentStatus}
              </span>
            </div>

            {/* Pixel-Perfect Unified Document Component */}
            <InvoiceDocumentView
              businessName={businessName}
              userEmail={userEmail}
              tagline={tagline}
              invoiceNo={invoiceNo}
              invoiceDate={invoiceDate}
              customerName={activeCustomerName}
              customerPhone={activeCustomerPhone}
              items={invoiceItems}
              subtotal={subtotal}
              discountAmount={discountAmount}
              total={total}
              paidAmount={paidAmount}
              due={due}
              changeAmount={changeAmount}
              paymentStatus={paymentStatus}
              colorClasses={colorClasses}
              biz={biz}
              t={t}
            />
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────── */}
      {/* Hidden Pure Printable Layout for Window Print / PDF Output            */}
      {/* ────────────────────────────────────────────────────────────────────── */}
      <div className="hidden print:block invoice-print-page w-full bg-white text-black p-4 font-sans text-xs">
        <InvoiceDocumentView
          businessName={businessName}
          userEmail={userEmail}
          tagline={tagline}
          invoiceNo={invoiceNo}
          invoiceDate={invoiceDate}
          customerName={activeCustomerName}
          customerPhone={activeCustomerPhone}
          items={invoiceItems}
          subtotal={subtotal}
          discountAmount={discountAmount}
          total={total}
          paidAmount={paidAmount}
          due={due}
          changeAmount={changeAmount}
          paymentStatus={paymentStatus}
          colorClasses={colorClasses}
          biz={biz}
          t={t}
          isPrintOnly
        />
      </div>
    </div>
  );
}
