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

    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    <div className="space-y-4 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3.5 rounded-2xl border-[0.5px] border-black/75 dark:border-white/30 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Truck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold font-charukola">{lang === "bn" ? "অনলাইন ও কুরিয়ার ডেলিভারি" : "Online & Courier Sales"}</h1>
              <p className="text-[11px] text-muted-foreground font-balooda">
                {lang === "bn" ? "কুরিয়ার ক্যাশ অন ডেলিভারি এবং রেমিট্যান্স ট্র্যাকিং" : "Track pending courier remittances and deliveries"}
              </p>
            </div>
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            className="sm:hidden h-8 px-2.5 text-xs font-bold font-balooda rounded-lg bg-primary text-primary-foreground gap-1"
          >
            <Plus className="size-3.5 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন অর্ডার" : "New"}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap font-balooda">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 h-8.5 text-xs rounded-xl font-balooda"
              placeholder={lang === "bn" ? "কুরিয়ার, ট্র্যাকিং বা কাস্টমার খুঁজুন..." : "Search courier orders..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Button
            onClick={() => setOpen(true)}
            size="sm"
            className="hidden sm:flex h-8.5 px-3 text-xs font-bold font-balooda rounded-xl bg-primary text-primary-foreground shadow-xs gap-1.5 cursor-pointer"
          >
            <Plus className="size-4 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন কুরিয়ার অর্ডার" : "New Courier Order"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Card className="p-3 rounded-xl border-[0.5px] border-black/75 dark:border-white/30 bg-card shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold font-balooda">{lang === "bn" ? "মোট অর্ডার" : "Total Orders"}</span>
            <Truck className="size-4 text-purple-600" />
          </div>
          <p className="text-lg font-bold font-serif text-foreground mt-1">{groupedOnlineSales.length}</p>
        </Card>

        <Card className="p-3 rounded-xl border-[0.5px] border-amber-500/50 bg-amber-500/5 shadow-2xs">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-300">
            <span className="text-xs font-bold font-balooda">{lang === "bn" ? "কুরিয়ার পেন্ডিং" : "Pending Courier"}</span>
            <Clock className="size-4" />
          </div>
          <p className="text-lg font-bold font-serif text-amber-700 dark:text-amber-300 mt-1">{fmtMoney(pendingAmount)}</p>
          <span className="text-[10px] text-muted-foreground font-balooda">{lang === "bn" ? "ক্যাশবক্সে এখনো জমা হয়নি" : "Not yet in cashbox"}</span>
        </Card>

        <Card className="p-3 rounded-xl border-[0.5px] border-emerald-500/50 bg-emerald-500/5 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
            <span className="text-xs font-bold font-balooda">{lang === "bn" ? "কালেক্টেড (ক্যাশবক্স)" : "Collected in Cashbox"}</span>
            <CheckCircle2 className="size-4" />
          </div>
          <p className="text-lg font-bold font-serif text-emerald-700 dark:text-emerald-300 mt-1">{fmtMoney(collectedAmount)}</p>
          <span className="text-[10px] text-muted-foreground font-balooda">{lang === "bn" ? "টাকা ক্যাশবক্সে জমা হয়েছে" : "Deposited in cashbox"}</span>
        </Card>

        <Card className="p-3 rounded-xl border-[0.5px] border-sky-500/50 bg-sky-500/5 shadow-2xs">
          <div className="flex items-center justify-between text-sky-700 dark:text-sky-300">
            <span className="text-xs font-bold font-balooda">{lang === "bn" ? "অনলাইন মোট লাভ" : "Online Profit"}</span>
            <ArrowUpRight className="size-4" />
          </div>
          <p className="text-lg font-bold font-serif text-sky-700 dark:text-sky-300 mt-1">{fmtMoney(onlineProfitTotal)}</p>
          <span className="text-[10px] text-muted-foreground font-balooda">{lang === "bn" ? "নিট অর্জিত লাভ" : "Net profit recorded"}</span>
        </Card>
      </div>

      {/* Tabs Filter */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full text-xs font-bold font-balooda p-1 bg-muted/80 rounded-xl gap-1">
          <TabsTrigger value="all" className="rounded-lg text-[11px] sm:text-xs font-bold">
            {lang === "bn" ? `সব (${groupedOnlineSales.length})` : `All (${groupedOnlineSales.length})`}
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg text-[11px] sm:text-xs font-bold text-amber-700 dark:text-amber-300">
            ⏳ {lang === "bn" ? "অপেক্ষমাণ" : "Pending"}
          </TabsTrigger>
          <TabsTrigger value="collected" className="rounded-lg text-[11px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-300">
            ✓ {lang === "bn" ? "কালেক্টেড" : "Collected"}
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="rounded-lg text-[11px] sm:text-xs font-bold text-rose-700 dark:text-rose-300">
            ✕ {lang === "bn" ? "বাতিল" : "Cancelled"}
          </TabsTrigger>
        </TabsList>

        <div className="pt-3 space-y-2">
          {filteredList.length === 0 ? (
            <Card className="p-12 text-center rounded-2xl border-dashed border-border text-muted-foreground">
              <Truck className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs font-medium font-balooda">
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
                    className="p-2.5 sm:p-3 cursor-pointer select-none space-y-1"
                  >
                    {/* Line 1: Product Name & Count | Total Amount & Courier Status Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className={`font-bold font-balooda text-xs sm:text-sm text-foreground truncate ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                          {item.product_name}
                        </span>
                        {item.items.length > 1 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0 font-balooda font-bold">
                            {item.items.length}টি
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPending ? (
                          <span className="text-[10px] font-bold font-balooda px-1.5 py-0.5 rounded border-[0.5px] border-amber-500/40 uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 animate-pulse">
                            ⏳ {lang === "bn" ? "পেন্ডিং" : "Pending"}
                          </span>
                        ) : isCollected ? (
                          <span className="text-[10px] font-bold font-balooda px-1.5 py-0.5 rounded border-[0.5px] border-emerald-500/40 uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            ✓ {lang === "bn" ? "পেইড" : "Paid"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold font-balooda px-1.5 py-0.5 rounded border-[0.5px] border-rose-500/40 uppercase tracking-wider bg-rose-500/15 text-rose-700 dark:text-rose-300 line-through">
                            ✕ {lang === "bn" ? "বাতিল" : "Cancelled"}
                          </span>
                        )}

                        <span className={`text-xs sm:text-sm font-extrabold font-serif text-foreground ${isCancelled ? "line-through text-muted-foreground" : ""}`}>
                          {fmtMoney(item.sell_price)}
                        </span>
                      </div>
                    </div>

                    {/* Line 2: Customer / Date | Profit & Reveal Trigger */}
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground font-balooda">
                      <div className="min-w-0 flex-1 truncate flex items-center gap-1">
                        {item.parties?.name ? (
                          <>
                            <span className="font-bold font-charukola text-foreground truncate max-w-[120px] sm:max-w-[200px]">
                              {item.parties.name}
                            </span>
                            <span>·</span>
                          </>
                        ) : null}
                        <span className="font-mono text-[10.5px]">
                          {fmtDateTime(item.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10.5px] font-bold font-balooda text-emerald-600 dark:text-emerald-400">
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
                    <div className="px-3 pb-3 pt-1 border-t-[0.5px] border-black/40 dark:border-white/20 space-y-2.5 bg-muted/10 rounded-b-xl animate-in fade-in-50 duration-150 font-balooda">
                      {/* Courier Information Bar */}
                      <div className="p-2 rounded-lg bg-purple-500/10 border-[0.5px] border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Truck className="size-3.5 text-purple-600 shrink-0" />
                          <span className="font-bold text-purple-900 dark:text-purple-200">{item.courier_name || "Courier Delivery"}</span>
                          {item.tracking_code && (
                            <span className="font-mono text-[10.5px] bg-background text-foreground px-1.5 py-0.5 rounded border-[0.5px] border-black/30 dark:border-white/30">
                              ID: {item.tracking_code}
                            </span>
                          )}
                        </div>

                        {item.note && (
                          <span className="text-[11px] text-muted-foreground italic">
                            {item.note}
                          </span>
                        )}
                      </div>

                      {/* Multi-Item Breakdown List if Group */}
                      {item.items.length > 1 && (
                        <div className="space-y-1 bg-background/80 p-2 rounded-lg border-[0.5px] border-black/20 dark:border-white/20">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider block font-balooda">
                            {lang === "bn" ? "অর্ডার আইটেম সমূহ" : "Order Items"}
                          </span>
                          {item.items.map((it: any) => (
                            <div key={it.id} className="flex justify-between items-center text-xs py-0.5 border-b border-border/30 last:border-0 font-balooda">
                              <div className="truncate mr-2">
                                <span className="font-bold text-foreground">{it.product_name}</span>
                                <span className="text-muted-foreground font-mono ml-1">×{it.qty}</span>
                              </div>
                              <span className="font-mono font-bold text-foreground shrink-0">
                                {fmtMoney(Number(it.sell_price) * it.qty)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions Toolbar */}
                      <div className="flex items-center justify-between gap-2 pt-1 font-balooda">
                        <Button
                          onClick={(e) => { e.stopPropagation(); handlePrint(item); }}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs font-bold rounded-lg gap-1.5 cursor-pointer bg-background hover:bg-muted border-[0.5px] border-black/50 dark:border-white/30"
                        >
                          <Printer className="size-3.5 text-primary" />
                          <span>{lang === "bn" ? "রসিদ প্রিন্ট" : "Print Invoice"}</span>
                        </Button>

                        {isPending && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleApprove(item.id); }}
                              disabled={actionBusyId === item.id}
                              className="h-7 px-2.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs cursor-pointer"
                            >
                              <PackageCheck className="size-3.5" />
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
