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
import { Plus, Trash2, Banknote, CreditCard, Globe, Split } from "lucide-react";

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
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "online" | "split">("cash");
  const [splitCash, setSplitCash] = useState("");
  const [splitOnline, setSplitOnline] = useState("");
  const [splitCredit, setSplitCredit] = useState("");
  const [onlineProvider, setOnlineProvider] = useState("bKash");
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
    if ((paymentType === "credit" || (paymentType === "split" && (Number(splitCredit) || 0) > 0)) && !partyId) {
      return toast.error(lang === "bn" ? "বাকি / ক্রেডিট ক্রয়ের জন্য সাপ্লায়ার নির্বাচন করা বাধ্যতামূলক" : "Supplier is required for credit purchases");
    }
    setBusy(true);
    try {
      await Promise.all(
        valid.map(line => {
          const p = products.find(x => x.id === line.productId)!;
          const qty = Number(line.qty) || 0;
          const unit_cost = Number(line.unitCost) || 0;
          const sell_price = Number(line.sellPrice) || 0;
          return createPurchaseFn({
            data: {
              product_id: p.id,
              product_name: p.name,
              qty,
              unit_cost,
              sell_price: sell_price > 0 ? sell_price : undefined,
              total: qty * unit_cost,
              party_id: partyId || null,
              payment_type: paymentType,
              split_cash: paymentType === "split" ? (Number(splitCash) || 0) : undefined,
              split_online: paymentType === "split" ? (Number(splitOnline) || 0) : undefined,
              split_credit: paymentType === "split" ? (Number(splitCredit) || 0) : undefined,
              online_provider: paymentType !== "cash" ? onlineProvider : undefined,
            },
          });
        })
      )
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

          {/* Supplier & Payment Type Selection in ONE ROW */}
          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground">{lang === "bn" ? "সাপ্লায়ার / পার্টি নির্বাচন" : t("party")}</Label>
              <select
                value={partyId}
                onChange={e => setPartyId(e.target.value)}
                className="w-full h-8.5 rounded-xl border border-border bg-background px-2.5 text-xs font-sans font-medium"
              >
                <option value="">{lang === "bn" ? "— সাপ্লায়ার বা পার্টি নির্বাচন করুন —" : "— Select Supplier —"}</option>
                {parties.filter(p => (p as any).type !== "customer" && !(p as any).is_customer).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Payment Method Selector in ONE ROW like the new sell widget */}
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs font-semibold text-muted-foreground">
                {lang === "bn" ? "পেমেন্ট মাধ্যম (Payment Method)" : "Payment Method"}
              </Label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setPaymentType("cash")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    paymentType === "cash"
                      ? "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500/30 font-bold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Banknote className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{lang === "bn" ? "নগদ" : "Cash"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("credit")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    paymentType === "credit"
                      ? "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs ring-1 ring-amber-500/30 font-bold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <CreditCard className="size-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{lang === "bn" ? "বাকি" : "Credit"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentType("online")}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    paymentType === "online"
                      ? "bg-blue-500/15 border-blue-500 text-blue-700 dark:text-blue-300 shadow-xs ring-1 ring-blue-500/30 font-bold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Globe className="size-3.5 text-blue-600 dark:text-blue-400" />
                  <span>{lang === "bn" ? "অনলাইন" : "Online"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("split");
                    setSplitCash(String(grandTotal));
                    setSplitOnline("0");
                    setSplitCredit("0");
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    paymentType === "split"
                      ? "bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs ring-1 ring-purple-500/30 font-bold"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Split className="size-3.5 text-purple-600 dark:text-purple-400" />
                  <span>{lang === "bn" ? "স্প্লিট" : "Split"}</span>
                </button>
              </div>
            </div>
          </div>

          {paymentType === "online" && (
            <div className="space-y-1 p-2.5 rounded-lg border border-primary/20 bg-primary/5">
              <Label className="text-[11px] font-semibold text-primary">{lang === "bn" ? "অনলাইন মাধ্যম" : "Online Method"}</Label>
              <select
                value={onlineProvider}
                onChange={e => setOnlineProvider(e.target.value)}
                className="w-full h-8 rounded border border-border bg-background px-2 text-xs"
              >
                <option value="bKash">bKash (বিকাশ)</option>
                <option value="Nagad">Nagad (নগদ)</option>
                <option value="Rocket">Rocket (রকেট)</option>
                <option value="Bank">Bank Transfer (ব্যাংক)</option>
                <option value="Upay">Upay (উপায়)</option>
              </select>
            </div>
          )}

          {paymentType === "split" && (
            <div className="space-y-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-primary">{lang === "bn" ? "⚡ স্প্লিট পেমেন্ট ব্রেকডাউন" : "⚡ Split Breakdown"}</span>
                <span className="text-[10px] text-muted-foreground">{lang === "bn" ? "মোট খরচ:" : "Total:"} {fmtMoney(grandTotal)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "💵 নগদ টাকা" : "Cash"}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8 text-xs font-mono"
                    placeholder="0"
                    value={splitCash}
                    onChange={e => {
                      const v = e.target.value;
                      setSplitCash(v);
                      const c = Number(v) || 0;
                      const o = Number(splitOnline) || 0;
                      setSplitCredit(String(Math.max(0, grandTotal - c - o)));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "🌐 অনলাইন / ব্যাংক" : "Online"}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8 text-xs font-mono"
                    placeholder="0"
                    value={splitOnline}
                    onChange={e => {
                      const v = e.target.value;
                      setSplitOnline(v);
                      const o = Number(v) || 0;
                      const c = Number(splitCash) || 0;
                      setSplitCredit(String(Math.max(0, grandTotal - c - o)));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "📋 বাকি / ক্রেডিট" : "Credit Due"}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="h-8 text-xs font-mono font-bold text-amber-500"
                    placeholder="0"
                    value={splitCredit}
                    onChange={e => setSplitCredit(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1 pt-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "অনলাইন পেমেন্ট মাধ্যম" : "Online Provider"}</Label>
                <select
                  value={onlineProvider}
                  onChange={e => setOnlineProvider(e.target.value)}
                  className="w-full h-7.5 rounded border border-border bg-background px-2 text-xs"
                >
                  <option value="bKash">bKash (বিকাশ)</option>
                  <option value="Nagad">Nagad (নগদ)</option>
                  <option value="Rocket">Rocket (রকেট)</option>
                  <option value="Bank">Bank Transfer (ব্যাংক)</option>
                  <option value="Upay">Upay (উপায়)</option>
                </select>
              </div>
            </div>
          )}

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
