"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getSales, type Sale } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { PaginationBar, paginate } from "@/components/ui/pagination-bar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { FAB } from "@/components/ui/fab";
import { SaleDialog } from "@/components/sale-dialog";
import { EditSaleDialog } from "@/components/edit-sale-dialog";
import { RotateCcw, Search, Trash2, Pencil, ChevronDown, ChevronUp, Printer, FileDown } from "lucide-react";
import { toast } from "sonner";
import { createReturnFn, deleteSaleFn } from "@/lib/rpc";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { printPwaInvoice, downloadPwaInvoicePdf } from "@/lib/invoice-printer";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { getBusinessSettingsFn } from "@/lib/rpc-admin";

interface GroupedSale {
  id: string;
  isGroup: boolean;
  cart_id?: string | null;
  product_name: string;
  qty: number;
  sell_price: number;
  profit: number;
  due_amount: number;
  paid_amount: number;
  type: "cash" | "bkash" | "credit" | "online";
  created_at: string;
  parties?: { name: string } | null;
  items: Sale[];
}

function groupSales(sales: Sale[]): GroupedSale[] {
  const grouped: GroupedSale[] = [];
  const cartGroups: Record<string, Sale[]> = {};

  sales.forEach(s => {
    if (s.cart_id) {
      if (!cartGroups[s.cart_id]) {
        cartGroups[s.cart_id] = [];
      }
      cartGroups[s.cart_id].push(s);
    } else {
      grouped.push({
        id: s.id,
        isGroup: false,
        cart_id: null,
        product_name: s.product_name,
        qty: s.qty,
        sell_price: Number(s.sell_price) * s.qty,
        profit: s.profit,
        due_amount: s.due_amount,
        paid_amount: s.paid_amount,
        type: s.type,
        created_at: s.created_at,
        parties: s.parties,
        items: [s]
      });
    }
  });

  Object.entries(cartGroups).forEach(([cartId, items]) => {
    items.sort((a, b) => a.product_name.localeCompare(b.product_name));
    
    const firstItem = items[0];
    const totalQty = items.reduce((sum, x) => sum + x.qty, 0);
    const totalSellPrice = items.reduce((sum, x) => sum + Number(x.sell_price) * x.qty, 0);
    const totalProfit = items.reduce((sum, x) => sum + x.profit, 0);
    const totalDue = items.reduce((sum, x) => sum + x.due_amount, 0);
    const totalPaid = items.reduce((sum, x) => sum + x.paid_amount, 0);
    
    const names = items.map(x => `${x.product_name} (×${x.qty})`).join(", ");

    grouped.push({
      id: firstItem.id,
      isGroup: true,
      cart_id: cartId,
      product_name: names,
      qty: totalQty,
      sell_price: totalSellPrice,
      profit: totalProfit,
      due_amount: totalDue,
      paid_amount: totalPaid,
      type: firstItem.type,
      created_at: firstItem.created_at,
      parties: firstItem.parties,
      items: items
    });
  });

  grouped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return grouped;
}

