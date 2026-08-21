"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Pencil, Plus, ShoppingBag, BookOpen, User, Phone, MapPin, Wallet } from "lucide-react";
import {
  getPaymentsForParty, getSalesForParty, getCustomer,
  getPartyReceivables,
} from "@/lib/queries";
import type { Customer, PartyLedger, Payment, Sale } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SpeedLoader } from "@/components/speed-loader";
import { toast } from "sonner";
import {
  createPaymentFn, deletePaymentFn, deleteSaleFn,
  createPartyReceivableFn, deletePartyReceivableFn,
  updateCustomerFn, deleteCustomerFn,
} from "@/lib/rpc";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PartyReturnDialog } from "@/components/party-return-dialog";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useIsMobile } from "@/hooks/use-mobile";

export default function CustomerDetail() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";
  const { lang, t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const partyQuery = useCachedQuery(["customer", id], () => getCustomer(id));
  const sales = useCachedQuery(["party-detail", "sales", id], () => getSalesForParty(id));
  const payments = useCachedQuery(["payments", id], () => getPaymentsForParty(id));
  const receivables = useCachedQuery(["party-receivables", id], () => getPartyReceivables(id));

  const [collectOpen, setCollectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addKind, setAddKind] = useState<"receivable" | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);

  const [purchasesPage, setPurchasesPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  const pageSize = 10;

  const [backPath, setBackPath] = useState("/dues");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const ref = document.referrer;
      if (ref && typeof ref === "string" && ref.includes("/customers")) {
        setBackPath("/customers");
      }
    }
  }, []);

  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const customer = partyQuery.data;
  const isLoading = partyQuery.isLoading && !customer;

  const allPartySales = (sales.data ?? []).filter(s => !s.returned);
  const totalBoughtValue = allPartySales.reduce((sum, s) => sum + (Number(s.sell_price) * s.qty), 0);
  const totalItemsCount = allPartySales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);

  const saleDue = allPartySales.reduce((a, s) => a + Number(s.due_amount), 0);
  const extraReceivable = (receivables.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const paidTotal = (payments.data ?? []).reduce((a, p) => a + Number(p.amount), 0);
  const netBalance = saleDue + extraReceivable - paidTotal;

  type Entry = {
    id: string; date: string; label: string; amount: number;
    kind: "sale" | "payment" | "receivable";
    deletable: boolean; rawId: string;
  };

  const entries: Entry[] = [
    ...(sales.data ?? []).filter(s => Number(s.due_amount) > 0 && !s.returned).map(s => ({
      id: "s" + s.id, rawId: s.id, date: s.created_at,
      label: s.product_id ? `${s.product_name} ×${s.qty}` : s.product_name,
      amount: Number(s.due_amount), kind: "sale" as const, deletable: !s.product_id,
    })),
    ...(receivables.data ?? []).map(r => ({
      id: "r" + r.id, rawId: r.id, date: r.created_at,
      label: r.note || (lang === "bn" ? "বাকী যোগ" : "Money Owed"), amount: Number(r.amount),
      kind: "receivable" as const, deletable: true,
    })),
    ...(payments.data ?? []).map(p => ({
      id: "p" + p.id, rawId: p.id, date: p.created_at,
      label: p.note || (lang === "bn" ? "টাকা জমা/আদায়" : "Payment Received"), amount: -Number(p.amount),
      kind: "payment" as const, deletable: true,
    })),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date));

  const { items: pagedPurchases, totalPages: purchaseTotalPages, safePage: safePurchasesPage } = paginate(allPartySales, purchasesPage, pageSize);
  const { items: pagedEntries, totalPages: ledgerTotalPages, safePage: safeLedgerPage } = paginate(entries, ledgerPage, pageSize);

  async function performDeleteEntry() {
    if (!entryToDelete) return;
    setIsDeletingEntry(true);
    const prevPayments = qc.getQueryData<Payment[]>(["payments", id]);
    const prevSales = qc.getQueryData<Sale[]>(["party-detail", "sales", id]);
    const prevReceivables = qc.getQueryData<PartyLedger[]>(["party-receivables", id]);

    try {
      if (entryToDelete.kind === "payment") {
        setCachedData<Payment[]>(qc, ["payments", id], old =>
          (old ?? []).filter(p => p.id !== entryToDelete.rawId),
        );
        await deletePaymentFn({ data: { id: entryToDelete.rawId } });
      } else if (entryToDelete.kind === "sale") {
        setCachedData<Sale[]>(qc, ["party-detail", "sales", id], old =>
          (old ?? []).filter(s => s.id !== entryToDelete.rawId),
        );
        const res = await deleteSaleFn({ data: { id: entryToDelete.rawId } });
        if (res && !res.success && 'error' in res) {
          throw new Error(res.error as string);
        }
      } else if (entryToDelete.kind === "receivable") {
        setCachedData<PartyLedger[]>(qc, ["party-receivables", id], old =>
          (old ?? []).filter(r => r.id !== entryToDelete.rawId),
        );
        await deletePartyReceivableFn({ data: { id: entryToDelete.rawId } });
      }
      await refreshQueries(qc, ["all-payments"], ["sales"], ["all-party-receivables"], ["cashbox"]);
      toast.success(t("delete"));
      setEntryToDelete(null);
    } catch (err: unknown) {
      if (entryToDelete.kind === "payment" && prevPayments) setCachedData(qc, ["payments", id], prevPayments);
      if (entryToDelete.kind === "sale" && prevSales) setCachedData(qc, ["party-detail", "sales", id], prevSales);
      if (entryToDelete.kind === "receivable" && prevReceivables) setCachedData(qc, ["party-receivables", id], prevReceivables);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingEntry(false);
    }
  }

  async function performDeleteCustomer() {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    const prevCustomers = qc.getQueryData<Customer[]>(["customers"]);
    try {
      setCachedData<Customer[]>(qc, ["customers"], old => (old ?? []).filter(p => p.id !== id));
      await deleteCustomerFn({ data: { id } });
      qc.removeQueries({ queryKey: ["customer", id] });
      qc.removeQueries({ queryKey: ["party-detail", "sales", id] });
      qc.removeQueries({ queryKey: ["payments", id] });
      qc.removeQueries({ queryKey: ["party-receivables", id] });
      await refreshQueries(qc, ["customers"]);
      toast.success(t("delete"));
      setCustomerToDelete(null);
      router.push(backPath);
    } catch (err: unknown) {
      if (prevCustomers) setCachedData<Customer[]>(qc, ["customers"], prevCustomers);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingCustomer(false);
    }
  }

  if (isLoading) return <SpeedLoader fullScreen={false} />;

  if (!customer) {
    return (
      <div className="space-y-4 text-center py-12">
        <p className="text-muted-foreground">{t("no_results")}</p>
        <Link href={backPath}>
          <Button variant="outline">
            <ArrowLeft className="size-4 mr-1" />{t("due")}
          </Button>
        </Link>
      </div>
    );
  }

  const isDue = netBalance > 0;
  const isAdvance = netBalance < 0;
  const absVal = Math.abs(netBalance);

  let cardBg = "bg-rose-500/5 border-rose-500/20";
  let textColor = "text-rose-600 dark:text-rose-400";
  let labelText = lang === "bn" ? "বকেয়া বাকী (তারা দেবে)" : "Outstanding Dues";
  let formula = lang === "bn"
    ? `হিসাব: বাকী ও অন্যান্য (${fmtMoney(saleDue + extraReceivable)}) − আদায় (${fmtMoney(paidTotal)}) = বাকি দেবে ${fmtMoney(absVal)}`
    : `Calculation: Dues (${fmtMoney(saleDue + extraReceivable)}) − Paid (${fmtMoney(paidTotal)}) = Owed ${fmtMoney(absVal)}`;

  if (isAdvance) {
    cardBg = "bg-emerald-500/5 border-emerald-500/20";
    textColor = "text-emerald-600 dark:text-emerald-400";
    labelText = lang === "bn" ? "অগ্রিম জমা (গ্রাহক পাবে)" : "Customer Advance Credit";
    formula = lang === "bn"
      ? `হিসাব: আদায় (${fmtMoney(paidTotal)}) − বাকী ও অন্যান্য (${fmtMoney(saleDue + extraReceivable)}) = অগ্রিম জমা পাবে ${fmtMoney(absVal)}`
      : `Calculation: Paid (${fmtMoney(paidTotal)}) − Dues (${fmtMoney(saleDue + extraReceivable)}) = Credit ${fmtMoney(absVal)}`;
  } else if (netBalance === 0) {
    cardBg = "bg-zinc-500/5 border-zinc-200 dark:border-zinc-800";
    textColor = "text-zinc-500 dark:text-zinc-400";
    labelText = lang === "bn" ? "পরিশোধিত হিসাব" : "Account Settled";
    formula = lang === "bn"
      ? `হিসাব: কোনো বাকী বা বকেয়া নেই (ব্যালেন্স ৳০)`
      : `Calculation: Settled (Balance ৳0)`;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Top Bar Navigation & Actions */}
      <div className="flex items-center justify-between gap-2">
        <Link href={backPath}>
          <Button variant="ghost" size="sm" className="cursor-pointer gap-1">
            <ArrowLeft className="size-4" />
            <span>{backPath === "/dues" ? (lang === "bn" ? "বাকী খাতা" : "Dues") : (lang === "bn" ? "কাস্টমার তালিকা" : "Customers")}</span>
          </Button>
        </Link>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="h-8 text-xs cursor-pointer">
            <Pencil className="size-3.5 mr-1" />{lang === "bn" ? "এডিট" : "Edit"}
          </Button>
          <Button size="sm" variant="destructive" className="h-8 text-xs beveled-button cursor-pointer" onClick={() => setCustomerToDelete(customer)}>
            <Trash2 className="size-3.5 mr-1" />{lang === "bn" ? "মুছুন" : "Delete"}
          </Button>
        </div>
      </div>

      {/* Customer Header Info */}
      <div className="flex items-center gap-3 p-4 bg-card rounded-2xl border border-border/80 shadow-xs">
        <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold font-serif text-lg shrink-0">
          <User className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold font-serif text-foreground truncate">{customer.name || "Unnamed"}</h1>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {customer.phone && (
              <span className="flex items-center gap-1">
                <Phone className="size-3 text-muted-foreground/70" />
                {customer.phone}
              </span>
            )}
            {customer.address && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3 text-muted-foreground/70" />
                {customer.address}
              </span>
            )}
          </div>
        </div>
      </div>

      {(sales.isFetching || payments.isFetching) && (
        <div className="h-1 rounded-full bg-primary/20 overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-pulse rounded-full" />
        </div>
      )}

      {/* PC 2-Column Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Left Column: Dynamic Balance Card & Quick Actions */}
        <div className="md:col-span-6 lg:col-span-5 space-y-3">
          <Card className={`p-5 beveled-kpi relative overflow-hidden rounded-none shadow-xs ${cardBg}`}>
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>{labelText}</span>
              <Wallet className="size-4 opacity-75" />
            </div>
            <div className={`text-3xl font-extrabold mt-2 font-serif ${textColor}`}>{fmtMoney(absVal)}</div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-normal border-t border-dashed border-border/80 pt-2">
              {formula}
            </p>
            <Button
              className="mt-4 w-full h-9 text-xs font-bold beveled-button cursor-pointer"
              size="sm"
              onClick={() => setCollectOpen(true)}
            >
              <Plus className="size-3.5 mr-1.5 stroke-[2.5]" />
              <span>{lang === "bn" ? "টাকা আদায়/জমা করুন" : "Collect Payment"}</span>
            </Button>
          </Card>

          <div className="flex gap-2 w-full">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-xs beveled-button cursor-pointer"
              onClick={() => setAddKind("receivable")}
            >
              <Plus className="size-3.5 mr-1" />
              <span>{lang === "bn" ? "বাকী যোগ করুন" : "Add Dues"}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-xs beveled-button border-rose-200 hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/10 text-rose-600 font-medium cursor-pointer"
              onClick={() => setReturnOpen(true)}
            >
              <Plus className="size-3.5 mr-1" />
              <span>{lang === "bn" ? "পণ্য ফেরত" : "Product Return"}</span>
            </Button>
          </div>
        </div>

        {/* Right Column: Buying History Stats KPI Cards */}
        <div className="md:col-span-6 lg:col-span-7 grid grid-cols-3 gap-2.5">
          <Card className="p-4 beveled-kpi border-indigo-500/20 bg-card rounded-none text-center shadow-xs space-y-1 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "মোট ক্রয়" : "Total Bought"}</div>
            <div className="text-base sm:text-xl font-bold text-foreground font-serif">
              {fmtMoney(totalBoughtValue)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {lang === "bn" ? "সর্বমোট বিক্রয়মূল্য" : "Total sales value"}
            </div>
          </Card>

          <Card className="p-4 beveled-kpi border-teal-500/20 bg-card rounded-none text-center shadow-xs space-y-1 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "মোট আইটেম" : "Total Items"}</div>
            <div className="text-base sm:text-xl font-bold text-foreground font-serif">
              {totalItemsCount} {lang === "bn" ? "টি" : "pcs"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {lang === "bn" ? "পিস সামগ্রী" : "Purchased items"}
            </div>
          </Card>

          <Card className="p-4 beveled-kpi border-amber-500/20 bg-card rounded-none text-center shadow-xs space-y-1 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
            <div className="text-[11px] text-muted-foreground font-semibold">{lang === "bn" ? "অর্ডারের সংখ্যা" : "Orders"}</div>
            <div className="text-base sm:text-xl font-bold text-foreground font-serif">
              {allPartySales.length} {lang === "bn" ? "টি" : "orders"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {lang === "bn" ? "মোট চালান" : "Invoices recorded"}
            </div>
          </Card>
        </div>
      </div>

      {/* Tabs with Detailed Buying History & Ledger */}
      <Tabs defaultValue="purchases" className="w-full pt-2">
        <TabsList className="grid grid-cols-2 w-full max-w-sm mx-auto mb-4 h-9 p-0.5 bg-muted/60 rounded-xl">
          <TabsTrigger value="purchases" className="text-xs h-8 rounded-lg font-semibold gap-1.5">
            <ShoppingBag className="size-3.5" />
            <span>{lang === "bn" ? "ক্রয়ের ইতিহাস" : "Buying History"} ({allPartySales.length})</span>
          </TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs h-8 rounded-lg font-semibold gap-1.5">
            <BookOpen className="size-3.5" />
            <span>{lang === "bn" ? "লেনদেন খাতা" : "Ledger"} ({entries.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Purchases / Buying History */}
        <TabsContent value="purchases" className="space-y-3">
          <Card className="divide-y divide-border overflow-hidden rounded-2xl border border-border/80 shadow-xs bg-card">
            {allPartySales.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <ShoppingBag className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                {lang === "bn" ? "এই কাস্টমারের কোনো ক্রয়ের রেকর্ড নেই" : "No purchase history for this customer"}
              </div>
            ) : (
              pagedPurchases.map(s => (
                <div key={s.id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-bold text-sm text-foreground truncate">{s.product_name}</div>
                    <div className="text-muted-foreground flex gap-1.5 flex-wrap items-center text-[11px]">
                      <span>{fmtDateTime(s.created_at)}</span>
                      <span>·</span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                        s.type === "cash" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" :
                        s.type === "online" ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800" :
                        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                      }`}>
                        {s.type === "cash" ? (lang === "bn" ? "নগদ" : "Cash") : s.type === "online" ? (lang === "bn" ? "অনলাইন" : "Online") : (lang === "bn" ? "বাকী" : "Credit")}
                      </span>
                      {Number(s.due_amount) > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 font-bold text-[11px] bg-rose-500/10 px-1.5 py-0.2 rounded">
                          {lang === "bn" ? "বাকী: " : "Due: "}{fmtMoney(s.due_amount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-foreground text-sm sm:text-base font-serif">
                      {fmtMoney(Number(s.sell_price) * s.qty)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtMoney(s.sell_price)} × {s.qty}
                      {Number((s as any).discount) > 0 && ` (${lang === "bn" ? "ছাড়" : "Dis"}: ৳${(s as any).discount})`}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>

          {allPartySales.length > pageSize && (
            <PaginationBar
              page={safePurchasesPage}
              totalPages={purchaseTotalPages}
              total={allPartySales.length}
              pageSize={pageSize}
              onPageChange={setPurchasesPage}
            />
          )}
        </TabsContent>

        {/* Tab 2: Transaction Ledger */}
        <TabsContent value="ledger" className="space-y-3">
          <Card className="divide-y divide-border overflow-hidden rounded-2xl border border-border/80 shadow-xs bg-card">
            {entries.length === 0 && (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <BookOpen className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                {lang === "bn" ? "কোনো লেনদেন পাওয়া যায়নি" : "No activity recorded"}
              </div>
            )}
            {pagedEntries.map(e => (
              <div key={e.id} className="p-3.5 flex items-center justify-between gap-2.5 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-semibold truncate text-sm text-foreground">{e.label}</div>
                  <div className="text-xs text-muted-foreground">{fmtDateTime(e.date)}</div>
                </div>
                <div className={`text-sm font-bold font-serif shrink-0 ${e.amount < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                  {e.amount < 0 ? "−" : "+"}{fmtMoney(Math.abs(e.amount))}
                </div>
                {e.deletable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer rounded-lg"
                    onClick={() => setEntryToDelete(e)}
                    title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </Card>

          {entries.length > pageSize && (
            <PaginationBar
              page={safeLedgerPage}
              totalPages={ledgerTotalPages}
              total={entries.length}
              pageSize={pageSize}
              onPageChange={setLedgerPage}
            />
          )}
        </TabsContent>
      </Tabs>

      <CollectDialog partyId={id} open={collectOpen} onOpenChange={setCollectOpen} />
      <EditCustomerDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      {addKind && (
        <AddLedgerDialog partyId={id} kind={addKind} open={!!addKind} onOpenChange={v => { if (!v) setAddKind(null); }} />
      )}
      <PartyReturnDialog partyId={id} open={returnOpen} onOpenChange={setReturnOpen} />

      <ConfirmDeleteDialog
        open={entryToDelete !== null}
        onOpenChange={(v) => { if (!v) setEntryToDelete(null); }}
        title={lang === "bn" ? "লেনদেন মুছুন" : "Delete Transaction"}
        description={lang === "bn" ? `আপনি কি নিশ্চিত যে এই লেনদেন রেকর্ডটি মুছে ফেলতে চান? এটি স্থায়ীভাবে মুছে যাবে।` : `Are you sure you want to delete this ${entryToDelete?.kind || "transaction"}? This action is permanent and cannot be undone.`}
        onConfirm={performDeleteEntry}
        busy={isDeletingEntry}
      />

      <ConfirmDeleteDialog
        open={customerToDelete !== null}
        onOpenChange={(v) => { if (!v) setCustomerToDelete(null); }}
        title={lang === "bn" ? "কাস্টমার মুছুন" : "Delete Customer"}
        description={lang === "bn" ? `আপনি কি নিশ্চিত যে "${customerToDelete?.name || "নামহীন"}" কাস্টমারটি মুছে ফেলতে চান? এর সাথে সম্পর্কিত সকল ইতিহাস মুছে যাবে।` : `Are you sure you want to delete customer "${customerToDelete?.name || "Unnamed"}"? All associated transaction history will be permanently deleted.`}
        onConfirm={performDeleteCustomer}
        busy={isDeletingCustomer}
      />
    </div>
  );
}

function EditCustomerDialog({ customer, open, onOpenChange }: { customer: Customer | undefined; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && customer) {
      setName(customer.name || "");
      setPhone(customer.phone ?? "");
      setAddress(customer.address ?? "");
    }
  }, [open, customer]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const phoneVal = phone.trim() || null;
    const addressVal = address.trim() || null;
    const prevCustomer = qc.getQueryData<Customer>(["customer", customer.id]);
    const prevCustomers = qc.getQueryData<Customer[]>(["customers"]);

    setCachedData<Customer>(qc, ["customer", customer.id], { ...customer, name: trimmedName, phone: phoneVal, address: addressVal });
    setCachedData<Customer[]>(qc, ["customers"], old =>
      (old ?? []).map(p => (p.id === customer.id ? { ...p, name: trimmedName, phone: phoneVal, address: addressVal } : p)),
    );
    onOpenChange(false);
    toast.success(t("save"));

    setBusy(true);
    try {
      await updateCustomerFn({ data: { id: customer.id, name: trimmedName, phone: phoneVal, address: addressVal } });
      await refreshQueries(qc, ["customers"], ["customer", customer.id]);
    } catch (err: unknown) {
      if (prevCustomer) setCachedData(qc, ["customer", customer.id], prevCustomer);
      if (prevCustomers) setCachedData(qc, ["customers"], prevCustomers);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-border/80">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-foreground font-serif">
            {lang === "bn" ? "কাস্টমার তথ্য এডিট করুন" : "Edit Customer Info"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5 py-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "কাস্টমারের নাম" : "Customer Name"}
            </Label>
            <Input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={busy}
              placeholder={lang === "bn" ? "যেমন: মোঃ জামিল আহমেদ" : "E.g. Jamil Ahmed"}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "ফোন নম্বর" : "Phone number"}
            </Label>
            <Input
              type="tel"
              inputMode="tel"
              pattern="[0-9+]*"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              disabled={busy}
              placeholder={lang === "bn" ? "যেমন: ০১৭১২-৩৪৫৬৭৮" : "E.g. 017xxxxxxxx"}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "ঠিকানা" : "Address"}
            </Label>
            <Input
              value={address}
              onChange={e => setAddress(e.target.value)}
              disabled={busy}
              placeholder={lang === "bn" ? "যেমন: বনানী, ঢাকা" : "E.g. Banani, Dhaka"}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <DialogFooter className="flex flex-row gap-2 mt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="flex-1 h-9 text-xs rounded-xl cursor-pointer"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="flex-1 h-9 text-xs font-semibold rounded-xl beveled-button cursor-pointer"
            >
              {busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddLedgerDialog({ partyId, kind, open, onOpenChange }: { partyId: string; kind: "receivable"; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const queryKey = ["party-receivables", partyId];

  useEffect(() => {
    if (!open) { setAmount(""); setNote(""); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (isNaN(amt) || amt <= 0) return;
    const tempId = `temp-${Date.now()}`;
    const entry: PartyLedger = { id: tempId, party_id: partyId, amount: amt, note: note || null, created_at: new Date().toISOString() };

    setCachedData<PartyLedger[]>(qc, queryKey, old => [entry, ...(old ?? [])]);
    onOpenChange(false);
    toast.success(t("save"));

    setBusy(true);
    try {
      const saved = await createPartyReceivableFn({ data: { party_id: partyId, amount: amt, note: note || null } });
      setCachedData<PartyLedger[]>(qc, queryKey, old =>
        (old ?? []).map(r => (r.id === tempId ? { ...saved, id: saved.id } : r)),
      );
      await refreshQueries(qc, queryKey, ["all-party-receivables"]);
    } catch (err: unknown) {
      setCachedData<PartyLedger[]>(qc, queryKey, old => (old ?? []).filter(r => r.id !== tempId));
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold font-serif text-foreground">
            {lang === "bn" ? "বাকী টাকা যোগ করুন" : "Add Dues"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5 py-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "টাকার পরিমাণ" : "Amount"}
            </Label>
            <Input
              required
              type="number"
              step="any"
              inputMode="decimal"
              pattern="[0-9.]*"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="h-9 text-xs rounded-xl font-serif font-semibold"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "মন্তব্য বা বিবরণ" : "Note / Description"}
            </Label>
            <Input
              placeholder={lang === "bn" ? "যেমন: বিশেষ বাকী / পূর্বের হিসাব" : "E.g. Old due balance"}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <DialogFooter className="flex flex-row gap-2 mt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-9 text-xs rounded-xl cursor-pointer"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="flex-1 h-9 text-xs font-semibold rounded-xl beveled-button cursor-pointer"
            >
              {busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Dues")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CollectDialog({ partyId, open, onOpenChange }: { partyId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setAmount(""); setNote(""); }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    const tempId = `temp-${Date.now()}`;
    const entry: Payment = { id: tempId, party_id: partyId, amount: amt, note: note || null, created_at: new Date().toISOString() };

    setCachedData<Payment[]>(qc, ["payments", partyId], old => [entry, ...(old ?? [])]);
    onOpenChange(false);
    toast.success(t("save"));

    setBusy(true);
    try {
      const saved = await createPaymentFn({ data: { party_id: partyId, amount: amt, note: note || null } });
      setCachedData<Payment[]>(qc, ["payments", partyId], old =>
        (old ?? []).map(p => (p.id === tempId ? { ...saved, id: saved.id } : p)),
      );
      await refreshQueries(qc, ["all-payments"], ["cashbox"]);
    } catch (err: unknown) {
      setCachedData<Payment[]>(qc, ["payments", partyId], old => (old ?? []).filter(p => p.id !== tempId));
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold font-serif text-foreground">
            {lang === "bn" ? "টাকা আদায় / জমা নিন" : "Collect Payment"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5 py-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "আদায়কৃত টাকার পরিমাণ" : "Collected Amount"}
            </Label>
            <Input
              required
              type="number"
              step="any"
              inputMode="decimal"
              pattern="[0-9.]*"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="h-9 text-xs rounded-xl font-serif font-semibold"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground font-semibold">
              {lang === "bn" ? "মন্তব্য বা বিবরণ" : "Note / Receipt No"}
            </Label>
            <Input
              placeholder={lang === "bn" ? "যেমন: ক্যাশ আদায় / বিকাশ ট্রানজ্যাকশন" : "E.g. Cash collected / bKash TxID"}
              value={note}
              onChange={e => setNote(e.target.value)}
              className="h-9 text-xs rounded-xl"
            />
          </div>
          <DialogFooter className="flex flex-row gap-2 mt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-9 text-xs rounded-xl cursor-pointer"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="flex-1 h-9 text-xs font-semibold rounded-xl beveled-button cursor-pointer"
            >
              {busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Payment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

