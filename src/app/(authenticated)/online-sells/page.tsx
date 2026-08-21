"use client";


import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { getSales } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { FAB } from "@/components/ui/fab";
import { SaleDialog } from "@/components/sale-dialog";



export default function OnlineSellsPage() {
  const { t } = useT();
  const { data } = useQuery({ queryKey: ["sales"], queryFn: getSales });
  const [open, setOpen] = useState(false);

  // Filter for online sales only
  const onlineSales = (data ?? []).filter(s => s.type === "online");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("online_sell")}</h1>
      <Tabs defaultValue="all">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="all">{t("all")}</TabsTrigger>
          <TabsTrigger value="today">{t("today")}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="pt-3"><OnlineSalesList items={onlineSales} /></TabsContent>
        <TabsContent value="today" className="pt-3">
          {/* Filter for today's online sales */}
          <OnlineSalesList
            items={onlineSales.filter(s => {
              const saleDate = new Date(s.created_at);
              const today = new Date();
              return saleDate.toDateString() === today.toDateString();
            })}
          />
        </TabsContent>
      </Tabs>
      <FAB onClick={() => setOpen(true)} />
      <SaleDialog open={open} onOpenChange={setOpen} presetType="online" />
    </div>
  );
}

function OnlineSalesList({ items }: { items: ReturnType<typeof Array.prototype.slice> | any[] }) {
  const { t } = useT();
  if (!items || items.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">{t("no_sales")}</Card>;
  return (
    <Card className="divide-y divide-border overflow-hidden">
      {items.map((s: any) => (
        <div key={s.id} className="p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium truncate">{s.product_name} <span className="text-muted-foreground text-xs">×{s.qty}</span></div>
            <div className="text-xs text-muted-foreground">
              {s.parties?.name && s.party_id ? (
                <>
                  <Link
                    href={`/customers/detail?id=${s.party_id}`}
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
          <div className="text-right">
            <div className="font-semibold">{fmtMoney(Number(s.sell_price)*s.qty)}</div>
            <div className="text-xs text-success">+{fmtMoney(s.profit)}</div>
          </div>
        </div>
      ))}
    </Card>
  );
}
