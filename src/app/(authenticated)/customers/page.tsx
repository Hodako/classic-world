"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, UserPlus, Search, Users, Archive, Download, ArrowUpRight, Plus, Phone, MapPin, Wallet } from "lucide-react";
import { getCustomers, getSales, getAllPayments, getAllPartyReceivables } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createCustomerFn, archiveCustomerFn } from "@/lib/rpc";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import type { Customer } from "@/lib/queries";
import Link from "next/link";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PartyReturnDialog } from "@/components/party-return-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

export default function CustomersPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const customers = useCachedQuery(["customers"], getCustomers);
  const sales = useCachedQuery(["sales"], getSales);
  const allPayments = useCachedQuery(["all-payments"], getAllPayments);
  const allReceivables = useCachedQuery(["all-party-receivables"], getAllPartyReceivables);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const pageSize = isMobile ? 10 : 15;

  const duesByParty: Record<string, number> = {};
  const purchasesByParty: Record<string, { total: number; count: number }> = {};

  (sales.data ?? []).forEach(s => {
    if (s.party_id && !s.returned) {
      duesByParty[s.party_id] = (duesByParty[s.party_id] ?? 0) + Number(s.due_amount);
      if (!purchasesByParty[s.party_id]) {
        purchasesByParty[s.party_id] = { total: 0, count: 0 };
      }
      purchasesByParty[s.party_id].total += Number(s.sell_price) * s.qty;
      purchasesByParty[s.party_id].count += Number(s.qty) || 0;
    }
  });

  const paidByParty: Record<string, number> = {};
  (allPayments.data ?? []).forEach(p => {
    paidByParty[p.party_id] = (paidByParty[p.party_id] ?? 0) + Number(p.amount);
  });

  const extraByParty: Record<string, number> = {};
  (allReceivables.data ?? []).forEach(r => {
    extraByParty[r.party_id] = (extraByParty[r.party_id] ?? 0) + Number(r.amount);
  });

  const getCustomerBalance = (customerId: string) => {
    const totalDues = (duesByParty[customerId] ?? 0) + (extraByParty[customerId] ?? 0);
    const paid = paidByParty[customerId] ?? 0;
    return totalDues - paid;
  };

  const getCustomerReceivable = (customerId: string) => {
    return Math.max(getCustomerBalance(customerId), 0);
  };

  const onlyCustomers = (customers.data ?? [])
    .filter(Boolean)
    .filter(p => (p as any).type !== "supplier" && !(p as any).is_supplier);

  const totalOutstanding = onlyCustomers.reduce((sum, p) => {
    if (p.archived) return sum;
    const bal = getCustomerBalance(p.id);
    return sum + (bal > 0 ? bal : 0);
  }, 0);

  const totalAdvance = onlyCustomers.reduce((sum, p) => {
    if (p.archived) return sum;
    const bal = getCustomerBalance(p.id);
    return sum + (bal < 0 ? Math.abs(bal) : 0);
  }, 0);

  const activeCustomerCount = onlyCustomers.filter(p => !p.archived).length;

  const filtered = onlyCustomers
    .filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes(search.toLowerCase()) || (p.phone ?? "").includes(search);
      const matchesTab = activeTab === "archived" ? p.archived === true : p.archived !== true;
      return matchesSearch && matchesTab;
    });

  const { items: pagedCustomers, totalPages, safePage } = paginate(filtered, page, pageSize);

  function prefetchCustomer(p: Customer) {
    setCachedData<Customer>(qc, ["customer", p.id], p);
  }

  async function toggleArchive(p: Customer) {
    const nextVal = !p.archived;
    const prevCustomers = qc.getQueryData<Customer[]>(["customers"]);
    setCachedData<Customer[]>(qc, ["customers"], old =>
      (old ?? []).map(x => x.id === p.id ? { ...x, archived: nextVal } : x)
    );
    toast.success(nextVal ? t("archived") : t("active"));
    try {
      await archiveCustomerFn({ data: { id: p.id, archived: nextVal } });
      await refreshQueries(qc, ["customers"]);
    } catch (err: unknown) {
      if (prevCustomers) setCachedData(qc, ["customers"], prevCustomers);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function exportCustomers(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["নাম", "ফোন নম্বর", "মোট দেনা (গ্রাহক দেবে)", "আর্কাইভ করা"]
      : ["Name", "Phone", "Total Dues (They Owe)", "Archived"];
    const rows = filtered.map(p => [
      p.name,
      p.phone || "",
      getCustomerReceivable(p.id),
      p.archived
        ? (langCode === "bn" ? "হ্যাঁ" : "Yes")
        : (langCode === "bn" ? "না" : "No")
    ]);
    downloadCsv(`customers_${activeTab}_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  const getInitials = (name?: string) => {
    if (!name) return "ক";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-serif flex items-center gap-2 text-foreground">
            <Users className="size-5 sm:size-6 text-primary shrink-0" />
            <span>{lang === "bn" ? "কাস্টমার খাতা" : "Customer Ledger"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "bn"
              ? `মোট ${filtered.length} জন কাস্টমার তালিকাভুক্ত আছেন`
              : `${filtered.length} customers registered in ledger`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs cursor-pointer">
                <Download className="size-3.5 mr-1" />
                <span>{isMobile ? "CSV" : (lang === "bn" ? "ডাউনলোড CSV" : "Download CSV")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCustomers("bn")}>বাংলা CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCustomers("en")}>English CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setReturnOpen(true)}
            className="h-8 text-xs border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/10 beveled-button cursor-pointer"
          >
            <Plus className="size-3.5 mr-1" />
            <span>{lang === "bn" ? "পণ্য ফেরত" : "Product Return"}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="h-8 text-xs font-bold beveled-button cursor-pointer shadow-xs"
          >
            <UserPlus className="size-3.5 mr-1 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন কাস্টমার" : "Add Customer"}</span>
          </Button>
        </div>
      </div>

      {/* KPI Overview Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4 bg-rose-500/5 border-rose-500/20 relative overflow-hidden flex flex-col justify-between beveled-kpi rounded-none shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
            <span className="text-[11px] font-bold uppercase tracking-wide">{lang === "bn" ? "মোট বকেয়া বাকী" : "Total Customer Dues"}</span>
            <Wallet className="size-4 opacity-80" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-serif mt-2">{fmtMoney(totalOutstanding)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "গ্রাহকদের কাছ থেকে প্রাপ্য মোট বাকী" : "Total amount owed by customers"}
          </div>
        </Card>

        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 relative overflow-hidden flex flex-col justify-between beveled-kpi rounded-none shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
            <span className="text-[11px] font-bold uppercase tracking-wide">{lang === "bn" ? "মোট অগ্রিম জমা" : "Total Customer Advances"}</span>
            <Wallet className="size-4 opacity-80" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-serif mt-2">{fmtMoney(totalAdvance)}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {lang === "bn" ? "গ্রাহকদের অগ্রিম জমা রাখা ব্যালেন্স" : "Customer advance balances"}
          </div>
        </Card>

        <Card className="p-4 bg-indigo-500/5 border-indigo-500/20 relative overflow-hidden flex flex-col justify-between beveled-kpi rounded-none shadow-xs">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-[11px] font-bold uppercase tracking-wide">{lang === "bn" ? "সক্রিয় কাস্টমার" : "Active Customers"}</span>
            <Users className="size-4 opacity-80" />
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-serif mt-2">{activeCustomerCount} {lang === "bn" ? "জন" : "people"}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {activeTab === "archived" ? (lang === "bn" ? "আর্কাইভ তালিকা প্রদর্শিত হচ্ছে" : "Viewing archived") : (lang === "bn" ? "লেনদেন সচল হিসাবসমূহ" : "Active accounts")}
          </div>
        </Card>
      </div>

      {/* Tabs and Search Controls */}
      <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
        <Tabs value={activeTab} onValueChange={(v: any) => { setActiveTab(v); setPage(1); }} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-2 w-full sm:w-[240px] h-8.5 p-0.5 bg-muted/60 rounded-xl">
            <TabsTrigger value="active" className="text-xs h-7.5 rounded-lg">{lang === "bn" ? "সক্রিয় কাস্টমার" : "Active"}</TabsTrigger>
            <TabsTrigger value="archived" className="text-xs h-7.5 rounded-lg">{lang === "bn" ? "আর্কাইভ তালিকা" : "Archived"}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={lang === "bn" ? "নাম বা ফোন নম্বর দিয়ে খুঁজুন…" : "Search by name or phone…"}
            className="pl-8 h-8.5 text-xs rounded-xl"
          />
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <Card className="p-12 text-center text-sm text-muted-foreground rounded-2xl border-dashed">
          <Users className="size-8 mx-auto text-muted-foreground/40 mb-2" />
          {lang === "bn" ? "কোনো কাস্টমার পাওয়া যায়নি" : "No customers found"}
        </Card>
      )}

      {/* PC Table View (Visible on desktop md+) */}
      {filtered.length > 0 && (
        <div className="hidden md:block">
          <Card className="rounded-2xl border border-border/80 shadow-xs overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                    <th className="py-3 px-4">{lang === "bn" ? "কাস্টমার" : "Customer"}</th>
                    <th className="py-3 px-4">{lang === "bn" ? "যোগাযোগ ও ঠিকানা" : "Contact & Address"}</th>
                    <th className="py-3 px-4 text-right">{lang === "bn" ? "মোট ক্রয়" : "Total Purchased"}</th>
                    <th className="py-3 px-4 text-right">{lang === "bn" ? "বর্তমান ব্যালেন্স" : "Current Balance"}</th>
                    <th className="py-3 px-4 text-center">{lang === "bn" ? "অ্যাকশন" : "Action"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pagedCustomers.map(p => {
                    const bal = getCustomerBalance(p.id);
                    const purchases = purchasesByParty[p.id] || { total: 0, count: 0 };
                    const isDue = bal > 0;
                    const isAdvance = bal < 0;

                    return (
                      <tr
                        key={p.id}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onMouseEnter={() => prefetchCustomer(p)}
                      >
                        <td className="py-3 px-4">
                          <Link href={`/customers/detail?id=${p.id}`} className="flex items-center gap-3">
                            <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-bold font-serif text-xs shrink-0 group-hover:scale-105 transition-transform">
                              {getInitials(p.name)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                {p.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                ID: #{p.id.slice(0, 6)}
                              </div>
                            </div>
                          </Link>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-0.5 text-[11px] text-muted-foreground">
                            {p.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="size-3 text-muted-foreground/60 shrink-0" />
                                <span>{p.phone}</span>
                              </div>
                            )}
                            {p.address && (
                              <div className="flex items-center gap-1 truncate max-w-xs">
                                <MapPin className="size-3 text-muted-foreground/60 shrink-0" />
                                <span className="truncate">{p.address}</span>
                              </div>
                            )}
                            {!p.phone && !p.address && <span className="text-zinc-400">—</span>}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-foreground font-serif text-xs">
                            {fmtMoney(purchases.total)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {purchases.count} {lang === "bn" ? "টি পণ্য" : "items"}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isDue ? (
                            <span className="inline-flex flex-col items-end">
                              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-tight bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">
                                {lang === "bn" ? "বকেয়া বাকী" : "Due"}: {fmtMoney(bal)}
                              </span>
                            </span>
                          ) : isAdvance ? (
                            <span className="inline-flex flex-col items-end">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                                {lang === "bn" ? "অগ্রিম জমা" : "Advance"}: {fmtMoney(Math.abs(bal))}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-medium text-zinc-500 bg-zinc-500/10 px-2 py-0.5 rounded-md">
                              {lang === "bn" ? "পরিশোধিত (০)" : "Settled"}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleArchive(p)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                              title={p.archived ? (lang === "bn" ? "সক্রিয় করুন" : "Activate") : (lang === "bn" ? "আর্কাইভ করুন" : "Archive")}
                            >
                              <Archive className="size-3.5" />
                            </Button>
                            <Link href={`/customers/detail?id=${p.id}`}>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 text-xs font-semibold gap-1 rounded-xl cursor-pointer hover:bg-primary hover:text-white transition-colors"
                              >
                                <span>{lang === "bn" ? "হিসাব" : "Details"}</span>
                                <ArrowUpRight className="size-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Mobile Card List View (Visible on mobile <md) */}
      {filtered.length > 0 && (
        <div className="md:hidden">
          <Card className="divide-y divide-border overflow-hidden rounded-2xl border border-border/80 shadow-xs">
            {pagedCustomers.map(p => {
              const bal = getCustomerBalance(p.id);
              const isDue = bal > 0;
              const isAdvance = bal < 0;

              return (
                <Link
                  key={p.id}
                  href={`/customers/detail?id=${p.id}`}
                  onMouseEnter={() => prefetchCustomer(p)}
                  className="flex items-center justify-between p-3.5 hover:bg-muted/40 transition-colors gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-foreground">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                      {p.phone && <span>{p.phone}</span>}
                      {p.address && (
                        <>
                          <span>·</span>
                          <span className="truncate">{p.address}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right">
                    {isDue ? (
                      <div>
                        <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide">{lang === "bn" ? "বকেয়া বাকী" : "Owes Us"}</div>
                        <div className="text-sm font-bold font-serif text-rose-600 dark:text-rose-400">
                          {fmtMoney(bal)}
                        </div>
                      </div>
                    ) : isAdvance ? (
                      <div>
                        <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">{lang === "bn" ? "অগ্রিম জমা" : "Advance"}</div>
                        <div className="text-sm font-bold font-serif text-emerald-600 dark:text-emerald-400">
                          {fmtMoney(Math.abs(bal))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">{lang === "bn" ? "পরিশোধিত" : "Settled"}</div>
                        <div className="text-sm font-semibold font-serif text-zinc-400 dark:text-zinc-500">
                          {fmtMoney(0)}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleArchive(p);
                        }}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
                        title={p.archived ? "Activate" : "Archive"}
                      >
                        <Archive className="size-3.5" />
                      </Button>
                      <ChevronRight className="size-4 text-muted-foreground/60" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        </div>
      )}

      {/* Pagination Bar */}
      {filtered.length > pageSize && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
      <PartyReturnDialog open={returnOpen} onOpenChange={setReturnOpen} />
    </div>
  );
}

function AddCustomerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await createCustomerFn({ data: { name: trimmed, phone: phone.trim() || null, address: address.trim() || null } });
      await refreshQueries(qc, ["customers"]);
      setName("");
      setPhone("");
      setAddress("");
      onOpenChange(false);
      toast.success(lang === "bn" ? `${trimmed} কে সফলভাবে কাস্টমার হিসেবে যোগ করা হয়েছে!` : `Successfully added customer ${trimmed}!`);
    } catch (err: unknown) {
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
            {lang === "bn" ? "নতুন কাস্টমার যোগ করুন" : "Add New Customer"}
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
              autoFocus
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
              {busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Customer")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

