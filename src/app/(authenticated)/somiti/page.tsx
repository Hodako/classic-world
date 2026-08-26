"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight,
  UserPlus,
  Search,
  Users,
  Archive,
  Download,
  ArrowLeft,
  ArrowDownToLine,
  Trash2,
  Pencil,
  Plus,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { getSomiti } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createSomitiFn, updateSomitiFn, deleteSomitiFn, renameSomitiFn, deleteSomitiFnByName } from "@/lib/rpc";
import { playTapSound } from "@/lib/audio";
import { FAB } from "@/components/ui/fab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function SomitiPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["somiti"], queryFn: getSomiti });

  const [selectedSamity, setSelectedSamity] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"samities" | "ledger">("samities");

  // Dialog States
  const [addSamityOpen, setAddSamityOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<any | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [samityToRename, setSamityToRename] = useState<string | null>(null);

  // Parse entries to extract [Samity Name] prefix from note
  const parsedEntries = useMemo(() => {
    return (data ?? []).map(e => {
      const rawNote = e.note || "";
      const match = rawNote.match(/^\[(.*?)\](?:\s*(.*))?$/);
      let samityName = lang === "bn" ? "সাধারণ সমিতি" : "General Samity";
      let actualNote = rawNote;
      if (match) {
        samityName = match[1].trim();
        actualNote = match[2]?.trim() || "";
      }
      return { ...e, samityName, actualNote };
    });
  }, [data, lang]);

  // Group entries by Samity Name
  const samitiesList = useMemo(() => {
    const groups: Record<string, { name: string; totalDeposit: number; totalWithdraw: number; balance: number; entriesCount: number; lastActivity: string }> = {};
    parsedEntries.forEach(e => {
      const name = e.samityName;
      if (!groups[name]) {
        groups[name] = { name, totalDeposit: 0, totalWithdraw: 0, balance: 0, entriesCount: 0, lastActivity: e.created_at };
      }
      const amount = Number(e.amount) || 0;
      if (e.kind === "deposit") {
        groups[name].totalDeposit += amount;
        groups[name].balance += amount;
      } else {
        groups[name].totalWithdraw += amount;
        groups[name].balance -= amount;
      }
      groups[name].entriesCount += 1;
      if (new Date(e.created_at) > new Date(groups[name].lastActivity)) {
        groups[name].lastActivity = e.created_at;
      }
    });
    return Object.values(groups).sort((a, b) => b.balance - a.balance);
  }, [parsedEntries]);

  // Overall total balance
  const totalBalance = useMemo(() => {
    return (data ?? []).reduce((a, e) => a + (e.kind === "deposit" ? 1 : -1) * Number(e.amount), 0);
  }, [data]);

  // Search filtered samities
  const filteredSamities = useMemo(() => {
    return samitiesList.filter(s =>
      s.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [samitiesList, search]);

  // Selected Samity current stats
  const currentSamity = useMemo(() => {
    if (!selectedSamity) return null;
    return samitiesList.find(s => s.name === selectedSamity) || {
      name: selectedSamity,
      totalDeposit: 0,
      totalWithdraw: 0,
      balance: 0,
      entriesCount: 0,
      lastActivity: new Date().toISOString(),
    };
  }, [samitiesList, selectedSamity]);

  // Entries for selected samity or all
  const samityEntries = useMemo(() => {
    if (selectedSamity) {
      return parsedEntries.filter(e => e.samityName === selectedSamity);
    }
    return parsedEntries;
  }, [parsedEntries, selectedSamity]);

  async function performDeleteEntry() {
    if (!entryToDelete) return;
    try {
      await deleteSomitiFn({ data: { id: entryToDelete.id } });
      toast.success(t("delete") || "Deleted");
      setEntryToDelete(null);
      qc.invalidateQueries({ queryKey: ["somiti"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  }

  async function handleDeleteSamityByName(name: string) {
    playTapSound();
    const confirmed = confirm(
      lang === "bn"
        ? `আপনি কি নিশ্চিত যে আপনি "${name}" এবং এর অধীনে থাকা সমস্ত লেনদেন মুছে ফেলতে চান?`
        : `Are you sure you want to delete "${name}" and all its associated transactions?`
    );
    if (!confirmed) return;
    try {
      await deleteSomitiFnByName({ data: { name } });
      toast.success(
        lang === "bn" ? `সফলভাবে "${name}" মুছে ফেলা হয়েছে` : `Deleted "${name}" successfully`
      );
      if (selectedSamity === name) setSelectedSamity(null);
      qc.invalidateQueries({ queryKey: ["somiti"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete samity");
    }
  }

  function exportCSV(langCode: "en" | "bn") {
    playTapSound();
    const headers = langCode === "bn"
      ? ["তারিখ", "সমিতির নাম", "ধরণ", "পরিমাণ", "মন্তব্য"]
      : ["Date", "Samity Name", "Type", "Amount", "Note"];
    const rows = samityEntries.map(e => [
      new Date(e.created_at).toLocaleString(langCode === "bn" ? "bn-BD" : "en-US"),
      e.samityName,
      e.kind === "deposit"
        ? (langCode === "bn" ? "জমা" : "Deposit")
        : (langCode === "bn" ? "উত্তোলন" : "Withdrawal"),
      String(e.amount),
      e.actualNote ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `samity_${(selectedSamity || "all").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  if (selectedSamity && currentSamity) {
    return (
      <div className="space-y-4 pb-4">
        <Button variant="ghost" size="sm" onClick={() => { playTapSound(); setSelectedSamity(null); }}>
          <ArrowLeft className="size-4 mr-1" />
          {lang === "bn" ? "সমিতি তালিকা" : "Samity List"}
        </Button>

        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold font-serif">{currentSamity.name}</h1>
            <div className="text-sm text-muted-foreground space-y-0.5 mt-0.5">
              <p>
                {lang === "bn"
                  ? `${currentSamity.entriesCount} টি লেনদেন · শেষ লেনদেন: ${new Date(currentSamity.lastActivity).toLocaleDateString("bn-BD")}`
                  : `${currentSamity.entriesCount} transactions · Last activity: ${new Date(currentSamity.lastActivity).toLocaleDateString()}`}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button size="sm" variant="outline" onClick={() => { playTapSound(); setSamityToRename(currentSamity.name); setRenameOpen(true); }}>
              <Pencil className="size-3.5 mr-1" /> {t("edit")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => handleDeleteSamityByName(currentSamity.name)}>
              <Trash2 className="size-3.5 mr-1" /> {lang === "bn" ? "মুছুন" : "Delete"}
            </Button>
          </div>
        </div>

        <div className="max-w-md mx-auto w-full space-y-4">
          <Card className="p-5 border-amber-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              {lang === "bn" ? "মোট সমিতি সঞ্চয় ব্যালেন্স" : "Net Samity Savings"}
            </div>
            <div className="text-3xl font-extrabold text-amber-600 mt-2 font-serif">
              {fmtMoney(currentSamity.balance)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-normal border-t border-dashed border-border/80 pt-2">
              {lang === "bn"
                ? `হিসাব: মোট জমা (${fmtMoney(currentSamity.totalDeposit)}) − মোট উত্তোলন (${fmtMoney(currentSamity.totalWithdraw)}) = বর্তমান ব্যালেন্স ${fmtMoney(currentSamity.balance)}`
                : `Calculation: Total Deposit (${fmtMoney(currentSamity.totalDeposit)}) − Total Withdrawn (${fmtMoney(currentSamity.totalWithdraw)}) = Net Balance ${fmtMoney(currentSamity.balance)}`}
            </p>
            <Button
              className="mt-4 w-full h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              size="sm"
              onClick={() => { playTapSound(); setDepositOpen(true); }}
            >
              <Plus className="size-3.5 mr-1.5" />
              {lang === "bn" ? "কিস্তি / টাকা জমা দিন" : "Deposit Money"}
            </Button>
          </Card>

          <div className="flex gap-2 w-full">
            <Button
              size="sm" variant="outline" className="flex-1 h-9 text-xs border-rose-200 hover:border-rose-300 hover:bg-rose-50 text-rose-600 font-medium"
              onClick={() => { playTapSound(); setWithdrawOpen(true); }}
            >
              <ArrowDownToLine className="size-3.5 mr-1 rotate-180" />
              {lang === "bn" ? "টাকা উত্তোলন করুন" : "Withdraw Money"}
            </Button>
            <Button
              size="sm" variant="outline" className="flex-1 h-9 text-xs text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/5 font-medium"
              onClick={() => { playTapSound(); setDepositOpen(true); }}
            >
              <Plus className="size-3.5 mr-1" />
              {lang === "bn" ? "অতিরিক্ত জমা" : "Extra Deposit"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="ledger" className="w-full">
          <TabsList className="grid grid-cols-2 w-full max-w-xs mx-auto mb-3">
            <TabsTrigger value="ledger" className="text-xs">{lang === "bn" ? "লেনদেন খাতা" : "Ledger"}</TabsTrigger>
            <TabsTrigger value="summary" className="text-xs">{lang === "bn" ? "সংক্ষিপ্ত বিবরণ" : "Summary"}</TabsTrigger>
          </TabsList>
          <TabsContent value="ledger">
            <Card className="divide-y divide-border overflow-hidden">
              {samityEntries.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{t("no_activity")}</div>}
              {samityEntries.map(e => (
                <div key={e.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate text-sm">
                      {e.kind === "deposit" ? (lang === "bn" ? "টাকা জমা / কিস্তি" : "Deposit / Installment") : (lang === "bn" ? "টাকা উত্তোলন" : "Withdrawal")}
                      {e.actualNote ? ` — ${e.actualNote}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</div>
                  </div>
                  <div className={`text-sm font-semibold shrink-0 ${e.kind === "deposit" ? "text-emerald-600" : "text-rose-600"}`}>
                    {e.kind === "deposit" ? "+" : "−"}{fmtMoney(e.amount)}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { playTapSound(); setEditingEntry(e); if (e.kind === "deposit") setDepositOpen(true); else setWithdrawOpen(true); }}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setEntryToDelete(e)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          </TabsContent>
          <TabsContent value="summary">
            <Card className="p-4 space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">{lang === "bn" ? "সমিতির নাম" : "Samity Name"}</span><span className="font-semibold">{currentSamity.name}</span></div>
              <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">{lang === "bn" ? "সর্বমোট জমা" : "Total Deposited"}</span><span className="font-semibold text-emerald-600 font-serif">+{fmtMoney(currentSamity.totalDeposit)}</span></div>
              <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">{lang === "bn" ? "সর্বমোট উত্তোলন" : "Total Withdrawn"}</span><span className="font-semibold text-rose-600 font-serif">−{fmtMoney(currentSamity.totalWithdraw)}</span></div>
              <div className="flex justify-between py-1.5 font-bold text-sm"><span>{lang === "bn" ? "অবশিষ্ট সঞ্চয় ব্যালেন্স" : "Net Balance"}</span><span className="font-serif text-amber-600">{fmtMoney(currentSamity.balance)}</span></div>
            </Card>
          </TabsContent>
        </Tabs>

        <FAB onClick={() => { playTapSound(); setEditingEntry(null); setDepositOpen(true); }} />
        <CollectPaymentDialog open={depositOpen} onOpenChange={(v) => { setDepositOpen(v); if (!v) setEditingEntry(null); }} samityName={currentSamity.name} entry={editingEntry} />
        <PayPartyDialog open={withdrawOpen} onOpenChange={(v) => { setWithdrawOpen(v); if (!v) setEditingEntry(null); }} samityName={currentSamity.name} entry={editingEntry} />
        <RenameDialog open={renameOpen} onOpenChange={(v) => { setRenameOpen(v); if (!v) setSamityToRename(null); }} oldName={samityToRename} onRenameSuccess={(newName) => { setSelectedSamity(newName); qc.invalidateQueries({ queryKey: ["somiti"] }); }} />
        <ConfirmDeleteModal open={!!entryToDelete} onOpenChange={(v) => { if (!v) setEntryToDelete(null); }} onConfirm={performDeleteEntry} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h1 className="text-xl font-bold whitespace-nowrap flex items-center gap-2">
            <PiggyBank className="size-5 text-primary" />
            {lang === "bn" ? "সমিতি ব্যবস্থাপনা" : "Samity Collection"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{filteredSamities.length} {lang === "bn" ? "টি সমিতি" : "samities"}</p>
        </div>
        <div className="flex gap-1.5 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs"><Download className="size-4 mr-1" />{t("download_csv") || "CSV"}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportCSV("en")}>English (ইংরেজি)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCSV("bn")}>Bangla (বাংলা)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" onClick={() => { playTapSound(); setAddSamityOpen(true); }}><UserPlus className="size-4 mr-1" />{lang === "bn" ? "নতুন সমিতি" : "Add Samity"}</Button>
        </div>
      </div>

      <Card className="p-3 beveled-kpi relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-primary grid place-items-center shrink-0 shadow-xs"><PiggyBank className="size-4 text-primary-foreground" /></div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{lang === "bn" ? "সর্বমোট সমিতি সঞ্চয় ব্যালেন্স" : "Total Net Samity Savings"}</div>
            <div className="text-xl font-bold font-serif text-primary">{fmtMoney(totalBalance)}</div>
          </div>
        </div>
      </Card>

      <div className="sticky top-0 z-10 bg-background border-b pb-2 pt-3 px-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
          <Input className="pl-10" placeholder={lang === "bn" ? "সমিতি খুঁজুন..." : "Search samities..."} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { playTapSound(); setActiveTab(v as any); }}>
        <TabsList className="grid grid-cols-2 w-full h-8 p-0.5 bg-muted/60">
          <TabsTrigger value="samities" className="text-xs py-1">{lang === "bn" ? "সক্রিয় সমিতি সমূহ" : "Active Samities"} ({filteredSamities.length})</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs py-1">{lang === "bn" ? "সব লেনদেন লেজার" : "All Ledger"} ({parsedEntries.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {data && filteredSamities.length === 0 && activeTab === "samities" && (
        <Card className="p-10 text-center">
          <PiggyBank className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{lang === "bn" ? "কোন সমিতি পাওয়া যায়নি" : "No samities found"}</p>
          <Button className="mt-4" onClick={() => { playTapSound(); setAddSamityOpen(true); }}><UserPlus className="size-4 mr-1" /> {lang === "bn" ? "নতুন সমিতি যোগ করুন" : "Add Samity"}</Button>
        </Card>
      )}

      {activeTab === "samities" ? (
        <div className="space-y-2.5">
          {filteredSamities.map(s => (
            <div key={s.name} onClick={() => { playTapSound(); setSelectedSamity(s.name); }} className="block w-full text-left active:scale-[0.99] transition-transform cursor-pointer">
              <Card className={`overflow-hidden ${s.balance >= 0 ? "border-primary/30" : "border-rose-300/30"}`}>
                <div className="flex items-center p-3 gap-2.5">
                  <div className={`size-9 rounded-full grid place-items-center text-sm font-bold shrink-0 ${s.balance >= 0 ? "bg-primary/15 text-primary" : "bg-rose-500/15 text-rose-600"}`}>
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {s.entriesCount} {lang === "bn" ? "টি লেনদেন" : "transactions"} · {lang === "bn" ? "শেষ:" : "Last:"} {new Date(s.lastActivity).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US")}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div className="flex flex-col items-end gap-0.5"><span className="text-[9px] text-muted-foreground block">{lang === "bn" ? "মোট ব্যালেন্স" : "Net Balance"}</span><span className="text-xs font-bold font-serif text-emerald-600">{fmtMoney(s.balance)}</span></div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {parsedEntries.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{t("no_activity")}</div>}
          {parsedEntries.map(e => (
            <div key={e.id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate text-sm flex items-center gap-1.5"><span className="text-xs font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{e.samityName}</span><span>{e.kind === "deposit" ? (lang === "bn" ? "জমা" : "Deposit") : (lang === "bn" ? "উত্তোলন" : "Withdraw")}{e.actualNote ? ` — ${e.actualNote}` : ""}</span></div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</div>
              </div>
              <div className={`text-sm font-semibold shrink-0 ${e.kind === "deposit" ? "text-emerald-600" : "text-rose-600"}`}>{e.kind === "deposit" ? "+" : "−"}{fmtMoney(e.amount)}</div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => setEntryToDelete(e)}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </Card>
      )}

      <FAB onClick={() => { playTapSound(); setAddSamityOpen(true); }} />
      <AddPartyEquivalentDialog open={addSamityOpen} onOpenChange={setAddSamityOpen} onSuccess={(name) => { setSelectedSamity(name); qc.invalidateQueries({ queryKey: ["somiti"] }); }} />
      <ConfirmDeleteModal open={!!entryToDelete} onOpenChange={(v) => { if (!v) setEntryToDelete(null); }} onConfirm={performDeleteEntry} />
    </div>
  );
}

function CollectPaymentDialog({ samityName, open, onOpenChange, entry }: { samityName: string; open: boolean; onOpenChange: (v: boolean) => void; entry?: any; }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      if (entry) { setAmount(String(entry.amount)); setNote(entry.actualNote || ""); }
      else { setAmount(""); setNote(""); }
    }
  }, [open, entry]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    setBusy(true);
    playTapSound();
    const finalNote = note.trim() ? `[${samityName}] ${note.trim()}` : `[${samityName}]`;
    try {
      if (entry) { await updateSomitiFn({ data: { id: entry.id, kind: "deposit", amount: amt, note: finalNote } }); toast.success(t("save") || "Updated successfully"); }
      else { await createSomitiFn({ data: { kind: "deposit", amount: amt, note: finalNote } }); toast.success(lang === "bn" ? "টাকা জমা সফল হয়েছে!" : "Deposit saved successfully!"); }
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["somiti"] });
    } catch (err: any) { toast.error(err.message || "Failed to save"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{entry ? t("edit") : (lang === "bn" ? `কিস্তি / টাকা জমা (${samityName})` : `Collect Deposit (${samityName})`)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">{t("amount")}</Label><Input required type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">{t("note")}</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder={lang === "bn" ? "যেমন: ১০ম কিস্তি / সাপ্তাহিক জমা" : "e.g. 10th Installment"} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{busy ? "…" : t("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayPartyDialog({ samityName, open, onOpenChange, entry }: { samityName: string; open: boolean; onOpenChange: (v: boolean) => void; entry?: any; }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      if (entry) { setAmount(String(entry.amount)); setNote(entry.actualNote || ""); }
      else { setAmount(""); setNote(""); }
    }
  }, [open, entry]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0) return;
    setBusy(true);
    playTapSound();
    const finalNote = note.trim() ? `[${samityName}] ${note.trim()}` : `[${samityName}]`;
    try {
      if (entry) { await updateSomitiFn({ data: { id: entry.id, kind: "withdraw", amount: amt, note: finalNote } }); toast.success(t("save") || "Updated successfully"); }
      else { await createSomitiFn({ data: { kind: "withdraw", amount: amt, note: finalNote } }); toast.success(lang === "bn" ? "টাকা উত্তোলন সফল হয়েছে!" : "Withdrawal saved successfully!"); }
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["somiti"] });
    } catch (err: any) { toast.error(err.message || "Failed to save"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{entry ? t("edit") : (lang === "bn" ? `টাকা উত্তোলন (${samityName})` : `Withdraw Money (${samityName})`)}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">{t("amount")}</Label><Input required type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">{t("note")}</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder={lang === "bn" ? "যেমন: সঞ্চয় ভাঙানো / জরুরি উত্তোলন" : "e.g. Withdrawal reason"} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button><Button type="submit" disabled={busy}>{busy ? "…" : t("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddPartyEquivalentDialog({ open, onOpenChange, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; onSuccess: (name: string) => void; }) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) { setName(""); setAmount(""); setNote(""); } }, [open]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    playTapSound();
    try {
      const cleanName = name.trim();
      const initAmt = Number(amount) || 0;
      if (initAmt > 0) {
        const finalNote = note.trim() ? `[${cleanName}] ${note.trim()}` : `[${cleanName}] ${lang === "bn" ? "প্রাথমিক জমা (পূর্বের স্থিতি)" : "Opening deposit (Previous Balance)"}`;
        await createSomitiFn({ data: { kind: "deposit", amount: initAmt, note: finalNote, skipCashbox: true, is_initial: true } });
      }
      toast.success(lang === "bn" ? `সমিতি "${cleanName}" তৈরি হয়েছে` : `Samity "${cleanName}" created`);
      onOpenChange(false);
      onSuccess(cleanName);
    } catch (err: any) { toast.error(err.message || "Failed to create samity"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md font-hind">
        <DialogHeader><DialogTitle className="font-balooda text-base font-bold">{lang === "bn" ? "নতুন সমিতি তৈরি করুন" : "Add New Samity"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1"><Label className="text-xs font-semibold text-foreground">{lang === "bn" ? "সমিতির নাম" : "Samity Name"}</Label><Input required value={name} onChange={e => setName(e.target.value)} placeholder={lang === "bn" ? "যেমন: আশা সমিতি, গ্রামীণ ব্যাংক" : "e.g. Asha Samity, Grameen Bank"} autoFocus className="h-10 rounded-xl text-xs" /></div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">{lang === "bn" ? "পূর্বে জমা করা টাকা / প্রারম্ভিক স্থিতি (ঐচ্ছিক)" : "Opening Deposit / Previous Balance (Optional)"}</Label>
            <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-10 rounded-xl text-xs font-mono font-bold" />
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              {lang === "bn" ? "ℹ️ এই প্রারম্ভিক টাকা বর্তমান ক্যাশ থেকে কাটা হবে না (কারণ এটি সফটওয়্যার ব্যবহারের পূর্বে জমা করা হতে পারে)।" : "ℹ️ This opening deposit will NOT be deducted from current cashbox (for pre-existing balances)."}
            </p>
          </div>
          <div className="space-y-1"><Label className="text-xs font-semibold text-foreground">{t("note")}</Label><Input value={note} onChange={e => setNote(e.target.value)} placeholder={lang === "bn" ? "সদস্য নম্বর বা সংক্ষিপ্ত বিবরণ" : "Notes or description"} className="h-10 rounded-xl text-xs" /></div>
          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">{t("cancel")}</Button><Button type="submit" disabled={busy} className="rounded-xl bg-primary text-primary-foreground font-bold text-xs">{busy ? "…" : t("save")}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ open, onOpenChange, oldName, onRenameSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; oldName: string | null; onRenameSuccess: (newName: string) => void; }) {
  const { lang, t } = useT();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open && oldName) setNewName(oldName); }, [open, oldName]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!oldName || !newName.trim() || oldName === newName.trim()) return;
    setBusy(true);
    playTapSound();
    try {
      await renameSomitiFn({ data: { oldName, newName: newName.trim() } });
      toast.success(lang === "bn" ? "নাম পরিবর্তন সফল হয়েছে" : "Renamed successfully");
      onRenameSuccess(newName.trim());
      onOpenChange(false);
    } catch (err: any) { toast.error(err.message || "Failed to rename"); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{lang === "bn" ? "নাম পরিবর্তন করুন" : "Rename Samity"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{lang === "bn" ? "নতুন নাম" : "New Name"}</Label>
            <Input
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New Samity Name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "…" : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeleteModal({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  const { t, lang } = useT();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{lang === "bn" ? "মুছে ফেলতে চান?" : "Confirm Delete"}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {lang === "bn"
            ? "আপনি কি নিশ্চিত যে এই লেনদেনটি মুছে ফেলতে চান?"
            : "Are you sure you want to delete this transaction entry?"}
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
