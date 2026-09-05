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
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag,
  Receipt,
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  Calendar,
  CalendarPlus,
  Clock,
  CheckCircle2,
  PlusCircle,
  HelpCircle,
  ArrowRight,
  Tag,
  TrendingUp,
  Banknote,
  Sparkles,
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
  const customers = useMemo(() => parties.filter((p: any) => p.type === "customer" && !p.archived), [parties]);
  const suppliers = useMemo(() => parties.filter((p: any) => p.type === "supplier" && !p.archived), [parties]);

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

  // Date preset buttons
  const setDatePreset = (preset: "today" | "yesterday" | "2daysAgo" | "7daysAgo" | "monthStart" | "now") => {
    playTapSound();
    const d = new Date();
    if (preset === "yesterday") d.setDate(d.getDate() - 1);
    else if (preset === "2daysAgo") d.setDate(d.getDate() - 2);
    else if (preset === "7daysAgo") d.setDate(d.getDate() - 7);
    else if (preset === "monthStart") d.setDate(1);
    const pad = (n: number) => String(n).padStart(2, "0");
    setCustomDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  // Form states: Sale
  const [saleProdId, setSaleProdId] = useState("");
  const [saleProdName, setSaleProdName] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleBuyPrice, setSaleBuyPrice] = useState("");
  const [saleSellPrice, setSaleSellPrice] = useState("");
  const [saleDiscount, setSaleDiscount] = useState("");
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

  // Calculations for live preview
  const saleQtyNum = Number(saleQty) || 1;
  const saleSellNum = Number(saleSellPrice) || 0;
  const saleBuyNum = Number(saleBuyPrice) || 0;
  const saleDiscountNum = Number(saleDiscount) || 0;
  const saleSubtotal = saleQtyNum * saleSellNum;
  const saleTotal = Math.max(0, saleSubtotal - saleDiscountNum);
  const saleProfit = (saleSellNum - saleBuyNum) * saleQtyNum - saleDiscountNum;
  const saleMargin = saleTotal > 0 ? ((saleProfit / saleTotal) * 100).toFixed(1) : "0";

  const expAmtNum = Number(expAmount) || 0;
  const purQtyNum = Number(purQty) || 1;
  const purCostNum = Number(purUnitCost) || 0;
  const purTotal = purQtyNum * purCostNum;
  const cashboxAmtNum = Number(cashboxAmt) || 0;
  const dueAmtNum = Number(dueAmount) || 0;

  // Check if chosen date is backdated
  const isBackdated = useMemo(() => {
    if (!customDate) return false;
    const chosen = new Date(customDate);
    const now = new Date();
    return (
      chosen.getFullYear() < now.getFullYear() ||
      (chosen.getFullYear() === now.getFullYear() && chosen.getMonth() < now.getMonth()) ||
      (chosen.getFullYear() === now.getFullYear() && chosen.getMonth() === now.getMonth() && chosen.getDate() < now.getDate())
    );
  }, [customDate]);

  const formattedDate = useMemo(() => {
    if (!customDate) return "";
    const d = new Date(customDate);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(lang === "bn" ? "bn-BD" : "en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [customDate, lang]);

  // Clear fields on type change or finish
  const resetFormFields = () => {
    setSaleProdId(""); setSaleProdName(""); setSaleQty("1"); setSaleBuyPrice(""); setSaleSellPrice(""); setSaleDiscount(""); setSaleCustomerId(""); setSaleNote("");
    setExpTitle(""); setExpAmount(""); setExpCategory("general"); setExpNote("");
    setPurProdId(""); setPurProdName(""); setPurQty("1"); setPurUnitCost(""); setPurSupplierId(""); setPurNote("");
    setCashboxAmt(""); setCashboxNote("");
    setDueCustomerId(""); setDueAmount(""); setDueNote("");
  };

  const handleSubmit = async (e?: React.FormEvent, closeAfter = true) => {
    if (e) e.preventDefault();
    if (!customDate) {
      playErrorSound();
      return toast.error(lang === "bn" ? "তারিখ নির্বাচন করুন" : "Please select date & time");
    }

    setSubmitting(true);
    const parsedDate = new Date(customDate);
    const isoDate = !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

    try {
      if (entryType === "sale") {
        if (!saleProdName.trim()) throw new Error(lang === "bn" ? "পণ্যের নাম দিন" : "Product name is required");
        if (saleSellNum <= 0) throw new Error(lang === "bn" ? "বিক্রি মূল্য সঠিক দিন" : "Valid sell price is required");
        if (salePaymentType === "credit" && !saleCustomerId) {
          throw new Error(lang === "bn" ? "বাকি বিক্রির জন্য কাস্টমার নির্বাচন বাধ্যতামূলক" : "Customer is required for credit sales");
        }

        const paidAmount = salePaymentType === "credit" ? 0 : saleTotal;
        const dueAmount = salePaymentType === "credit" ? saleTotal : 0;

        await createSaleFn({
          data: {
            product_id: saleProdId || null,
            product_name: saleProdName.trim(),
            qty: saleQtyNum,
            buy_price: saleBuyNum,
            sell_price: saleSellNum,
            discount: saleDiscountNum,
            profit: saleProfit,
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
        if (!expTitle.trim()) throw new Error(lang === "bn" ? "খরচের বিবরণ দিন" : "Expense title is required");
        if (expAmtNum <= 0) throw new Error(lang === "bn" ? "খরচের পরিমাণ সঠিক দিন" : "Valid expense amount is required");

        await createExpenseFn({
          data: {
            title: expTitle.trim(),
            amount: expAmtNum,
            category: expCategory,
            note: expNote.trim() || null,
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "কাস্টম খরচ সফলভাবে যুক্ত হয়েছে!" : "Custom expense recorded successfully!");
      } else if (entryType === "purchase") {
        if (!purProdName.trim()) throw new Error(lang === "bn" ? "পণ্যের নাম দিন" : "Product name is required");
        if (purCostNum <= 0) throw new Error(lang === "bn" ? "কেনা দাম সঠিক দিন" : "Valid unit cost is required");

        await createPurchaseFn({
          data: {
            product_id: purProdId || null,
            product_name: purProdName.trim(),
            qty: purQtyNum,
            unit_cost: purCostNum,
            total: purTotal,
            party_id: purSupplierId || null,
            note: purNote.trim() || null,
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "কাস্টম ক্রয় সফলভাবে যুক্ত হয়েছে!" : "Custom purchase recorded successfully!");
      } else if (entryType === "deposit") {
        if (cashboxAmtNum <= 0) throw new Error(lang === "bn" ? "জমার পরিমাণ সঠিক দিন" : "Valid deposit amount is required");

        const noteText = cashboxNote.trim() || (lang === "bn" ? "কাস্টম ক্যাশ জমা" : "Custom Cash Deposit");
        try {
          await createCashboxFn({
            data: {
              kind: "deposit",
              amount: cashboxAmtNum,
              note: noteText,
              created_at: isoDate,
            },
          });
        } catch (rpcErr) {
          console.warn("createCashboxFn fallback to Firestore:", rpcErr);
          try {
            const { fsCreateCashbox } = await import("@/lib/firestore-service");
            await fsCreateCashbox({
              kind: "deposit",
              amount: cashboxAmtNum,
              note: noteText,
            });
          } catch (_) {}
        }
        toast.success(lang === "bn" ? "ক্যাশবক্সে টাকা জমা সফল হয়েছে!" : "Cash added to cashbox successfully!");
      } else if (entryType === "withdraw") {
        if (cashboxAmtNum <= 0) throw new Error(lang === "bn" ? "উত্তোলনের পরিমাণ সঠিক দিন" : "Valid withdrawal amount is required");

        const noteText = cashboxNote.trim() || (lang === "bn" ? "কাস্টম ক্যাশ উত্তোলন" : "Custom Cashbox Withdrawal");
        try {
          await createCashboxFn({
            data: {
              kind: "withdraw",
              amount: cashboxAmtNum,
              note: noteText,
              created_at: isoDate,
            },
          });
        } catch (rpcErr) {
          console.warn("createCashboxFn fallback to Firestore:", rpcErr);
          try {
            const { fsCreateCashbox } = await import("@/lib/firestore-service");
            await fsCreateCashbox({
              kind: "withdraw",
              amount: cashboxAmtNum,
              note: noteText,
            });
          } catch (_) {}
        }
        toast.success(lang === "bn" ? "ক্যাশবক্স থেকে উত্তোলন সফল হয়েছে!" : "Cash withdrawn from cashbox successfully!");
      } else if (entryType === "due_collection") {
        if (!dueCustomerId) throw new Error(lang === "bn" ? "কাস্টমার নির্বাচন করুন" : "Select a customer");
        if (dueAmtNum <= 0) throw new Error(lang === "bn" ? "আদায়ের পরিমাণ সঠিক দিন" : "Valid collected amount is required");

        await createPaymentFn({
          data: {
            party_id: dueCustomerId,
            amount: dueAmtNum,
            note: dueNote.trim() || (lang === "bn" ? "বাকি আদায়" : "Due collection"),
            created_at: isoDate,
          },
        });
        toast.success(lang === "bn" ? "বাকি আদায় সফলভাবে রেকর্ড হয়েছে!" : "Due collection recorded successfully!");
      }

      playSaleSuccessSound();

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

  // Keyboard shortcut listener for PC (Alt+1..6, Ctrl+Enter)
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
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit(undefined, false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, entryType, customDate, saleProdName, saleSellPrice, saleQty, saleBuyPrice, saleDiscount, salePaymentType, saleCustomerId, saleNote, expTitle, expAmount, expCategory, expNote, purProdName, purQty, purUnitCost, purSupplierId, purNote, cashboxAmt, cashboxNote, dueCustomerId, dueAmount, dueNote]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl p-0 overflow-hidden border-border/80 shadow-2xl rounded-2xl sm:rounded-3xl bg-card max-h-[92vh] flex flex-col">
        {/* Responsive Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-primary/10 border-b border-border/60 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 sm:size-11 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-xs shrink-0">
                <CalendarPlus className="size-5 sm:size-6 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                    {lang === "bn" ? "কাস্টম এন্ট্রি ও লেনদেন উইজেট" : "Custom Entry & Transaction Hub"}
                  </DialogTitle>
                  <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isBackdated ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"}`}>
                    {isBackdated
                      ? (lang === "bn" ? "পেছনের তারিখ (Backdated)" : "Backdated")
                      : (lang === "bn" ? "বর্তমান (Live)" : "Current Time")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                  {lang === "bn"
                    ? "যেকোনো তারিখ ও সময়ে সরাসরি বিক্রি, খরচ, ক্রয় বা ক্যাশ রেকর্ড করুন"
                    : "Record backdated or forward-dated sales, expenses, purchases, and cashbox transactions"}
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground bg-background/80 px-2.5 py-1 rounded-xl border border-border/60">
              <HelpCircle className="size-3.5 text-primary" />
              <span>{lang === "bn" ? "শর্টকাট:" : "Hotkeys:"}</span>
              <kbd className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border border-border text-[10px]">Alt + 1..6</kbd>
              <span className="opacity-40">|</span>
              <kbd className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border border-border text-[10px]">Ctrl + Enter</kbd>
            </div>
          </div>

          {/* Date & Time Bar */}
          <div className="mt-3.5 p-2.5 rounded-xl bg-background/90 backdrop-blur-xs border border-border/80 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Calendar className="size-4 text-primary shrink-0" />
              <Label className="text-xs font-semibold shrink-0">
                {lang === "bn" ? "তারিখ ও সময়:" : "Date & Time:"}
              </Label>
              <Input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-8.5 text-xs font-mono font-semibold border-border/70 bg-card"
                required
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5 md:pb-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("today")}
                className="h-7 text-[11px] px-2 font-semibold hover:bg-emerald-500/10 hover:text-emerald-600 rounded-lg shrink-0"
              >
                {lang === "bn" ? "আজ" : "Today"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("yesterday")}
                className="h-7 text-[11px] px-2 font-semibold hover:bg-amber-500/10 hover:text-amber-600 rounded-lg shrink-0"
              >
                {lang === "bn" ? "গতকাল" : "Yesterday"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("2daysAgo")}
                className="h-7 text-[11px] px-2 font-semibold hover:bg-indigo-500/10 hover:text-indigo-600 rounded-lg shrink-0"
              >
                {lang === "bn" ? "২ দিন আগে" : "2 Days Ago"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("7daysAgo")}
                className="h-7 text-[11px] px-2 font-semibold hover:bg-purple-500/10 hover:text-purple-600 rounded-lg shrink-0 hidden sm:inline-flex"
              >
                {lang === "bn" ? "৭ দিন আগে" : "1 Week Ago"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDatePreset("monthStart")}
                className="h-7 text-[11px] px-2 font-semibold hover:bg-sky-500/10 hover:text-sky-600 rounded-lg shrink-0 hidden sm:inline-flex"
              >
                {lang === "bn" ? "১ তারিখ" : "Month Start"}
              </Button>
            </div>
          </div>
        </div>

        {/* Responsive Transaction Type Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-border/60 bg-muted/20 shrink-0">
          <Tabs value={entryType} onValueChange={(v: any) => { playTapSound(); setEntryType(v); }}>
            <TabsList className="w-full grid grid-cols-3 sm:grid-cols-6 h-auto p-1 bg-muted/60 rounded-xl gap-1">
              <TabsTrigger
                value="sale"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <ShoppingBag className="size-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "বিক্রি" : "Sale"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+1</span>
              </TabsTrigger>

              <TabsTrigger
                value="expense"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <Receipt className="size-3.5 text-rose-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "খরচ" : "Expense"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+2</span>
              </TabsTrigger>

              <TabsTrigger
                value="purchase"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <ShoppingCart className="size-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "ক্রয়" : "Buy"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+3</span>
              </TabsTrigger>

              <TabsTrigger
                value="deposit"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <ArrowDownLeft className="size-3.5 text-sky-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "টাকা জমা" : "Deposit"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+4</span>
              </TabsTrigger>

              <TabsTrigger
                value="withdraw"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <ArrowUpRight className="size-3.5 text-amber-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "উত্তোলন" : "Withdraw"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+5</span>
              </TabsTrigger>

              <TabsTrigger
                value="due_collection"
                className="text-xs py-2 px-2 flex items-center justify-center gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs rounded-lg font-bold transition-all"
              >
                <HandCoins className="size-3.5 text-purple-500 shrink-0" />
                <span className="truncate">{lang === "bn" ? "বাকি আদায়" : "Due Rec"}</span>
                <span className="hidden md:inline text-[9px] px-1 bg-muted rounded font-mono text-muted-foreground">Alt+6</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Responsive Desktop 2-Column Body */}
        <form onSubmit={(e) => handleSubmit(e, true)} className="flex-1 overflow-hidden lg:grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
          {/* Left Column: Form Inputs */}
          <div className="lg:col-span-7 xl:col-span-8 p-4 sm:p-6 overflow-y-auto max-h-[55vh] lg:max-h-[calc(92vh-220px)] space-y-4">
            {/* 1. SALE FORM */}
            {entryType === "sale" && (
              <div className="space-y-4">
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
                    placeholder={lang === "bn" ? "ইনভেন্টরি পণ্য সার্চ করুন..." : "Search inventory product..."}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "পণ্যের নাম *" : "Product Name *"}</Label>
                  <Input
                    value={saleProdName}
                    onChange={(e) => setSaleProdName(e.target.value)}
                    placeholder={lang === "bn" ? "যেমন: কটন শার্ট, জুতো..." : "E.g. Cotton Shirt, Shoes..."}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ (পিস) *" : "Quantity *"}</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={saleQty}
                      onChange={(e) => setSaleQty(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কেনা দর (প্রতি পিস)" : "Buy Price (Unit)"}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={saleBuyPrice}
                      onChange={(e) => setSaleBuyPrice(e.target.value)}
                      placeholder="0"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{lang === "bn" ? "বিক্রি দর (প্রতি পিস) *" : "Sell Price (Unit) *"}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={saleSellPrice}
                      onChange={(e) => setSaleSellPrice(e.target.value)}
                      placeholder="0"
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "ছাড় / ডিসকাউন্ট (৳)" : "Discount (৳)"}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={saleDiscount}
                      onChange={(e) => setSaleDiscount(e.target.value)}
                      placeholder="0"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Method"}</Label>
                    <Select value={salePaymentType} onValueChange={setSalePaymentType}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">
                      {salePaymentType === "credit"
                        ? (lang === "bn" ? "কাস্টমার (বাকি বিক্রির জন্য আবশ্যক) *" : "Customer (Required for Due) *")
                        : (lang === "bn" ? "কাস্টমার (ঐচ্ছিক)" : "Customer (Optional)")}
                    </Label>
                    <Select value={saleCustomerId} onValueChange={setSaleCustomerId}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={lang === "bn" ? "কাস্টমার নির্বাচন..." : "Select customer..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য / নোট" : "Note (Optional)"}</Label>
                    <Input
                      value={saleNote}
                      onChange={(e) => setSaleNote(e.target.value)}
                      placeholder={lang === "bn" ? "চালান বা অতিরিক্ত বিবরণ..." : "Memo or notes..."}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. EXPENSE FORM */}
            {entryType === "expense" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "খরচের বিবরণ *" : "Expense Title *"}</Label>
                  <Input
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                    placeholder={lang === "bn" ? "যেমন: দোকানের বিদ্যুৎ বিল, অফিস নাস্তা, যাতায়াত..." : "E.g. Electricity bill, Office snacks, Transport..."}
                    className="h-9 text-xs font-medium"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-rose-600 dark:text-rose-400">{lang === "bn" ? "পরিমাণ (টাকা) *" : "Amount (৳) *"}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="0"
                      className="h-9 text-xs font-bold font-mono"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "খরচের ক্যাটাগরি" : "Category"}</Label>
                    <Select value={expCategory} onValueChange={setExpCategory}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">{lang === "bn" ? "সাধারণ দোকান খরচ" : "General Shop"}</SelectItem>
                        <SelectItem value="utility">{lang === "bn" ? "ইউটিলিটি ও বিল" : "Utilities & Bills"}</SelectItem>
                        <SelectItem value="rent">{lang === "bn" ? "দোকান ভাড়া" : "Rent"}</SelectItem>
                        <SelectItem value="salary">{lang === "bn" ? "কর্মচারী বেতন" : "Staff Salary"}</SelectItem>
                        <SelectItem value="transport">{lang === "bn" ? "পরিবহন ও ভাড়া" : "Transport"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য" : "Note (Optional)"}</Label>
                  <Input
                    value={expNote}
                    onChange={(e) => setExpNote(e.target.value)}
                    placeholder={lang === "bn" ? "পেমেন্ট মাধ্যম বা ভাউচার নম্বর..." : "Voucher or payment details..."}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}

            {/* 3. PURCHASE FORM */}
            {entryType === "purchase" && (
              <div className="space-y-4">
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
                    placeholder={lang === "bn" ? "নতুন কেনা পণ্যের নাম..." : "Purchased product title..."}
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পরিমাণ (পিস) *" : "Quantity *"}</Label>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={purQty}
                      onChange={(e) => setPurQty(e.target.value)}
                      className="h-9 text-xs font-bold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{lang === "bn" ? "কেনা দর (প্রতি পিস) *" : "Unit Cost *"}</Label>
                    <Input
                      type="number"
                      step="any"
                      value={purUnitCost}
                      onChange={(e) => setPurUnitCost(e.target.value)}
                      placeholder="0"
                      className="h-9 text-xs font-bold font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "সাপ্লায়ার / মহাজন" : "Supplier"}</Label>
                    <Select value={purSupplierId} onValueChange={setPurSupplierId}>
                      <SelectTrigger className="h-9 text-xs">
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
                    <Label className="text-xs font-semibold">{lang === "bn" ? "নোট বা মেমো নম্বর" : "Note / Memo (Optional)"}</Label>
                    <Input
                      value={purNote}
                      onChange={(e) => setPurNote(e.target.value)}
                      placeholder={lang === "bn" ? "চালান বা ইনভয়েস নম্বর..." : "Chalan or memo..."}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. CASHBOX DEPOSIT / WITHDRAW */}
            {(entryType === "deposit" || entryType === "withdraw") && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-muted/40 border border-border/60 flex items-center gap-3.5">
                  <div className={`size-10 rounded-xl grid place-items-center shadow-xs shrink-0 ${entryType === "deposit" ? "bg-sky-500/15 text-sky-600" : "bg-amber-500/15 text-amber-600"}`}>
                    {entryType === "deposit" ? <ArrowDownLeft className="size-5" /> : <ArrowUpRight className="size-5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      {entryType === "deposit"
                        ? (lang === "bn" ? "ক্যাশবক্সে সরাসরি টাকা জমা (Deposit)" : "Cashbox Direct Deposit")
                        : (lang === "bn" ? "ক্যাশবক্স থেকে টাকা উত্তোলন (Withdrawal)" : "Cashbox Direct Withdrawal")}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {entryType === "deposit"
                        ? (lang === "bn" ? "সরাসরি ক্যাশবক্স ড্রয়ারের ব্যালেন্সে যোগ হবে এবং নির্বাচিত তারিখে প্রদর্শিত হবে" : "Directly added into cash drawer balance for the selected date")
                        : (lang === "bn" ? "সরাসরি ক্যাশবক্স থেকে বাদ যাবে এবং নির্বাচিত তারিখে প্রদর্শিত হবে" : "Directly deducted from cash drawer for the selected date")}
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
                    className="h-10 text-sm font-bold font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "বিবরণ / কারণ *" : "Reason / Note *"}</Label>
                  <Input
                    value={cashboxNote}
                    onChange={(e) => setCashboxNote(e.target.value)}
                    placeholder={entryType === "deposit"
                      ? (lang === "bn" ? "যেমন: সকালের ড্রয়ার ক্যাশ, মালিকের জমা..." : "E.g. Opening cash drawer float, Owner deposit...")
                      : (lang === "bn" ? "যেমন: মালিকের ব্যক্তিগত খরচ, জরুরী উত্তোলন..." : "E.g. Owner personal withdrawal...")}
                    className="h-9 text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* 5. DUE COLLECTION */}
            {entryType === "due_collection" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কাস্টমার নির্বাচন করুন *" : "Select Customer *"}</Label>
                  <Select value={dueCustomerId} onValueChange={setDueCustomerId}>
                    <SelectTrigger className="h-9 text-xs">
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
                  <Label className="text-xs font-semibold text-purple-600 dark:text-purple-400">{lang === "bn" ? "আদায়ের পরিমাণ (টাকা) *" : "Collected Amount (৳) *"}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={dueAmount}
                    onChange={(e) => setDueAmount(e.target.value)}
                    placeholder="0"
                    className="h-10 text-sm font-bold font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "মন্তব্য" : "Note (Optional)"}</Label>
                  <Input
                    value={dueNote}
                    onChange={(e) => setDueNote(e.target.value)}
                    placeholder={lang === "bn" ? "যেমন: ক্যাশ আদায়, বিকাশ বা ব্যাংক রসিদ..." : "E.g. Cash collected, bKash memo..."}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Calculation & Intelligence Panel (PC & Mobile) */}
          <div className="lg:col-span-5 xl:col-span-4 p-4 sm:p-6 bg-muted/20 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              {/* Financial Snapshot Card */}
              <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    {lang === "bn" ? "হিসাব সারসংক্ষেপ" : "Financial Summary"}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold">
                    {entryType.toUpperCase()}
                  </span>
                </div>

                {/* Total Display */}
                <div>
                  <div className="text-[11px] text-muted-foreground">
                    {entryType === "sale" ? (lang === "bn" ? "সর্বমোট বিক্রয় মূল্য" : "Total Sale Value") :
                     entryType === "expense" ? (lang === "bn" ? "খরচের পরিমাণ" : "Total Expense") :
                     entryType === "purchase" ? (lang === "bn" ? "মোট ক্রয় খরচ" : "Total Purchase Cost") :
                     entryType === "deposit" ? (lang === "bn" ? "ক্যাশ জমা" : "Deposit Amount") :
                     entryType === "withdraw" ? (lang === "bn" ? "ক্যাশ উত্তোলন" : "Withdrawal Amount") :
                     (lang === "bn" ? "মোট বাকি আদায়" : "Due Collected")}
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-foreground tracking-tight mt-0.5">
                    ৳{entryType === "sale" ? saleTotal.toLocaleString() :
                      entryType === "expense" ? expAmtNum.toLocaleString() :
                      entryType === "purchase" ? purTotal.toLocaleString() :
                      entryType === "deposit" ? cashboxAmtNum.toLocaleString() :
                      entryType === "withdraw" ? cashboxAmtNum.toLocaleString() :
                      dueAmtNum.toLocaleString()}
                  </div>
                </div>

                {/* Granular Breakdown */}
                {entryType === "sale" && (
                  <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{lang === "bn" ? "সাবটোটাল:" : "Subtotal:"}</span>
                      <span className="font-mono">৳{saleSubtotal.toLocaleString()}</span>
                    </div>
                    {saleDiscountNum > 0 && (
                      <div className="flex justify-between text-rose-500 font-semibold">
                        <span>{lang === "bn" ? "ছাড় (Discount):" : "Discount:"}</span>
                        <span className="font-mono">-৳{saleDiscountNum.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-400">
                      <span>{lang === "bn" ? "আনুমানিক লাভ:" : "Est. Profit:"}</span>
                      <span className="font-mono">৳{saleProfit.toLocaleString()} ({saleMargin}%)</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>{lang === "bn" ? "পেমেন্ট:" : "Payment:"}</span>
                      <span className="font-bold uppercase text-foreground">{salePaymentType}</span>
                    </div>
                  </div>
                )}

                {entryType === "purchase" && (
                  <div className="space-y-1.5 pt-2 border-t border-border/60 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{lang === "bn" ? "পরিমাণ:" : "Quantity:"}</span>
                      <span className="font-mono">{purQtyNum} {lang === "bn" ? "পিস" : "Units"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{lang === "bn" ? "ইউনিট খরচ:" : "Unit Cost:"}</span>
                      <span className="font-mono">৳{purCostNum.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400 pt-1 border-t border-border/40">
                      <span>{lang === "bn" ? "ইনভেন্টরিতে স্টক যোগ:" : "Inventory Stock:"}</span>
                      <span className="font-mono">+{purQtyNum}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamp & Impact Banner */}
              <div className="p-3 rounded-xl bg-background/80 border border-border/60 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground font-semibold">
                  <Clock className="size-3.5 text-primary" />
                  <span>{lang === "bn" ? "নির্ধারিত তারিখ ও সময়:" : "Scheduled Timestamp:"}</span>
                </div>
                <div className="font-mono font-bold text-foreground pl-5">
                  {formattedDate || customDate}
                </div>
              </div>
            </div>

            {/* Bottom Actions for PC & Mobile */}
            <div className="space-y-2 pt-3 border-t border-border/60">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  disabled={submitting}
                  onClick={() => handleSubmit(undefined, false)}
                  className="h-10 text-xs font-bold rounded-xl cursor-pointer hover:bg-muted active:scale-95 transition-all"
                  title="Ctrl + Enter"
                >
                  <PlusCircle className="size-4 mr-1 text-primary" />
                  <span>{lang === "bn" ? "যুক্ত করে আরেকটি" : "Add Another"}</span>
                </Button>

                <Button
                  type="submit"
                  size="default"
                  disabled={submitting}
                  className="h-10 text-xs font-bold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md cursor-pointer active:scale-95 transition-all"
                  title="Enter"
                >
                  <CheckCircle2 className="size-4 mr-1" />
                  <span>{submitting ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "সংরক্ষণ করুন" : "Save & Close")}</span>
                </Button>
              </div>

              <div className="hidden lg:flex items-center justify-between text-[10px] text-muted-foreground px-1">
                <span>[Ctrl+Enter] {lang === "bn" ? "আরেকটি" : "Another"}</span>
                <span>[Enter] {lang === "bn" ? "সংরক্ষণ" : "Save"}</span>
                <span>[Esc] {lang === "bn" ? "বাতিল" : "Close"}</span>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
