"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Trash2, Download, ShoppingBag, DollarSign, Tag, Info, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getPurchases } from "@/lib/queries";
import type { Purchase } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { FAB } from "@/components/ui/fab";
import { PurchaseDialog } from "@/components/purchase-dialog";
import { deletePurchaseFn } from "@/lib/rpc";
import { toast } from "sonner";
import { setCachedData, refreshQueries } from "@/lib/optimistic-cache";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useIsMobile } from "@/hooks/use-mobile";

export default function PurchasesPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { data } = useCachedQuery(["purchases"], getPurchases);
  const [open, setOpen] = useState(false);
  const [filterDate, setFilterDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [purchaseToDelete, setPurchaseToDelete] = useState<Purchase | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const pageSize = isMobile ? 12 : 20;

  const filteredPurchases = useMemo(() => {
    let list = data ?? [];
    if (filterDate) {
      list = list.filter((p) => p.created_at.startsWith(filterDate));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.product_name || "").toLowerCase().includes(q));
    }
    return list;
  }, [data, filterDate, search]);

  const totalBuyExpense = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + (p.total || 0), 0);
  }, [filteredPurchases]);

  const totalBuyQty = useMemo(() => {
    return filteredPurchases.reduce((sum, p) => sum + (p.qty || 0), 0);
  }, [filteredPurchases]);

  const { items: pagedPurchases, totalPages, safePage } = paginate(filteredPurchases, page, pageSize);

  // ── CSV Export Function ────────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!filteredPurchases || filteredPurchases.length === 0) {
      toast.error(lang === "bn" ? "ডাউনলোড করার মতো কোনো তথ্য পাওয়া যায়নি" : "No purchase data available to export");
      return;
    }

    const headers = [
      "ID",
      lang === "bn" ? "তারিখ ও সময়" : "Date & Time",
      lang === "bn" ? "পণ্যের নাম" : "Product Name",
      lang === "bn" ? "পরিমাণ" : "Quantity",
      lang === "bn" ? "একক ক্রয় মূল্য" : "Unit Cost",
      lang === "bn" ? "মোট ক্রয় খরচ" : "Total Buy Expense",
      lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Mode",
    ];

    const rows = filteredPurchases.map((p) => [
      `"${p.id}"`,
      `"${fmtDateTime(p.created_at)}"`,
      `"${(p.product_name || "").replace(/"/g, '""')}"`,
      p.qty,
      p.unit_cost,
      p.total,
      `"${p.payment_type === "credit" ? (lang === "bn" ? "বকেয়া" : "Credit") : (lang === "bn" ? "ক্যাশ" : "Cash")}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = filterDate
      ? `product_buy_expenses_${filterDate}.csv`
      : `product_buy_expenses_all.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(
      lang === "bn"
        ? `মাল ক্রয় খরচের হিসাব ডাউনলোড হয়েছে (${filename})`
        : `Product buy expense report exported (${filename})`
    );
  };

  async function performDelete() {
    if (!purchaseToDelete) return;
    setIsDeleting(true);
    setCachedData<Purchase[]>(qc, ["purchases"], (old) =>
      (old ?? []).filter((p) => p.id !== purchaseToDelete.id)
    );
    try {
      await deletePurchaseFn({ data: { id: purchaseToDelete.id } });
      await refreshQueries(qc, ["purchases"], ["products"], ["expenses"], ["cashbox"]);
      toast.success(t("delete"));
      setPurchaseToDelete(null);
    } catch (err: unknown) {
      await refreshQueries(qc, ["purchases"], ["products"], ["expenses"], ["cashbox"]);
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeleting(false);
    }
  }

  function handleDelete(purchase: Purchase) {
    setPurchaseToDelete(purchase);
  }

  return (
    <div className="space-y-3.5 pb-20 sm:pb-6 font-sans">
      {/* Page Title & Add/Export Header Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-foreground truncate font-serif">
            <ShoppingBag className="size-5 sm:size-6 text-primary shrink-0" />
            <span>{lang === "bn" ? "মাল ক্রয়" : "Product Purchases"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
            {lang === "bn"
              ? "নতুন মাল ক্রয় ও ক্রয় খরচের হিসাব"
              : "Product buy expenses & purchase inventory records"}
          </p>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={() => setOpen(true)}
            size="sm"
            className="h-8 sm:h-9 px-3 gap-1.5 font-bold shadow-xs text-xs sm:text-sm beveled-button"
          >
            <Plus className="size-4 stroke-[2.5]" />
            <span>{lang === "bn" ? "নতুন ক্রয়" : "Add Purchase"}</span>
          </Button>

          <Button
            onClick={handleExportCSV}
            variant="outline"
            size="sm"
            className="h-8 sm:h-9 px-2.5 sm:px-3 gap-1.5 font-semibold text-xs border-border hover:bg-accent cursor-pointer"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">{lang === "bn" ? "ডাউনলোড" : "Export CSV"}</span>
          </Button>
        </div>
      </div>

      {/* ── Product Buy Expense Summary KPI Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <Card className="p-3 beveled-kpi border-teal-500/20 bg-gradient-to-br from-white via-teal-50/30 to-teal-500/5 dark:from-zinc-900 dark:via-teal-950/20 dark:to-teal-500/5 rounded-none shadow-xs space-y-1 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-muted-foreground text-[11px] sm:text-xs font-medium">
            <span>{lang === "bn" ? "মোট মাল ক্রয় খরচ" : "Total Buy Expense"}</span>
            <DollarSign className="size-3.5 sm:size-4 text-teal-600 dark:text-teal-400 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-bold text-foreground tracking-tight font-serif">
            {fmtMoney(totalBuyExpense)}
          </div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
            {filterDate ? `${filterDate} তারিখের হিসাব` : (lang === "bn" ? "সর্বমোট ক্রয় খরচ" : "Lifetime Total")}
          </div>
        </Card>

        <Card className="p-3 beveled-kpi border-indigo-500/20 bg-gradient-to-br from-white via-indigo-50/30 to-indigo-500/5 dark:from-zinc-900 dark:via-indigo-950/20 dark:to-indigo-500/5 rounded-none shadow-xs space-y-1 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-muted-foreground text-[11px] sm:text-xs font-medium">
            <span>{lang === "bn" ? "কেনা পণ্যের সংখ্যা" : "Total Purchased Qty"}</span>
            <Tag className="size-3.5 sm:size-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          </div>
          <div className="text-lg sm:text-2xl font-bold text-foreground font-serif">
            {totalBuyQty} {lang === "bn" ? "টি" : "items"}
          </div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground truncate">
            {filteredPurchases.length} {lang === "bn" ? "টি ক্রয় হিসাব" : "purchases"}
          </div>
        </Card>

        <Card className="hidden sm:block p-3 beveled-kpi border-amber-500/20 bg-gradient-to-br from-white via-amber-50/30 to-amber-500/5 dark:from-zinc-900 dark:via-amber-950/20 dark:to-amber-500/5 rounded-none shadow-xs space-y-1 col-span-2 sm:col-span-1 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white/80 dark:via-white/20 to-transparent pointer-events-none z-10" />
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Ledger"}</span>
            <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug">
            {lang === "bn"
              ? "নগদ ক্রয় ক্যাশবক্স হিসাব এবং বকেয়া ক্রয় সাপ্লায়ার হিসাব আপডেট করে।"
              : "Cash purchases update Cashbox; Credit purchases update Supplier Dues."}
          </div>
        </Card>
      </div>

      {/* Date Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-card p-2.5 rounded-2xl border border-border/80 shadow-xs">
        <div className="flex gap-2 items-center min-w-0 flex-1">
          <Label className="text-xs font-medium text-muted-foreground shrink-0">{lang === "bn" ? "তারিখ:" : "Date:"}</Label>
          <Input
            type="date"
            className="h-8 text-xs w-36 sm:w-44 rounded-xl bg-background"
            value={filterDate}
            onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
          />
          {filterDate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => { setFilterDate(""); setPage(1); }}
            >
              {lang === "bn" ? "সাফ করুন" : "Clear"}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={lang === "bn" ? "পণ্য খুঁজুন…" : "Search product…"}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="h-8 pl-8 text-xs rounded-xl"
            />
          </div>

          <Button
            onClick={handleExportCSV}
            variant="ghost"
            size="sm"
            className="h-8 text-xs font-semibold gap-1 text-primary hover:bg-primary/10 shrink-0 cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>{lang === "bn" ? "CSV" : "Export"}</span>
          </Button>
        </div>
      </div>

      {/* Purchases List */}
      {(!filteredPurchases || filteredPurchases.length === 0) && (
        <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl border-dashed">
          {lang === "bn" ? "কোনো ক্রয় হিসাব পাওয়া যায়নি" : "No purchase activity found"}
        </Card>
      )}

      {filteredPurchases.length > 0 && (
        <Card className="divide-y divide-border/60 overflow-hidden rounded-2xl shadow-xs border-border/80">
          {pagedPurchases.map((p) => (
            <div key={p.id} className="p-3 flex items-center justify-between gap-2.5 hover:bg-muted/30 transition">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="font-bold text-xs sm:text-sm truncate flex items-center gap-1.5 text-foreground">
                  <span className="truncate">{p.product_name}</span>
                  <span className="text-[11px] font-semibold bg-muted px-1.5 py-0.2 rounded-md text-muted-foreground shrink-0">
                    ×{p.qty}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>{fmtDateTime(p.created_at)}</span>
                  {p.unit_cost ? (
                    <span className="text-[11px] font-medium text-muted-foreground">
                      @{fmtMoney(p.unit_cost)}
                    </span>
                  ) : null}
                  {p.payment_type && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-tight ${
                        p.payment_type === "cash"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {p.payment_type === "credit" ? (lang === "bn" ? "বকেয়া" : "Credit") : (lang === "bn" ? "নগদ" : "Cash")}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-bold text-xs sm:text-sm text-foreground font-serif">{fmtMoney(p.total)}</div>
                <div className="text-[9px] sm:text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                  {lang === "bn" ? "ক্রয় খরচ" : "Buy Expense"}
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-lg cursor-pointer"
                onClick={() => handleDelete(p)}
                title={lang === "bn" ? "মুছে ফেলুন" : "Delete"}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </Card>
      )}

      {/* Pagination Bar */}
      {filteredPurchases.length > pageSize && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filteredPurchases.length}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      )}

      {/* Floating Action + Icon Button */}
      <FAB onClick={() => setOpen(true)} />

      <PurchaseDialog open={open} onOpenChange={setOpen} />

      <ConfirmDeleteDialog
        open={purchaseToDelete !== null}
        onOpenChange={(v) => {
          if (!v) setPurchaseToDelete(null);
        }}
        title={lang === "bn" ? "মাল ক্রয় হিসেব মুছুন" : "Delete Purchase Record"}
        description={
          lang === "bn"
            ? `আপনি কি নিশ্চিত যে "${purchaseToDelete?.product_name}" পণ্যটির ক্রয় হিসাব মুছে ফেলতে চান? এটি স্থায়ীভাবে মুছে যাবে।`
            : `Are you sure you want to delete purchase "${purchaseToDelete?.product_name}"? This action is permanent and cannot be undone.`
        }
        onConfirm={performDelete}
        busy={isDeleting}
      />
    </div>
  );
}


