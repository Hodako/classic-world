"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getCustomers, getSales, getAllPayments, getAllPartyReceivables,
  getAllPartyPayables, getAllPayableSettlements,
  type Customer as Party, type Sale, type Payment, type PartyLedger
} from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createPaymentFn, createPartyReceivableFn, createCustomerFn as createPartyFn } from "@/lib/rpc";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import Link from "next/link";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { Search, Plus, Download, DollarSign, Wallet, Users, ArrowRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type DuesTab = "all" | "outstanding" | "settled";

export default function DuesPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();

  const parties = useCachedQuery(["customers"], getCustomers);
  const sales = useCachedQuery(["sales"], getSales);
  const allPayments = useCachedQuery(["all-payments"], getAllPayments);
  const allReceivables = useCachedQuery(["all-party-receivables"], getAllPartyReceivables);
  const allPayables = useCachedQuery(["all-party-payables"], getAllPartyPayables);
  const allSettlements = useCachedQuery(["all-payable-settlements"], getAllPayableSettlements);

  const [activeTab, setActiveTab] = useState<DuesTab>("outstanding");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"highest" | "lowest">("highest");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Dialog States
  const [collectOpen, setCollectOpen] = useState(false);
  const [addDueOpen, setAddDueOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<any | null>(null);

  // Form Inputs
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Quick Customer Creation
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [addingCust, setAddingCust] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCustName.trim();
    if (!name) return;
    const phone = newCustPhone.trim() || null;
    const address = newCustAddress.trim() || null;
    setAddingCust(true);
    try {
      await createPartyFn({ data: { name, phone, address } });
      await refreshQueries(qc, ["customers"]);
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
  };

  // Dues calculations
  const duesByParty: Record<string, number> = {};
  (sales.data ?? []).forEach(s => {
    if (s.party_id && !s.returned) {
      duesByParty[s.party_id] = (duesByParty[s.party_id] ?? 0) + Number(s.due_amount);
    }
  });

  const receivablesByParty: Record<string, number> = {};
  (allReceivables.data ?? []).forEach(r => {
    receivablesByParty[r.party_id] = (receivablesByParty[r.party_id] ?? 0) + Number(r.amount);
  });

  const paidByParty: Record<string, number> = {};
  (allPayments.data ?? []).forEach(p => {
    paidByParty[p.party_id] = (paidByParty[p.party_id] ?? 0) + Number(p.amount);
  });

  const payablesByParty: Record<string, number> = {};
  (allPayables.data ?? []).forEach(p => {
    payablesByParty[p.party_id] = (payablesByParty[p.party_id] ?? 0) + Number(p.amount);
  });

  const settlementsByParty: Record<string, number> = {};
  (allSettlements.data ?? []).forEach(s => {
    settlementsByParty[s.party_id] = (settlementsByParty[s.party_id] ?? 0) + Number(s.amount);
  });

  // Outstanding calculator
  const getOutstanding = (partyId: string) => {
    const totalDues = (duesByParty[partyId] ?? 0) + (receivablesByParty[partyId] ?? 0);
    const paid = paidByParty[partyId] ?? 0;
    return Math.max(totalDues - paid, 0);
  };

  // Compile parties with calculations
  const parsedParties = (parties.data ?? []).filter(Boolean).map(p => {
    const outstanding = getOutstanding(p.id);
    const totalDues = (duesByParty[p.id] ?? 0) + (receivablesByParty[p.id] ?? 0);
    const totalPaid = paidByParty[p.id] ?? 0;
    const payableOutstanding = Math.max((payablesByParty[p.id] ?? 0) - (settlementsByParty[p.id] ?? 0), 0);
    return {
      ...p,
      outstanding,
      totalDues,
      totalPaid,
      payableOutstanding
    };
  });

  // Calculate global totals
  const totalOutstanding = parsedParties.reduce((sum, p) => sum + p.outstanding, 0);
  const totalDebtors = parsedParties.filter(p => p.outstanding > 0).length;

  // Filter & Search
  const filtered = parsedParties.filter(p => {
    const matchesSearch = (p.name || "").toLowerCase().includes(search.toLowerCase()) || 
                          (p.phone ?? "").includes(search);
    
    if (p.archived) return false; // Exclude archived parties from dues manager

    if (activeTab === "outstanding") return matchesSearch && p.outstanding > 0;
    if (activeTab === "settled") return matchesSearch && p.outstanding === 0;
    return matchesSearch; // "all"
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    if (sortOrder === "highest") {
      return b.outstanding - a.outstanding;
    }
    return a.outstanding - b.outstanding;
  });

  const { items: pagedParties, totalPages, safePage } = paginate(sorted, page, pageSize);

  // Quick Action triggers
  const triggerCollect = (party: any) => {
    setSelectedParty(party);
    setAmount("");
    setNote("");
    setCollectOpen(true);
  };

  const triggerAddDue = (party: any) => {
    setSelectedParty(party);
    setAmount("");
    setNote("");
    setAddDueOpen(true);
  };

  // Form Submissions
  const submitCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty || !amount || Number(amount) <= 0) return;
    const amt = Number(amount);
    const tempId = `temp-${Date.now()}`;
    const optimisticPayment: Payment = {
      id: tempId,
      party_id: selectedParty.id,
      amount: amt,
      note: note.trim() || null,
      created_at: new Date().toISOString()
    };

    const prevPayments = qc.getQueryData<Payment[]>(["all-payments"]);
    setCachedData<Payment[]>(qc, ["all-payments"], old => [optimisticPayment, ...(old ?? [])]);
    setCollectOpen(false);
    toast.success(lang === "bn" ? "আদায় সফলভাবে সংরক্ষণ হয়েছে" : "Payment collection recorded");

    setBusy(true);
    try {
      await createPaymentFn({
        data: {
          party_id: selectedParty.id,
          amount: amt,
          note: note.trim() || null
        }
      });
      await refreshQueries(qc, ["all-payments"], ["sales"], ["parties"], ["all-party-receivables"]);
    } catch (err: any) {
      if (prevPayments) setCachedData(qc, ["all-payments"], prevPayments);
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitReceivable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty || !amount || Number(amount) <= 0) return;
    const amt = Number(amount);
    const tempId = `temp-${Date.now()}`;
    const optimisticReceivable: PartyLedger = {
      id: tempId,
      party_id: selectedParty.id,
      amount: amt,
      note: note.trim() || null,
      created_at: new Date().toISOString()
    };

    const prevReceivables = qc.getQueryData<PartyLedger[]>(["all-party-receivables"]);
    setCachedData<PartyLedger[]>(qc, ["all-party-receivables"], old => [optimisticReceivable, ...(old ?? [])]);
    setAddDueOpen(false);
    toast.success(lang === "bn" ? "নতুন বাকী সফলভাবে যুক্ত হয়েছে" : "Receivable/due recorded");

    setBusy(true);
    try {
      await createPartyReceivableFn({
        data: {
          party_id: selectedParty.id,
          amount: amt,
          note: note.trim() || null
        }
      });
      await refreshQueries(qc, ["all-party-receivables"], ["sales"], ["parties"], ["all-payments"]);
    } catch (err: any) {
      if (prevReceivables) setCachedData(qc, ["all-party-receivables"], prevReceivables);
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // CSV Export
  const exportCSV = (langCode: "en" | "bn") => {
    const headers = langCode === "bn"
      ? ["কাস্টমারের নাম", "ফোন নম্বর", "মোট ক্রয় ও ব্যক্তিগত বাকী", "মোট পরিশোধ", "মোট বকেয়া জমা"]
      : ["Customer Name", "Phone", "Total Purchases & Manual Dues", "Total Paid", "Outstanding Dues"];
    const rows = sorted.map(p => [
      p.name,
      p.phone || "",
      p.totalDues,
      p.totalPaid,
      p.outstanding
    ]);
    downloadCsv(`outstanding_dues_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <h1 className="text-xl font-bold tracking-tight font-serif shrink-0">{lang === "bn" ? "বাকী" : "Dues"}</h1>
          <span className="text-[10px] text-muted-foreground font-sans">
            — {lang === "bn" ? `${totalDebtors} জন কাস্টমারের বকেয়া` : `${totalDebtors} customers with outstanding balances`}
          </span>
        </div>
        <div className="flex gap-1.5 items-center">
          <Button
            size="sm"
            variant={searchOpen ? "default" : "outline"}
            className="h-8 text-xs beveled-button"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search className="size-3.5 mr-1" />
            {lang === "bn" ? "খুঁজুন" : "Search"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs beveled-button">
                <Download className="size-3.5 mr-1" />
                {t("download_csv")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCSV("en")}>
                English (ইংরেজি)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV("bn")}>
                Bangla (বাংলা)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-8 text-xs beveled-button" onClick={() => setAddCustomerOpen(true)}>
            <Plus className="size-3.5 mr-1" />
            {lang === "bn" ? "নতুন গ্রাহক" : "Add Customer"}
          </Button>
        </div>
      </div>

      {/* Main KPI Summary Card */}
      <div>
        <Card className="p-4 bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-background border-amber-500/25 beveled-card shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 border border-amber-400/20 shadow-md">
              <Wallet className="size-5 text-white" />
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{t("due")}</div>
              <div className="text-2xl font-bold font-serif text-amber-600 mt-0.5">{fmtMoney(totalOutstanding)}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{lang === "bn" ? "মোট খাতুন" : "Debtors Count"}</div>
            <div className="text-lg font-bold font-serif text-zinc-950 dark:text-zinc-50">{totalDebtors}</div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      {searchOpen && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1 border-t animate-in fade-in duration-200">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10 pointer-events-none" />
            <Input
              style={{ paddingLeft: "2.5rem" }}
              className="pl-10 h-9"
              placeholder={lang === "bn" ? "কাস্টমার খুঁজুন..." : "Search customers..."}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex bg-muted/60 rounded p-0.5 text-xs">
              <button
                onClick={() => { setSortOrder("highest"); setPage(1); }}
                className={`px-2 py-1 rounded transition-colors ${sortOrder === "highest" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
              >
                {lang === "bn" ? "সর্বোচ্চ বকেয়া" : "Highest due"}
              </button>
              <button
                onClick={() => { setSortOrder("lowest"); setPage(1); }}
                className={`px-2 py-1 rounded transition-colors ${sortOrder === "lowest" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
              >
                {lang === "bn" ? "সর্বনিম্ন বকেয়া" : "Lowest due"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs list */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(1); }}>
        <TabsList className="grid grid-cols-3 w-full h-9 p-0.5 bg-muted/60">
          <TabsTrigger value="outstanding" className="text-xs">{lang === "bn" ? "বকেয়া বাকি" : "Outstanding Balance"}</TabsTrigger>
          <TabsTrigger value="all" className="text-xs">{lang === "bn" ? "সব কাস্টমার" : "All Customers"}</TabsTrigger>
          <TabsTrigger value="settled" className="text-xs">{lang === "bn" ? "পরিশোধিত" : "Settled Accounts"}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Debtors List */}
      {pagedParties.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground bg-card/60 backdrop-blur-sm">
          {lang === "bn" ? "কোন তথ্য পাওয়া যায়নি" : "No dues found matching current filter"}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pagedParties.map((p: any) => {
            const isReceivable = p.outstanding > 0;
            const isPayable = p.payableOutstanding > 0;

            let cardBorder = "border-border/80";
            let badgeStyle = "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20";
            let labelText = lang === "bn" ? "পরিশোধিত" : "Settled";
            if (isReceivable) {
              cardBorder = "border-amber-500/25";
              badgeStyle = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20";
              labelText = lang === "bn" ? "জমা" : "Receivable";
            } else if (isPayable) {
              cardBorder = "border-rose-500/25";
              badgeStyle = "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20";
              labelText = lang === "bn" ? "বকেয়া" : "Payable";
            }

            return (
              <Card key={p.id} className={`p-4 flex flex-col justify-between gap-3 bg-card/75 backdrop-blur-sm hover:shadow-md transition-shadow beveled-card ${cardBorder}`}>
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/customers/detail?id=${p.id}`} className="font-semibold text-sm hover:text-primary transition-colors hover:underline flex items-center gap-1 group">
                      {p.name}
                      <ArrowRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeStyle}`}>
                      {fmtMoney(Math.abs(p.outstanding))} ({labelText})
                    </span>
                  </div>
                  {(p.phone || p.address) && (
                    <div className="text-xs text-muted-foreground truncate">
                      {p.phone}{p.phone && p.address ? " · " : ""}{p.address}
                    </div>
                  )}
                </div>

                <div className="text-[10px] grid grid-cols-2 gap-2 py-1.5 border-t border-b border-dashed border-border/70 my-1">
                  <div>
                    <span className="text-muted-foreground block">{lang === "bn" ? "মোট বকেয়া ও বাকী:" : "Total Dues:"}</span>
                    <span className="font-medium font-serif">{fmtMoney(p.totalDues)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground block">{lang === "bn" ? "মোট জমা (পরিশোধ):" : "Total Paid:"}</span>
                    <span className="font-medium font-serif text-emerald-600">+{fmtMoney(p.totalPaid)}</span>
                  </div>
                </div>

                {p.payableOutstanding > 0 && (
                  <div className="text-[9px] text-rose-600 font-semibold border-t border-dashed border-border/70 pt-1 -mt-1">
                    {lang === "bn" ? `মোট বকেয়া: ${fmtMoney(p.payableOutstanding)}` : `Total Payable Dues: ${fmtMoney(p.payableOutstanding)}`}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="h-8 flex-1 text-xs border-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-500/5 beveled-button"
                    onClick={() => triggerAddDue(p)}
                  >
                    <Plus className="size-3 mr-1" />
                    {lang === "bn" ? "বাকী যোগ" : "Add Due"}
                  </Button>
                  <Button 
                    size="sm" 
                    className="h-8 flex-1 text-xs beveled-button bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => triggerCollect(p)}
                  >
                    <Plus className="size-3 mr-1" />
                    {lang === "bn" ? "টাকা আদায়" : "Collect"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <PaginationBar page={safePage} totalPages={totalPages} total={sorted.length} pageSize={pageSize} onPageChange={setPage} />

      {/* Collect Payment Dialog */}
      <Dialog open={collectOpen} onOpenChange={setCollectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? `${selectedParty?.name} এর থেকে বকেয়া আদায়` : `Collect Dues from ${selectedParty?.name}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitCollection} className="space-y-4">
            {selectedParty && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 text-xs flex justify-between items-center text-amber-800 dark:text-amber-400 font-medium">
                <span>{lang === "bn" ? "বর্তমান বকেয়া জমা:" : "Current Outstanding Dues:"}</span>
                <span className="font-bold text-sm font-serif">{fmtMoney(selectedParty.outstanding)}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "আদায়ের পরিমাণ (টাকা)" : "Collection Amount (Tk)"}</Label>
              <Input
                type="number"
                inputMode="numeric"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 1500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "নোট / মন্তব্য" : "Note / Remarks"}</Label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Cash payment"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCollectOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy ? "…" : (lang === "bn" ? "আদায় নিশ্চিত করুন" : "Confirm Collection")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Manual Due Dialog */}
      <Dialog open={addDueOpen} onOpenChange={setAddDueOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? `${selectedParty?.name} এর খাতায় বাকী যোগ` : `Record Manual Due for ${selectedParty?.name}`}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReceivable} className="space-y-4">
            {selectedParty && (
              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-2.5 text-xs flex justify-between items-center font-medium">
                <span>{lang === "bn" ? "বর্তমান বকেয়া জমা:" : "Current Outstanding Dues:"}</span>
                <span className="font-bold text-sm font-serif text-amber-600">{fmtMoney(selectedParty.outstanding)}</span>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "বাকীর পরিমাণ (টাকা)" : "Due Amount (Tk)"}</Label>
              <Input
                type="number"
                inputMode="numeric"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 500"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "নোট / মন্তব্য" : "Note / Remarks"}</Label>
              <Input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="e.g. Manual credit adjustment"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddDueOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "…" : (lang === "bn" ? "বাকী যোগ করুন" : "Add Due")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? "নতুন গ্রাহক যোগ করুন" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "গ্রাহকের নাম *" : "Customer Name *"}</Label>
              <Input
                required
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
                placeholder="e.g. Abul Kalam"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ফোন নম্বর" : "Phone Number"}</Label>
              <Input
                type="tel"
                inputMode="tel"
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
                placeholder="e.g. 017XXXXXXXX"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ঠিকানা" : "Address"}</Label>
              <Input
                value={newCustAddress}
                onChange={e => setNewCustAddress(e.target.value)}
                placeholder="e.g. Dhaka, Bangladesh"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddCustomerOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={addingCust}>
                {addingCust ? "…" : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
