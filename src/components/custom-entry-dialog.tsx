"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShoppingBag,
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  Calendar,
  Sparkles,
  CheckCircle2,
  PlusCircle,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { getProducts, getParties } from "@/lib/queries";
import { ProductSearchSelect } from "@/components/product-search";
import {
  createSaleFn,
  createExpenseFn,
  createPurchaseFn,
  createCashboxFn,
  createPaymentFn,
} from "@/lib/rpc";
import { playSaleSuccessSound, playTapSound, playErrorSound } from "@/lib/audio";

export type CustomEntryType = "sale" | "expense" | "purchase" | "deposit" | "withdraw" | "due_collection";

interface CustomEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: CustomEntryType;
}

export function CustomEntryDialog({ open, onOpenChange, initialType = "sale" }: CustomEntryDialogProps) {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();

  const productsQuery = useQuery({ queryKey: ["products"], queryFn: getProducts, enabled: open });
  const partiesQuery = useQuery({ queryKey: ["parties"], queryFn: getParties, enabled: open });

  const products = productsQuery.data ?? [];
  const parties = partiesQuery.data ?? [];
  const customers = useMemo(() => parties.filter((p: any) => p.type === "customer"), [parties]);
  const suppliers = useMemo(() => parties.filter((p: any) => p.type === "supplier"), [parties]);

  const [entryType, setEntryType] = useState<CustomEntryType>(initialType);
  const [customDate, setCustomDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Common helper for local datetime formatting
  const getNowLocal = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Reset or preset date on open
  useEffect(() => {
    if (open) {
      setEntryType(initialType);
      setCustomDate(getNowLocal());
    }
  }, [open, initialType]);

  // Keyboard shortcut listener for PC (Alt+1..6)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        if (e.key === "1") { e.preventDefault(); setEntryType("sale"); }
        else if (e.key === "2") { e.preventDefault(); setEntryType("expense"); }
        else if (e.key === "3") { e.preventDefault(); setEntryType("purchase"); }
        else if (e.key === "4") { e.preventDefault(); setEntryType("deposit"); }
        else if (e.key === "5") { e.preventDefault(); setEntryType("withdraw"); }
        else if (e.key === "6") { e.preventDefault(); setEntryType("due_collection"); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Date preset buttons
  const setDatePreset = (preset: "today" | "yesterday" | "2daysAgo") => {
    playTapSound();
    const d = new Date();
    if (preset === "yesterday") d.setDate(d.getDate() - 1);
    else if (preset === "2daysAgo") d.setDate(d.getDate() - 2);
    const pad = (n: number) => String(n).padStart(2, "0");
    setCustomDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  // Form states: Sale
  const [saleProdId, setSaleProdId] = useState("");
  const [saleProdName, setSaleProdName] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleBuyPrice, setSaleBuyPrice] = useState("");
  const [saleSellPrice, setSaleSellPrice] = useState("");
  const [salePaymentType, setSalePaymentType] = useState("cash");
  const [saleCustomerId, setSaleCustomerId] = useState("");
  const [saleNote, setSaleNote] = useState("");

  // Form states: Expense
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCategory, setExpCategory] = useState("general");
  const [expNote, setExpNote] = useState("");

  // Form states: Purchase
  const [purProdId, setPurProdId] = useState("");
  const [purProdName, setPurProdName] = useState("");
  const [purQty, setPurQty] = useState("1");
  const [purUnitCost, setPurUnitCost] = useState("");
  const [purSupplierId, setPurSupplierId] = useState("");
  const [purNote, setPurNote] = useState("");

  // Form states: Cashbox (Deposit / Withdraw)
  const [cashboxAmt, setCashboxAmt] = useState("");
  const [cashboxNote, setCashboxNote] = useState("");

  // Form states: Due Collection
  const [dueCustomerId, setDueCustomerId] = useState("");
  const [dueAmount, setDueAmount] = useState("");
  const [dueNote, setDueNote] = useState("");

  // Clear fields on type change or finish
  const resetFormFields = () => {
    setSaleProdId(""); setSaleProdName(""); setSaleQty("1"); setSaleBuyPrice(""); setSaleSellPrice(""); setSaleCustomerId(""); setSaleNote("");
    setExpTitle(""); setExpAmount(""); setExpCategory("general"); setExpNote("");
    setPurProdId(""); setPurProdName(""); setPurQty("1"); setPurUnitCost(""); setPurSupplierId(""); setPurNote("");
    setCashboxAmt(""); setCashboxNote("");
    setDueCustomerId(""); setDueAmount(""); setDueNote("");
  };

  const handleSubmit = async (e: React.FormEvent, closeAfter = true) => {
    e.preventDefault();
    if (!customDate) {
      playErrorSound();
      return toast.error(lang === "bn" ? "তারিখ নির্বাচন করুন" : "Please select date & time");
    }

    setSubmitting(true);
    const parsedDate = new Date(customDate);
    const isoDate = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

    try {
      if (entryType === "sale") {
        const qtyNum = Number(saleQty) || 1;
        const sellNum = Number(saleSellPrice) || 0;
        const buyNum = Number(saleBuyPrice) || 0;
        if (!saleProdName.trim()) throw new Error(lang === "bn" ? "পণ্যের নাম দিন" : "Product name is required");
        if (sellNum <= 0) throw new Error(lang === "bn" ? "বিক্রি মূল্য সঠিক দিন" : "Valid sell price is required");

        const lineTotal = sellNum * qtyNum;
        const profit = (sellNum - buyNum) * qtyNum;
        const paidAmount = salePaymentType === "credit" ? 0 : lineTotal;
        const dueAmount = salePaymentType === "credit" ? lineTotal : 0;

        await createSaleFn({
          data: {
            product_id: saleProdId || null,
            product_name: saleProdName.trim(),
            qty: qtyNum,
            buy_price: buyNum,
            sell_price: sellNum,
            profit,
            type: salePaymentType,
            party_id: saleCustomerId || null,
            paid_amount: paidAmount,
            due_amount: dueAmount,
            created_at: isoDate,
            note: saleNote.trim() || undefined,
          },
        });
        toast.success(lang === "bn" ? "কাস্টম বিক্রয় সফলভাবে যুক্ত হয়েছে!" : "Custom sale recorded successfully!");
      } else if (entryType === "expense") {
        const amt = Number(expAmount) || 0;
        if (!expTitle.trim()) throw new Error(lang === "bn" ? "খরচের বিবরণ দিন" : "Expense title is required");
        if (amt <= 0) throw new Error(lang === "bn" ? "খরচের পরিমাণ সঠিক দিন" : "Valid expense amount is required");

        await createExpenseFn({
          data: {
            title: expTitle.trim(),
            amount: amt,
            category: expCategory,
            note: expNote.trim() || null,
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "কাস্টম খরচ সফলভাবে যুক্ত হয়েছে!" : "Custom expense recorded successfully!");
      } else if (entryType === "purchase") {
        const qty = Number(purQty) || 1;
        const unitCost = Number(purUnitCost) || 0;
        if (!purProdName.trim()) throw new Error(lang === "bn" ? "পণ্যের নাম দিন" : "Product name is required");
        if (unitCost <= 0) throw new Error(lang === "bn" ? "কেনা দাম সঠিক দিন" : "Valid unit cost is required");

        await createPurchaseFn({
          data: {
            product_id: purProdId || null,
            product_name: purProdName.trim(),
            qty,
            unit_cost: unitCost,
            total: unitCost * qty,
            party_id: purSupplierId || null,
            note: purNote.trim() || null,
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "কাস্টম ক্রয় সফলভাবে যুক্ত হয়েছে!" : "Custom purchase recorded successfully!");
      } else if (entryType === "deposit") {
        const amt = Number(cashboxAmt) || 0;
        if (amt <= 0) throw new Error(lang === "bn" ? "জমার পরিমাণ সঠিক দিন" : "Valid deposit amount is required");

        await createCashboxFn({
          data: {
            kind: "deposit",
            amount: amt,
            note: cashboxNote.trim() || (lang === "bn" ? "কাস্টম ক্যাশ জমা" : "Custom Cash Deposit"),
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "ক্যাশবক্সে টাকা জমা সফল হয়েছে!" : "Cash added to cashbox successfully!");
      } else if (entryType === "withdraw") {
        const amt = Number(cashboxAmt) || 0;
        if (amt <= 0) throw new Error(lang === "bn" ? "উত্তোলনের পরিমাণ সঠিক দিন" : "Valid withdrawal amount is required");

        await createCashboxFn({
          data: {
            kind: "withdraw",
            amount: amt,
            note: cashboxNote.trim() || (lang === "bn" ? "কাস্টম ক্যাশ উত্তোলন" : "Custom Cashbox Withdrawal"),
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "ক্যাশবক্স থেকে উত্তোলন সফল হয়েছে!" : "Cash withdrawn from cashbox successfully!");
      } else if (entryType === "due_collection") {
        const amt = Number(dueAmount) || 0;
        if (!dueCustomerId) throw new Error(lang === "bn" ? "কাস্টমার নির্বাচন করুন" : "Select a customer");
        if (amt <= 0) throw new Error(lang === "bn" ? "আদায়ের পরিমাণ সঠিক দিন" : "Valid collected amount is required");

        await createPaymentFn({
          data: {
            party_id: dueCustomerId,
            amount: amt,
            note: dueNote.trim() || (lang === "bn" ? "বাকি আদায়" : "Due collection"),
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "বাকি আদায় সফলভাবে রেকর্ড হয়েছে!" : "Due collection recorded successfully!");
      }

      playSaleSuccessSound();

      // Invalidate queries for instant live updates across UI
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sales"] }),
        qc.invalidateQueries({ queryKey: ["expenses"] }),
        qc.invalidateQueries({ queryKey: ["purchases"] }),
        qc.invalidateQueries({ queryKey: ["cashbox"] }),
        qc.invalidateQueries({ queryKey: ["parties"] }),
        qc.invalidateQueries({ queryKey: ["payments"] }),
      ]);

      resetFormFields();

      if (closeAfter) {
        onOpenChange(false);
      }
    } catch (err: any) {
      playErrorSound();
      toast.error(err?.message || String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden border-border/80 shadow-2xl rounded-2xl bg-card">
        {/* Header with Title & Quick Date Selector */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-amber-500/10 border-b border-border/60">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="size-9 sm:size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-xs">
                <Sparkles className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold text-foreground">
                  {lang === "bn" ? "কাস্টম এন্ট্রি ও দ্রুত শর্টকাট" : "Custom Entry & Quick Actions"}
                </DialogTitle>
                <p className="text-[11px] sm:text-xs text-muted-foreground">
                  {lang === "bn"
                    ? "যেকোনো তারিখ ও সময়ে সরাসরি বিক্রি, খরচ, ক্রয় বা ক্যাশ রেকর্ড করুন"
                    : "Backdate or record any transaction with exact timestamp"}
                </p>
              </div>
            </div>
          </div>

          {/* Date & Time Bar */}
          <div className="mt-3.5 p-2.5 rounded-xl bg-background/80 backdrop-blur-xs border border-border/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Calendar className="size-4 text-primary shrink-0" />
              <Label className="text-xs font-semibold shrink-0">
                {lang === "bn" ? "তারিখ ও সময়:" : "Date & Time:"}
              </Label>
              <Input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-8 text-xs font-mono font-medium border-border/60 bg-card/60"
                required
              />
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("today")}
                className="h-7 text-[10px] sm:text-[11px] px-2 font-medium"
              >
                {lang === "bn" ? "আজ" : "Today"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("yesterday")}
                className="h-7 text-[10px] sm:text-[11px] px-2 font-medium"
              >
                {lang === "bn" ? "গতকাল" : "Yesterday"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("2daysAgo")}
                className="h-7 text-[10px] sm:text-[11px] px-2 font-medium"
              >
                {lang === "bn" ? "২ দিন আগে" : "2 Days Ago"}
              </Button>
            </div>
          </div>
        </div>

        {/* Transaction Type Navigation Tabs */}
        <div className="px-4 pt-3 border-b border-border/60 bg-muted/20">
          <Tabs value={entryType} onValueChange={(v: any) => { playTapSound(); setEntryType(v); }}>
            <TabsList className="w-full grid grid-cols-6 h-auto p-1 bg-muted/60 rounded-xl">
              <TabsTrigger value="sale" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <ShoppingBag className="size-3.5 text-emerald-500" />
                <span className="truncate">{lang === "bn" ? "বিক্রি" : "Sale"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">1</span>
              </TabsTrigger>
              <TabsTrigger value="expense" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <Receipt className="size-3.5 text-rose-500" />
                <span className="truncate">{lang === "bn" ? "খরচ" : "Expense"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">2</span>
              </TabsTrigger>
              <TabsTrigger value="purchase" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <ShoppingCart className="size-3.5 text-indigo-500" />
                <span className="truncate">{lang === "bn" ? "ক্রয়" : "Buy"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">3</span>
              </TabsTrigger>
              <TabsTrigger value="deposit" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <ArrowDownLeft className="size-3.5 text-sky-500" />
                <span className="truncate">{lang === "bn" ? "ক্যাশ জমা" : "Deposit"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">4</span>
              </TabsTrigger>
              <TabsTrigger value="withdraw" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <ArrowUpRight className="size-3.5 text-amber-500" />
                <span className="truncate">{lang === "bn" ? "উত্তোলন" : "Withdraw"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">5</span>
              </TabsTrigger>
              <TabsTrigger value="due_collection" className="text-[11px] sm:text-xs py-1.5 flex items-center justify-center gap-1 data-[state=active]:bg-background data-[state=active]:shadow-xs">
                <HandCoins className="size-3.5 text-purple-500" />
                <span className="truncate">{lang === "bn" ? "বাকি আদায়" : "Due Rec"}</span>
                <span className="hidden sm:inline text-[9px] text-muted-foreground opacity-60">6</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={(e) => handleSubmit(e, true)} className="p-4 sm:p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* 1. SALE FORM */}
          {entryType === "sale" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "বিদ্যমান পণ্য নির্বাচন করুন (ঐচ্ছিক)" : "Select Existing Product (Optional)"}</Label>
                <ProductSearchSelect
                  products={products}
                  value={saleProdId}
                  onChange={(val) => {
                    setSaleProdId(val);
                    const prod = products.find((p: any) => p.id === val);
                    if (prod) {
                      setSaleProdName(prod.name);
                      setSaleBuyPrice(String(prod.buy_price || 0));
                      setSaleSellPrice(String(prod.sell_price || 0));
                    }
                  }}
                  placeholder={lang === "bn" ? "পণ্য খুঁজুন..." : "Search product..."}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পণ্যের নাম *" : "Product Name *"}</Label>
                <Input
                  value={saleProdName}
                  onChange={(e) => setSaleProdName(e.target.value)}
                  placeholder={lang === "bn" ? "যেমন: কটন শার্ট" : "E.g. Cotton Shirt"}
                  className="h-8.5 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ *" : "Quantity *"}</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    className="h-8.5 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কেনা দাম (ইউনিট)" : "Buy Price (Unit)"}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={saleBuyPrice}
                    onChange={(e) => setSaleBuyPrice(e.target.value)}
                    placeholder="0"
                    className="h-8.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "বিক্রি দাম (ইউনিট) *" : "Sell Price (Unit) *"}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={saleSellPrice}
                    onChange={(e) => setSaleSellPrice(e.target.value)}
                    placeholder="0"
                    className="h-8.5 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</Label>
                  <Select value={salePaymentType} onValueChange={setSalePaymentType}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{lang === "bn" ? "নগদ (Cash)" : "Cash"}</SelectItem>
                      <SelectItem value="credit">{lang === "bn" ? "বাকি (Credit / Due)" : "Due / Credit"}</SelectItem>
                      <SelectItem value="bkash">bKash</SelectItem>
                      <SelectItem value="nagad">Nagad</SelectItem>
                      <SelectItem value="bank">Bank / Card</SelectItem>
                      <SelectItem value="online">{lang === "bn" ? "কুরিয়ার অনলাইন" : "Online Courier"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কাস্টমার (বাকি হলে বাধ্যতামূলক)" : "Customer (Required if Due)"}</Label>
                  <Select value={saleCustomerId} onValueChange={setSaleCustomerId}>
                    <SelectTrigger className="h-8.5 text-xs">
                      <SelectValue placeholder={lang === "bn" ? "কাস্টমার নির্বাচন..." : "Select customer..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য / নোট" : "Note (Optional)"}</Label>
                <Input
                  value={saleNote}
                  onChange={(e) => setSaleNote(e.target.value)}
                  placeholder={lang === "bn" ? "অতিরিক্ত তথ্য..." : "Extra details..."}
                  className="h-8.5 text-xs"
                />
              </div>
            </div>
          )}

          {/* 2. EXPENSE FORM */}
          {entryType === "expense" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "খরচের বিবরণ *" : "Expense Title *"}</Label>
                <Input
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder={lang === "bn" ? "যেমন: দোকানের বিদ্যুৎ বিল, চা নাস্তা" : "E.g. Electricity bill, Staff snacks"}
                  className="h-8.5 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ (টাকা) *" : "Amount (৳) *"}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0"
                    className="h-8.5 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "খরচের ক্যাটাগরি" : "Category"}</Label>
                  <Select value={expCategory} onValueChange={setExpCategory}>
                    <SelectTrigger className="h-8.5 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">{lang === "bn" ? "সাধারণ দোকান খরচ" : "General Shop"}</SelectItem>
                      <SelectItem value="utility">{lang === "bn" ? "ইউটিলিটি / বিল" : "Utilities"}</SelectItem>
                      <SelectItem value="rent">{lang === "bn" ? "দোকান ভাড়া" : "Rent"}</SelectItem>
                      <SelectItem value="salary">{lang === "bn" ? "কর্মচারী বেতন" : "Staff Salary"}</SelectItem>
                      <SelectItem value="transport">{lang === "bn" ? "পরিবহন / যাতায়াত" : "Transport"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য" : "Note (Optional)"}</Label>
                <Input
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder={lang === "bn" ? "পেমেন্ট মাধ্যম বা নোট..." : "Payment method or note..."}
                  className="h-8.5 text-xs"
                />
              </div>
            </div>
          )}

          {/* 3. PURCHASE FORM */}
          {entryType === "purchase" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "বিদ্যমান পণ্য নির্বাচন করুন (ঐচ্ছিক)" : "Select Existing Product (Optional)"}</Label>
                <ProductSearchSelect
                  products={products}
                  value={purProdId}
                  onChange={(val) => {
                    setPurProdId(val);
                    const prod = products.find((p: any) => p.id === val);
                    if (prod) {
                      setPurProdName(prod.name);
                      setPurUnitCost(String(prod.buy_price || 0));
                    }
                  }}
                  placeholder={lang === "bn" ? "পণ্য খুঁজুন..." : "Search product..."}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পণ্যের নাম *" : "Product Name *"}</Label>
                <Input
                  value={purProdName}
                  onChange={(e) => setPurProdName(e.target.value)}
                  placeholder={lang === "bn" ? "নতুন কেনা পণ্যের নাম" : "Purchased product name"}
                  className="h-8.5 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ *" : "Quantity *"}</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={purQty}
                    onChange={(e) => setPurQty(e.target.value)}
                    className="h-8.5 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কেনা দর (প্রতি পিস) *" : "Unit Cost *"}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={purUnitCost}
                    onChange={(e) => setPurUnitCost(e.target.value)}
                    placeholder="0"
                    className="h-8.5 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "সাপ্লায়ার / মহাজন" : "Supplier"}</Label>
                  <Select value={purSupplierId} onValueChange={setPurSupplierId}>
                    <SelectTrigger className="h-8.5 text-xs">
                      <SelectValue placeholder={lang === "bn" ? "সাপ্লায়ার নির্বাচন..." : "Select supplier..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} {s.phone ? `(${s.phone})` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "নোট" : "Note (Optional)"}</Label>
                  <Input
                    value={purNote}
                    onChange={(e) => setPurNote(e.target.value)}
                    placeholder={lang === "bn" ? "চালান বা ইনভয়েস নম্বর..." : "Chalan or memo..."}
                    className="h-8.5 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 4. CASHBOX DEPOSIT / WITHDRAW */}
          {(entryType === "deposit" || entryType === "withdraw") && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 flex items-center gap-3">
                <div className={`size-8 rounded-lg grid place-items-center ${entryType === "deposit" ? "bg-sky-500/10 text-sky-600" : "bg-amber-500/10 text-amber-600"}`}>
                  {entryType === "deposit" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold">
                    {entryType === "deposit"
                      ? (lang === "bn" ? "ক্যাশবক্সে সরাসরি টাকা যোগ (Deposit)" : "Cashbox Direct Deposit")
                      : (lang === "bn" ? "ক্যাশবক্স থেকে টাকা উত্তোলন (Withdrawal)" : "Cashbox Direct Withdrawal")}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    {entryType === "deposit"
                      ? (lang === "bn" ? "সরাসরি ক্যাশবক্স ব্যালেন্সে যোগ হবে এবং নির্বাচিত তারিখের হিসাবে প্রদর্শিত হবে" : "Added directly into cash drawer balance on selected date")
                      : (lang === "bn" ? "সরাসরি ক্যাশবক্স থেকে বাদ যাবে এবং নির্বাচিত তারিখের হিসাবে প্রদর্শিত হবে" : "Deducted directly from cash drawer on selected date")}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ (টাকা) *" : "Amount (৳) *"}</Label>
                <Input
                  type="number"
                  step="any"
                  value={cashboxAmt}
                  onChange={(e) => setCashboxAmt(e.target.value)}
                  placeholder="0"
                  className="h-9 text-xs font-bold font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "বিবরণ / কারণ *" : "Reason / Note *"}</Label>
                <Input
                  value={cashboxNote}
                  onChange={(e) => setCashboxNote(e.target.value)}
                  placeholder={entryType === "deposit" ? (lang === "bn" ? "যেমন: সকালের ক্যাশ ফ্লট, মালিকের জমা" : "E.g. Opening cash drawer float") : (lang === "bn" ? "যেমন: মালিকের ব্যক্তিগত উত্তোলন" : "E.g. Owner emergency personal cash")}
                  className="h-8.5 text-xs"
                  required
                />
              </div>
            </div>
          )}

          {/* 5. DUE COLLECTION */}
          {entryType === "due_collection" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "কাস্টমার নির্বাচন করুন *" : "Select Customer *"}</Label>
                <Select value={dueCustomerId} onValueChange={setDueCustomerId}>
                  <SelectTrigger className="h-8.5 text-xs">
                    <SelectValue placeholder={lang === "bn" ? "কাস্টমার নির্বাচন..." : "Select customer..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "আদায়ের পরিমাণ (টাকা) *" : "Collected Amount (৳) *"}</Label>
                <Input
                  type="number"
                  step="any"
                  value={dueAmount}
                  onChange={(e) => setDueAmount(e.target.value)}
                  placeholder="0"
                  className="h-9 text-xs font-bold font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য" : "Note (Optional)"}</Label>
                <Input
                  value={dueNote}
                  onChange={(e) => setDueNote(e.target.value)}
                  placeholder={lang === "bn" ? "যেমন: ক্যাশ আদায়" : "E.g. Cash collected"}
                  className="h-8.5 text-xs"
                />
              </div>
            </div>
          )}

          {/* Bottom Actions */}
          <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2.5">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <HelpCircle className="size-3.5" />
              <span>{lang === "bn" ? "পিসিতে Alt+1..6 চাপুন" : "PC Hotkeys: Alt+1 to Alt+6"}</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={submitting}
                onClick={(e) => handleSubmit(e as any, false)}
                className="h-8 text-xs font-medium"
              >
                <PlusCircle className="size-3.5 mr-1" />
                {lang === "bn" ? "যুক্ত করে আরেকটি" : "Save & Add Another"}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                {submitting ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "সংরক্ষণ করুন" : "Save & Close")}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
