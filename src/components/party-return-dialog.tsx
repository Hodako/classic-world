"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductSearchSelect } from "@/components/product-search";
import { CustomerSearchSelect } from "@/components/customer-search";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { getCustomers, getProducts } from "@/lib/queries";
import { createPartyReturnFn, createCustomerFn } from "@/lib/rpc";
import { Plus } from "lucide-react";

export function PartyReturnDialog({
  open, onOpenChange, partyId: initialPartyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partyId?: string;
}) {
  const { lang, t } = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  
  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const { data: customers = [] } = useCachedQuery(["customers"], getCustomers);

  const [partyId, setPartyId] = useState(initialPartyId ?? "");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [refundAmount, setRefundAmount] = useState("");
  const [deductType, setDeductType] = useState<"receivable" | "payable" | "cash">("receivable");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Quick Customer Creation
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [addingCust, setAddingCust] = useState(false);

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault();
    const name = newCustName.trim();
    if (!name) return;
    const phone = newCustPhone.trim() || null;
    const address = newCustAddress.trim() || null;
    setAddingCust(true);
    try {
      const saved = await createCustomerFn({ data: { name, phone, address } });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setPartyId(saved.id);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustAddress("");
      setAddCustomerOpen(false);
      toast.success(lang === "bn" ? `${name} কে কাস্টমার হিসেবে যোগ করা হয়েছে` : `Added customer ${name}`);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setAddingCust(false);
    }
  }

  useEffect(() => {
    if (open) {
      setPartyId(initialPartyId ?? "");
      setProductId("");
      setQty("1");
      setRefundAmount("");
      setDeductType("receivable");
      setNote("");
    }
  }, [open, initialPartyId]);

  // Pre-populate refund amount based on product sell price when product/quantity changes
  useEffect(() => {
    if (productId && qty) {
      const p = products.find(x => x.id === productId);
      if (p) {
        const total = p.sell_price * (Number(qty) || 0);
        setRefundAmount(String(total));
      }
    }
  }, [productId, qty, products]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!partyId) return toast.error(lang === "bn" ? "অনুগ্রহ করে কাস্টমার সিলেক্ট করুন" : "Please select a customer");
    if (!productId) return toast.error(t("select_product"));
    const qtyNum = Number(qty) || 0;
    if (qtyNum <= 0) return toast.error(lang === "bn" ? "সঠিক পরিমাণ লিখুন" : "Please enter a valid quantity");
    const refundAmtNum = Number(refundAmount) || 0;
    if (refundAmtNum < 0) return toast.error(lang === "bn" ? "ফেরতের মূল্য নেতিবাচক হতে পারে না" : "Refund amount cannot be negative");

    setBusy(true);
    try {
      await createPartyReturnFn({
        data: {
          party_id: partyId,
          product_id: productId,
          qty: qtyNum,
          refund_amount: refundAmtNum,
          deduct_type: deductType,
          note: note.trim() || null,
        },
      });

      toast.success(lang === "bn" ? "পণ্য ফেরত সফলভাবে রেকর্ড করা হয়েছে" : "Product return recorded successfully");
      
      // Invalidate queries to refresh UI
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["party-detail"] });
      qc.invalidateQueries({ queryKey: ["party-receivables"] });
      qc.invalidateQueries({ queryKey: ["party-payables"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold font-serif">
              {lang === "bn" ? "পণ্য ফেরত (Product Return)" : "Product Return"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4 py-2">
            {/* Customer select - Locked if initialized with a specific party */}
            {!initialPartyId && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{lang === "bn" ? "গ্রাহক / কাস্টমার" : "Customer"}</Label>
                <div className="flex items-center gap-1.5">
                  <div className="flex-1">
                    <CustomerSearchSelect customers={customers} value={partyId} onChange={setPartyId} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 shrink-0 cursor-pointer"
                    onClick={() => setAddCustomerOpen(true)}
                    title="Add Customer"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("select_product")}</Label>
                <ProductSearchSelect products={products} value={productId} onChange={setProductId} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t("qty")}</Label>
                  <Input
                    type="number"
                    step="1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1"
                    value={qty}
                    onChange={e => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {lang === "bn" ? "ফেরত মূল্য (৳)" : "Refund Value (৳)"}
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    pattern="[0-9.]*"
                    placeholder="0"
                    value={refundAmount}
                    onChange={e => setRefundAmount(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {lang === "bn" ? "ফেরতের মাধ্যম" : "Return / Refund Method"}
              </Label>
              <Select value={deductType} onValueChange={(v: any) => setDeductType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receivable">
                    {lang === "bn" ? "গ্রাহকের বাকি বকেয়া থেকে কাটা (Receivables)" : "Deduct Customer Dues (Receivables)"}
                  </SelectItem>
                  <SelectItem value="payable">
                    {lang === "bn" ? "আমাদের দে না থেকে কাটা (Supplier Payables)" : "Deduct Our Dues (Payables)"}
                  </SelectItem>
                  <SelectItem value="cash">
                    {lang === "bn" ? "নগদ টাকা ফেরত (Cash Refund)" : "Cash Refund (From Cashbox)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("note")}</Label>
              <Input
                placeholder={lang === "bn" ? "মন্তব্য লিখুন..." : "Enter note/reason..."}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" disabled={busy || !productId}>
                {busy ? "…" : (lang === "bn" ? "ফেরত রেকর্ড করুন" : "Record Return")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Customer Add Dialog */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? "নতুন গ্রাহক যোগ করুন" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "গ্রাহকের নাম *" : "Customer Name *"}</Label>
              <Input
                required
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
                placeholder="e.g. Abul Kalam"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ফোন নম্বর" : "Phone Number"}</Label>
              <Input
                type="tel"
                inputMode="tel"
                pattern="[0-9+]*"
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
                placeholder="e.g. 017XXXXXXXX"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "ঠিকানা" : "Address"}</Label>
              <Input
                value={newCustAddress}
                onChange={e => setNewCustAddress(e.target.value)}
                placeholder="e.g. Dhaka, Bangladesh"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddCustomerOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={addingCust}>
                {addingCust ? "…" : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
