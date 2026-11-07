"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Barcode, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabelPrintingStudio } from "@/components/label-print-dialog";
import { getProducts } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { getBusinessSettingsFn } from "@/lib/rpc-admin";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";

export default function LabelsPrinterPage() {
  const { lang } = useT();
  const { user } = useAuth();
  const isBn = lang === "bn";

  const { data: products = [] } = useCachedQuery(["products"], getProducts);
  const settingsQuery = useQuery({
    queryKey: ["business-settings"],
    queryFn: getBusinessSettingsFn,
  });

  const resolvedShopName =
    settingsQuery.data?.business?.name ||
    user?.business_name ||
    "CLASSIC WORLD";

  return (
    <div className="space-y-4 pb-20 sm:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold flex items-center gap-2 text-foreground">
            <Barcode className="size-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              {isBn
                ? "লেবেল ও বারকোড স্টিকার প্রিন্টার"
                : "Barcode & Custom-Size Sticker Printer"}
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isBn
              ? "পণ্য বারকোড স্টিকার, প্রাইস ট্যাগ, ২-কলাম/৩-কলাম থার্মাল রোল এবং কাস্টম সাইজ (mm) লেবেল প্রিন্টিং"
              : "Print custom-size product barcode stickers, price tags, multi-column thermal rolls, and A4 label sheets"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/products">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-xl cursor-pointer">
              <Package className="size-3.5 text-primary" />
              {isBn ? "সকল পণ্য" : "Products"}
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 rounded-xl cursor-pointer">
              <Settings className="size-3.5 text-muted-foreground" />
              {isBn ? "প্রিন্টার সেটিংস" : "Printer Settings"}
            </Button>
          </Link>
        </div>
      </div>

      <LabelPrintingStudio
        embedded
        products={products}
        shopName={resolvedShopName}
        lang={lang}
      />
    </div>
  );
}
