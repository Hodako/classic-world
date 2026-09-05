"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductSearchSelect } from "@/components/product-search";
import { CustomerSearchSelect } from "@/components/customer-search";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { getCustomers, getProducts, type Product } from "@/lib/queries";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { createSaleFn, createCustomerFn } from "@/lib/rpc";
import { Plus, Minus, Trash2, Scan, Printer, History, Banknote, Smartphone, CreditCard, DollarSign, ShoppingCart, Truck, PackageCheck, Share2, Split, ChevronDown, ChevronUp, RotateCcw, CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import { safeUUID } from "@/lib/utils";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";
import { playTapSound, playScanSuccessSound, playSaleSuccessSound, playErrorSound } from "@/lib/audio";
import { getWhatsAppInvoiceUrl } from "@/lib/whatsapp-helper";

type CartLine = { productId: string; qty: string; sellPrice: string; discount: string };
export type SalePaymentType = "cash" | "bkash" | "bank" | "credit" | "online" | "split";

function BkashLogo({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      viewBox="-6.6741 -11.07275 57.8422 66.4365"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g fill="none">
        <path
          fill="#DF146E"
          d="M42.31 44.291H2.182C.981 44.291 0 43.308 0 42.107V2.186C0 .982.981 0 2.182 0H42.31c1.203 0 2.184.982 2.184 2.186v39.921c0 1.201-.981 2.184-2.184 2.184"
        />
        <path
          fill="#FFF"
          d="M31.894 24.251l-14.107-2.246 1.909 8.329zm.572-.682L21.374 8.16l-3.623 13.106zm-15.402-2.482L5.441 6.239l15.221 1.819zm-5.639-6.154l-6.449-6.08h1.695zm24.504 1.15L33.2 23.486l-4.426-6.118zM21.417 30.232l10.71-4.3.454-1.365zm-8.933 7.821l4.589-16.102 2.326 10.479zm24.099-21.914l-1.128 3.056 4.059-.07z"
        />
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sale Dialog Component
// ─────────────────────────────────────────────────────────────────────────────
export function SaleDialog({
  open, onOpenChange, presetType, presetProductId, presetCart,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  presetType?: SalePaymentType; presetProductId?: string;
  presetCart?: { productId: string; qty: string; sellPrice: string; discount?: string }[];
}) {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [type, setType] = useState<SalePaymentType>(presetType ?? "cash");
  const [partyId, setPartyId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<CartLine>({ productId: "", qty: "1", sellPrice: "", discount: "" });
  const [paid, setPaid] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitBkash, setSplitBkash] = useState("");
  const [splitBank, setSplitBank] = useState("");
  const [mobileSplitOpen, setMobileSplitOpen] = useState(true);
  const [courierName, setCourierName] = useState("Steadfast Courier");
  const [trackingCode, setTrackingCode] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: customers = [] } = useCachedQuery(["customers"], getCustomers);

  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [addingCust, setAddingCust] = useState(false);

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    const name = newCustName.trim();
    if (!name) return;
    const phone = newCustPhone.trim() || null;
    const address = newCustAddress.trim() || null;
    setAddingCust(true);
    try {
      const saved = await createCustomerFn({ data: { name, phone, address } });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setPartyId(saved.id);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setAddCustomerOpen(false);
      toast.success(lang === "bn" ? `${name} কে কাস্টমার হিসেবে যোগ করা হয়েছে` : `Added customer ${name}`);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setAddingCust(false);
    }
  }

  const handleBarcodeScan = (scannedCode: string) => {
    const clean = String(scannedCode || "").trim().toLowerCase();
    const prod = products.find(p => {
      const pBarcode = (p.barcode || "").trim().toLowerCase();
      const pQr = ((p as any).qr_code || "").trim().toLowerCase();
      const pCode = ((p as any).code || "").trim().toLowerCase();
      const pSku = ((p as any).sku || "").trim().toLowerCase();
      const pNum = ((p as any).product_number || "").trim().toLowerCase();
      const pId = String(p.id || "").trim().toLowerCase();
      const pName = (p.name || "").trim().toLowerCase();

      return (
        (pBarcode && (pBarcode === clean || clean.includes(pBarcode))) ||
        (pQr && (pQr === clean || clean.includes(pQr))) ||
        (pCode && (pCode === clean || clean.includes(pCode))) ||
        (pSku && (pSku === clean || clean.includes(pSku))) ||
        (pNum && (pNum === clean || clean.includes(pNum))) ||
        (pId && (pId === clean || clean.includes(pId))) ||
        (pName && pName === clean)
      );
    });
    if (!prod) {
      toast.error(lang === "bn" ? `বারকোড/QR কোড (${scannedCode}) দ্বারা পণ্য পাওয়া যায়নি` : `No product found for Barcode/QR: ${scannedCode}`);
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(item => item.productId === prod.id);
      if (idx !== -1) {
        const updated = [...prev];
        const existingQty = Number(updated[idx].qty) || 0;
        updated[idx] = { ...updated[idx], qty: String(existingQty + 1) };
        return updated;
      } else {
        return [...prev, {
          productId: prod.id,
          qty: "1",
          sellPrice: String(prod.sell_price || ""),
          discount: ""
        }];
      }
    });

    toast.success(lang === "bn" ? `কার্টে যুক্ত: ${prod.name}` : `Added to cart: ${prod.name}`);
  };

  useEffect(() => {
    if (open) {
      setType(presetType ?? "cash");
      setPartyId("");
      setPaid("");
      setSplitCash("");
      setSplitBkash("");
      setSplitBank("");
      if (presetCart && presetCart.length > 0) {
        setCart(presetCart.map(x => ({ ...x, discount: x.discount ?? "" })));
      } else if (presetProductId) {
        const p = products.find(x => x.id === presetProductId);
        setCart([{ productId: presetProductId, qty: "1", sellPrice: p ? String(p.sell_price || "") : "", discount: "" }]);
      } else {
        setCart([]);
      }
      setDraft({ productId: "", qty: "1", sellPrice: "", discount: "" });
    }
  }, [open, presetType, presetProductId, presetCart, products]);

  useEffect(() => {
    if (!open) return;

    let scanBuffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 120) {
        scanBuffer = "";
      }
      lastKeyTime = currentTime;

      if (e.key === "Enter") {
        if (scanBuffer.length >= 3) {
          e.preventDefault();
          handleBarcodeScan(scanBuffer);
          scanBuffer = "";
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, products]);

  function lineTotal(line: CartLine) {
    const p = products.find(x => x.id === line.productId);
    if (!p) return 0;
    const sell = Number(line.sellPrice) || p.sell_price || 0;
    const disc = Number(line.discount) || 0;
    const finalPrice = Math.max(sell - disc, 0);
    return finalPrice * (Number(line.qty) || 0);
  }

  const sellTotal = cart.reduce((a, l) => a + lineTotal(l), 0);
  const profitTotal = cart.reduce((a, l) => {
    const p = products.find(x => x.id === l.productId);
    const sell = Number(l.sellPrice) || (p ? p.sell_price : 0) || 0;
    const disc = Number(l.discount) || 0;
    const finalPrice = Math.max(sell - disc, 0);
    const qty = Number(l.qty) || 1;
    const buy = Number(p?.buy_price) || 0;
    return a + (finalPrice - buy) * qty;
  }, 0);

  const isFullPaid = type === "cash" || type === "bkash" || type === "bank";
  const splitCashNum = Math.max(0, Number(splitCash) || 0);
  const splitBkashNum = Math.max(0, Number(splitBkash) || 0);
  const splitBankNum = Math.max(0, Number(splitBank) || 0);
  const totalSplitPaid = splitCashNum + splitBkashNum + splitBankNum;

  const paidNum = type === "split"
    ? totalSplitPaid
    : (type === "online" ? 0 : (isFullPaid ? sellTotal : Number(paid) || 0));

  const due = Math.max(sellTotal - paidNum, 0);

  function addToCart() {
    if (!draft.productId) {
      playErrorSound();
      return toast.error(t("select_product"));
    }
    const p = products.find(x => x.id === draft.productId);
    const qty = Number(draft.qty) || 1;
    if (qty <= 0) {
      playErrorSound();
      return toast.error(t("qty") + " > 0");
    }
    const sell = Number(draft.sellPrice) || (p ? p.sell_price : 0);
    if (!sell || sell <= 0) {
      playErrorSound();
      return toast.error(t("sell_price") + " " + t("required"));
    }
    const disc = Number(draft.discount) || 0;
    if (disc < 0) {
      playErrorSound();
      return toast.error(lang === "bn" ? "ডিসকাউন্ট নেতিবাচক হতে পারে না" : "Discount cannot be negative");
    }
    
    playScanSuccessSound();
    setCart(prev => {
      const idx = prev.findIndex(item => item.productId === draft.productId);
      if (idx !== -1) {
        const next = [...prev];
        const prevQty = Number(next[idx].qty) || 0;
        next[idx] = {
          ...next[idx],
          qty: String(prevQty + qty),
          sellPrice: String(sell),
          discount: String(disc),
        };
        return next;
      }
      return [...prev, { productId: draft.productId, qty: String(qty), sellPrice: String(sell), discount: String(disc) }];
    });

    toast.success(lang === "bn" ? `কার্টে যুক্ত: ${p?.name || ""}` : `Added to cart: ${p?.name || ""}`);
    setDraft({ productId: "", qty: "1", sellPrice: "", discount: "" });
  }

  useEffect(() => {
    if (!open) return;

    const handleDialogKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if (e.code === "Space" || e.key === " ") {
        const isTextInput = isInput && (target as HTMLInputElement).type === "text" && (target as HTMLInputElement).value.length > 0;
        if (!isTextInput && cart.length > 0 && !draft.productId && !busy) {
          e.preventDefault();
          submit(e as any, "print");
        }
      }

      if (e.key === "Enter") {
        if (draft.productId) {
          e.preventDefault();
          addToCart();
        }
        // Never auto-submit the whole order on Enter while interacting with product drafts
      }
    };

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => window.removeEventListener("keydown", handleDialogKeyDown);
  }, [open, draft.productId, cart, busy, type, partyId, paidNum, due]);

  async function submit(e: React.FormEvent, action: "print" | "download" | "none" = "none") {
    e.preventDefault();
    if (!user || cart.length === 0) {
      playErrorSound();
      return toast.error(t("select_product"));
    }
    if ((type === "credit" || (type === "split" && due > 0)) && !partyId) {
      playErrorSound();
      return toast.error(lang === "bn" ? "বকেয়া থাকার কারণে কাস্টমার নির্বাচন করা আবশ্যক" : "Customer is required when there is remaining due");
    }
    setBusy(true);
    try {
      const cartId = safeUUID();
      let remainingCash = splitCashNum;
      let remainingBkash = splitBkashNum;
      let remainingBank = splitBankNum;
      let remainingPaid = (type === "credit" || type === "split") ? paidNum : sellTotal;
      let remainingDue = (type === "credit" || type === "split") ? due : 0;

      for (let i = 0; i < cart.length; i++) {
        const line = cart[i];
        const product = products.find(p => p.id === line.productId);
        if (!product) {
          throw new Error(lang === "bn" ? "কার্টের একটি পণ্য ডাটাবেজে পাওয়া যায়নি!" : "A product in your cart could not be found!");
        }
        const qtyNum = Math.max(1, Number(line.qty) || 1);
        const rawSellPrice = Number(line.sellPrice) || product.sell_price || 0;
        const disc = Math.max(0, Number(line.discount) || 0);
        const finalUnitSell = Math.max(rawSellPrice - disc, 0);
        const lineSell = finalUnitSell * qtyNum;
        const lineProfit = (finalUnitSell - Number(product.buy_price || 0)) * qtyNum;

        // Proportional paid & due distribution
        let linePaid = 0;
        let lineDue = 0;
        let lineCash = 0;
        let lineBkash = 0;
        let lineBank = 0;

        if (type === "online") {
          linePaid = 0;
          lineDue = lineSell;
        } else if (type === "split") {
          if (i === cart.length - 1) {
            lineCash = Math.max(remainingCash, 0);
            lineBkash = Math.max(remainingBkash, 0);
            lineBank = Math.max(remainingBank, 0);
            linePaid = lineCash + lineBkash + lineBank;
            lineDue = Math.max(remainingDue, 0);
          } else {
            const ratio = sellTotal > 0 ? lineSell / sellTotal : 1 / cart.length;
            lineCash = Math.min(Math.round(splitCashNum * ratio), remainingCash);
            lineBkash = Math.min(Math.round(splitBkashNum * ratio), remainingBkash);
            lineBank = Math.min(Math.round(splitBankNum * ratio), remainingBank);
            linePaid = lineCash + lineBkash + lineBank;
            lineDue = Math.max(lineSell - linePaid, 0);
            remainingCash -= lineCash;
            remainingBkash -= lineBkash;
            remainingBank -= lineBank;
            remainingDue -= lineDue;
          }
        } else if (type === "credit") {
          if (i === cart.length - 1) {
            linePaid = Math.max(remainingPaid, 0);
            lineDue = Math.max(remainingDue, 0);
            lineCash = linePaid;
          } else {
            const ratio = sellTotal > 0 ? lineSell / sellTotal : 1 / cart.length;
            linePaid = Math.min(Math.round(paidNum * ratio), remainingPaid);
            lineDue = Math.max(lineSell - linePaid, 0);
            lineCash = linePaid;
            remainingPaid -= linePaid;
            remainingDue -= lineDue;
          }
        } else {
          linePaid = lineSell;
          lineDue = 0;
          if (type === "cash") lineCash = lineSell;
          else if (type === "bkash") lineBkash = lineSell;
          else if (type === "bank") lineBank = lineSell;
        }

        await createSaleFn({
          data: {
            product_id: product.id,
            product_name: product.name,
            qty: qtyNum,
            buy_price: Number(product.buy_price) || 0,
            sell_price: finalUnitSell,
            profit: lineProfit,
            type,
            party_id: partyId || null,
            paid_amount: linePaid,
            due_amount: lineDue,
            split_cash: lineCash,
            split_bkash: lineBkash,
            split_bank: lineBank,
            cart_id: cartId,
            discount: 0,
            courier_name: type === "online" ? courierName : undefined,
            tracking_code: type === "online" ? trackingCode : undefined,
            courier_status: type === "online" ? "pending" : undefined,
            note: customerAddress ? `Address: ${customerAddress}` : undefined,
          },
        });
      }

      await qc.invalidateQueries({ queryKey: ["sales"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["party-detail"] });
      await qc.invalidateQueries({ queryKey: ["cashbox"] });

      playSaleSuccessSound();

      let paymentModeStr = "CASH (নগদ)";
      if (type === "online") {
        paymentModeStr = `COURIER [${courierName}]`;
      } else if (type === "bkash") {
        paymentModeStr = "BKASH (বিকাশ)";
      } else if (type === "bank") {
        paymentModeStr = "BANK (ব্যাংক)";
      } else if (type === "credit") {
        paymentModeStr = due > 0 ? `CREDIT (বাকী) [জমা: ৳${paidNum}]` : "CASH (নগদ)";
      } else if (type === "split") {
        const parts: string[] = [];
        if (splitCashNum > 0) parts.push(`নগদ: ৳${splitCashNum}`);
        if (splitBkashNum > 0) parts.push(`বিকাশ: ৳${splitBkashNum}`);
        if (splitBankNum > 0) parts.push(`ব্যাংক: ৳${splitBankNum}`);
        if (due > 0) parts.push(`বাকী: ৳${due}`);
        paymentModeStr = `MIXED (${parts.join(" + ")})`;
      }

      const cust = customers.find(c => c.id === partyId);
      const waUrl = getWhatsAppInvoiceUrl({
        invoiceNo: `INV-${cartId.slice(-6).toUpperCase()}`,
        customerName: cust?.name || (lang === "bn" ? "সম্মানিত ক্রেতা" : "Valued Customer"),
        customerPhone: cust?.phone || "",
        shopName: user.business_name || user.full_name || "Dream Fashion",
        shopPhone: user.business_phone_numbers || "",
        items: cart.map(c => {
          const prod = products.find(p => p.id === c.productId);
          return {
            name: prod?.name || "Product",
            qty: Number(c.qty) || 1,
            price: Math.max((Number(c.sellPrice) || prod?.sell_price || 0) - (Number(c.discount) || 0), 0),
          };
        }),
        subtotal: sellTotal + cart.reduce((acc, c) => acc + ((Number(c.discount) || 0) * (Number(c.qty) || 1)), 0),
        discount: cart.reduce((acc, c) => acc + ((Number(c.discount) || 0) * (Number(c.qty) || 1)), 0),
        total: sellTotal,
        paidAmount: type === "online" ? 0 : paidNum,
        dueAmount: type === "online" ? sellTotal : due,
        paymentMethod: paymentModeStr,
      }, lang as any);

      toast.success(
        <div className="flex items-center justify-between gap-3 w-full">
          <span>{lang === "bn" ? "বিক্রয় সম্পন্ন হয়েছে!" : "Sale recorded successfully!"}</span>
          {cust?.phone && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold shrink-0 inline-flex items-center gap-1 shadow-sm transition-colors"
            >
              <Share2 className="size-3" /> WhatsApp
            </a>
          )}
        </div>,
        { duration: 6000 }
      );

      if (action === "print") {
        const invoiceParams = {
          businessName: user.business_name || user.full_name || "Dream Fashion POS",
          userEmail: user.business_emails || user.email || "",
          shopAddress: user.business_address || "",
          shopPhoneNumbers: user.business_phone_numbers || "",
          pageSize: user.invoice_page_size || "80mm",
          pageWidth: user.invoice_page_width || "",
          pageHeight: user.invoice_page_height || "",
          invoiceFontSize: user.invoice_font_size || "16px",
          invoiceScale: user.invoice_scale || "100%",
          invoiceLineSpacing: user.invoice_line_spacing || "3px",
          invoiceNo: `INV-${cartId.slice(-6).toUpperCase()}`,
          invoiceDate: fmtDateTime(new Date()),
          customerName: cust?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer"),
          customerPhone: cust?.phone || "",
          paymentMode: paymentModeStr,
          splitCash: type === "split" ? splitCashNum : (type === "cash" ? paidNum : undefined),
          splitBkash: type === "split" ? splitBkashNum : (type === "bkash" ? paidNum : undefined),
          splitBank: type === "split" ? splitBankNum : (type === "bank" ? paidNum : undefined),
          items: cart.map(c => {
            const prod = products.find(p => p.id === c.productId);
            return {
              product: { id: prod?.id, name: prod?.name || "Product" },
              qty: Number(c.qty) || 1,
              sellPrice: Math.max((Number(c.sellPrice) || prod?.sell_price || 0) - (Number(c.discount) || 0), 0),
            };
          }),
          subtotal: sellTotal + cart.reduce((acc, c) => acc + ((Number(c.discount) || 0) * (Number(c.qty) || 1)), 0),
          discountAmount: cart.reduce((acc, c) => acc + ((Number(c.discount) || 0) * (Number(c.qty) || 1)), 0),
          total: sellTotal,
          paidAmount: type === "online" ? 0 : paidNum,
          due: type === "online" ? sellTotal : due,
          terms: user.invoice_terms || "",
        };

        printPwaInvoice(invoiceParams);
        toast.success(lang === "bn" ? "ইনভয়েস প্রিন্ট প্রস্তুত হচ্ছে!" : "Opening invoice print view!");
      }

      onOpenChange(false);
    } catch (err: unknown) {
      playErrorSound();
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-20px)] sm:max-w-2xl md:max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden p-0 rounded-2xl border-border shadow-2xl">
          <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b border-border/80 bg-card flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                {presetType === "online" || type === "online" ? <Truck className="size-4" /> : <ShoppingCart className="size-4" />}
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {presetType === "online" || type === "online" ? (lang === "bn" ? "নতুন অনলাইন কুরিয়ার অর্ডার" : "New Online Courier Order") : t("new_sale")}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  {presetType === "online" || type === "online"
                    ? (lang === "bn" ? "কুরিয়ার ক্যাশ অন ডেলিভারি সেলস এন্ট্রি" : "Courier Cash on Delivery Order")
                    : (lang === "bn" ? "দ্রুত বিক্রয় ও ইনভয়েস জেনারেশন" : "Fast POS Checkout & Invoice Generation")}
                </p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 font-medium">
              <span><strong className="text-foreground">Enter</strong>: {lang === "bn" ? "কার্টে যোগ" : "Add to Cart"}</span>
              <span>·</span>
              <span><strong className="text-foreground">Space</strong>: {lang === "bn" ? "বিক্রি সম্পন্ন" : "Complete Sale"}</span>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <form
              id="sale-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.productId) {
                  addToCart();
                } else if (cart.length > 0) {
                  submit(e);
                }
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-4"
            >
              <div className="md:col-span-7 space-y-3.5">
                {/* Payment Method Selector or Courier Delivery Panel */}
                {presetType === "online" || type === "online" ? (
                  <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                        <Truck className="size-4 text-purple-600" />
                        {lang === "bn" ? "কুরিয়ার পেমেন্ট (Courier Payment)" : "Courier Payment"}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        ⏳ {lang === "bn" ? "পেমেন্ট অপেক্ষমাণ (Pending)" : "Payment: Pending"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {lang === "bn"
                        ? "কুরিয়ার পেমেন্ট পেন্ডিং থাকবে। কুরিয়ার টাকা রিসিভ করার পর সেলস পেজ থেকে 'পেমেন্ট গ্রহণ' করলে ক্যাশবক্সে জমা হবে।"
                        : "Online sale profit is recorded immediately. Payment will deposit into Cashbox upon courier collection approval."}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <Label className="text-[10.5px] font-semibold text-muted-foreground">{lang === "bn" ? "কুরিয়ার সার্ভিস" : "Courier Service"}</Label>
                        <select
                          value={courierName}
                          onChange={(e) => setCourierName(e.target.value)}
                          className="w-full h-8.5 text-xs rounded-lg border border-input bg-background px-2 font-medium"
                        >
                          <option value="Steadfast Courier">Steadfast Courier (স্টেডফাস্ট)</option>
                          <option value="Pathao Courier">Pathao Courier (পাঠাও)</option>
                          <option value="RedX Delivery">RedX Delivery (রেডএক্স)</option>
                          <option value="Sundarban Courier">Sundarban Courier (সুন্দরবন)</option>
                          <option value="Paperfly">Paperfly (পেপারফ্লাই)</option>
                          <option value="SA Paribahan">SA Paribahan (এস এ পরিবহন)</option>
                          <option value="Custom Courier">Other / অন্য কুরিয়ার</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10.5px] font-semibold text-muted-foreground">{lang === "bn" ? "ট্র্যাকিং কোড / ইনভয়েস" : "Tracking / Consignment ID"}</Label>
                        <Input
                          value={trackingCode}
                          onChange={(e) => setTrackingCode(e.target.value)}
                          placeholder="e.g. ST-93821"
                          className="h-8.5 text-xs font-mono"
                        >
                        </Input>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      {lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setType("cash")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "cash"
                            ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{lang === "bn" ? "নগদ" : "Cash"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setType("bkash")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "bkash"
                            ? "bg-[#E2136E]/15 border-[#E2136E] text-[#E2136E] dark:text-pink-300 shadow-xs ring-1 ring-[#E2136E]/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <BkashLogo className="size-4 shrink-0" />
                        <span>{lang === "bn" ? "বিকাশ" : "bKash"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setType("bank")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "bank"
                            ? "bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300 shadow-xs ring-1 ring-sky-500/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <DollarSign className="size-4 text-sky-600 dark:text-sky-400" />
                        <span>{lang === "bn" ? "ব্যাংক" : "Bank"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setType("credit")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "credit"
                            ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs ring-1 ring-amber-500/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <CreditCard className="size-4 text-amber-600 dark:text-amber-400" />
                        <span>{lang === "bn" ? "বাকী" : "Credit"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setType("split");
                          if (!splitCash && !splitBkash) {
                            const half = Math.round(sellTotal / 2);
                            setSplitCash(String(half));
                            setSplitBkash(String(sellTotal - half));
                            setSplitBank("0");
                          }
                        }}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "split"
                            ? "bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs ring-1 ring-purple-500/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <Split className="size-4 text-purple-600 dark:text-purple-400" />
                        <span>{lang === "bn" ? "মিক্সড / আংশিক" : "Split / Mixed"}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {lang === "bn" ? "কাস্টমার" : "Customer"} {(type === "credit" || (type === "split" && due > 0)) ? "*" : ""}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <CustomerSearchSelect customers={customers} value={partyId} onChange={setPartyId} />
                    </div>
                    {partyId && (
                      <Link href={`/customers/detail?id=${partyId}`} target="_blank">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-9 shrink-0 cursor-pointer text-primary hover:bg-primary/10 hover:border-primary/40"
                          title={lang === "bn" ? "কাস্টমারের ক্রয়ের ইতিহাস দেখুন" : "View Customer Buying History"}
                        >
                          <History className="size-4" />
                        </Button>
                      </Link>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0 cursor-pointer"
                      onClick={() => setAddCustomerOpen(true)}
                      title="Add Customer"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </div>

                <div className="border border-border/90 bg-card/60 rounded-xl p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Scan className="size-3.5 text-primary" />
                      {t("select_product")}
                    </Label>
                    <span className="text-[10px] text-muted-foreground font-mono">{lang === "bn" ? "ডিফল্ট পরিমাণ: ১" : "Default Qty: 1"}</span>
                  </div>

                  <ProductSearchSelect
                    products={products}
                    value={draft.productId}
                    onChange={v => {
                      const p = products.find(x => x.id === v);
                      setDraft(d => ({
                        ...d,
                        productId: v,
                        qty: d.qty || "1",
                        sellPrice: p && p.sell_price > 0 ? String(p.sell_price) : "",
                        discount: "",
                      }));
                    }}
                  />

                  <div className="grid grid-cols-3 gap-2">
                    <Field label={t("qty")}>
                      <Input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="1"
                        value={draft.qty}
                        onChange={e => setDraft(d => ({ ...d, qty: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (draft.productId) addToCart();
                          }
                        }}
                      />
                    </Field>
                    <Field label={t("sell_price")}>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        placeholder={t("sell_price")}
                        value={draft.sellPrice}
                        onChange={e => setDraft(d => ({ ...d, sellPrice: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (draft.productId) addToCart();
                          }
                        }}
                      />
                    </Field>
                    <Field label={lang === "bn" ? "ছাড়" : "Discount"}>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        placeholder="0"
                        value={draft.discount}
                        onChange={e => setDraft(d => ({ ...d, discount: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (draft.productId) addToCart();
                          }
                        }}
                      />
                    </Field>
                  </div>

                  {draft.productId && draft.sellPrice && (
                    <div className="text-xs text-muted-foreground flex justify-between items-center font-medium bg-muted/40 p-2 rounded-lg">
                      <span>{lang === "bn" ? "আইটেম মোট:" : "Item Total:"}</span>
                      <span className="font-bold text-foreground font-serif">
                        ৳{Math.max((Number(draft.sellPrice) || 0) - (Number(draft.discount) || 0), 0) * (Number(draft.qty) || 1)}
                      </span>
                    </div>
                  )}

                  <Button type="button" variant="default" size="sm" className="w-full h-9 text-xs font-semibold cursor-pointer" onClick={addToCart}>
                    <Plus className="size-4 mr-1" />{t("add_to_cart")} <span className="opacity-70 ml-1 font-mono text-[10px] hidden sm:inline">[Enter]</span>
                  </Button>
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col justify-between space-y-3">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <ShoppingCart className="size-3.5 text-primary" />
                      {t("cart")} ({cart.length})
                    </Label>
                    {cart.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-1.5"
                        onClick={() => setCart([])}
                      >
                        {lang === "bn" ? "কার্ট খালি করুন" : "Clear Cart"}
                      </Button>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5 bg-muted/10 min-h-[140px]">
                      <ShoppingCart className="size-6 text-muted-foreground/40" />
                      <span>{lang === "bn" ? "কার্ট খালি রয়েছে। পণ্য যোগ করুন।" : "Cart is empty. Add products to proceed."}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {cart.map((line, i) => {
                        const p = products.find(x => x.id === line.productId);
                        return (
                          <div key={`${line.productId}-${i}`} className="border border-border/80 rounded-xl p-2.5 text-xs bg-card space-y-1.5 shadow-2xs">
                            <div className="flex items-center justify-between font-semibold">
                              <span className="truncate flex-1 text-zinc-900 dark:text-zinc-100 font-medium" title={p?.name}>
                                {i + 1}. {p?.name}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-6 shrink-0 text-destructive hover:bg-destructive/10"
                                onClick={() => setCart(prev => prev.filter((_, idx) => idx !== i))}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-0.5">
                              <div className="flex items-center border border-border rounded-lg bg-background">
                                <button
                                  type="button"
                                  className="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                                  onClick={() => {
                                    const current = Number(line.qty) || 1;
                                    if (current > 1) {
                                      setCart(prev => prev.map((item, idx) => idx === i ? { ...item, qty: String(current - 1) } : item));
                                    } else {
                                      setCart(prev => prev.filter((_, idx) => idx !== i));
                                    }
                                  }}
                                >
                                  <Minus className="size-3" />
                                </button>
                                <span className="px-2 font-mono font-bold text-xs">{line.qty}</span>
                                <button
                                  type="button"
                                  className="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                                  onClick={() => {
                                    const current = Number(line.qty) || 0;
                                    setCart(prev => prev.map((item, idx) => idx === i ? { ...item, qty: String(current + 1) } : item));
                                  }}
                                >
                                  <Plus className="size-3" />
                                </button>
                              </div>

                              <div className="text-right">
                                <div className="font-bold text-foreground font-serif">৳{lineTotal(line)}</div>
                                <div className="text-[10px] text-muted-foreground">৳{line.sellPrice} × {line.qty}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {type === "split" && (
                  <div className="border border-purple-500/30 bg-purple-500/5 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs">
                    {/* Header: Title, Total, and Mobile Toggle */}
                    <div className="flex items-center justify-between gap-2 border-b border-purple-500/20 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 grid place-items-center">
                          <Split className="size-4" />
                        </div>
                        <div>
                          <Label className="text-xs sm:text-sm font-bold text-purple-950 dark:text-purple-100 flex items-center gap-1.5 font-charukola">
                            {lang === "bn" ? "আংশিক / মিক্সড পেমেন্ট হিসাব" : "Split & Partial Payment Breakdown"}
                          </Label>
                          <p className="text-[10px] text-muted-foreground hidden sm:block">
                            {lang === "bn" ? "ক্যাশ, বিকাশ ও ব্যাংকে টাকা ভাগ করুন। বাকী টাকা ডিউ হিসেবে যুক্ত হবে।" : "Split amount across cash, bKash & bank. Remainder becomes due."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold font-serif bg-background px-2 py-1 rounded-lg border border-purple-500/30 text-foreground">
                          {lang === "bn" ? "বিল:" : "Bill:"} ৳{sellTotal}
                        </span>

                        {/* Mobile Reveal / Hide Toggle Button */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setMobileSplitOpen(prev => !prev)}
                          className="sm:hidden h-7 text-[11px] px-2 rounded-lg font-bold border-purple-500/30 text-purple-700 dark:text-purple-300 bg-background cursor-pointer gap-1"
                        >
                          {mobileSplitOpen ? (
                            <>
                              <ChevronUp className="size-3.5" />
                              <span>{lang === "bn" ? "লুকান" : "Hide"}</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3.5" />
                              <span>{lang === "bn" ? "টাকা ভাগ করুন" : "Reveal"}</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Mobile Compact Summary Chip (Shown when collapsed on mobile) */}
                    {!mobileSplitOpen && (
                      <div
                        onClick={() => setMobileSplitOpen(true)}
                        className="sm:hidden p-2 bg-background/90 rounded-xl border border-purple-500/30 flex items-center justify-between text-xs cursor-pointer hover:bg-muted/40 transition-all"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold font-serif text-[11px]">
                            {lang === "bn" ? "নগদ:" : "Cash:"} ৳{splitCashNum}
                          </span>
                          <span className="text-[#E2136E] font-bold font-serif text-[11px]">
                            {lang === "bn" ? "বিকাশ:" : "bKash:"} ৳{splitBkashNum}
                          </span>
                          {splitBankNum > 0 && (
                            <span className="text-sky-600 font-bold font-serif text-[11px]">
                              {lang === "bn" ? "ব্যাংক:" : "Bank:"} ৳{splitBankNum}
                            </span>
                          )}
                        </div>
                        <div className="font-extrabold font-serif text-[11px] text-purple-700 dark:text-purple-300">
                          {due > 0 ? (
                            <span className="text-rose-600">বাকী: ৳{due}</span>
                          ) : (
                            <span className="text-emerald-600">✓ পরিশোধ</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Inputs & Controls (Visible always on sm: screens, revealable on mobile) */}
                    <div className={`${mobileSplitOpen ? "block" : "hidden sm:block"} space-y-3 animate-in fade-in duration-150`}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Cash Card */}
                        <div className="bg-background rounded-xl p-2.5 border border-emerald-500/30 shadow-2xs space-y-1.5 transition-all focus-within:ring-1 focus-within:ring-emerald-500">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                              <Banknote className="size-3.5 text-emerald-600" />
                              <span>{lang === "bn" ? "নগদ (Cash)" : "Cash"}</span>
                              {splitCashNum > 0 && sellTotal > 0 && (
                                <span className="text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-1 py-0.2 rounded">
                                  {Math.round((splitCashNum / sellTotal) * 100)}%
                                </span>
                              )}
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                const rest = Math.max(0, sellTotal - splitBkashNum - splitBankNum);
                                setSplitCash(String(rest));
                              }}
                              className="text-[10.5px] text-emerald-600 hover:text-emerald-700 font-bold cursor-pointer hover:underline"
                            >
                              {lang === "bn" ? "বাকি ক্যাশ" : "Fill Rest"}
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground select-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitCash}
                              onChange={e => setSplitCash(e.target.value)}
                              className="h-8.5 pl-6 text-sm font-extrabold font-serif bg-card"
                            />
                          </div>
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setSplitCash(String(splitCashNum + 100))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +১০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitCash(String(splitCashNum + 500))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +৫০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitCash(String(sellTotal))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold cursor-pointer ml-auto"
                            >
                              {lang === "bn" ? "সব ক্যাশ" : "All"}
                            </button>
                          </div>
                        </div>

                        {/* bKash Card */}
                        <div className="bg-background rounded-xl p-2.5 border border-[#E2136E]/30 shadow-2xs space-y-1.5 transition-all focus-within:ring-1 focus-within:ring-[#E2136E]">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-[#E2136E] dark:text-pink-300 flex items-center gap-1.5">
                              <BkashLogo className="size-3.5" />
                              <span>{lang === "bn" ? "বিকাশ (bKash)" : "bKash"}</span>
                              {splitBkashNum > 0 && sellTotal > 0 && (
                                <span className="text-[9px] font-mono font-bold bg-[#E2136E]/15 text-[#E2136E] dark:text-pink-300 px-1 py-0.2 rounded">
                                  {Math.round((splitBkashNum / sellTotal) * 100)}%
                                </span>
                              )}
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                const rest = Math.max(0, sellTotal - splitCashNum - splitBankNum);
                                setSplitBkash(String(rest));
                              }}
                              className="text-[10.5px] text-[#E2136E] hover:text-[#E2136E]/80 font-bold cursor-pointer hover:underline"
                            >
                              {lang === "bn" ? "বাকি বিকাশ" : "Fill Rest"}
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground select-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitBkash}
                              onChange={e => setSplitBkash(e.target.value)}
                              className="h-8.5 pl-6 text-sm font-extrabold font-serif bg-card"
                            />
                          </div>
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setSplitBkash(String(splitBkashNum + 100))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +১০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitBkash(String(splitBkashNum + 500))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +৫০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitBkash(String(sellTotal))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-pink-500/10 hover:bg-pink-500/20 text-[#E2136E] font-bold cursor-pointer ml-auto"
                            >
                              {lang === "bn" ? "সব বিকাশ" : "All"}
                            </button>
                          </div>
                        </div>

                        {/* Bank Card */}
                        <div className="bg-background rounded-xl p-2.5 border border-sky-500/30 shadow-2xs space-y-1.5 transition-all focus-within:ring-1 focus-within:ring-sky-500">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                              <DollarSign className="size-3.5 text-sky-600" />
                              <span>{lang === "bn" ? "ব্যাংক (Bank)" : "Bank"}</span>
                              {splitBankNum > 0 && sellTotal > 0 && (
                                <span className="text-[9px] font-mono font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 px-1 py-0.2 rounded">
                                  {Math.round((splitBankNum / sellTotal) * 100)}%
                                </span>
                              )}
                            </Label>
                            <button
                              type="button"
                              onClick={() => {
                                const rest = Math.max(0, sellTotal - splitCashNum - splitBkashNum);
                                setSplitBank(String(rest));
                              }}
                              className="text-[10.5px] text-sky-600 hover:text-sky-700 font-bold cursor-pointer hover:underline"
                            >
                              {lang === "bn" ? "বাকি ব্যাংক" : "Fill Rest"}
                            </button>
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground select-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitBank}
                              onChange={e => setSplitBank(e.target.value)}
                              className="h-8.5 pl-6 text-sm font-extrabold font-serif bg-card"
                            />
                          </div>
                          <div className="flex items-center gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => setSplitBank(String(splitBankNum + 100))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +১০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitBank(String(splitBankNum + 500))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground font-mono font-bold cursor-pointer"
                            >
                              +৫০০
                            </button>
                            <button
                              type="button"
                              onClick={() => setSplitBank(String(sellTotal))}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold cursor-pointer ml-auto"
                            >
                              {lang === "bn" ? "সব ব্যাংক" : "All"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Quick Split Presets Bar */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10.5px] font-bold text-muted-foreground">{lang === "bn" ? "দ্রুত ভাগ করুন:" : "Quick Split:"}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6.5 text-[10px] px-2.5 rounded-lg font-bold cursor-pointer bg-background hover:bg-purple-500/10 hover:border-purple-500/40"
                          onClick={() => {
                            const half = Math.round(sellTotal / 2);
                            setSplitCash(String(half));
                            setSplitBkash(String(sellTotal - half));
                            setSplitBank("0");
                          }}
                        >
                          ৫০% ক্যাশ + ৫০% বিকাশ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6.5 text-[10px] px-2.5 rounded-lg font-bold cursor-pointer bg-background hover:bg-emerald-500/10 hover:border-emerald-500/40"
                          onClick={() => {
                            setSplitCash(String(sellTotal));
                            setSplitBkash("0");
                            setSplitBank("0");
                          }}
                        >
                          ১০০% ক্যাশ
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6.5 text-[10px] px-2.5 rounded-lg font-bold cursor-pointer bg-background hover:bg-pink-500/10 hover:border-pink-500/40"
                          onClick={() => {
                            setSplitCash("0");
                            setSplitBkash(String(sellTotal));
                            setSplitBank("0");
                          }}
                        >
                          ১০০% বিকাশ
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6.5 text-[10px] px-2 rounded-lg font-semibold text-muted-foreground hover:text-rose-600 cursor-pointer ml-auto gap-1"
                          onClick={() => {
                            setSplitCash("0");
                            setSplitBkash("0");
                            setSplitBank("0");
                          }}
                        >
                          <RotateCcw className="size-3" />
                          <span>{lang === "bn" ? "রিসেট" : "Clear"}</span>
                        </Button>
                      </div>

                      {/* Summary & Live Financial Verification Strip */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-bold pt-2 border-t border-purple-500/20 bg-background/50 p-2.5 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="text-muted-foreground">{lang === "bn" ? "মোট পরিশোধ:" : "Total Paid:"} </span>
                            <span className="font-serif text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">৳{totalSplitPaid}</span>
                          </div>
                          <span className="text-muted-foreground font-normal">/</span>
                          <div>
                            <span className="text-muted-foreground">{lang === "bn" ? "মোট বিল:" : "Total Bill:"} </span>
                            <span className="font-serif font-extrabold text-sm">৳{sellTotal}</span>
                          </div>
                        </div>

                        <div>
                          {due > 0 ? (
                            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold">
                              <span>{lang === "bn" ? "⚠️ বাকী থাকবে (Due):" : "⚠️ Remaining Due:"} ৳{due}</span>
                              {!partyId && (
                                <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                  {lang === "bn" ? "কাস্টমার আবশ্যক" : "Customer required"}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
                              <CheckCircle2 className="size-3.5" />
                              <span>{lang === "bn" ? "সম্পূর্ণ পরিশোধিত (Paid in Full)" : "Paid in Full"}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {type === "credit" && (
                  <div className="border border-amber-500/30 bg-amber-500/5 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-amber-900 dark:text-amber-200">
                        {lang === "bn" ? "আংশিক জমা / আদায়কৃত টাকা" : "Partial Paid Amount"}
                      </Label>
                      <span className="text-[11px] font-semibold text-muted-foreground font-mono">
                        {lang === "bn" ? "মোট বিল:" : "Total:"} ৳{sellTotal}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        placeholder="0"
                        value={paid}
                        onChange={e => setPaid(e.target.value)}
                        className="h-9 text-sm font-semibold font-serif bg-background rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 text-xs px-2.5 shrink-0 rounded-lg cursor-pointer font-medium"
                        onClick={() => setPaid("0")}
                      >
                        {lang === "bn" ? "পুরো বাকী" : "Full Due"}
                      </Button>
                      {sellTotal > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs px-2.5 shrink-0 rounded-lg cursor-pointer font-medium"
                          onClick={() => setPaid(String(Math.round(sellTotal / 2)))}
                        >
                          ৫০%
                        </Button>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold text-amber-700 dark:text-amber-300 pt-0.5 border-t border-amber-500/20">
                      <span>{lang === "bn" ? "অবশিষ্ট বাকী থাকবে:" : "Remaining Due:"}</span>
                      <span className="font-serif text-sm font-black text-rose-600 dark:text-rose-400">৳{due}</span>
                    </div>
                  </div>
                )}

                <div className="border border-border rounded-xl p-3 bg-muted/20 space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("subtotal")}</span>
                    <span className="font-mono font-medium">৳{sellTotal}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</span>
                    <span className="font-bold uppercase text-foreground">
                      {type === "split"
                        ? (lang === "bn" ? "মিক্সড / আংশিক" : "Split / Mixed")
                        : type === "bkash"
                        ? (lang === "bn" ? "বিকাশ" : "bKash")
                        : type === "credit"
                        ? (lang === "bn" ? "বাকী" : "Credit")
                        : type === "online"
                        ? (lang === "bn" ? "অনলাইন" : "Online")
                        : type === "bank"
                        ? (lang === "bn" ? "ব্যাংক" : "Bank")
                        : (lang === "bn" ? "নগদ" : "Cash")}
                    </span>
                  </div>
                  <div className="border-t border-border/80 pt-1.5 flex justify-between items-baseline font-bold text-sm">
                    <span>{t("total")}</span>
                    <span className="text-base font-serif text-foreground">৳{sellTotal}</span>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <DialogFooter className="px-5 py-3 shrink-0 border-t border-border bg-card flex flex-row items-center justify-between sm:justify-between gap-2">
            <div className="text-xs flex items-center gap-1.5 flex-wrap">
              <span className="text-muted-foreground">{t("total")}: </span>
              <span className="font-bold text-base font-serif text-foreground">৳{sellTotal}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || cart.length === 0}
                onClick={(e) => submit(e, "print")}
                className="gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 h-9 font-medium cursor-pointer"
              >
                <Printer className="size-3.5" />
                <span>{lang === "bn" ? "প্রিন্ট" : "Print"}</span>
                <span className="text-[10px] opacity-70 font-mono hidden sm:inline">[Space]</span>
              </Button>
              <Button
                type="submit"
                form="sale-form"
                size="sm"
                disabled={busy || cart.length === 0}
                className="h-9 px-4 font-semibold cursor-pointer"
              >
                {busy ? "…" : t("record_sale")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{lang === "bn" ? "নতুন কাস্টমার যোগ করুন" : "Add New Customer"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCustomer} className="space-y-3 text-xs pt-1">
            <div className="space-y-1">
              <Label className="text-[10px]">{t("full_name")} *</Label>
              <Input
                required
                className="h-8 text-xs"
                placeholder={t("full_name")}
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{t("phone")}</Label>
              <Input
                type="tel"
                inputMode="tel"
                pattern="[0-9+]*"
                className="h-8 text-xs"
                placeholder={t("phone")}
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">{lang === "bn" ? "ঠিকানা" : "Address"}</Label>
              <Input
                className="h-8 text-xs"
                placeholder={lang === "bn" ? "ঠিকানা" : "Address"}
                value={newCustAddress}
                onChange={e => setNewCustAddress(e.target.value)}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddCustomerOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={addingCust}>
                {addingCust ? "..." : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
