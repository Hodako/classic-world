"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSales, type Sale } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { Calendar, RefreshCw, Trash2 } from "lucide-react";
import { deleteSaleFn } from "@/lib/rpc";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { toast } from "sonner";

type Range = "today" | "week" | "month" | "all";

export default function LossesPage() {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data = [], isLoading } = useCachedQuery(["sales"], getSales);

  const [range, setRange] = useState<Range>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function performDelete() {
    if (!saleToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSaleFn({ data: { id: saleToDelete } });
      toast.success(lang === "bn" ? "লেনদেন মুছে ফেলা হয়েছে" : "Record deleted successfully");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      setSaleToDelete(null);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsDeleting(false);
    }
  }

  const parseDate = (dateInput: any): Date => {
    if (!dateInput) return new Date(0);
    if (typeof dateInput?.toDate === "function") return dateInput.toDate();
    if (dateInput?.seconds !== undefined) return new Date(dateInput.seconds * 1000);
    const d = new Date(dateInput);
    return !isNaN(d.getTime()) ? d : new Date(0);
  };

  const calcLoss = (s: any) => {
    if (s.profit !== undefined && s.profit !== null && !isNaN(Number(s.profit))) {
      return Number(s.profit);
    }
    const sell = Number(s.sell_price) || 0;
    const buy = Number(s.buy_price) || 0;
    const qty = Number(s.qty) || 1;
    const discount = Number(s.discount) || 0;
    return (sell - buy) * qty - discount;
  };

  const lostSales = useMemo(() => {
    return data.filter(s => !s.returned && calcLoss(s) < 0);
  }, [data]);

  const filteredLostSales = useMemo(() => {
    let result = [...lostSales];

    if (range !== "all" && !from && !to) {
      const now = new Date();
      let limit = new Date(0);
      if (range === "today") {
        limit = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (range === "week") {
        limit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (range === "month") {
        limit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      result = result.filter(s => parseDate(s.created_at) >= limit);
    }

    if (from) {
      const fromLimit = new Date(from);
      result = result.filter(s => parseDate(s.created_at) >= fromLimit);
    }
    if (to) {
      const toLimit = new Date(to);
      toLimit.setHours(23, 59, 59, 999);
      result = result.filter(s => parseDate(s.created_at) <= toLimit);
    }

    return result.sort((a, b) => parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime());
  }, [lostSales, range, from, to]);

  const totalLoss = useMemo(() => {
    return filteredLostSales.reduce((a, s) => a + Math.abs(calcLoss(s)), 0);
  }, [filteredLostSales]);

  const { items: paged, totalPages, safePage } = paginate(filteredLostSales, page, pageSize);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["sales"] });
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight font-serif text-rose-600">
            {lang === "bn" ? "লোকসান খতিয়ান" : "Loss Analytics"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {lang === "bn"
              ? "ক্রয়মূল্যের চেয়ে কম দামে বিক্রির কারণে লোকসান হওয়া পণ্যসমূহের হিসাব খতিয়ান"
              : "Overview of sales transactions where products were sold below purchase price (incurring a loss)"}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs beveled-button self-end sm:self-auto" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className="size-3.5 mr-1" />
          {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
        </Button>
      </div>

      {/* Date Filters & Range Selectors */}
      <div className="bg-card/60 backdrop-blur-sm border rounded-xl p-3 space-y-3 beveled-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex bg-muted/60 rounded p-0.5 text-xs">
            <button onClick={() => { setRange("today"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "today" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "আজ" : "Today"}</button>
            <button onClick={() => { setRange("week"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "week" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "৭ দিন" : "7 Days"}</button>
            <button onClick={() => { setRange("month"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "month" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "৩০ দিন" : "30 Days"}</button>
            <button onClick={() => { setRange("all"); setFrom(""); setTo(""); setPage(1); }} className={`px-2.5 py-1 rounded transition-colors ${range === "all" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}>{lang === "bn" ? "সব সময়" : "All Time"}</button>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            <span>{lang === "bn" ? "কাস্টম রেঞ্জ:" : "Custom Range:"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-dashed">
          <div>
            <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "হতে" : "From Date"}</Label>
            <Input type="date" className="h-8 text-xs mt-0.5" value={from} onChange={e => { setFrom(e.target.value); setRange("all"); setPage(1); }} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "পর্যন্ত" : "To Date"}</Label>
            <Input type="date" className="h-8 text-xs mt-0.5" value={to} onChange={e => { setTo(e.target.value); setRange("all"); setPage(1); }} />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3.5 bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-950 beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-rose-700 dark:text-rose-300 uppercase tracking-wide font-medium">
            {lang === "bn" ? "মোট লোকসান" : "Total Loss"}
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-serif text-rose-600">{fmtMoney(totalLoss)}</div>
            <span className="text-[9px] text-rose-700/60 dark:text-rose-400/60 block">
              {lang === "bn" ? "ক্ষতির মোট হিসাব" : "Accumulated Losses"}
            </span>
          </div>
        </Card>
        <Card className="p-3.5 bg-card border-border beveled-card shadow-sm flex flex-col justify-between h-24">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
            {lang === "bn" ? "মোট লোকসান হওয়া লেনদেন" : "Loss Transactions"}
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-serif">{filteredLostSales.length}</div>
            <span className="text-[9px] text-muted-foreground block">
              {lang === "bn" ? "ক্ষতিগ্রস্ত বিক্রির সংখ্যা" : "Number of negative margin sales"}
            </span>
          </div>
        </Card>
      </div>

      {/* Losses List Table */}
      <Card className="overflow-hidden border-border beveled-card">
        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">
            <RefreshCw className="size-8 animate-spin mx-auto text-primary mb-2" />
            {lang === "bn" ? "লোড হচ্ছে..." : "Loading transaction logs..."}
          </div>
        ) : paged.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            {lang === "bn" ? "কোনো লোকসান হওয়া লেনদেনের রেকর্ড পাওয়া যায়নি।" : "No loss-incurring transactions recorded for this period."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="p-3">{lang === "bn" ? "পণ্যের নাম ও তারিখ" : "Product & Date"}</th>
                  <th className="p-3 text-right">{lang === "bn" ? "পরিমাণ" : "Qty"}</th>
                  <th className="p-3 text-right">{lang === "bn" ? "কেনা দাম" : "Buy Price"}</th>
                  <th className="p-3 text-right">{lang === "bn" ? "বিক্রি দাম" : "Sell Price"}</th>
                  <th className="p-3 text-right">{lang === "bn" ? "লোকসান" : "Loss"}</th>
                  <th className="p-3 text-right">{lang === "bn" ? "মুছুন" : "Delete"}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paged.map(s => {
                  const itemLoss = Math.abs(Number(s.profit));
                  return (
                    <tr key={s.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-3">
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">{s.product_name}</div>
                        <div className="text-[10px] text-muted-foreground">{fmtDateTime(s.created_at)}</div>
                      </td>
                      <td className="p-3 text-right font-mono font-medium">{s.qty}</td>
                      <td className="p-3 text-right font-mono">{fmtMoney(s.buy_price)}</td>
                      <td className="p-3 text-right font-mono">{fmtMoney(s.sell_price)}</td>
                      <td className="p-3 text-right font-mono text-rose-600 font-bold">-{fmtMoney(itemLoss)}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 rounded-full"
                          onClick={() => setSaleToDelete(s.id)}
                          title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PaginationBar page={safePage} totalPages={totalPages} total={filteredLostSales.length} pageSize={pageSize} onPageChange={setPage} />

      <ConfirmDeleteDialog
        open={saleToDelete !== null}
        onOpenChange={(v) => { if (!v) setSaleToDelete(null); }}
        title={lang === "bn" ? "লেনদেন মুছে ফেলুন" : "Delete Loss Record"}
        description={lang === "bn" ? "এই লোকসান রেকর্ডটি স্থায়ীভাবে মুছে ফেলা হবে। এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।" : "This loss record will be permanently deleted. This action cannot be undone."}
        onConfirm={performDelete}
        busy={isDeleting}
      />
    </div>
  );
}