export default function SalesPage() {
  const { lang, t } = useT();
  const isMobile = useIsMobile();
  const { data } = useCachedQuery(["sales"], getSales);
  const [open, setOpen] = useState(false);
  const [editSale, setEditSale] = useState<Sale | null>(null);
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = isMobile ? 12 : 20;

  const allSalesGrouped = useMemo(() => {
    return groupSales(data ?? []);
  }, [data]);

  const q = search.trim().toLowerCase();
  const filter = (items: GroupedSale[]) =>
    items.filter(s =>
      !q ||
      s.product_name.toLowerCase().includes(q) ||
      (s.parties?.name ?? "").toLowerCase().includes(q),
    );

  const cash = filter(allSalesGrouped.filter(s => s.type === "cash"));
  const bkash = filter(allSalesGrouped.filter(s => s.type === "bkash"));
  const credit = filter(allSalesGrouped.filter(s => s.type === "credit"));
  const online = filter(allSalesGrouped.filter(s => s.type === "online"));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold font-serif">{t("sales")}</h1>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => setSearchOpen(v => !v)}
          aria-label={t("search")}
        >
          <Search className="icon-sm" />
        </Button>
      </div>

      {(searchOpen || search) && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground z-10 pointer-events-none" />
          <Input
            style={{ paddingLeft: "2.5rem" }}
            className="pl-10 h-9 text-sm"
            placeholder={t("search_sales")}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            autoFocus={searchOpen}
          />
        </div>
      )}

      <Tabs defaultValue="cash" onValueChange={() => setPage(1)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="cash">{t("cash_sale")}</TabsTrigger>
          <TabsTrigger value="bkash">{lang === "bn" ? "বিকাশ" : "bKash"}</TabsTrigger>
          <TabsTrigger value="credit">{t("credit_sale")}</TabsTrigger>
          <TabsTrigger value="online">{t("online_sell")}</TabsTrigger>
        </TabsList>
        <TabsContent value="cash" className="pt-3 space-y-2">
          <SalesTab items={cash} page={page} pageSize={pageSize} onPageChange={setPage} onEdit={setEditSale} />
        </TabsContent>
        <TabsContent value="bkash" className="pt-3 space-y-2">
          <SalesTab items={bkash} page={page} pageSize={pageSize} onPageChange={setPage} onEdit={setEditSale} />
        </TabsContent>
        <TabsContent value="credit" className="pt-3 space-y-2">
          <SalesTab items={credit} page={page} pageSize={pageSize} onPageChange={setPage} credit onEdit={setEditSale} />
        </TabsContent>
        <TabsContent value="online" className="pt-3 space-y-2">
          <SalesTab items={online} page={page} pageSize={pageSize} onPageChange={setPage} onEdit={setEditSale} />
        </TabsContent>
      </Tabs>

      <FAB onClick={() => setOpen(true)} />
      <SaleDialog open={open} onOpenChange={setOpen} />
      {editSale && (
        <EditSaleDialog sale={editSale} open={!!editSale} onOpenChange={v => { if (!v) setEditSale(null); }} />
      )}
      {returnSale && (
        <ReturnDialog sale={returnSale} open={!!returnSale} onOpenChange={v => { if (!v) setReturnSale(null); }} />
      )}
    </div>
  );
}

