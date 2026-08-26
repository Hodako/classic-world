"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSales, type Sale } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { FAB } from "@/components/ui/fab";
import { SaleDialog } from "@/components/sale-dialog";
import {
  Truck,
  PackageCheck,
  RotateCcw,
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { approveCourierPaymentFn, cancelCourierOrderFn } from "@/lib/rpc";
import { printPwaInvoice } from "@/lib/invoice-printer";
import { useAuth } from "@/hooks/use-auth";

export default function OnlineSellsPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data = [] } = useCachedQuery(["sales"], getSales);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Filter for online sales only
  const onlineSales = useMemo(() => {
    return (data ?? []).filter((s) => s.type === "online");
  }, [data]);

  // Group by cart_id if multi-item cart
  const groupedOnlineSales = useMemo(() => {
    const groups: { [key: string]: Sale[] } = {};
    const singles: Sale[] = [];

    onlineSales.forEach((s) => {
      if (s.cart_id) {
        if (!groups[s.cart_id]) groups[s.cart_id] = [];
        groups[s.cart_id].push(s);
      } else {
        singles.push(s);
      }
    });

    const result = [
      ...singles.map((s) => ({
        id: s.id,
        items: [s],
        product_name: s.product_name,
        qty: s.qty,
        sell_price: Number(s.sell_price) * s.qty,
        profit: s.profit,
        paid_amount: s.paid_amount,
        due_amount: s.due_amount,
        courier_status: (s as any).courier_status || "pending",
        courier_name: (s as any).courier_name || "Courier Delivery",
        tracking_code: (s as any).tracking_code || null,
        note: s.note,
        returned: (s as any).returned || false,
        created_at: s.created_at,
        parties: s.parties,
        party_id: s.party_id,
      })),
      ...Object.entries(groups).map(([cartId, items]) => {
        const first = items[0];
        const totalQty = items.reduce((sum, x) => sum + x.qty, 0);
        const totalSellPrice = items.reduce((sum, x) => sum + Number(x.sell_price) * x.qty, 0);
        const totalProfit = items.reduce((sum, x) => sum + x.profit, 0);
        const names = items.map((x) => `${x.product_name} (×${x.qty})`).join(", ");

        return {
          id: first.id,
          cart_id: cartId,
          items,
          product_name: names,
          qty: totalQty,
          sell_price: totalSellPrice,
          profit: totalProfit,
          paid_amount: first.paid_amount,
          due_amount: first.due_amount,
          courier_status: (first as any).courier_status || "pending",
          courier_name: (first as any).courier_name || "Courier Delivery",
          tracking_code: (first as any).tracking_code || null,
          note: first.note,
          returned: (first as any).returned || false,
          created_at: first.created_at,
          parties: first.parties,
          party_id: first.party_id,
        };
      }),
    ];

    const parseDate = (dateInput: any): Date => {
      if (!dateInput) return new Date(0);
      if (typeof dateInput?.toDate === "function") return dateInput.toDate();
      if (dateInput?.seconds !== undefined) return new Date(dateInput.seconds * 1000);
      const d = new Date(dateInput);
      return !isNaN(d.getTime()) ? d : new Date(0);
    };

    result.sort((a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime());
    return result;
  }, [onlineSales]);

  // Tab Filtering
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupedOnlineSales.filter((item) => {
      // 1. Tab Filter
      if (tab === "pending") {
        if (item.courier_status === "collected" || item.courier_status === "cancelled" || item.returned) return false;
      } else if (tab === "collected") {
        if (item.courier_status !== "collected") return false;
      } else if (tab === "cancelled") {
        if (item.courier_status !== "cancelled" && !item.returned) return false;
      }

      // 2. Search query
      if (q) {
        const matchProd = item.product_name.toLowerCase().includes(q);
        const matchCust = (item.parties?.name ?? "").toLowerCase().includes(q);
        const matchCourier = (item.courier_name ?? "").toLowerCase().includes(q);
        const matchTrack = (item.tracking_code ?? "").toLowerCase().includes(q);
        if (!matchProd && !matchCust && !matchCourier && !matchTrack) return false;
      }

      return true;
    });
  }, [groupedOnlineSales, tab, search]);

  // Overall Financial Counters for Online Sales
  const pendingAmount = useMemo(() => {
    return groupedOnlineSales
      .filter((s) => s.courier_status !== "collected" && s.courier_status !== "cancelled" && !s.returned)
      .reduce((acc, s) => acc + s.sell_price, 0);
  }, [groupedOnlineSales]);

  const collectedAmount = useMemo(() => {
    return groupedOnlineSales
      .filter((s) => s.courier_status === "collected")
      .reduce((acc, s) => acc + s.sell_price, 0);
  }, [groupedOnlineSales]);

  const onlineProfitTotal = useMemo(() => {
    return groupedOnlineSales
      .filter((s) => s.courier_status !== "cancelled" && !s.returned)
      .reduce((acc, s) => acc + s.profit, 0);
  }, [groupedOnlineSales]);

  async function handleApprove(id: string) {
    setActionBusyId(id);
    try {
      await approveCourierPaymentFn({ data: { id } });
      toast.success(lang === "bn" ? "কুরিয়ার পেমেন্ট সফলভাবে ক্যাশবক্সে জমা হয়েছে!" : "Courier payment collected and deposited into Cashbox!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleCancel(id: string) {
    setActionBusyId(id);
    try {
      await cancelCourierOrderFn({ data: { id } });
      toast.success(lang === "bn" ? "কুরিয়ার অর্ডার বাতিল এবং স্টক ফিরিয়ে দেওয়া হয়েছে!" : "Courier order cancelled and stock restored!");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setActionBusyId(null);
    }
  }

  function handlePrint(item: any) {
    const custName = item.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Online Customer");
    const invNo = item.cart_id ? `INV-${item.cart_id.slice(-6).toUpperCase()}` : `INV-${item.id.slice(-6).toUpperCase()}`;

    try {
      printPwaInvoice({
        businessName: user?.business_name || "Dream Fashion",
        userEmail: user?.business_emails || user?.email || "",
        shopAddress: user?.business_address || "",
        shopPhoneNumbers: user?.business_phone_numbers || "",
        pageSize: user?.invoice_page_size || "58mm",
        terms: user?.invoice_terms || "",
        invoiceNo: invNo,
        invoiceDate: fmtDateTime(item.created_at),
        customerName: custName,
        paymentMode: `COURIER [${item.courier_name || "Courier"}]`,
        items: item.items.map((it: any) => ({
          product: { id: it.product_id || undefined, name: it.product_name },
          qty: Number(it.qty) || 1,
          sellPrice: Number(it.sell_price) || 0,
        })),
        subtotal: item.sell_price,
        discountAmount: 0,
        total: item.sell_price,
        paidAmount: item.courier_status === "collected" ? item.sell_price : 0,
        due: item.courier_status === "collected" ? 0 : item.sell_price,
      });
      toast.success(lang === "bn" ? "ইনভয়েস প্রিন্ট প্রস্তুত হচ্ছে!" : "Opening invoice print view!");
    } catch (err: any) {
      toast.error(err?.message || "Print failed");
    }
  }

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const toggleOrder = (id: string) => {
    setExpandedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-3 pb-12 font-hind">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-card p-2.5 sm:p-3 rounded-2xl border-[0.5px] border-black/75 dark:border-white/30 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-8 sm:size-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0">
              <Truck className="size-4.5 sm:size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold font-hind text-zinc-800 dark:text-zinc-200 tracking-tight truncate">
                {lang === "bn" ? "অনলাইন ও কুরিয়ার ডেলিভারি" : "Online & Courier Delivery"}
              </h1>
              <p className="text-[10.5px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-hind truncate max-w-[210px] sm:max-w-none">
                {lang === "bn" ? "কুরিয়ার ক্যাশ অন ডেলিভারি ও রেমিট্যান্স ট্র্যাকিং" : "Track courier remittances & orders"}
              </p>
            </div>
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            style={{ backgroundColor: "#ADFF2F" }}
            className="sm:hidden h-7.5 px-2.5 text-xs font-bold font-hind rounded-lg text-zinc-950 gap-1 shrink-0 border border-black/20 hover:brightness-95 transition-all shadow-2xs cursor-pointer"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন অর্ডার" : "New"}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap font-hind">
          <div className="relative flex-1 sm:w-60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-7.5 h-8 text-xs rounded-xl font-hind"
              placeholder={lang === "bn" ? "কুরিয়ার, ট্র্যাকিং বা কাস্টমার খুঁজুন..." : "Search courier orders..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            style={{ backgroundColor: "#ADFF2F" }}
            className="hidden sm:flex h-8 px-3 text-xs font-bold font-hind rounded-xl text-zinc-950 border border-black/20 hover:brightness-95 transition-all shadow-2xs gap-1.5 cursor-pointer"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন কুরিয়ার অর্ডার" : "New Courier Order"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Info Boxes Grid (#98FB98 background) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-center">
        <Card
          className="p-2 sm:p-2.5 rounded-xl border-[0.5px] border-black/75 dark:border-white/30 shadow-2xs text-zinc-950 font-hind transition-all"
          style={{ backgroundColor: "#98FB98" }}
        >
          <div className="flex items-center justify-between text-zinc-800">
            <span className="text-[10.5px] sm:text-xs font-bold font-hind uppercase tracking-tight">{lang === "bn" ? "মোট অর্ডার" : "Total Orders"}</span>
            <Truck className="size-3.5 sm:size-4 text-zinc-800" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-serif text-zinc-950 mt-0.5">{groupedOnlineSales.length}</p>
        </Card>

        <Card
          className="p-2 sm:p-2.5 rounded-xl border-[0.5px] border-black/75 dark:border-white/30 shadow-2xs text-zinc-950 font-hind transition-all"
          style={{ backgroundColor: "#98FB98" }}
        >
          <div className="flex items-center justify-between text-zinc-800">
            <span className="text-[10.5px] sm:text-xs font-bold font-hind uppercase tracking-tight">{lang === "bn" ? "কুরিয়ার পেন্ডিং" : "Pending Courier"}</span>
            <Clock className="size-3.5 sm:size-4 text-zinc-800" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-serif text-zinc-950 mt-0.5">{fmtMoney(pendingAmount)}</p>
          <span className="text-[9.5px] sm:text-[10px] text-zinc-700 font-hind block truncate">{lang === "bn" ? "ক্যাশবক্সে জমা বাকি" : "Awaiting collection"}</span>
        </Card>

        <Card
          className="p-2 sm:p-2.5 rounded-xl border-[0.5px] border-black/75 dark:border-white/30 shadow-2xs text-zinc-950 font-hind transition-all"
          style={{ backgroundColor: "#98FB98" }}
        >
          <div className="flex items-center justify-between text-zinc-800">
            <span className="text-[10.5px] sm:text-xs font-bold font-hind uppercase tracking-tight">{lang === "bn" ? "কালেক্টেড (ক্যাশবক্স)" : "Collected"}</span>
            <CheckCircle2 className="size-3.5 sm:size-4 text-zinc-800" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-serif text-zinc-950 mt-0.5">{fmtMoney(collectedAmount)}</p>
          <span className="text-[9.5px] sm:text-[10px] text-zinc-700 font-hind block truncate">{lang === "bn" ? "টাকা ক্যাশবক্সে যুক্ত" : "Deposited in cashbox"}</span>
        </Card>

        <Card
          className="p-2 sm:p-2.5 rounded-xl border-[0.5px] border-black/75 dark:border-white/30 shadow-2xs text-zinc-950 font-hind transition-all"
          style={{ backgroundColor: "#98FB98" }}
        >
          <div className="flex items-center justify-between text-zinc-800">
            <span className="text-[10.5px] sm:text-xs font-bold font-hind uppercase tracking-tight">{lang === "bn" ? "অনলাইন মোট লাভ" : "Online Profit"}</span>
            <ArrowUpRight className="size-3.5 sm:size-4 text-zinc-800" />
          </div>
          <p className="text-base sm:text-lg font-extrabold font-serif text-zinc-950 mt-0.5">{fmtMoney(onlineProfitTotal)}</p>
          <span className="text-[9.5px] sm:text-[10px] text-zinc-700 font-hind block truncate">{lang === "bn" ? "নিট অর্জিত লাভ" : "Net profit recorded"}</span>
        </Card>
      </div>

      {/* Tabs Filter */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full text-xs font-bold font-hind p-0.5 sm:p-1 h-8 sm:h-8.5 bg-muted/80 rounded-xl gap-0.5 sm:gap-1">
          <TabsTrigger value="all" className="rounded-lg text-[10.5px] sm:text-xs font-bold h-7 sm:h-7.5">
            {lang === "bn" ? `সব (${groupedOnlineSales.length})` : `All (${groupedOnlineSales.length})`}
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg text-[10.5px] sm:text-xs font-bold h-7 sm:h-7.5 text-amber-800 dark:text-amber-300">
            ⏳ {lang === "bn" ? "অপেক্ষমাণ" : "Pending"}
          </TabsTrigger>
          <TabsTrigger value="collected" className="rounded-lg text-[10.5px] sm:text-xs font-bold h-7 sm:h-7.5 text-emerald-800 dark:text-emerald-300">
            ✓ {lang === "bn" ? "কালেক্টেড" : "Collected"}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="rounded-lg text-[10.5px] sm:text-xs font-bold h-7 sm:h-7.5 text-rose-800 dark:text-rose-300">
            ✕ {lang === "bn" ? "বাতিল" : "Cancelled"}
          </TabsTrigger>
        </TabsList>

        <div className="pt-2.5 space-y-1.5 sm:space-y-2">
          {filteredList.length === 0 ? (
            <Card className="p-8 sm:p-12 text-center rounded-2xl border-dashed border-border text-muted-foreground">
              <Truck className="size-7 sm:size-8 mx-auto mb-1.5 text-muted-foreground/40" />
              <p className="text-xs font-medium font-hind">
                {lang === "bn" ? "নির্বাচিত ক্যাটাগরিতে কোন অনলাইন অর্ডার পাওয়া যায়নি।" : "No online orders found for the selected view."}
              </p>
            </Card>
          ) : (
            filteredList.map((item) => {
              const isPending = item.courier_status !== "collected" && item.courier_status !== "cancelled" && !item.returned;
              const isCollected = item.courier_status === "collected";
              const isCancelled = item.courier_status === "cancelled" || item.returned;
              const isExpanded = expandedOrders[item.id] || false;

              return (
                <div
                  key={item.id}
                  className={`rounded-xl border-[0.5px] transition-all duration-150 ${
                    isExpanded
                      ? "border-black dark:border-white bg-primary/[0.02] shadow-xs"
                      : "border-black/70 dark:border-white/30 hover:border-black dark:hover:border-white bg-card"
                  }`}
                >
                  {/* Compact 2-Line Clickable Summary */}
                  <div
                    onClick={() => toggleOrder(item.id)}
                    className="p-2 sm:p-2.5 cursor-pointer select-none space-y-0.5"
                  >
                    {/* Line 1: Product Name & Count | Total Amount & Courier Status Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className={`font-bold font-hind text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 truncate ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                          {item.product_name}
                        </span>
                        {item.items.length > 1 && (
                          <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0 font-hind font-bold">
                            {item.items.length}টি
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPending ? (
                          <span className="text-[9.5px] sm:text-[10px] font-bold font-hind px-1.5 py-0.2 rounded border-[0.5px] border-amber-500/40 uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 animate-pulse">
                            ⏳ {lang === "bn" ? "পেন্ডিং" : "Pending"}
                          </span>
                        ) : isCollected ? (
                          <span className="text-[9.5px] sm:text-[10px] font-bold font-hind px-1.5 py-0.2 rounded border-[0.5px] border-emerald-500/40 uppercase tracking-wider bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                            ✓ {lang === "bn" ? "পেইড" : "Paid"}
                          </span>
                        ) : (
                          <span className="text-[9.5px] sm:text-[10px] font-bold font-hind px-1.5 py-0.2 rounded border-[0.5px] border-rose-500/40 uppercase tracking-wider bg-rose-500/15 text-rose-800 dark:text-rose-300 line-through">
                            ✕ {lang === "bn" ? "বাতিল" : "Cancelled"}
                          </span>
                        )}

                        <span className={`text-xs sm:text-sm font-extrabold font-serif text-zinc-900 dark:text-zinc-100 ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                          {fmtMoney(item.sell_price)}
                        </span>
                      </div>
                    </div>

                    {/* Line 2: Customer / Date | Profit & Reveal Trigger */}
                    <div className="flex items-center justify-between gap-2 text-[10.5px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-hind">
                      <div className="min-w-0 flex-1 truncate flex items-center gap-1">
                        {item.parties?.name ? (
                          <>
                            <span className="font-bold font-charukola text-zinc-700 dark:text-zinc-300 truncate max-w-[120px] sm:max-w-[200px]">
                              {item.parties.name}
                            </span>
                            <span>·</span>
                          </>
                        ) : null}
                        <span className="font-mono text-[10px] sm:text-[10.5px]">
                          {fmtDateTime(item.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] sm:text-[10.5px] font-bold font-hind text-emerald-700 dark:text-emerald-300">
                          {lang === "bn" ? "লাভ:" : "Profit:"} {isCancelled ? "৳০" : fmtMoney(item.profit)}
                        </span>
                        <span className="p-0.5 rounded text-muted-foreground/70 hover:text-foreground">
                          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Revealable Action & Order Details Drawer */}
                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 pt-1 border-t-[0.5px] border-black/40 dark:border-white/20 space-y-2 bg-muted/10 rounded-b-xl animate-in fade-in-50 duration-150 font-hind">
                      {/* Courier Information Bar */}
                      <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/10 border-[0.5px] border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Truck className="size-3.5 text-purple-600 shrink-0" />
                          <span className="font-bold text-purple-900 dark:text-purple-200">{item.courier_name || "Courier Delivery"}</span>
                          {item.tracking_code && (
                            <span className="font-mono text-[10px] bg-background text-foreground px-1.5 py-0.2 rounded border-[0.5px] border-black/30 dark:border-white/30">
                              ID: {item.tracking_code}
                            </span>
                          )}
                        </div>

                        {item.note && (
                          <span className="text-[10.5px] text-muted-foreground italic">
                            {item.note}
                          </span>
                        )}
                      </div>

                      {/* Multi-Item Breakdown List if Group */}
                      {item.items.length > 1 && (
                        <div className="space-y-0.5 bg-background/80 p-1.5 sm:p-2 rounded-lg border-[0.5px] border-black/20 dark:border-white/20">
                          <span className="text-[9.5px] font-bold uppercase text-muted-foreground tracking-wider block font-hind">
                            {lang === "bn" ? "অর্ডার আইটেম সমূহ" : "Order Items"}
                          </span>
                          {item.items.map((it: any) => (
                            <div key={it.id} className="flex justify-between items-center text-xs py-0.5 border-b border-border/30 last:border-0 font-hind">
                              <div className="truncate mr-2">
                                <span className="font-bold text-zinc-800 dark:text-zinc-200">{it.product_name}</span>
                                <span className="text-muted-foreground font-mono ml-1">×{it.qty}</span>
                              </div>
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0">
                                {fmtMoney(Number(it.sell_price) * it.qty)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions Toolbar */}
                      <div className="flex items-center justify-between gap-2 pt-0.5 font-hind">
                        <Button
                          onClick={(e) => { e.stopPropagation(); handlePrint(item); }}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs font-bold rounded-lg gap-1 cursor-pointer bg-background hover:bg-muted border-[0.5px] border-black/50 dark:border-white/30"
                        >
                          <Printer className="size-3 text-primary" />
                          <span>{lang === "bn" ? "রসিদ প্রিন্ট" : "Print Invoice"}</span>
                        </Button>

                        {isPending && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              style={{ backgroundColor: "#ADFF2F" }}
                              onClick={(e) => { e.stopPropagation(); handleApprove(item.id); }}
                              disabled={actionBusyId === item.id}
                              className="h-7 px-2.5 text-xs font-bold rounded-lg text-zinc-950 gap-1 border border-black/20 hover:brightness-95 transition-all shadow-2xs cursor-pointer"
                            >
                              <PackageCheck className="size-3 text-zinc-950" />
                              <span>{lang === "bn" ? "✓ গ্রহণ" : "Accept"}</span>
                            </Button>

                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => { e.stopPropagation(); handleCancel(item.id); }}
                              disabled={actionBusyId === item.id}
                              className="h-7 px-2 text-xs font-bold rounded-lg gap-1 cursor-pointer"
                            >
                              <RotateCcw className="size-3" />
                              <span>{lang === "bn" ? "বাতিল" : "Cancel"}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Tabs>

      <FAB onClick={() => setOpen(true)} />
      <SaleDialog open={open} onOpenChange={setOpen} presetType="online" />
    </div>
  );
}
