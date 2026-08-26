"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { editPurchaseFn } from "@/lib/rpc";
import type { Purchase } from "@/lib/queries";
import { playTapSound } from "@/lib/audio";
import { Pencil } from "lucide-react";

export function EditPurchaseDialog({
  purchase,
  open,
  onOpenChange,
}: {
  purchase: Purchase | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { lang, t } = useT();
  const qc = useQueryClient();

  const [productName, setProductName] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (purchase && open) {
      setProductName(purchase.product_name || "");
      setQty(String(purchase.qty || 1));
      setUnitCost(String(purchase.unit_cost || ""));
      setTotalCost(String(purchase.total || ""));
      setPaymentType((purchase.payment_type as any) || "cash");
      setNote(purchase.note || "");
    }
  }, [purchase, open]);

  // Recalculate total when qty or unit cost changes
  const handleQtyChange = (val: string) => {
    setQty(val);
    const q = Number(val) || 0;
    const u = Number(unitCost) || 0;
    if (q > 0 && u > 0) {
      setTotalCost(String(q * u));
    }
  };

  const handleUnitCostChange = (val: string) => {
    setUnitCost(val);
    const q = Number(qty) || 0;
    const u = Number(val) || 0;
    if (q > 0 && u > 0) {
      setTotalCost(String(q * u));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchase) return;

    const q = Number(qty) || 0;
    const u = Number(unitCost) || 0;
    const tot = Number(totalCost) || (q * u);

    if (!productName.trim()) {
      toast.error(lang === "bn" ? "পণ্যের নাম দিন" : "Product name is required");
      return;
    }
    if (q <= 0) {
      toast.error(lang === "bn" ? "সঠিক পরিমাণ দিন" : "Valid quantity required");
      return;
    }
    if (u <= 0) {
      toast.error(lang === "bn" ? "ক্রয় মূল্য দিন" : "Unit buy cost required");
      return;
    }

    setBusy(true);
    playTapSound();

    try {
      await editPurchaseFn({
        data: {
          id: purchase.id,
          product_id: purchase.product_id || null,
          product_name: productName.trim(),
          qty: q,
          unit_cost: u,
          total: tot,
          note: note.trim() || null,
          payment_type: paymentType,
          party_id: purchase.party_id || null,
        },
      });

      toast.success(
        lang === "bn"
          ? "ক্রয় তথ্য সফলভাবে আপডেট হয়েছে!"
          : "Purchase details updated successfully!"
      );
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to update purchase");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md font-hind">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold font-balooda">
            <Pencil className="size-4 text-primary" />
            <span>{lang === "bn" ? "ক্রয় তথ্য পরিবর্তন করুন" : "Edit Purchase Record"}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">
              {lang === "bn" ? "পণ্যের নাম" : "Product Name"}
            </Label>
            <Input
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="h-10 rounded-xl text-xs"
              placeholder="Product Name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                {lang === "bn" ? "পরিমাণ (পিস)" : "Quantity (Pcs)"}
              </Label>
              <Input
                required
                type="number"
                min="1"
                step="any"
                value={qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="h-10 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                {lang === "bn" ? "একক ক্রয় মূল্য (৳)" : "Unit Buy Cost (৳)"}
              </Label>
              <Input
                required
                type="number"
                min="0"
                step="any"
                value={unitCost}
                onChange={(e) => handleUnitCostChange(e.target.value)}
                className="h-10 rounded-xl text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                {lang === "bn" ? "মোট খরচ (৳)" : "Total Cost (৳)"}
              </Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                className="h-10 rounded-xl text-xs font-mono font-bold bg-muted/30"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">
                {lang === "bn" ? "পেমেন্ট মাধ্যম" : "Payment Type"}
              </Label>
              <div className="grid grid-cols-2 gap-1.5 h-10 p-1 bg-muted/50 rounded-xl border border-border/60">
                <button
                  type="button"
                  onClick={() => setPaymentType("cash")}
                  className={`rounded-lg text-xs font-bold transition ${
                    paymentType === "cash"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang === "bn" ? "নগদ (ক্যাশ)" : "Cash"}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType("credit")}
                  className={`rounded-lg text-xs font-bold transition ${
                    paymentType === "credit"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang === "bn" ? "বকেয়া" : "Credit"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">
              {lang === "bn" ? "মন্তব্য / নোট (ঐচ্ছিক)" : "Note / Description (Optional)"}
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-10 rounded-xl text-xs"
              placeholder={lang === "bn" ? "যেমন: মহাজন রশিদ নম্বর" : "e.g. Supplier Invoice #"}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
              className="rounded-xl text-xs"
            >
              {lang === "bn" ? "বাতিল" : "Cancel"}
            </Button>
            <Button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary text-primary-foreground font-bold text-xs"
            >
              {busy ? "Saving..." : (lang === "bn" ? "সংরক্ষণ করুন" : "Save Changes")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
