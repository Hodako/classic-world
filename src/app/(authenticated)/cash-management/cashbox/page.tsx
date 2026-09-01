"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { CashboxEntry } from "@/lib/queries";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { cashboxBalance, cashboxDelta } from "@/lib/cashbox-utils";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { ArrowLeft, Plus, Minus, Download, Banknote, TrendingUp, TrendingDown, Pencil, Trash2, MoreVertical, Wrench } from "lucide-react";
import { createCashboxFn, updateCashboxFn, deleteCashboxFn, repairCashboxDbFn } from "@/lib/rpc";
import { toast } from "sonner";
import { refreshQueries } from "@/lib/optimistic-cache";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";

type Range = "today" | "yesterday" | "week" | "month" | "all" | "custom";
type FilterKind = "all" | CashboxEntry["kind"];

function RangePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        active ? "bg-primary text-primary-foreground shadow-xs" : "bg-muted text-muted-foreground hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}

function kindLabel(t: (k: any) => string, kind: CashboxEntry["kind"]) {
  if (kind === "sale") return t("sales");
  if (kind === "expense") return t("expense");
  if (kind === "deposit") return t("add_money");
  return t("take_money");
}

export default function CashboxDetailsPage() {
  const { t, lang } = useT();
  const { user } = useAuth();
  const isAdmin = user?.role === "owner" || user?.role === "superadmin";
  const cashbox = useCashboxQuery();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const [dialogKind, setDialogKind] = useState<"deposit" | "withdraw">("deposit");
  const [editEntry, setEditEntry] = useState<CashboxEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashboxEntry | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [range, setRange] = useState<Range>("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  async function runRepair() {
    if (!confirm(lang === "bn" ? "আপনি কি ক্যাশবক্স ডাটা সংস্কার ও সমন্বয় করতে চান?" : "Are you sure you want to reconcile and synchronize all historical cashbox data?")) {
      return;
    }
    setRepairing(true);
    try {
      const res = await repairCashboxDbFn();
      if (res && res.success) {
        toast.success(lang === "bn" ? `${res.repairedCount}টি ক্যাশবক্স এন্ট্রি সফলভাবে সংস্কার করা হয়েছে!` : `${res.repairedCount} cashbox entries successfully reconciled!`);
        await refreshQueries(qc, ["cashbox", "sales", "expenses"]);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to repair");
    } finally {
      setRepairing(false);
    }
  }

  const entries = cashbox.data ?? [];
  const balance = cashbox.isLoading ? null : cashboxBalance(entries);

  const { from, to } = useMemo(() => {
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);

    if (range === "today") {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    }
    if (range === "yesterday") {
      const yStart = new Date(now); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date(now); yEnd.setDate(yEnd.getDate() - 1); yEnd.setHours(23, 59, 59, 999);
      return { from: yStart, to: yEnd };
    }
    if (range === "week") {
      const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    }
    if (range === "month") {
      const start = new Date(now); start.setDate(1); start.setHours(0, 0, 0, 0);
      return { from: start, to: end };
    }
    if (range === "custom") {
      return {
        from: startDate ? new Date(startDate) : new Date(0),
        to: endDate ? new Date(endDate + "T23:59:59.999") : end,
      };
    }
    // "all"
    return { from: new Date(0), to: end };
  }, [range, startDate, endDate]);

  const parseEntryDate = (dateInput: any): Date => {
    if (!dateInput) return new Date(0);
    if (typeof dateInput?.toDate === "function") return dateInput.toDate();
    if (dateInput?.seconds !== undefined) return new Date(dateInput.seconds * 1000);
    const d = new Date(dateInput);
    return !isNaN(d.getTime()) ? d : new Date(0);
  };

  const filtered = useMemo(() => {
    return entries
      .filter(e => {
        const dt = parseEntryDate(e.created_at);
        if (dt < from || dt > to) return false;
        if (filterKind !== "all" && e.kind !== filterKind) return false;
        return true;
      })
      .sort((a, b) => +parseEntryDate(b.created_at) - +parseEntryDate(a.created_at));
  }, [entries, from, to, filterKind]);

  const periodIn = filtered.filter(e => e.kind === "deposit" || e.kind === "sale").reduce((a, e) => a + Number(e.amount), 0);
  const periodOut = filtered.filter(e => e.kind === "withdraw" || e.kind === "expense").reduce((a, e) => a + Number(e.amount), 0);
  const periodNet = periodIn - periodOut;

  const { items: paged, totalPages, safePage } = paginate(filtered, page, pageSize);

  useEffect(() => { setPage(1); }, [range, startDate, endDate, filterKind]);

  async function handleDelete(entry: CashboxEntry) {
    setDeleteTarget(entry);
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteCashboxFn({ data: { id: deleteTarget.id } });
      toast.success(t("deleted" as any) || "Deleted");
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      await refreshQueries(qc, ["cashbox"]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function exportCSV(langCode: "en" | "bn") {
    const rows = langCode === "bn"
      ? [["তারিখ", "সময়", "ধরণ", "মন্তব্য", "পরিমাণ", "দিকনির্দেশ"]]
      : [["Date", "Time", "Type", "Note", "Amount", "Direction"]];
    filtered.forEach(e => {
      const d = new Date(e.created_at);
      let typeLabel: string = e.kind;
      if (langCode === "bn") {
        if (e.kind === "deposit") typeLabel = "জমা";
        else if (e.kind === "withdraw") typeLabel = "উত্তোলন";
        else if (e.kind === "sale") typeLabel = "বিক্রয়";
        else if (e.kind === "expense") typeLabel = "খরচ";
      } else {
        typeLabel = e.kind.toUpperCase();
      }

      rows.push([
        d.toLocaleDateString(langCode === "bn" ? "bn-BD" : "en-US"),
        d.toLocaleTimeString(langCode === "bn" ? "bn-BD" : "en-US"),
        typeLabel,
        e.note ?? "",
        String(e.amount),
        cashboxDelta(e.kind, e.amount) >= 0
          ? (langCode === "bn" ? "ভিতরে (ইন)" : "in")
          : (langCode === "bn" ? "বাহিরে (আউট)" : "out"),
      ]);
    });
    rows.push([]);
    if (langCode === "bn") {
      rows.push(["সারসংক্ষেপ", "", "", "ব্যালেন্স", String(balance), ""]);
      rows.push(["নির্বাচিত সময়ে মোট জমা", "", "", "", String(periodIn), ""]);
      rows.push(["নির্বাচিত সময়ে মোট উত্তোলন", "", "", "", String(periodOut), ""]);
    } else {
      rows.push(["Summary", "", "", "Balance", String(balance), ""]);
      rows.push(["Period In", "", "", "", String(periodIn), ""]);
      rows.push(["Period Out", "", "", "", String(periodOut), ""]);
    }
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `cashbox-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  const rangeLabel =
    range === "today" ? (lang === "bn" ? "আজ" : "Today") :
    range === "yesterday" ? (lang === "bn" ? "গতকাল" : "Yesterday") :
    range === "week" ? (lang === "bn" ? "এই সপ্তাহ" : "This Week") :
    range === "month" ? (lang === "bn" ? "এই মাস" : "This Month") :
    range === "all" ? (lang === "bn" ? "সর্বমোট" : "All Time") : (lang === "bn" ? "কাস্টম" : "Custom");

  return (
    <div className="space-y-4 pb-4">
      <Link href="/cash-management">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="size-4 mr-1" />{t("cash_management")}
        </Button>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t("cashbox")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("cashbox_ledger")}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              disabled={repairing}
              onClick={runRepair}
              className="border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/20"
            >
              <Wrench className={`size-3.5 mr-1 ${repairing ? "animate-spin" : ""}`} />
              {repairing ? "..." : (lang === "bn" ? "ডাটা সংস্কার" : "Reconcile Data")}
            </Button>
          )}
          <Button size="sm" onClick={() => { setDialogKind("deposit"); setEditEntry(null); setDialogOpen(true); }}>
            <Plus className="size-3.5 mr-1" />{t("add_money")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setDialogKind("withdraw"); setEditEntry(null); setDialogOpen(true); }}>
            <Minus className="size-3.5 mr-1" />{t("take_money")}
          </Button>
        </div>
      </div>

      <Card className="p-4 glass-card border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 to-indigo-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-indigo-500 grid place-items-center shrink-0 shadow-xs">
              <Banknote className="size-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground font-medium">
                {range === "today"
                  ? (lang === "bn" ? "আজকের ক্যাশ আদায় ও স্থিতি" : "Today's Cash Collection")
                  : range === "yesterday"
                  ? (lang === "bn" ? "গতকালের ক্যাশ আদায় ও স্থিতি" : "Yesterday's Cash Collection")
                  : range === "all"
                  ? (lang === "bn" ? "সর্বমোট ক্যাশবক্স ব্যালেন্স" : "All-Time Cashbox Balance")
                  : `${rangeLabel} ${lang === "bn" ? "ক্যাশ প্রবাহ" : "Net Cash Flow"}`}
              </div>
              {balance === null ? (
                <div className="h-9 w-32 rounded-md bg-indigo-200/60 dark:bg-indigo-800/40 animate-pulse mt-1" />
              ) : (
                <div className="text-2xl sm:text-3xl font-bold text-indigo-600 font-serif">
                  {range === "today" || range === "yesterday"
                    ? fmtMoney(periodIn)
                    : range === "all"
                    ? fmtMoney(balance)
                    : (periodNet >= 0 ? "+" : "−") + fmtMoney(Math.abs(periodNet))}
                </div>
              )}
            </div>
          </div>
          {balance !== null && (
            <div className="flex flex-col sm:items-end bg-background/60 backdrop-blur-xs px-3 py-1.5 rounded-xl border border-border/60">
              <span className="text-[10px] text-muted-foreground font-medium">
                {lang === "bn" ? "সর্বমোট ক্যাশবক্স ব্যালেন্স" : "All-Time Total Balance"}
              </span>
              <span className="text-sm sm:text-base font-bold text-foreground font-serif">
                {fmtMoney(balance)}
              </span>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Card className="p-3 sm:p-4 text-center">
          <TrendingUp className="size-4 text-emerald-600 mx-auto mb-1" />
          <div className="text-[10px] text-muted-foreground">{t("money_in")}</div>
          <div className="text-sm sm:text-base font-bold text-emerald-600">{fmtMoney(periodIn)}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{rangeLabel}</div>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <TrendingDown className="size-4 text-rose-600 mx-auto mb-1" />
          <div className="text-[10px] text-muted-foreground">{t("money_out")}</div>
          <div className="text-sm sm:text-base font-bold text-rose-600">{fmtMoney(periodOut)}</div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{rangeLabel}</div>
        </Card>
        <Card className="p-3 sm:p-4 text-center">
          <div className="text-[10px] text-muted-foreground mt-5 sm:mt-0">{t("net_change")}</div>
          <div className={`text-sm sm:text-base font-bold mt-1 ${periodNet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {periodNet >= 0 ? "+" : "−"}{fmtMoney(Math.abs(periodNet))}
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">{rangeLabel}</div>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <RangePill label={lang === "bn" ? "আজ" : "Today"} active={range === "today"} onClick={() => setRange("today")} />
          <RangePill label={lang === "bn" ? "গতকাল" : "Yesterday"} active={range === "yesterday"} onClick={() => setRange("yesterday")} />
          <RangePill label={lang === "bn" ? "এই সপ্তাহ" : "This Week"} active={range === "week"} onClick={() => setRange("week")} />
          <RangePill label={lang === "bn" ? "এই মাস" : "This Month"} active={range === "month"} onClick={() => setRange("month")} />
          <RangePill label={lang === "bn" ? "সব" : "All"} active={range === "all"} onClick={() => setRange("all")} />
          <RangePill label={lang === "bn" ? "কাস্টম" : "Custom"} active={range === "custom"} onClick={() => setRange("custom")} />
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 h-8 text-xs" />
            <span className="text-muted-foreground text-xs">—</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 h-8 text-xs" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(["all", "sale", "expense", "deposit", "withdraw"] as FilterKind[]).map(k => (
          <button
            key={k}
            type="button"
            onClick={() => setFilterKind(k)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              filterKind === k ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {k === "all" ? t("all") : kindLabel(t, k)}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={filtered.length === 0}>
              <Download className="size-4 mr-1" />{t("export_csv")}
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
      </div>

      <Card className="divide-y divide-border overflow-hidden">
        {paged.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("no_activity")}</div>
        )}
        {paged.map(e => {
          const delta = cashboxDelta(e.kind, e.amount);
          return (
            <div key={e.id} className="p-3 flex items-center justify-between gap-2 group">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{e.note || kindLabel(t, e.kind)}</div>
                <div className="text-xs text-muted-foreground">{fmtDateTime(e.created_at)}</div>
                <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  e.kind === "sale" || e.kind === "deposit"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                }`}>
                  {kindLabel(t, e.kind)}
                </span>
                {(e.kind === "sale" || e.kind === "expense") && (
                  <span className="ml-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
                    auto
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`text-sm font-bold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {delta >= 0 ? "+" : "−"}{fmtMoney(Math.abs(delta))}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 hover:bg-muted rounded-full"
                      onClick={() => { setEditEntry(e); setDialogOpen(true); }}
                      title={t("edit")}
                    >
                      <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 hover:bg-destructive/10 rounded-full"
                      onClick={() => handleDelete(e)}
                      title={t("delete")}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <PaginationBar page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />

      <CashboxDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditEntry(null); }}
        initialKind={editEntry ? editEntry.kind : dialogKind}
        editEntry={editEntry}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t("delete")} — {t("cashbox")}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {deleteTarget && (
              <>
                <span className="font-semibold text-foreground">{fmtMoney(deleteTarget.amount)}</span>
                {" "}({kindLabel(t, deleteTarget.kind)})
                {deleteTarget.note && <> — {deleteTarget.note}</>}
                <br />
                <span className="text-xs">{fmtDateTime(deleteTarget.created_at)}</span>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            This will permanently remove this entry and adjust the cashbox balance. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteBusy}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteBusy}>
              {deleteBusy ? "…" : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CashboxDialog({
  open, onOpenChange, initialKind, editEntry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialKind: CashboxEntry["kind"];
  editEntry: CashboxEntry | null;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const isEdit = !!editEntry;
  const [kind, setKind] = useState<CashboxEntry["kind"]>(initialKind);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [dateVal, setDateVal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      if (editEntry) {
        setKind(editEntry.kind);
        setAmount(String(editEntry.amount));
        setNote(editEntry.note ?? "");
        const d = new Date(editEntry.created_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        setDateVal(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
      } else {
        setKind(initialKind);
        setAmount("");
        setNote("");
        setDateVal("");
      }
    }
  }, [open, initialKind, editEntry]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount) || 0;
    if (amt <= 0) return toast.error(t("amount") + " > 0");
    setBusy(true);
    try {
      if (isEdit && editEntry) {
        await updateCashboxFn({
          data: {
            id: editEntry.id,
            kind,
            amount: amt,
            note: note.trim() || null,
            created_at: dateVal ? new Date(dateVal).toISOString() : undefined,
          },
        });
        toast.success(lang === "bn" ? "এন্ট্রি আপডেট সফল হয়েছে" : "Entry updated");
      } else {
        await createCashboxFn({
          data: {
            kind,
            amount: amt,
            note: note.trim() || null,
            created_at: dateVal ? new Date(dateVal).toISOString() : undefined,
          },
        });
        toast.success(lang === "bn" ? "ক্যাশ এন্ট্রি সফল হয়েছে" : "Entry recorded");
      }
      onOpenChange(false);
      await refreshQueries(qc, ["cashbox"]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? (lang === "bn" ? "ক্যাশ এন্ট্রি এডিট" : "Edit Cashbox Entry")
              : (kind === "deposit" ? t("add_money") : t("take_money"))}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">{t("category")}</Label>
            <Tabs value={kind} onValueChange={(v) => setKind(v as any)} className="w-full mt-1">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="deposit">{t("add_money")}</TabsTrigger>
                <TabsTrigger value="withdraw">{t("take_money")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("amount")}</Label>
            <Input
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 font-mono"
              autoFocus
              required
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{lang === "bn" ? "তারিখ ও সময়" : "Date & Time"}</Label>
            <Input
              type="datetime-local"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">{t("note")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={lang === "bn" ? "কারণ / বিবরণ লিখুন..." : "Reason / details..."}
              rows={2}
              className="mt-1 text-xs"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
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
