"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronRight, UserPlus, Search, Users, Archive, Download } from "lucide-react";
import { getParties, getSales, getAllPayments, getAllPartyReceivables, getAllPartyPayables, getAllPayableSettlements } from "@/lib/queries";
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
import { createPartyFn, archivePartyFn } from "@/lib/rpc";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import type { Party } from "@/lib/queries";
import Link from "next/link";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PartiesPage() {
  const { lang, t } = useT();
  const parties = useCachedQuery(["parties"], getParties);
  const sales = useCachedQuery(["sales"], getSales);
  const allPayments = useCachedQuery(["all-payments"], getAllPayments);
  const allReceivables = useCachedQuery(["all-party-receivables"], getAllPartyReceivables);
  const allPayables = useCachedQuery(["all-party-payables"], getAllPartyPayables);
  const allSettlements = useCachedQuery(["all-payable-settlements"], getAllPayableSettlements);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const pageSize = 10;

  const duesByParty: Record<string, number> = {};
  (sales.data ?? []).forEach(s => {
    if (s.party_id && !s.returned) {
      duesByParty[s.party_id] = (duesByParty[s.party_id] ?? 0) + Number(s.due_amount);
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

  const payablesByParty: Record<string, number> = {};
  (allPayables.data ?? []).forEach(p => {
    payablesByParty[p.party_id] = (payablesByParty[p.party_id] ?? 0) + Number(p.amount);
  });

  const settlementsByParty: Record<string, number> = {};
  (allSettlements.data ?? []).forEach(s => {
    settlementsByParty[s.party_id] = (settlementsByParty[s.party_id] ?? 0) + Number(s.amount);
  });

  const getPartyReceivable = (partyId: string) => {
    const totalDues = (duesByParty[partyId] ?? 0) + (extraByParty[partyId] ?? 0);
    const paid = paidByParty[partyId] ?? 0;
    return Math.max(totalDues - paid, 0);
  };

  const getPartyPayable = (partyId: string) => {
    const payableTotal = payablesByParty[partyId] ?? 0;
    const settledTotal = settlementsByParty[partyId] ?? 0;
    return Math.max(payableTotal - settledTotal, 0);
  };

  const onlySuppliers = (parties.data ?? [])
    .filter(Boolean)
    .filter(p => (p as any).type !== "customer" && !(p as any).is_customer);

  const totalPayable = onlySuppliers.reduce((sum, p) => {
    if (p.archived) return sum;
    return sum + getPartyPayable(p.id);
  }, 0);

  const filtered = onlySuppliers
    .filter(p => {
      const matchesSearch = (p.name || "").toLowerCase().includes(search.toLowerCase()) || (p.phone ?? "").includes(search);
      const matchesTab = activeTab === "archived" ? p.archived === true : p.archived !== true;
      return matchesSearch && matchesTab;
    });

  const { items: pagedParties, totalPages, safePage } = paginate(filtered, page, pageSize);

  function prefetchParty(p: Party) {
    setCachedData<Party>(qc, ["party", p.id], p);
  }

  async function toggleArchive(p: Party) {
    const nextVal = !p.archived;
    const prevParties = qc.getQueryData<Party[]>(["parties"]);
    setCachedData<Party[]>(qc, ["parties"], old =>
      (old ?? []).map(x => x.id === p.id ? { ...x, archived: nextVal } : x)
    );
    toast.success(nextVal ? t("archived") : t("active"));
    try {
      await archivePartyFn({ data: { id: p.id, archived: nextVal } });
      await refreshQueries(qc, ["parties"]);
    } catch (err: unknown) {
      if (prevParties) setCachedData(qc, ["parties"], prevParties);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  function exportParties(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["নাম", "ফোন নম্বর", "মোট বকেয়া", "আর্কাইভ করা"]
      : ["Name", "Phone", "Total Payable (I Owe)", "Archived"];
    const rows = filtered.map(p => [
      p.name,
      p.phone || "",
      getPartyPayable(p.id),
      p.archived
        ? (langCode === "bn" ? "হ্যাঁ" : "Yes")
        : (langCode === "bn" ? "না" : "No")
    ]);
    downloadCsv(`parties_${activeTab}_${exportDateStamp()}.csv`, headers, rows);
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-xl font-bold whitespace-nowrap">{t("party_collection")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {t("parties")}</p>
        </div>
        <div className="flex gap-1.5 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs">
                <Download className="size-4 mr-1" />
                {t("download_csv")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportParties("en")}>
                English (ইংরেজি)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportParties("bn")}>
                Bangla (বাংলা)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            className="bg-[#228B22] hover:bg-[#1C741C] text-white font-bold border-0 shadow-sm transition-all"
            style={{ backgroundColor: "#228B22", color: "#FFFFFF" }}
          >
            <UserPlus className="size-4 mr-1 text-white" />
            {t("add_party")}
          </Button>
        </div>
      </div>

      <Card className="p-3 beveled-kpi relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-primary grid place-items-center shrink-0 shadow-xs">
            <Users className="icon-sm text-primary-foreground" />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "মোট বকেয়া" : "Total Payable"}</div>
            <div className="text-xl font-bold font-serif text-primary">{fmtMoney(totalPayable)}</div>
          </div>
        </div>
      </Card>

      <div className="sticky top-0 z-10 bg-background border-b pb-2 pt-3 px-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10 pointer-events-none" />
          <Input
            style={{ paddingLeft: "2.5rem" }}
            className="pl-10"
            placeholder={t("search_parties")}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setPage(1); }}>
        <TabsList className="grid grid-cols-2 w-full h-8 p-0.5 bg-muted/60">
          <TabsTrigger value="active" className="text-xs py-1">{t("active")}</TabsTrigger>
          <TabsTrigger value="archived" className="text-xs py-1">{t("archived")}</TabsTrigger>
        </TabsList>
      </Tabs>

      {parties.data && filtered.length === 0 && (
        <Card className="p-10 text-center">
          <Users className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t("no_parties")}</p>
          <Button
            className="mt-4 bg-[#228B22] hover:bg-[#1C741C] text-white font-bold border-0 shadow-sm transition-all"
            style={{ backgroundColor: "#228B22", color: "#FFFFFF" }}
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="size-4 mr-1 text-white" /> {t("add_party")}
          </Button>
        </Card>
      )}
      <div className="space-y-2.5">
        {pagedParties.map(p => {
          const outstanding = getPartyReceivable(p.id);
          const payableOutstanding = getPartyPayable(p.id);
          
          let cardBorder = "border-border";
          let avatarStyle = "bg-secondary text-secondary-foreground";
          if (outstanding > 0) {
            cardBorder = "border-primary/30";
            avatarStyle = "bg-primary/15 text-primary";
          } else if (payableOutstanding > 0) {
            cardBorder = "border-rose-300/30";
            avatarStyle = "bg-rose-500/15 text-rose-600";
          }

          return (
            <Link
              key={p.id}
              href={`/parties/detail?id=${p.id}`}
              onMouseEnter={() => prefetchParty(p)}
              onTouchStart={() => prefetchParty(p)}
              className="block w-full text-left active:scale-[0.99] transition-transform"
            >
              <Card className={`overflow-hidden ${cardBorder}`}>
                <div className="flex items-center p-3 gap-2.5">
                  <div className={`size-9 rounded-full grid place-items-center text-sm font-bold shrink-0 ${avatarStyle}`}>
                    {(p.name || "P").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{p.name}</div>
                    {(p.phone || p.address) && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {p.phone}{p.phone && p.address ? " · " : ""}{p.address}
                      </div>
                    )}
                    <div className="text-[10px] text-primary mt-0.5">{t("view")} →</div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div className="flex flex-col items-end gap-0.5">
                      {payableOutstanding > 0 ? (
                        <div>
                          <span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "বকেয়া" : "I owe"}</span>
                          <span className="text-xs font-bold text-rose-600 font-serif">{fmtMoney(payableOutstanding)}</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-bold text-emerald-600">{lang === "bn" ? "পরিশোধিত" : "Clear"}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleArchive(p);
                      }}
                      title={p.archived ? t("restore") : t("archive")}
                    >
                      <Archive className="size-3.5" />
                    </Button>
                  </div>
                  <ChevronRight className="icon-sm text-muted-foreground shrink-0" />
                </div>
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && search && (
          <p className="text-sm text-muted-foreground text-center py-6">{t("no_results")}</p>
        )}
      </div>

      <PaginationBar page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />

      <AddPartyDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddPartyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const phoneVal = phone.trim() || null;
    const addressVal = address.trim() || null;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Party = { id: tempId, name: trimmedName, phone: phoneVal, address: addressVal, created_at: new Date().toISOString() };

    const prevParties = qc.getQueryData<Party[]>(["parties"]);
    setCachedData<Party[]>(qc, ["parties"], old => [...(old ?? []), optimistic].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setName(""); setPhone(""); setAddress("");
    onOpenChange(false);
    toast.success(`${trimmedName} — ${t("add_party")}`);

    setBusy(true);
    try {
      const saved = await createPartyFn({ data: { name: trimmedName, phone: phoneVal, address: addressVal } });
      setCachedData<Party[]>(qc, ["parties"], old =>
        (old ?? []).map(p => (p.id === tempId ? { ...saved, id: saved.id } as Party : p)),
      );
      await refreshQueries(qc, ["parties"]);
    } catch (err: unknown) {
      if (prevParties) {
        setCachedData<Party[]>(qc, ["parties"], prevParties);
      } else {
        setCachedData<Party[]>(qc, ["parties"], old => (old ?? []).filter(p => p.id !== tempId));
      }
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl">
        <div
          className="p-4 bg-[#228B22] text-white flex items-center gap-3"
          style={{ backgroundColor: "#228B22", color: "#FFFFFF" }}
        >
          <div className="size-9 rounded-xl bg-white/20 grid place-items-center shrink-0">
            <UserPlus className="size-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">{t("add_party")}</h3>
            <p className="text-xs text-white/80 font-balooda">
              {lang === "bn" ? "নতুন সাপ্লায়ার ও ব্যবসায়িক পার্টনার যুক্ত করুন" : "Add a new supplier or partner"}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="p-5 space-y-3.5 bg-card">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">{t("party_name")} *</Label>
            <Input required placeholder={lang === "bn" ? "সাপ্লায়ার / পার্টনারের নাম লিখুন" : t("party_name")} value={name} onChange={e => setName(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">{t("phone")}</Label>
            <Input inputMode="tel" placeholder={lang === "bn" ? "মোবাইল নম্বর (যেমন: 017XXXXXXXX)" : t("phone")} value={phone} onChange={e => setPhone(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">{lang === "bn" ? "ঠিকানা" : "Address"}</Label>
            <Input placeholder={lang === "bn" ? "দোকান বা গোডাউনের ঠিকানা" : "Store or Warehouse Address"} value={address} onChange={e => setAddress(e.target.value)} className="h-10 rounded-xl" />
          </div>
          <DialogFooter className="pt-2 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">{t("cancel")}</Button>
            <Button
              type="submit"
              disabled={busy}
              className="bg-[#228B22] hover:bg-[#1C741C] text-white font-bold rounded-xl border-0 shadow-sm transition-all"
              style={{ backgroundColor: "#228B22", color: "#FFFFFF" }}
            >
              {busy ? "…" : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
