"use client";

import { useCallback, useEffect, useState, useMemo, useRef } from "react";
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
import { Plus, Minus, Trash2, Scan, Printer, History, Banknote, Smartphone, CreditCard, DollarSign, ShoppingCart, Truck, PackageCheck, Share2, Split, ChevronDown, ChevronUp, RotateCcw, CheckCircle2, Sparkles, Eye, EyeOff, Tag } from "lucide-react";
import Link from "next/link";
import { safeUUID } from "@/lib/utils";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";
import { playTapSound, playScanSuccessSound, playSaleSuccessSound, playErrorSound } from "@/lib/audio";
import { getWhatsAppInvoiceUrl } from "@/lib/whatsapp-helper";
import { createHidScanBuffer, findProductsByScannedCode, getPosHardwareSettings, type ReceiptPrintMode } from "@/lib/pos-hardware";

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
  const [showBuyPrice, setShowBuyPrice] = useState(false);
  const [finalDiscount, setFinalDiscount] = useState("");
  const [finalDiscountType, setFinalDiscountType] = useState<"fixed" | "percent">("fixed");
  const [scanInput, setScanInput] = useState("");
  const [printMode, setPrintMode] = useState<ReceiptPrintMode>("manual");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const initializedSaleRef = useRef(false);
  const submittingRef = useRef(false);
  const [scannerSuffix, setScannerSuffix] = useState<"Enter" | "Tab">("Enter");

  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: rawCustomers = [] } = useCachedQuery(["customers"], getCustomers);
  const customers = rawCustomers.filter((c: any) => c.type !== "supplier" && !c.is_supplier);

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

  const handleBarcodeScan = useCallback((scannedCode: string) => {
    const matches = findProductsByScannedCode(products, String(scannedCode || ""));
    if (matches.length > 1) {
      playErrorSound();
      toast.error(lang === "bn" ? `একই বারকোড (${scannedCode}) একাধিক পণ্যে আছে` : `Barcode ${scannedCode} belongs to multiple products`);
      return;
    }
    const prod = matches[0];
    if (!prod) {
      playErrorSound();
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

    playScanSuccessSound();
    toast.success(lang === "bn" ? `কার্টে যুক্ত: ${prod.name}` : `Added to cart: ${prod.name}`);
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 50);
  }, [products, lang]);

  useEffect(() => {
    if (!open) { initializedSaleRef.current = false; return; }
    if (!initializedSaleRef.current) {
      initializedSaleRef.current = true;
      setPrintMode(getPosHardwareSettings().printMode);
      setScannerSuffix(getPosHardwareSettings().scannerSuffix);
      setScanInput("");
      setType(presetType ?? "cash");
      setPartyId("");
      setPaid("");
      setSplitCash("");
      setSplitBkash("");
      setSplitBank("");
      setFinalDiscount("");
      setFinalDiscountType("fixed");
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

    const focusTimer = setTimeout(() => {
      scanInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(focusTimer);
  }, [open, presetType, presetProductId, presetCart, products]);

  // Listen for global product add events (e.g. from dashboard scanner)
  useEffect(() => {
    if (!open) return;
    const handleGlobalAdd = (e: any) => {
      const pid = e?.detail?.productId;
      const p = e?.detail?.product || products.find(x => x.id === pid);
      if (p && pid) {
        setCart(prev => {
          const idx = prev.findIndex(item => item.productId === pid);
          if (idx !== -1) {
            const updated = [...prev];
            const existingQty = Number(updated[idx].qty) || 0;
            updated[idx] = { ...updated[idx], qty: String(existingQty + 1) };
            return updated;
          }
          return [...prev, {
            productId: pid,
            qty: "1",
            sellPrice: String(p.sell_price || ""),
            discount: ""
          }];
        });
      }
    };
    window.addEventListener("df-add-product-to-sale", handleGlobalAdd);
    return () => window.removeEventListener("df-add-product-to-sale", handleGlobalAdd);
  }, [open, products]);

  useEffect(() => {
    if (!open) return;

    const scanner = createHidScanBuffer(scannerSuffix);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || busy) return;
      const target = e.target as HTMLElement;
      if (target && target.id === "sale-barcode-input") {
        return;
      }

      const code = scanner.push(e.key, Date.now());
      if (code) {
        e.preventDefault();
        e.stopPropagation();
        handleBarcodeScan(code);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, products, busy, scannerSuffix, handleBarcodeScan]);

  function lineTotal(line: CartLine) {
    const p = products.find(x => x.id === line.productId);
    if (!p) return 0;
    const sell = Number(line.sellPrice) || p.sell_price || 0;
    const disc = Number(line.discount) || 0;
    const finalPrice = Math.max(sell - disc, 0);
    return finalPrice * (Number(line.qty) || 0);
  }

  const cartSubtotal = cart.reduce((a, l) => a + lineTotal(l), 0);

  const finalDiscountAmount = useMemo(() => {
    const val = Number(finalDiscount) || 0;
    if (val <= 0 || cartSubtotal <= 0) return 0;
    if (finalDiscountType === "percent") {
      const pct = Math.min(100, Math.max(0, val));
      return Math.round((cartSubtotal * pct) / 100);
    }
    return Math.min(cartSubtotal, Math.max(0, val));
  }, [finalDiscount, finalDiscountType, cartSubtotal]);

  const sellTotal = Math.max(0, cartSubtotal - finalDiscountAmount);

  const rawProfitTotal = cart.reduce((a, l) => {
    const p = products.find(x => x.id === l.productId);
    const sell = Number(l.sellPrice) || (p ? p.sell_price : 0) || 0;
    const disc = Number(l.discount) || 0;
    const finalPrice = Math.max(sell - disc, 0);
    const qty = Number(l.qty) || 1;
    const buy = Number(p?.buy_price) || 0;
    return a + (finalPrice - buy) * qty;
  }, 0);
  const profitTotal = rawProfitTotal - finalDiscountAmount;

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
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      if (e.key === "Enter") {
        if (target === scanInputRef.current) return;
        if (draft.productId && !isInput && target.tagName !== "BUTTON" && target.tagName !== "SELECT") {
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
    if (submittingRef.current) return;
    if (!user || cart.length === 0) {
      playErrorSound();
      return toast.error(t("select_product"));
    }

    // STRICT SELL PRICE VALIDATION: Block sale from recording if ANY item has empty or <= 0 price
    const emptyPriceIdx = cart.findIndex((line) => {
      const pStr = String(line.sellPrice ?? "").trim();
      const num = Number(pStr);
      return pStr === "" || isNaN(num) || num <= 0;
    });

    if (emptyPriceIdx !== -1) {
      submittingRef.current = false;
      playErrorSound();
      const p = products.find((x) => x.id === cart[emptyPriceIdx].productId);
      const name = p?.name ? `"${p.name}"` : `আইটেম #${emptyPriceIdx + 1}`;
      toast.error(
        lang === "bn"
          ? `${name}-এর বিক্রয় মূল্য খালি বা ০ রাখা যাবে না! অনুগ্রহ করে সঠিক দর লিখুন।`
          : `Sell price for ${name} cannot be empty or zero! Please enter a valid price.`
      );
      const el = document.querySelector(`[data-cart-sell-price-index="${emptyPriceIdx}"]`) as HTMLInputElement | null;
      if (el) {
        el.focus();
        el.select();
      }
      return;
    }

    if ((type === "credit" || (type === "split" && due > 0)) && !partyId) {
      playErrorSound();
      return toast.error(lang === "bn" ? "বকেয়া থাকার কারণে কাস্টমার নির্বাচন করা আবশ্যক" : "Customer is required when there is remaining due");
    }
    submittingRef.current = true;
    setBusy(true);
    try {
      const cartId = safeUUID();
      const changeAmount = (type === "split" && totalSplitPaid > sellTotal)
        ? totalSplitPaid - sellTotal
        : 0;

      // Net amounts actually received/retained after returning physical cash change
      let netCash = splitCashNum;
      let netBkash = splitBkashNum;
      let netBank = splitBankNum;

      if (type === "split" && changeAmount > 0) {
        const cashDeduction = Math.min(netCash, changeAmount);
        netCash -= cashDeduction;
        const remainderChange = changeAmount - cashDeduction;
        if (remainderChange > 0) {
          const bkashDeduction = Math.min(netBkash, remainderChange);
          netBkash -= bkashDeduction;
          const bankDeduction = Math.min(netBank, remainderChange - bkashDeduction);
          netBank -= bankDeduction;
        }
      }

      const effectivePaid = type === "split"
        ? Math.min(totalSplitPaid, sellTotal)
        : (type === "online" ? 0 : (isFullPaid ? sellTotal : Math.min(Number(paid) || 0, sellTotal)));

      let remainingCash = type === "split" ? netCash : (type === "cash" ? sellTotal : 0);
      let remainingBkash = type === "split" ? netBkash : (type === "bkash" ? sellTotal : 0);
      let remainingBank = type === "split" ? netBank : (type === "bank" ? sellTotal : 0);
      let remainingPaid = (type === "credit") ? effectivePaid : (type === "split" ? (netCash + netBkash + netBank) : (type === "online" ? 0 : sellTotal));
      let remainingDue = (type === "credit" || type === "split") ? due : (type === "online" ? sellTotal : 0);

      let remainingFinalDisc = finalDiscountAmount;
      const salePayloads: any[] = [];

      for (let i = 0; i < cart.length; i++) {
        const line = cart[i];
        const product = products.find(p => p.id === line.productId);
        if (!product) {
          throw new Error(lang === "bn" ? "কার্টের একটি পণ্য ডাটাবেজে পাওয়া যায়নি!" : "A product in your cart could not be found!");
        }
        const qtyNum = Math.max(1, Number(line.qty) || 1);
        const rawSellPrice = Number(line.sellPrice);
        if (isNaN(rawSellPrice) || rawSellPrice <= 0) {
          throw new Error(lang === "bn" ? `${product.name}-এর বিক্রয় মূল্য সঠিক নয়!` : `Invalid sell price for ${product.name}!`);
        }
        const disc = Math.max(0, Number(line.discount) || 0);
        const itemLineSell = Math.max(rawSellPrice - disc, 0) * qtyNum;

        // Distribute final discount proportionally across line items
        let lineFinalDisc = 0;
        if (finalDiscountAmount > 0 && cartSubtotal > 0) {
          if (i === cart.length - 1) {
            lineFinalDisc = Math.max(0, remainingFinalDisc);
          } else {
            const ratio = itemLineSell / cartSubtotal;
            lineFinalDisc = Math.min(Math.round(finalDiscountAmount * ratio), remainingFinalDisc);
            remainingFinalDisc -= lineFinalDisc;
          }
        }

        const lineSell = Math.max(0, itemLineSell - lineFinalDisc);
        const lineDiscTotal = (disc * qtyNum) + lineFinalDisc;
        const lineProfit = lineSell - (Number(product.buy_price || 0) * qtyNum);

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
            linePaid = Math.min(lineCash + lineBkash + lineBank, lineSell);
            lineDue = Math.max(lineSell - linePaid, 0);
          } else {
            const ratio = sellTotal > 0 ? lineSell / sellTotal : 1 / cart.length;
            lineCash = Math.min(Math.round(netCash * ratio), remainingCash);
            lineBkash = Math.min(Math.round(netBkash * ratio), remainingBkash);
            lineBank = Math.min(Math.round(netBank * ratio), remainingBank);
            linePaid = Math.min(lineCash + lineBkash + lineBank, lineSell);
            lineDue = Math.max(lineSell - linePaid, 0);
            remainingCash -= lineCash;
            remainingBkash -= lineBkash;
            remainingBank -= lineBank;
            remainingDue -= lineDue;
          }
        } else if (type === "credit") {
          if (i === cart.length - 1) {
            linePaid = Math.min(Math.max(remainingPaid, 0), lineSell);
            lineDue = Math.max(lineSell - linePaid, 0);
            lineCash = linePaid;
          } else {
            const ratio = sellTotal > 0 ? lineSell / sellTotal : 1 / cart.length;
            linePaid = Math.min(Math.round(effectivePaid * ratio), remainingPaid, lineSell);
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

        salePayloads.push({
          product_id: product.id,
          product_name: product.name,
          qty: qtyNum,
          buy_price: Number(product.buy_price) || 0,
          sell_price: rawSellPrice,
          discount: lineDiscTotal,
          profit: lineProfit,
          type,
          party_id: partyId || null,
          paid_amount: linePaid,
          due_amount: lineDue,
          split_cash: lineCash,
          split_bkash: lineBkash,
          split_bank: lineBank,
          cart_id: cartId,
          courier_name: type === "online" ? courierName : undefined,
          tracking_code: type === "online" ? trackingCode : undefined,
          courier_status: type === "online" ? "pending" : undefined,
          note: customerAddress ? `Address: ${customerAddress}` : undefined,
        });
      }

      // Execute all sale lines in parallel for blazing-fast POS throughput
      await Promise.all(salePayloads.map(payload => createSaleFn({ data: payload })));

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
        paymentModeStr = `SPLIT (${parts.join(" + ")})`;
      }

      const cust = customers.find(c => c.id === partyId);
      const lineDiscountsTotal = cart.reduce((acc, c) => acc + ((Number(c.discount) || 0) * (Number(c.qty) || 1)), 0);
      const totalCombinedDiscount = lineDiscountsTotal + finalDiscountAmount;

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
        subtotal: cartSubtotal + lineDiscountsTotal,
        discount: totalCombinedDiscount,
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

      if (action === "print" || (action === "none" && printMode === "automatic")) {
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
          splitCash: type === "split" ? netCash : (type === "cash" ? paidNum : undefined),
          splitBkash: type === "split" ? netBkash : (type === "bkash" ? paidNum : undefined),
          splitBank: type === "split" ? netBank : (type === "bank" ? paidNum : undefined),
          items: cart.map(c => {
            const prod = products.find(p => p.id === c.productId);
            return {
              product: { id: prod?.id, name: prod?.name || "Product" },
              qty: Number(c.qty) || 1,
              sellPrice: Math.max((Number(c.sellPrice) || prod?.sell_price || 0) - (Number(c.discount) || 0), 0),
            };
          }),
          subtotal: cartSubtotal + lineDiscountsTotal,
          discountAmount: totalCombinedDiscount,
          total: sellTotal,
          paidAmount: type === "online" ? 0 : (type === "split" && totalSplitPaid > sellTotal ? totalSplitPaid : paidNum),
          due: type === "online" ? sellTotal : due,
          changeAmount: changeAmount > 0 ? changeAmount : undefined,
          terms: user.invoice_terms || "",
        };

        try {
          printPwaInvoice(invoiceParams);
          toast.success(lang === "bn" ? "ইনভয়েস প্রিন্ট প্রস্তুত হচ্ছে!" : "Opening invoice print view!");
        } catch {
          toast.error(lang === "bn" ? "বিক্রি সংরক্ষিত হয়েছে, প্রিন্ট হয়নি। বিক্রির ইতিহাস থেকে আবার চেষ্টা করুন।" : "Sale saved, but printing failed. Retry from sales history.");
        }
      }

      setFinalDiscount("");
      setFinalDiscountType("fixed");
      onOpenChange(false);
    } catch (err: unknown) {
      playErrorSound();
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { submittingRef.current = false; setBusy(false); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onOpenAutoFocus={e => { e.preventDefault(); scanInputRef.current?.focus(); }} className="w-[98vw] sm:max-w-[95vw] md:max-w-5xl lg:max-w-6xl xl:max-w-[1380px] max-h-[94dvh] flex flex-col overflow-hidden p-0 rounded-2xl border-border shadow-2xl">
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`h-7 px-2 text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                  showBuyPrice
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300 font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setShowBuyPrice(v => !v)}
                title={showBuyPrice ? (lang === "bn" ? "ক্রয়মূল্য লুকান" : "Hide buy price") : (lang === "bn" ? "ক্রয়মূল্য দেখুন" : "View buy price")}
              >
                {showBuyPrice ? <EyeOff className="size-3.5 text-amber-600" /> : <Eye className="size-3.5" />}
                <span>{lang === "bn" ? (showBuyPrice ? "ক্রয় অন" : "ক্রয়মূল্য") : (showBuyPrice ? "Cost On" : "Buy Price")}</span>
              </Button>
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border/60 font-medium">
                <span><strong className="text-foreground">Enter</strong>: {lang === "bn" ? "কার্টে যোগ" : "Add to Cart"}</span>
                  <span>·</span>
                  <span>{lang === "bn" ? "স্ক্যান করলে পণ্য কার্টে যোগ হবে" : "Scans add items to the cart"}</span>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <form
              id="sale-form"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (draft.productId) {
                    e.preventDefault();
                    const draftPriceStr = String(draft.sellPrice ?? "").trim();
                    if (!draftPriceStr || isNaN(Number(draftPriceStr)) || Number(draftPriceStr) <= 0) {
                      e.stopPropagation();
                      playErrorSound();
                      toast.error(
                        lang === "bn"
                          ? "পণ্যের বিক্রয় মূল্য দিন! দর খালি বা ০ রাখা যাবে না।"
                          : "Please enter a valid sell price!"
                      );
                      return;
                    }
                    addToCart();
                    return;
                  }
                  // Check if any cart item has empty or <= 0 price
                  const emptyIdx = cart.findIndex((l) => {
                    const p = String(l.sellPrice ?? "").trim();
                    return p === "" || isNaN(Number(p)) || Number(p) <= 0;
                  });
                  if (emptyIdx !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    playErrorSound();
                    const invalidProduct = products.find((p) => p.id === cart[emptyIdx].productId);
                    const prodName = invalidProduct?.name ? `"${invalidProduct.name}"` : `আইটেম #${emptyIdx + 1}`;
                    toast.error(
                      lang === "bn"
                        ? `${prodName}-এর বিক্রয় মূল্য খালি! দর না লিখে এন্টার দিয়ে বিক্রি করা যাবে না।`
                        : `Sell price for ${prodName} cannot be empty! Please enter the sell price.`
                    );
                    const inputEl = document.querySelector(`[data-cart-sell-price-index="${emptyIdx}"]`) as HTMLInputElement | null;
                    if (inputEl) {
                      inputEl.focus();
                      inputEl.select();
                    }
                    return;
                  }
                }
              }}
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.productId) {
                  const draftPriceStr = String(draft.sellPrice ?? "").trim();
                  if (!draftPriceStr || isNaN(Number(draftPriceStr)) || Number(draftPriceStr) <= 0) {
                    playErrorSound();
                    toast.error(
                      lang === "bn"
                        ? "পণ্যের বিক্রয় মূল্য দিন! দর খালি বা ০ রাখা যাবে না।"
                        : "Please enter a valid sell price!"
                    );
                    return;
                  }
                  addToCart();
                } else if (cart.length > 0) {
                  submit(e);
                }
              }}
              className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-5"
            >
              <div className="md:col-span-7 lg:col-span-6 space-y-3.5 min-w-0">
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
                        onClick={() => setType("split")}
                        className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          type === "split"
                            ? "bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs ring-1 ring-purple-500/30"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        }`}
                      >
                        <Split className="size-4 text-purple-600 dark:text-purple-400" />
                        <span>{lang === "bn" ? "স্প্লিট" : "Split"}</span>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="sale-barcode-input" className="text-xs font-semibold flex items-center gap-1.5">
                      <Scan className="size-3.5 text-primary" />
                      {lang === "bn" ? "বারকোড স্ক্যান করুন" : "Scan a barcode"}
                    </Label>
                    <Input
                      id="sale-barcode-input"
                      ref={scanInputRef}
                      value={scanInput}
                      onChange={e => setScanInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== scannerSuffix && e.key !== "Enter") return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (busy) return;
                        const code = e.currentTarget.value.trim();
                        if (code) handleBarcodeScan(code);
                        setScanInput("");
                      }}
                      placeholder={lang === "bn" ? `স্ক্যান করুন বা বারকোড লিখে ${scannerSuffix} চাপুন` : `Scan or type a barcode, then press ${scannerSuffix}`}
                      autoComplete="off"
                      className="h-10 text-sm bg-background"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {lang === "bn" ? `USB বা Bluetooth স্ক্যানার Keyboard/HID মোডে রাখুন এবং ${scannerSuffix} suffix চালু করুন।` : `Use USB or Bluetooth scanner keyboard mode with a ${scannerSuffix} suffix.`}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Scan className="size-3.5 text-primary" />
                      {t("select_product")}
                    </Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded cursor-pointer transition-all active:scale-90 touch-manipulation ${
                          showBuyPrice ? "text-amber-700 dark:text-amber-300 bg-amber-500/15 font-semibold" : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setShowBuyPrice(v => !v)}
                        title={showBuyPrice ? (lang === "bn" ? "ক্রয়মূল্য লুকান" : "Hide buy price") : (lang === "bn" ? "ক্রয়মূল্য দেখুন" : "View buy price")}
                      >
                        {showBuyPrice ? <EyeOff className="size-3 text-amber-600" /> : <Eye className="size-3" />}
                        <span>{lang === "bn" ? (showBuyPrice ? "ক্রয় অন" : "ক্রয়মূল্য") : (showBuyPrice ? "Cost On" : "Buy Price")}</span>
                      </button>
                      <span className="text-[10px] text-muted-foreground font-mono">{lang === "bn" ? "ডিফল্ট: ১" : "Default: 1"}</span>
                    </div>
                  </div>

                  {/* Product Name & Direct Sell Price Input Box side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-7 space-y-1">
                      <Label className="text-[11px] font-semibold text-muted-foreground">
                        {lang === "bn" ? "পণ্যের নাম / বারকোড" : "Product Name / Barcode"}
                      </Label>
                      <ProductSearchSelect
                        products={products}
                        value={draft.productId}
                        showBuyPrice={showBuyPrice}
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
                    </div>
                    <div className="sm:col-span-5 space-y-1">
                      <Label className="text-[11px] font-bold text-primary">
                        {lang === "bn" ? "বিক্রি মূল্য (Sell Price ৳)" : "Sell Price (৳)"}
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        pattern="[0-9.]*"
                        placeholder={lang === "bn" ? "বিক্রি দর লিখুন (৳)" : "Enter Sell Price (৳)"}
                        value={draft.productId ? draft.sellPrice : (cart.length > 0 ? cart[cart.length - 1].sellPrice : draft.sellPrice)}
                        onChange={e => {
                          const val = e.target.value;
                          if (draft.productId) {
                            setDraft(d => ({ ...d, sellPrice: val }));
                          } else if (cart.length > 0) {
                            setCart(prev => prev.map((item, idx) => idx === prev.length - 1 ? { ...item, sellPrice: val } : item));
                          } else {
                            setDraft(d => ({ ...d, sellPrice: val }));
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (draft.productId) addToCart();
                          }
                        }}
                        className="h-9 font-bold font-mono text-sm border-primary/50 bg-background focus-visible:ring-primary"
                      />
                    </div>
                  </div>

                  {(() => {
                    const selectedProd = products.find(x => x.id === draft.productId);
                    if (!selectedProd) return null;
                    const unitSell = (Number(draft.sellPrice) || selectedProd.sell_price || 0) - (Number(draft.discount) || 0);
                    const unitProfit = unitSell - (selectedProd.buy_price || 0);
                    const estProfit = unitProfit * (Number(draft.qty) || 1);
                    return (
                      <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-amber-900 dark:text-amber-300 font-medium">
                            {lang === "bn" ? "ক্রয়মূল্য:" : "Buy Price:"}
                          </span>
                          {showBuyPrice ? (
                            <span className="font-bold text-amber-700 dark:text-amber-300 font-mono text-sm">
                              ৳{selectedProd.buy_price ?? 0}
                            </span>
                          ) : (
                            <span className="font-mono text-muted-foreground tracking-widest text-[11px]">••••••</span>
                          )}
                          {showBuyPrice && draft.sellPrice && (
                            <span className={`text-[11px] font-semibold ${estProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              ({lang === "bn" ? "লাভ" : "Profit"}: ৳{estProfit})
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground ml-auto sm:ml-2">
                            ({lang === "bn" ? "মজুদ" : "Stock"}: {selectedProd.stock})
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 sm:size-6 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 active:scale-90 transition-all shrink-0 cursor-pointer touch-manipulation"
                          onClick={() => setShowBuyPrice(v => !v)}
                          title={showBuyPrice ? (lang === "bn" ? "ক্রয়মূল্য লুকান" : "Hide buy price") : (lang === "bn" ? "ক্রয়মূল্য দেখুন" : "View buy price")}
                        >
                          {showBuyPrice ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                      </div>
                    );
                  })()}

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

              <div className="md:col-span-5 lg:col-span-6 flex flex-col justify-between space-y-3 min-w-0">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <ShoppingCart className="size-3.5 text-primary" />
                      {t("cart")} ({cart.length})
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-6 text-[10px] px-1.5 flex items-center gap-1 cursor-pointer transition-all active:scale-90 touch-manipulation ${
                          showBuyPrice ? "text-amber-700 dark:text-amber-300 font-semibold bg-amber-500/15" : "text-muted-foreground hover:bg-muted"
                        }`}
                        onClick={() => setShowBuyPrice(v => !v)}
                        title={showBuyPrice ? (lang === "bn" ? "ক্রয়মূল্য লুকান" : "Hide buy price") : (lang === "bn" ? "ক্রয়মূল্য দেখুন" : "View buy price")}
                      >
                        {showBuyPrice ? <EyeOff className="size-3 text-amber-600" /> : <Eye className="size-3" />}
                        <span>{lang === "bn" ? (showBuyPrice ? "ক্রয় অন" : "ক্রয়মূল্য") : (showBuyPrice ? "Cost On" : "Cost")}</span>
                      </Button>
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
                  </div>

                  {cart.length === 0 ? (
                    <div className="border border-dashed border-border rounded-xl p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-1.5 bg-muted/10 min-h-[140px]">
                      <ShoppingCart className="size-6 text-muted-foreground/40" />
                      <span>{lang === "bn" ? "কার্ট খালি রয়েছে। পণ্য যোগ করুন।" : "Cart is empty. Add products to proceed."}</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {cart.map((line, i) => {
                        const p = products.find(x => x.id === line.productId);
                        return (
                          <div key={`${line.productId}-${i}`} className="border border-border/80 rounded-xl p-2.5 text-xs bg-card space-y-2 shadow-2xs">
                            {/* Top Row: Product Name + Inline Sell Price Input + Delete Button */}
                            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 font-semibold">
                              <span className="truncate flex-1 min-w-[120px] text-zinc-900 dark:text-zinc-100 font-bold text-xs sm:text-sm" title={p?.name}>
                                {i + 1}. {p?.name}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] font-bold text-primary whitespace-nowrap">
                                  {lang === "bn" ? "দর ৳:" : "Price ৳:"}
                                </span>
                                <Input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  data-cart-sell-price-index={i}
                                  value={line.sellPrice}
                                  placeholder="0"
                                  onChange={e => {
                                    const val = e.target.value;
                                    setCart(prev => prev.map((item, idx) => idx === i ? { ...item, sellPrice: val } : item));
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      const p = String(line.sellPrice ?? "").trim();
                                      if (!p || isNaN(Number(p)) || Number(p) <= 0) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        playErrorSound();
                                        toast.error(
                                          lang === "bn"
                                            ? "বিক্রি দর খালি বা ০ রাখা যাবে না!"
                                            : "Sell price cannot be empty or zero!"
                                        );
                                      }
                                    }
                                  }}
                                  className="h-8 w-28 sm:w-32 text-xs font-mono font-bold px-2 border-primary/50 bg-background focus-visible:ring-1 focus-visible:ring-primary"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0 text-destructive hover:bg-destructive/10 cursor-pointer"
                                  onClick={() => setCart(prev => prev.filter((_, idx) => idx !== i))}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>

                            {/* Second Row: Quantity Controls, Discount Input, and Line Total */}
                            <div className="grid grid-cols-12 gap-2 items-center pt-1 border-t border-border/40">
                              {/* Quantity Controls */}
                              <div className="col-span-5 sm:col-span-4">
                                <label className="text-[10px] text-muted-foreground block mb-0.5 font-medium">
                                  {lang === "bn" ? "পরিমাণ (Qty)" : "Qty"}
                                </label>
                                <div className="flex items-center border border-border rounded-lg bg-background h-7 overflow-hidden">
                                  <button
                                    type="button"
                                    className="w-6 h-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
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
                                  <input
                                    type="number"
                                    min="1"
                                    value={line.qty}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setCart(prev => prev.map((item, idx) => idx === i ? { ...item, qty: val } : item));
                                    }}
                                    className="w-full text-center font-mono font-bold text-xs bg-transparent focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    className="w-6 h-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer shrink-0"
                                    onClick={() => {
                                      const current = Number(line.qty) || 0;
                                      setCart(prev => prev.map((item, idx) => idx === i ? { ...item, qty: String(current + 1) } : item));
                                    }}
                                  >
                                    <Plus className="size-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Editable Item Discount */}
                              <div className="col-span-4 sm:col-span-4">
                                <label className="text-[10px] text-muted-foreground block mb-0.5 font-medium">
                                  {lang === "bn" ? "ছাড় (Disc ৳)" : "Disc (৳)"}
                                </label>
                                <Input
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  value={line.discount}
                                  placeholder="0"
                                  onChange={e => {
                                    const val = e.target.value;
                                    setCart(prev => prev.map((item, idx) => idx === i ? { ...item, discount: val } : item));
                                  }}
                                  className="h-7 text-xs font-mono px-2 bg-background"
                                />
                              </div>

                              {/* Line Total */}
                              <div className="col-span-3 sm:col-span-4 text-right">
                                <span className="text-[10px] text-muted-foreground block mb-0.5 font-medium">
                                  {lang === "bn" ? "মোট (Total)" : "Total"}
                                </span>
                                <div className="font-bold text-foreground font-serif text-sm">৳{lineTotal(line)}</div>
                                {showBuyPrice && p && (
                                  <div className="text-[9px] text-amber-700 dark:text-amber-400 font-mono font-medium">
                                    (ক্রয় ৳{p.buy_price || 0})
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {type === "split" && (
                  <div className="border border-purple-500/30 bg-purple-500/5 rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs overflow-hidden font-hind">
                    {/* Header: Title, Total, and Mobile Toggle */}
                    <div className="flex items-center justify-between gap-2 border-b border-purple-500/20 pb-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-7 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400 grid place-items-center shrink-0">
                          <Split className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs sm:text-sm font-bold text-purple-950 dark:text-purple-100 flex items-center gap-1.5 truncate">
                            {lang === "bn" ? "স্প্লিট পেমেন্ট হিসাব" : "Split Payment Breakdown"}
                          </Label>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(splitCashNum > 0 || splitBkashNum > 0 || splitBankNum > 0) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSplitCash("");
                              setSplitBkash("");
                              setSplitBank("");
                            }}
                            className="text-[11px] font-medium text-muted-foreground hover:text-rose-600 px-2 py-0.5 rounded border border-border/60 hover:border-rose-300 transition-colors cursor-pointer flex items-center gap-1"
                            title="Reset all split fields"
                          >
                            <RotateCcw className="size-3" />
                            <span>{lang === "bn" ? "মুছুন" : "Clear"}</span>
                          </button>
                        )}

                        <span className="text-xs font-bold bg-background px-2.5 py-1 rounded-lg border border-purple-500/30 text-foreground shadow-2xs">
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
                              <span>{lang === "bn" ? "টাকা লিখুন" : "Reveal"}</span>
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
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                            {lang === "bn" ? "নগদ:" : "Cash:"} ৳{splitCashNum}
                          </span>
                          <span className="text-[#E2136E] font-bold text-[11px]">
                            {lang === "bn" ? "বিকাশ:" : "bKash:"} ৳{splitBkashNum}
                          </span>
                          {splitBankNum > 0 && (
                            <span className="text-sky-600 font-bold text-[11px]">
                              {lang === "bn" ? "ব্যাংক:" : "Bank:"} ৳{splitBankNum}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-[11px] text-purple-700 dark:text-purple-300">
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
                      {/* Visual Segmented Payment Progress Bar */}
                      {sellTotal > 0 && (
                        <div className="h-1.5 w-full bg-muted/80 rounded-full overflow-hidden flex shadow-inner">
                          {splitCashNum > 0 && (
                            <div
                              style={{ width: `${Math.min(100, (splitCashNum / sellTotal) * 100)}%` }}
                              className="bg-emerald-500 transition-all duration-200"
                              title={lang === "bn" ? `নগদ: ৳${splitCashNum}` : `Cash: ৳${splitCashNum}`}
                            />
                          )}
                          {splitBkashNum > 0 && (
                            <div
                              style={{ width: `${Math.min(100, (splitBkashNum / sellTotal) * 100)}%` }}
                              className="bg-[#E2136E] transition-all duration-200"
                              title={lang === "bn" ? `বিকাশ: ৳${splitBkashNum}` : `bKash: ৳${splitBkashNum}`}
                            />
                          )}
                          {splitBankNum > 0 && (
                            <div
                              style={{ width: `${Math.min(100, (splitBankNum / sellTotal) * 100)}%` }}
                              className="bg-sky-500 transition-all duration-200"
                              title={lang === "bn" ? `ব্যাংক: ৳${splitBankNum}` : `Bank: ৳${splitBankNum}`}
                            />
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Line 1: Cash */}
                        <div className="bg-background rounded-xl p-2.5 sm:p-3 border border-emerald-500/30 shadow-2xs transition-all focus-within:ring-1 focus-within:ring-emerald-500 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="size-6 sm:size-7 rounded-md bg-emerald-500/15 grid place-items-center text-emerald-600 shrink-0">
                                <Banknote className="size-3.5 sm:size-4" />
                              </div>
                              <Label className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer truncate">
                                {lang === "bn" ? "নগদ (Cash)" : "Cash"}
                              </Label>
                            </div>
                          </div>

                          <div className="relative w-full">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground select-none pointer-events-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitCash}
                              onChange={e => setSplitCash(e.target.value)}
                              className="h-9 sm:h-10 pl-7 pr-7 text-sm sm:text-base font-bold bg-card rounded-lg w-full"
                            />
                            {splitCash && (
                              <button
                                type="button"
                                onClick={() => setSplitCash("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-5 flex items-center justify-center text-xs rounded-full hover:bg-muted cursor-pointer"
                                title="Clear"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Line 2: bKash */}
                        <div className="bg-background rounded-xl p-2.5 sm:p-3 border border-[#E2136E]/30 shadow-2xs transition-all focus-within:ring-1 focus-within:ring-[#E2136E] space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="size-6 sm:size-7 rounded-md bg-[#E2136E]/15 grid place-items-center text-[#E2136E] shrink-0">
                                <BkashLogo className="size-3.5 sm:size-4" />
                              </div>
                              <Label className="text-xs sm:text-sm font-bold text-[#E2136E] dark:text-pink-300 cursor-pointer truncate">
                                {lang === "bn" ? "বিকাশ (bKash)" : "bKash"}
                              </Label>
                            </div>
                          </div>

                          <div className="relative w-full">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground select-none pointer-events-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitBkash}
                              onChange={e => setSplitBkash(e.target.value)}
                              className="h-9 sm:h-10 pl-7 pr-7 text-sm sm:text-base font-bold bg-card rounded-lg w-full"
                            />
                            {splitBkash && (
                              <button
                                type="button"
                                onClick={() => setSplitBkash("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-5 flex items-center justify-center text-xs rounded-full hover:bg-muted cursor-pointer"
                                title="Clear"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Line 3: Bank */}
                        <div className="bg-background rounded-xl p-2.5 sm:p-3 border border-sky-500/30 shadow-2xs transition-all focus-within:ring-1 focus-within:ring-sky-500 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="size-6 sm:size-7 rounded-md bg-sky-500/15 grid place-items-center text-sky-600 shrink-0">
                                <DollarSign className="size-3.5 sm:size-4" />
                              </div>
                              <Label className="text-xs sm:text-sm font-bold text-sky-700 dark:text-sky-300 cursor-pointer truncate">
                                {lang === "bn" ? "ব্যাংক (Bank)" : "Bank"}
                              </Label>
                            </div>
                          </div>

                          <div className="relative w-full">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground select-none pointer-events-none">৳</span>
                            <Input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0"
                              value={splitBank}
                              onChange={e => setSplitBank(e.target.value)}
                              className="h-9 sm:h-10 pl-7 pr-7 text-sm sm:text-base font-bold bg-card rounded-lg w-full"
                            />
                            {splitBank && (
                              <button
                                type="button"
                                onClick={() => setSplitBank("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-5 flex items-center justify-center text-xs rounded-full hover:bg-muted cursor-pointer"
                                title="Clear"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Summary & Live Financial Verification Strip */}
                      <div className="space-y-2 pt-1 border-t border-purple-500/20">
                        <div className="flex items-center justify-between gap-2 text-xs font-bold bg-background/60 p-2.5 rounded-xl border border-purple-500/20">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div>
                              <span className="text-muted-foreground">{lang === "bn" ? "পরিশোধ:" : "Paid:"} </span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">৳{totalSplitPaid}</span>
                            </div>
                            <span className="text-muted-foreground font-normal">/</span>
                            <div>
                              <span className="text-muted-foreground">{lang === "bn" ? "বিল:" : "Bill:"} </span>
                              <span className="font-extrabold text-sm">৳{sellTotal}</span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {due > 0 ? (
                              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-extrabold text-[11px] sm:text-xs">
                                <span>{lang === "bn" ? "⚠️ বাকী:" : "⚠️ Due:"} ৳{due}</span>
                                {!partyId && (
                                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                    {lang === "bn" ? "কাস্টমার আবশ্যক" : "Cust req"}
                                  </span>
                                )}
                              </div>
                            ) : totalSplitPaid > sellTotal ? (
                              <span className="text-amber-600 dark:text-amber-400 font-extrabold text-[11px] sm:text-xs flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                                <span>{lang === "bn" ? "🔄 ফেরত (Change):" : "🔄 Change:"} ৳{totalSplitPaid - sellTotal}</span>
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[11px] sm:text-xs flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                                <CheckCircle2 className="size-3.5" />
                                <span>{lang === "bn" ? "সম্পূর্ণ পরিশোধিত" : "Paid in Full"}</span>
                              </span>
                            )}
                          </div>
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
                        placeholder=""
                        value={paid}
                        onChange={e => setPaid(e.target.value)}
                        className="h-9 sm:h-11 text-sm sm:text-base font-semibold font-serif bg-background rounded-lg"
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
                  {showBuyPrice && cart.length > 0 && (
                    <div className="flex justify-between items-center text-amber-700 dark:text-amber-400 font-mono text-[11px] bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      <span>{lang === "bn" ? "মোট ক্রয়মূল্য:" : "Total Cost:"} ৳{sellTotal - profitTotal}</span>
                      <span className={`font-semibold ${profitTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {lang === "bn" ? "নিট লাভ:" : "Net Profit:"} ৳{profitTotal}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span className="font-medium">{t("subtotal")}</span>
                    <span className="font-mono font-bold text-sm text-foreground">৳{cartSubtotal}</span>
                  </div>

                  {/* Final Discount Options (Visible after adding products to cart) */}
                  {cart.length > 0 && (
                    <div className="bg-background/90 dark:bg-card/90 rounded-xl p-2.5 border border-border/80 space-y-2 shadow-2xs">
                      <div className="flex items-center justify-between gap-1.5">
                        <Label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                          <Tag className="size-3.5 text-primary" />
                          <span>{lang === "bn" ? "সার্বিক ছাড় (Final Discount)" : "Final Discount"}</span>
                        </Label>
                        {finalDiscountAmount > 0 && (
                          <span className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                            -৳{finalDiscountAmount}
                            {finalDiscountType === "fixed" && cartSubtotal > 0 && (
                              <span className="text-[9.5px] opacity-80 font-normal ml-1">
                                ({((finalDiscountAmount / cartSubtotal) * 100).toFixed(0)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Input & Unit Switch */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex rounded-lg border border-border p-0.5 bg-muted/60 shrink-0">
                          <button
                            type="button"
                            onClick={() => setFinalDiscountType("fixed")}
                            className={`px-2 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                              finalDiscountType === "fixed"
                                ? "bg-background text-foreground shadow-2xs font-serif"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title={lang === "bn" ? "টাকা হিসেবে ছাড়" : "Fixed Amount (৳)"}
                          >
                            ৳
                          </button>
                          <button
                            type="button"
                            onClick={() => setFinalDiscountType("percent")}
                            className={`px-2 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                              finalDiscountType === "percent"
                                ? "bg-background text-foreground shadow-2xs"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                            title={lang === "bn" ? "শতাংশ (%) হিসেবে ছাড়" : "Percentage (%)"}
                          >
                            %
                          </button>
                        </div>

                        <div className="relative flex-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            pattern="[0-9.]*"
                            placeholder={finalDiscountType === "percent" ? "0 %" : "0 ৳"}
                            value={finalDiscount}
                            onChange={(e) => setFinalDiscount(e.target.value)}
                            className="h-8 text-xs font-bold font-mono pr-7"
                          />
                          {finalDiscount && (
                            <button
                              type="button"
                              onClick={() => setFinalDiscount("")}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground size-5 flex items-center justify-center text-xs rounded-full cursor-pointer hover:bg-muted"
                              title={lang === "bn" ? "ছাড় মুছুন" : "Clear discount"}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick Shortcut Preset Buttons */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <span className="text-[10px] text-muted-foreground font-medium mr-0.5">
                          {lang === "bn" ? "কুইক:" : "Quick:"}
                        </span>
                        {(["20", "50", "100", "200"] as const).map((amt) => {
                          const isSelected = finalDiscountType === "fixed" && finalDiscount === amt;
                          return (
                            <button
                              key={`amt-${amt}`}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFinalDiscount("");
                                } else {
                                  setFinalDiscountType("fixed");
                                  setFinalDiscount(amt);
                                }
                              }}
                              className={`text-[10.5px] px-2 py-0.5 rounded-md font-mono border transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold"
                                  : "bg-muted/40 hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              ৳{amt}
                            </button>
                          );
                        })}
                        {(["5", "10", "15"] as const).map((pct) => {
                          const isSelected = finalDiscountType === "percent" && finalDiscount === pct;
                          return (
                            <button
                              key={`pct-${pct}`}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFinalDiscount("");
                                } else {
                                  setFinalDiscountType("percent");
                                  setFinalDiscount(pct);
                                }
                              }}
                              className={`text-[10.5px] px-2 py-0.5 rounded-md font-mono border transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300 font-bold"
                                  : "bg-muted/40 hover:bg-muted border-border/60 text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {pct}%
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</span>
                    <span className="font-bold uppercase text-foreground">
                      {type === "split"
                        ? (lang === "bn" ? "স্প্লিট" : "Split")
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
                  {type === "split" && (
                    <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/50 text-[11px]">
                      <span>{lang === "bn" ? "পরিশোধিত / বাকী:" : "Paid / Due:"}</span>
                      <span className="font-mono font-bold">
                        <span className="text-emerald-600 dark:text-emerald-400">৳{totalSplitPaid}</span>
                        {" / "}
                        <span className={due > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}>৳{due}</span>
                        {totalSplitPaid > sellTotal && (
                          <span className="text-amber-600 dark:text-amber-400 font-sans ml-1 text-[10px]">(ফেরত ৳{totalSplitPaid - sellTotal})</span>
                        )}
                      </span>
                    </div>
                  )}
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
              {finalDiscountAmount > 0 && (
                <span className="text-[10.5px] text-rose-600 dark:text-rose-400 font-mono font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
                  {lang === "bn" ? "ছাড়:" : "Disc:"} -৳{finalDiscountAmount}
                </span>
              )}
              {showBuyPrice && cart.length > 0 && (
                <span className="text-[11px] text-amber-700 dark:text-amber-300 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  {lang === "bn" ? "ক্রয়:" : "Cost:"} ৳{sellTotal - profitTotal} · {lang === "bn" ? "লাভ:" : "Profit:"} ৳{profitTotal}
                </span>
              )}
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
                <span>{lang === "bn" ? "সংরক্ষণ ও প্রিন্ট" : "Save & print"}</span>
              </Button>
              <Button
                type="submit"
                form="sale-form"
                size="sm"
                disabled={busy || cart.length === 0}
                className="h-9 px-4 font-semibold cursor-pointer"
              >
                {busy ? "…" : printMode === "automatic" ? (lang === "bn" ? "সংরক্ষণ ও অটো প্রিন্ট" : "Save & auto print") : t("record_sale")}
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
