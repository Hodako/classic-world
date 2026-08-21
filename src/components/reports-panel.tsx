"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { canAccess, resolvePermissions } from "@/lib/permissions";
import { getSales, getPurchases } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney } from "@/lib/format";
import { downloadCsv, exportDateStamp } from "@/lib/export";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, BarChart3 } from "lucide-react";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function inRange(iso: string, from: string, to: string) {
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Compact reports — summary + CSV export only (no long lists). */
export function ReportsPanel() {
  const { t } = useT();
  const { user } = useAuth();
  const perms = resolvePermissions(user?.role ?? "employee", user?.permissions);
  const canView = canAccess(perms, "reports");

  const range = defaultRange();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const { data: sales = [] } = useCachedQuery(["sales"], getSales, { enabled: canView });
  const { data: purchases = [] } = useCachedQuery(["purchases"], getPurchases, { enabled: canView });

  const filteredSales = useMemo(() => sales.filter(s => !s.returned && inRange(s.created_at, from, to)), [sales, from, to]);
  const filteredPurchases = useMemo(() => purchases.filter(p => inRange(p.created_at, from, to)), [purchases, from, to]);

  const salesTotal = filteredSales.reduce((a, s) => a + Number(s.sell_price) * s.qty, 0);
  const salesProfit = filteredSales.reduce((a, s) => a + Number(s.profit), 0);
  const purchaseTotal = filteredPurchases.reduce((a, p) => a + Number(p.total), 0);

  function exportSales(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["তারিখ", "পণ্য", "পরিমাণ", "বিক্রয় মূল্য", "লাভ", "ধরণ", "বকেয়া"]
      : ["Date", "Product", "Qty", "Sell", "Profit", "Type", "Due"];
    downloadCsv(
      `sales-${exportDateStamp()}.csv`,
      headers,
      filteredSales.map(s => [
        fmtDateTime(s.created_at), s.product_name, s.qty,
        Number(s.sell_price) * s.qty, s.profit,
        langCode === "bn"
          ? (s.type === "cash" ? "নগদ" : s.type === "credit" ? "বাকী" : "অনলাইন")
          : s.type.toUpperCase(),
        s.due_amount,
      ]),
    );
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  function exportPurchases(langCode: "en" | "bn") {
    const headers = langCode === "bn"
      ? ["তারিখ", "পণ্য", "পরিমাণ", "ইউনিট খরচ", "মোট"]
      : ["Date", "Product", "Qty", "Unit cost", "Total"];
    downloadCsv(
      `purchases-${exportDateStamp()}.csv`,
      headers,
      filteredPurchases.map(p => [
        fmtDateTime(p.created_at), p.product_name, p.qty, p.unit_cost, p.total,
      ]),
    );
    toast.success(langCode === "bn" ? "CSV ফাইল ডাউনলোড সফল হয়েছে!" : "CSV exported successfully!");
  }

  if (!canView) return null;

  return (
    <Card className="glass-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" />
        <h2 className="font-semibold text-sm">{t("reports")}</h2>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">{t("filter_date")} (from)</Label>
          <Input type="date" placeholder={t("filter_date")} className="h-8 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">{t("filter_date")} (to)</Label>
          <Input type="date" placeholder={t("filter_date")} className="h-8 text-xs" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-primary/10 p-2">
          <div className="text-muted-foreground text-[10px]">{t("sales")}</div>
          <div className="font-bold text-sm">{fmtMoney(salesTotal)}</div>
          <div className="text-[9px] text-muted-foreground">{filteredSales.length} {t("records")}</div>
        </div>
        <div className="rounded-md bg-success/10 p-2">
          <div className="text-muted-foreground text-[10px]">{t("profit")}</div>
          <div className="font-bold text-sm text-success">{fmtMoney(salesProfit)}</div>
        </div>
        <div className="rounded-md bg-secondary p-2">
          <div className="text-muted-foreground text-[10px]">{t("purchases")}</div>
          <div className="font-bold text-sm">{fmtMoney(purchaseTotal)}</div>
          <div className="text-[9px] text-muted-foreground">{filteredPurchases.length} {t("records")}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs w-full">
              <Download className="size-3 mr-1" />{t("export_sales_csv")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => exportSales("en")}>
              English (ইংরেজি)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportSales("bn")}>
              Bangla (বাংলা)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 text-xs w-full">
              <Download className="size-3 mr-1" />{t("export_buys_csv")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onClick={() => exportPurchases("en")}>
              English (ইংরেজি)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportPurchases("bn")}>
              Bangla (বাংলা)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
