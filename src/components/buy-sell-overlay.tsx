"use client";

import { useState } from "react";
import { ShoppingCart, Tag } from "lucide-react";
import { useT } from "@/lib/i18n";
import { SaleDialog } from "@/components/sale-dialog";
import { PurchaseDialog } from "@/components/purchase-dialog";

/** Fixed Buy (right) / Sell (left) overlay buttons for mobile home screen. */
export function BuySellOverlay() {
  const { t } = useT();
  const [sellOpen, setSellOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <>
      <div className="fixed mobile-buy-sell-bottom left-0 right-0 z-20 flex justify-between px-3 pointer-events-none sm:hidden max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => setSellOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-md active:scale-95 transition"
        >
          <Tag className="icon-sm" />
          {t("sell")}
        </button>
        <button
          type="button"
          onClick={() => setBuyOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground font-semibold text-xs shadow-md active:scale-95 transition"
        >
          <ShoppingCart className="icon-sm" />
          {t("buy")}
        </button>
      </div>
      <SaleDialog open={sellOpen} onOpenChange={setSellOpen} />
      <PurchaseDialog open={buyOpen} onOpenChange={setBuyOpen} />
    </>
  );
}
