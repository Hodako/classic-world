"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductSearchSelect } from "@/components/product-search";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getProducts, getParties } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { createPurchaseFn } from "@/lib/rpc";
import { Plus, Trash2 } from "lucide-react";

type PurchaseLine = { productId: string; qty: string; unitCost: string; sellPrice: string };

export function PurchaseDialog({
  open,
  onOpenChange,
  presetPartyId,
  presetProductId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetPartyId?: string;
  presetProductId?: string;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: parties = [] } = useCachedQuery(["parties"], getParties);

  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [partyId, setPartyId] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (presetPartyId) {
      setPartyId(presetPartyId);
    }
  }, [presetPartyId]);

  useEffect(() => {
    if (open) {
      const p = presetProductId ? products.find(x => x.id === presetProductId) : null;
      setLines([
        {
          productId: presetProductId ?? "",
          qty: "1",
          unitCost: p ? String(p.buy_price || "") : "",
          sellPrice: p ? String(p.sell_price || "") : "",
        },
      ]);
      setPartyId(presetPartyId ?? "");
      setPaymentType("cash");
    }
  }, [open, presetPartyId, presetProductId, products]);

  function updateLine(i: number, patch: Partial<PurchaseLine>) {
    setLines(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const next = { ...l, ...patch };
      if (patch.productId) {
        const p = products.find(x => x.id === patch.productId);
        if (p) {
          next.unitCost = String(p.buy_price || "");
          next.sellPrice = p.sell_price > 0 ? String(p.sell_price) : "";
        }
      }
      return next;
    }));
  }

  const grandTotal = lines.reduce((sum, l) => {
    const p = products.find(x => x.id === l.productId);
    if (!p) return sum;
    return sum + (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
  }, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const valid = lines.filter(l => l.productId && Number(l.qty) > 0);
    if (valid.length === 0) return toast.error(t("select_product"));
    if (paymentType === "credit" && !partyId) {
      return toast.error(lang === "bn" ? "ক্রেডিট ক্রয়ের জন্য সাপ্লায়ার নির্বাচন করা বাধ্যতামূলক" : "Supplier is required for credit purchases");
    }
    setBusy(true);
    try {
      for (const line of valid) {
        const p = products.find(x => x.id === line.productId)!;
        const qty = Number(line.qty) || 0;
        const unit_cost = Number(line.unitCost) || 0;
        const sell_price = Number(line.sellPrice) || 0;
        await createPurchaseFn({
          data: {
            product_id: p.id,
            product_name: p.name,
            qty,
            unit_cost,
            sell_price: sell_price > 0 ? sell_price : undefined,
            total: qty * unit_cost,
            party_id: partyId || null,
            payment_type: paymentType,
          },
        });
      }
      toast.success(t("save"));
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["party-detail"] });
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("new_purchase")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {lines.map((line, i) => (
            <div key={`p-line-${i}`} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="size-6" onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="size-3" />
                  </Button>
                )}
              </div>
              <ProductSearchSelect products={products} value={line.productId} onChange={v => updateLine(i, { productId: v })} />
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t("qty")}</Label>
                  <Input type="number" className="h-8 text-xs" inputMode="numeric" pattern="[0-9]*" placeholder={t("qty")} value={line.qty} onChange={e => updateLine(i, { qty: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t("buy_price")}</Label>
                  <Input type="number" step="any" className="h-8 text-xs" inputMode="decimal" pattern="[0-9.]*" placeholder={t("buy_price")} value={line.unitCost} onChange={e => updateLine(i, { unitCost: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t("sell_price")}</Label>
                  <Input type="number" step="any" className="h-8 text-xs" inputMode="decimal" pattern="[0-9.]*" placeholder={t("sell_price")} value={line.sellPrice} onChange={e => updateLine(i, { sellPrice: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setLines(prev => [...prev, { productId: "", qty: "1", unitCost: "", sellPrice: "" }])}>
            <Plus className="size-3.5 mr-1" />{t("add_product")}
          </Button>

          {/* Supplier & Payment Type Selection */}
          <div className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "সাপ্লায়ার / পার্টি" : t("party")}</Label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-sans"
              >
                <option value="">{lang === "bn" ? "— সাপ্লায়ার বা পার্টি নির্বাচন করুন —" : "— Select Supplier —"}</option>
                {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Type"}</Label>
              <select
                value={paymentType}
                onChange={e => setPaymentType(e.target.value as any)}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs font-sans"
              >
                <option value="cash">{lang === "bn" ? "ক্যাশ" : "Cash"}</option>
                <option value="credit">{lang === "bn" ? "বকেয়া" : "Credit"}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm border-t border-border pt-3">
            <span className="text-muted-foreground font-medium">{t("total")}</span>
            <span className="font-bold text-foreground">{fmtMoney(grandTotal)}</span>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
            <Button type="submit" size="sm" className="h-9 px-4 text-xs font-bold shadow-md" disabled={busy}>{busy ? "…" : (lang === "bn" ? "সংরক্ষণ করুন" : t("save"))}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
