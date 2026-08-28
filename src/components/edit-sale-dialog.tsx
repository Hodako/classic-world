"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductSearchSelect } from "@/components/product-search";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { getCustomers, getProducts, type Sale } from "@/lib/queries";
import { editSaleFn } from "@/lib/rpc";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function EditSaleDialog({
  sale, open, onOpenChange,
}: {
  sale: Sale;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();
  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: customers = [] } = useCachedQuery(["customers"], getCustomers);

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [type, setType] = useState<"cash" | "bkash" | "credit" | "online">("cash");
  const [partyId, setPartyId] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && sale) {
      setProductId(sale.product_id || "");
      setQty(String(sale.qty));
      setSellPrice(String(sale.sell_price));
      setType(sale.type || "cash");
      setPartyId(sale.party_id || "");
      setPaid(String(sale.paid_amount));
      setNote(sale.note || "");
    }
  }, [open, sale]);

  const qtyNum = Number(qty) || 0;
  const sellPriceNum = Number(sellPrice) || 0;
  const lineSell = sellPriceNum * qtyNum;
  
  const selectedProduct = products.find(p => p.id === productId);
  const buyPrice = selectedProduct ? selectedProduct.buy_price : (sale?.buy_price || 0);
  const profit = (sellPriceNum - buyPrice) * qtyNum;

  const paidNum = (type === "cash" || type === "bkash" || type === "online") ? lineSell : Number(paid) || 0;
  const due = Math.max(lineSell - paidNum, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return toast.error(t("select_product"));
    if (qtyNum <= 0) return toast.error("Quantity must be greater than 0");
    if (sellPriceNum <= 0) return toast.error("Sell price must be greater than 0");
    if (type === "credit" && !partyId) return toast.error(lang === "bn" ? "ক্রেতা নির্বাচন করা আবশ্যক" : "Customer is required for credit sale");

    setBusy(true);
    try {
      const product = products.find(p => p.id === productId) || selectedProduct;
      if (!product) throw new Error("Product details not found");

      await editSaleFn({
        data: {
          id: sale!.id,
          product_id: productId,
          product_name: product.name,
          qty: qtyNum,
          buy_price: product.buy_price,
          sell_price: sellPriceNum,
          profit,
          type,
          party_id: type === "credit" ? partyId : null,
          paid_amount: paidNum,
          due_amount: due,
          note: note.trim() || null,
        },
      });

      toast.success(lang === "bn" ? "বিক্রি আপডেট করা হয়েছে" : "Sale updated");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      onOpenChange(false);
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
          <DialogTitle>{lang === "bn" ? "বিক্রি এডিট করুন" : "Edit Sale"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label={t("select_product")}>
            <ProductSearchSelect products={products} value={productId} onChange={setProductId} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("qty")}>
              <Input type="number" inputMode="numeric" pattern="[0-9]*" value={qty} onChange={e => setQty(e.target.value)} />
            </Field>
            <Field label={t("sell_price")}>
              <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={sellPrice} onChange={e => setSellPrice(e.target.value)} />
            </Field>
          </div>

          <Field label={lang === "bn" ? "বিক্রয়ের ধরণ" : "Sale Type"}>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("cash_sale")}</SelectItem>
                <SelectItem value="bkash">bKash</SelectItem>
                <SelectItem value="credit">{t("credit_sale")}</SelectItem>
                <SelectItem value="online">{t("online_sell")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {type === "credit" && (
            <>
              <Field label={t("select_customer")}>
                <Select value={partyId} onValueChange={setPartyId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("select_customer")} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.filter(c => !(c as any).archived).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t("paid_amount")}>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={paid} onChange={e => setPaid(e.target.value)} />
                </Field>
                <Field label={t("due_amount")}>
                  <div className="h-9 flex items-center pl-3 bg-muted/25 border rounded-md text-sm font-semibold">
                    ৳{due.toLocaleString()}
                  </div>
                </Field>
              </div>
            </>
          )}

          <Field label={t("note")}>
            <Input value={note} onChange={e => setNote(e.target.value)} />
          </Field>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (lang === "bn" ? "সংরক্ষণ হচ্ছে..." : "Saving...") : (lang === "bn" ? "পরিবর্তন সংরক্ষণ করুন" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
