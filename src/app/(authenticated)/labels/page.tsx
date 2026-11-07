"use client";

import Link from "next/link";
import { Barcode, Package, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LabelPrintingStudio } from "@/components/label-print-dialog";
import { getProducts } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { useT } from "@/lib/i18n";

export default function LabelsPrinterPage() {
  const { lang } = useT();
  const isBn = lang === "bn";

  const { data: products = [] } = useCachedQuery(["products"], getProducts);

  return (
    <div className="space-y-3 pb-20 sm:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold flex items-center gap-2 text-foreground">
            <Barcode className="size-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>{isBn ? "লেবেল প্রিন্টিং" : "Label Printing"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isBn
              ? "নিজের মতো কাস্টম টেক্সট, বারকোড, ওজন ও সাইজ ড্র্যাগ-অ্যান্ড-ড্রপ করে যেকোনো মাপের স্টিকার প্রিন্ট করুন"
              : "Drag-and-drop custom text, barcodes, weight & measurements onto any sticker size"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/products">
            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 cursor-pointer">
              <Package className="size-3.5" />
              <span>{isBn ? "পণ্যসমূহ" : "Products"}</span>
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 cursor-pointer">
              <Settings className="size-3.5" />
              <span>{isBn ? "প্রিন্টার সেটিংস" : "Printer Settings"}</span>
            </Button>
          </Link>
        </div>
      </div>

      <LabelPrintingStudio products={products} lang={lang} embedded />
    </div>
  );
}