function SalesTab({
  items, page, pageSize, onPageChange, credit, onEdit,
}: {
  items: GroupedSale[];
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  credit?: boolean;
  onEdit: (sale: Sale) => void;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { items: paged, totalPages, safePage } = paginate(items, page, pageSize);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [saleToDelete, setSaleToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function performDelete() {
    if (!saleToDelete) return;
    setIsDeleting(true);
    try {
      const res = await deleteSaleFn({ data: { id: saleToDelete } });
      if (res && !res.success && 'error' in res) {
        throw new Error(res.error as string);
      }
      toast.success(t("delete") || "Deleted successfully");
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

  function handleDeleteClick(id: string) {
    setSaleToDelete(id);
  }

  const { user } = useAuth();
  const { data: bizData } = useQuery({ queryKey: ["business-settings"], queryFn: getBusinessSettingsFn });
  const biz = bizData?.business;

  async function handlePrintSale(s: GroupedSale) {
    const custName = s.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer");
    const invNo = s.cart_id ? `INV-${s.cart_id.slice(-6).toUpperCase()}` : `INV-${s.id.slice(-6).toUpperCase()}`;
    const discTotal = s.items.reduce((acc, x) => acc + (Number(x.discount) || 0) * (Number(x.qty) || 1), 0);
    const sub = s.sell_price + discTotal;

    try {
      await downloadPwaInvoicePdf({
        businessName: user?.business_name || biz?.name || "Classic World POS",
        userEmail: biz?.emails || user?.business_emails || user?.email || "",
        shopAddress: biz?.address || user?.business_address || "",
        shopPhoneNumbers: biz?.phone_numbers || user?.business_phone_numbers || "",
        pageSize: biz?.invoice_page_size || user?.invoice_page_size || "80mm",
        pageWidth: biz?.invoice_page_width || user?.invoice_page_width || "",
        pageHeight: biz?.invoice_page_height || user?.invoice_page_height || "",
        invoiceFontSize: biz?.invoice_font_size || user?.invoice_font_size || "22px",
        invoiceScale: biz?.invoice_scale || user?.invoice_scale || "100%",
        invoiceLineSpacing: biz?.invoice_line_spacing || user?.invoice_line_spacing || "6px",
        terms: biz?.invoice_terms || "",
        invoiceNo: invNo,
        invoiceDate: fmtDateTime(s.created_at),
        customerName: custName,
        items: s.items.map(item => ({
          product: { id: item.product_id || undefined, name: item.product_name },
          qty: Number(item.qty) || 1,
          sellPrice: Number(item.sell_price) || 0,
        })),
        subtotal: sub,
        discountAmount: discTotal,
        total: s.sell_price,
        paidAmount: s.paid_amount,
        due: s.due_amount,
      }, true);
      toast.success(lang === "bn" ? "ইনভয়েস পিডিএফ ভিউ প্রস্তুত হচ্ছে!" : "Opening invoice PDF!");
    } catch (err: any) {
      toast.error(lang === "bn" ? "পিডিএফ ভিউ সমস্যা: " + (err?.message || "") : "Failed to open PDF: " + (err?.message || ""));
    }
  }

  async function handleDownloadSalePdf(s: GroupedSale) {
    const custName = s.parties?.name || (lang === "bn" ? "সাধারণ কাস্টমার" : "Walk-in Customer");
    const invNo = s.cart_id ? `INV-${s.cart_id.slice(-6).toUpperCase()}` : `INV-${s.id.slice(-6).toUpperCase()}`;
    const discTotal = s.items.reduce((acc, x) => acc + (Number(x.discount) || 0) * (Number(x.qty) || 1), 0);
    const sub = s.sell_price + discTotal;

    try {
      await downloadPwaInvoicePdf({
        businessName: user?.business_name || biz?.name || "Classic World POS",
        userEmail: biz?.emails || user?.business_emails || user?.email || "",
        shopAddress: biz?.address || user?.business_address || "",
        shopPhoneNumbers: biz?.phone_numbers || user?.business_phone_numbers || "",
        pageSize: biz?.invoice_page_size || user?.invoice_page_size || "80mm",
        terms: biz?.invoice_terms || "",
        invoiceNo: invNo,
        invoiceDate: fmtDateTime(s.created_at),
        customerName: custName,
        items: s.items.map(item => ({
          product: { id: item.product_id || undefined, name: item.product_name },
          qty: Number(item.qty) || 1,
          sellPrice: Number(item.sell_price) || 0,
        })),
        subtotal: sub,
        discountAmount: discTotal,
        total: s.sell_price,
        paidAmount: s.paid_amount,
        due: s.due_amount,
      });
      toast.success(lang === "bn" ? "ইনভয়েস PDF সফলভাবে ডাউনলোড হয়েছে!" : "Invoice PDF downloaded successfully!");
    } catch (err: any) {
      toast.error(lang === "bn" ? "PDF ডাউনলোড সমস্যা: " + (err?.message || "") : "Failed to download PDF: " + (err?.message || ""));
    }
  }

  if (items.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">{t("no_sales")}</Card>;
  }

  return (
    <>
      <Card className="divide-y divide-border overflow-hidden">
        {paged.map(s => {
          const isExpanded = !!expandedGroups[s.id];
          return (
            <div
              key={s.id}
              className="p-3 flex flex-col gap-2 hover:bg-muted/5 transition-colors cursor-pointer select-none"
              onDoubleClick={() => handlePrintSale(s)}
              title={lang === "bn" ? "ডাবল ট্যাপ বা ক্লিক করে ইনভয়েস জেনারেট করুন" : "Double-tap to generate invoice"}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-sm flex items-center gap-1.5 flex-wrap">
                    {s.isGroup && (
                      <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {lang === "bn" ? "কার্ট" : "Cart"}
                      </span>
                    )}
                    <span className="text-foreground font-semibold">
                      {s.product_name}
                    </span>
                    {s.items.some(x => x.returned) && <span className="text-xs text-destructive">({t("returned")})</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {s.parties?.name && s.items?.[0]?.party_id ? (
                      <>
                        <Link
                          href={`/customers/detail?id=${s.items[0].party_id}`}
                          className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          {s.parties.name}
                        </Link>
                        {" · "}
                      </>
                    ) : null}
                    {fmtDateTime(s.created_at)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm text-foreground">{fmtMoney(s.sell_price)}</div>
                  {credit
                    ? <div className="text-xs text-warning font-semibold">{t("due")}: {fmtMoney(s.due_amount)}</div>
                    : <div className="text-xs text-success font-semibold">+{fmtMoney(s.profit)}</div>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 cursor-pointer text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                    onClick={() => handleDownloadSalePdf(s)}
                    title={lang === "bn" ? "ইনভয়েস PDF ডাউনলোড করুন" : "Download PDF Invoice"}
                  >
                    <FileDown className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 cursor-pointer text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                    onClick={() => handlePrintSale(s)}
                    title={lang === "bn" ? "ইনভয়েস প্রিন্ট করুন" : "Print Invoice"}
                  >
                    <Printer className="size-3.5" />
                  </Button>
                  {s.isGroup && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 cursor-pointer"
                      onClick={() => toggleGroup(s.id)}
                      title="Toggle Cart Details"
                    >
                      {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 cursor-pointer"
                    onClick={() => onEdit(s.items[0])}
                    title="Edit Sale"
                  >
                    <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-destructive cursor-pointer hover:bg-destructive/10 rounded-full"
                    onClick={() => handleDeleteClick(s.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {s.isGroup && isExpanded && (
                <div className="pl-3 py-2 border-l-2 border-emerald-500/30 space-y-1 bg-emerald-500/5 rounded-r-lg text-xs animate-in slide-in-from-top-1 duration-150">
                  <div className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 tracking-wider">
                    {lang === "bn" ? "কার্টের পণ্যসমূহ:" : "Cart Items:"}
                  </div>
                  {s.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center pr-2 font-mono text-[11px] text-muted-foreground py-0.5 border-b border-border/10 last:border-b-0">
                      <span>{item.product_name} <span className="font-semibold text-foreground/90">×{item.qty}</span></span>
                      <span>{fmtMoney(Number(item.sell_price) * item.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
      <PaginationBar page={safePage} totalPages={totalPages} total={items.length} pageSize={pageSize} onPageChange={onPageChange} />

      <ConfirmDeleteDialog
        open={saleToDelete !== null}
        onOpenChange={(v) => { if (!v) setSaleToDelete(null); }}
        title={lang === "bn" ? "বিক্রি হিসেব মুছুন" : "Delete Sale"}
        description={
          lang === "bn"
            ? "আপনি কি নিশ্চিত যে এই বিক্রয় রেকর্ডটি মুছে ফেলতে চান? এটি স্থায়ীভাবে মুছে যাবে।"
            : "Are you sure you want to delete this sale? This action is permanent and cannot be undone."
        }
        onConfirm={performDelete}
        busy={isDeleting}
      />
    </>
  );
}

function ReturnDialog({
  sale, open, onOpenChange,
}: {
  sale: Sale;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [qty, setQty] = useState(String(sale.qty));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createReturnFn({ data: { sale_id: sale.id, qty: Number(qty) || 0, note: note || null } });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      toast.success(t("return_product"));
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("return_product")} — {sale.product_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("qty")} (max {sale.qty})</Label>
            <Input inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} max={sale.qty} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("note")}</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" disabled={busy}>{busy ? "…" : t("return_product")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
