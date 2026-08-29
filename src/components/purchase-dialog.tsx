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
import { createPurchaseFn, createProductFn } from "@/lib/rpc";
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
  // Quick Add New Product State
  const [quickProductOpen, setQuickProductOpen] = useState(false);
  const [quickTargetLineIdx, setQuickTargetLineIdx] = useState<number>(0);
  const [quickName, setQuickName] = useState("");
  const [quickCategory, setQuickCategory] = useState("General");
  const [quickBuyPrice, setQuickBuyPrice] = useState("");
  const [quickSellPrice, setQuickSellPrice] = useState("");
  const [quickMinStock, setQuickMinStock] = useState("5");
  const [quickBusy, setQuickBusy] = useState(false);

  const handleQuickCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) {
      toast.error(lang === "bn" ? "পণ্যের নাম দিন" : "Please enter product name");
      return;
    }
    setQuickBusy(true);
    try {
      const res = await createProductFn({
        data: {
          name: quickName.trim(),
          category: quickCategory.trim() || "General",
          buy_price: Number(quickBuyPrice) || 0,
          sell_price: Number(quickSellPrice) || 0,
          stock: 0,
          min_stock: Number(quickMinStock) || 5,
        },
      });
      toast.success(lang === "bn" ? `"${quickName}" সফলভাবে তৈরি হয়েছে!` : `Product "${quickName}" created!`);
      await qc.invalidateQueries({ queryKey: ["products"] });
      
      const newProdId = res?.id || res?._id || (typeof res === "string" ? res : "");
      if (newProdId) {
        updateLine(quickTargetLineIdx, {
          productId: newProdId,
          unitCost: quickBuyPrice,
          sellPrice: quickSellPrice,
        });
      }
      setQuickName("");
      setQuickBuyPrice("");
      setQuickSellPrice("");
      setQuickProductOpen(false);
    } catch (err: any) {
      toast.error(err?.message || String(err));
    } finally {
      setQuickBusy(false);
    }
  };


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
    <>
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
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-semibold text-muted-foreground">{lang === "bn" ? "পণ্য নির্বাচন করুন" : "Select Product"}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuickTargetLineIdx(i);
                      setQuickProductOpen(true);
                    }}
                    className="h-6 px-2 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-lg gap-1 cursor-pointer"
                  >
                    <Plus className="size-3" />
                    <span>{lang === "bn" ? "+ নতুন পণ্য" : "+ New Product"}</span>
                  </Button>
                </div>
                <ProductSearchSelect products={products} value={line.productId} onChange={v => updateLine(i, { productId: v })} />
              </div>
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

      {/* Quick Add Product Modal */}
      <Dialog open={quickProductOpen} onOpenChange={setQuickProductOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-5 bg-card border-border/80 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-primary/10 text-primary">
                <Plus className="size-4" />
              </div>
              <span>{lang === "bn" ? "নতুন পণ্য যোগ করুন" : "Add New Product"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleQuickCreateProduct} className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "পণ্যের নাম" : "Product Name"} *</Label>
              <Input
                required
                className="h-8.5 text-xs rounded-xl"
                placeholder={lang === "bn" ? "যেমন: পাঞ্জাবি / শার্ট" : "e.g. Slim Fit Shirt"}
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ক্যাটাগরি" : "Category"}</Label>
              <Input
                className="h-8.5 text-xs rounded-xl"
                placeholder={lang === "bn" ? "যেমন: Men, Women" : "e.g. General, Apparel"}
                value={quickCategory}
                onChange={e => setQuickCategory(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "কেনা দাম (৳)" : "Buy Price (৳)"}</Label>
                <Input
                  type="number"
                  step="any"
                  className="h-8.5 text-xs rounded-xl font-mono"
                  placeholder="0"
                  value={quickBuyPrice}
                  onChange={e => setQuickBuyPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "বিক্রয় দাম (৳)" : "Sell Price (৳)"}</Label>
                <Input
                  type="number"
                  step="any"
                  className="h-8.5 text-xs rounded-xl font-mono"
                  placeholder="0"
                  value={quickSellPrice}
                  onChange={e => setQuickSellPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "সংকট স্টক সতর্কতা" : "Low Stock Alert"}</Label>
              <Input
                type="number"
                className="h-8.5 text-xs rounded-xl font-mono"
                value={quickMinStock}
                onChange={e => setQuickMinStock(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickProductOpen(false)}
                className="rounded-xl text-xs h-8.5 cursor-pointer"
              >
                {lang === "bn" ? "বাতিল" : "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={quickBusy || !quickName.trim()}
                className="rounded-xl text-xs h-8.5 font-semibold bg-primary text-primary-foreground cursor-pointer"
              >
                {quickBusy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "পণ্য সংরক্ষণ করুন" : "Save Product")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
