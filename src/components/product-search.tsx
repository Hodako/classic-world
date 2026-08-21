"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronsUpDown, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtMoney } from "@/lib/format";
import type { Product } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { BarcodeScannerDialog } from "@/components/barcode-scanner-dialog";
import { toast } from "sonner";

interface ProductSearchProps {
  products: Product[];
  value: string;
  onChange: (id: string) => void;
  showPrice?: boolean;
  placeholder?: string;
}

/** Searchable product picker for buy/sell dialogs. Inline design avoids modal/keyboard conflicts. */
export function ProductSearchSelect({ products, value, onChange, showPrice, placeholder }: ProductSearchProps) {
  const { t, lang } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const selectedProduct = products.find(p => p.id === value);

  // Filter products based on search query (name, barcode, unique product number, code, sku, or qr)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    const strippedQ = q.replace(/^0+/, "");
    return products.filter(p => {
      const pName = (p.name || "").toLowerCase();
      const pBarcode = (p.barcode || "").toLowerCase();
      const pCode = ((p as any).code || "").toLowerCase();
      const pSku = ((p as any).sku || "").toLowerCase();
      const pQr = ((p as any).qr_code || "").toLowerCase();
      const pNum = ((p as any).product_number || "").toLowerCase();
      const pId = String(p.id || "").toLowerCase();

      return (
        pName.includes(q) ||
        (pBarcode && (pBarcode.includes(q) || (strippedQ && pBarcode.replace(/^0+/, "").includes(strippedQ)))) ||
        (pCode && (pCode.includes(q) || (strippedQ && pCode.replace(/^0+/, "").includes(strippedQ)))) ||
        (pSku && (pSku.includes(q) || (strippedQ && pSku.replace(/^0+/, "").includes(strippedQ)))) ||
        (pQr && (pQr.includes(q) || (strippedQ && pQr.replace(/^0+/, "").includes(strippedQ)))) ||
        (pNum && (pNum.includes(q) || (strippedQ && pNum.replace(/^0+/, "").includes(strippedQ)))) ||
        pId === q ||
        pId.slice(-6) === q
      );
    });
  }, [products, searchQuery]);

  const [highlightIndex, setHighlightIndex] = useState(0);

  // Reset highlight index when query changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [searchQuery]);

  // Handle when user selects a product
  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightIndex(0);
  };

  const handleBarcodeScanned = (code: string) => {
    const rawCode = String(code || "").trim();
    const cleanCode = rawCode.toLowerCase();
    const strippedCode = cleanCode.replace(/^0+/, "");

    const found = products.find(p => {
      const pBarcode = (p.barcode || "").trim().toLowerCase();
      const pStripped = pBarcode.replace(/^0+/, "");
      const pQr = ((p as any).qr_code || "").trim().toLowerCase();
      const pCode = ((p as any).code || "").trim().toLowerCase();
      const pSku = ((p as any).sku || "").trim().toLowerCase();
      const pNum = ((p as any).product_number || "").trim().toLowerCase();
      const pId = String(p.id || "").trim().toLowerCase();
      const pName = (p.name || "").trim().toLowerCase();

      return (
        (pBarcode && (pBarcode === cleanCode || cleanCode.includes(pBarcode) || (strippedCode && pStripped === strippedCode))) ||
        (pQr && (pQr === cleanCode || cleanCode.includes(pQr))) ||
        (pCode && (pCode === cleanCode || cleanCode.includes(pCode))) ||
        (pSku && (pSku === cleanCode || cleanCode.includes(pSku))) ||
        (pNum && (pNum === cleanCode || cleanCode.includes(pNum))) ||
        (pId && (pId === cleanCode || cleanCode.includes(pId))) ||
        (pName && pName === cleanCode)
      );
    });
    if (found) {
      onChange(found.id);
      setIsOpen(false);
      setSearchQuery("");
      toast.success(lang === "bn" ? `পণ্য নির্বাচিত: ${found.name}` : `Selected product: ${found.name}`);
    } else {
      toast.error(lang === "bn" ? `বারকোড/QR কোড (${code}) পাওয়া যায়নি` : `No product found for Barcode/QR: ${code}`);
    }
  };

  return (
    <>
      <div className="space-y-1">
        {selectedProduct && !isOpen ? (
          <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-card/60">
            <span className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
              <span className="truncate">{selectedProduct.name}</span>
              {showPrice && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({fmtMoney(selectedProduct.sell_price)} · {selectedProduct.stock} pcs)
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="h-7 px-2.5 text-[11px] hover:bg-muted text-primary active:scale-95 transition-all shrink-0"
              onClick={() => {
                setIsOpen(true);
                setSearchQuery("");
              }}
            >
              {lang === "bn" ? "পরিবর্তন" : "Change"}
            </Button>
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            <div className="relative flex-1">
              <Input
                type="text"
                inputMode="search"
                className="w-full pr-8 h-9 text-sm bg-background border-border/80"
                placeholder={placeholder ?? t("select_product")}
                value={searchQuery}
                autoFocus={isOpen}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIsOpen(true);
                    setHighlightIndex(prev => Math.min(prev + 1, Math.max(filteredProducts.length - 1, 0)));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIsOpen(true);
                    setHighlightIndex(prev => Math.max(prev - 1, 0));
                  } else if (e.key === "Enter") {
                    if (filteredProducts.length > 0 && filteredProducts[highlightIndex]) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelect(filteredProducts[highlightIndex].id);
                    }
                  } else if (e.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setIsOpen(false), 250);
                }}
              />
              <ChevronsUpDown className="absolute right-2.5 top-2.5 size-4 opacity-50 pointer-events-none" />

              {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-md shadow-md max-h-48 overflow-y-auto divide-y divide-border/60">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      {t("no_products")}
                    </div>
                  ) : (
                    filteredProducts.map((p, idx) => {
                      const isHighlighted = idx === highlightIndex;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer min-h-[44px] ${
                            isHighlighted
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "hover:bg-accent hover:text-accent-foreground"
                          }`}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            handleSelect(p.id);
                          }}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          onClick={() => handleSelect(p.id)}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{p.name}</span>
                            {p.barcode && <span className="font-mono text-[9px] opacity-75">{p.barcode}</span>}
                          </div>
                          <span className="shrink-0 text-[10px] opacity-80">
                            {showPrice && `${fmtMoney(p.sell_price)} · `}({p.stock})
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 px-3 shrink-0 text-xs flex items-center gap-1 border-dashed cursor-pointer min-h-[44px]"
              onClick={() => setScannerOpen(true)}
              title="Scan Barcode"
            >
              <Scan className="size-4 text-primary" />
            </Button>
          </div>
        )}
      </div>

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onScan={handleBarcodeScanned}
        title={lang === "bn" ? "পণ্য খুঁজুন (বারকোড)" : "Scan Product Barcode"}
      />
    </>
  );
}
