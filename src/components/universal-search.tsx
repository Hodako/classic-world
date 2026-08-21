"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Package, Users, ShoppingBag, Receipt, Settings, BarChart3, Home, ArrowLeft, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { useT, type DictKey } from "@/lib/i18n";
import { getProducts, getParties, getSales, type Product, type Party, type Sale } from "@/lib/queries";
import { fmtMoney } from "@/lib/format";
import { canAccess } from "@/lib/permissions";
import type { PermissionSet } from "@/lib/permissions";
import { resolvePermissions } from "@/lib/permissions";
import { useIsMobile } from "@/hooks/use-mobile";

import { CustomHomeIcon } from "@/components/custom-home-icon";

const PAGES: { to: string; labelKey: DictKey; icon: React.ElementType; perm?: keyof PermissionSet }[] = [
  { to: "/dashboard", labelKey: "home", icon: CustomHomeIcon, perm: "dashboard" },
  { to: "/products", labelKey: "products", icon: Package, perm: "products" },
  { to: "/sales", labelKey: "sales", icon: ShoppingBag, perm: "sales" },
  { to: "/customers", labelKey: "customers", icon: Users, perm: "parties" },
  { to: "/dues", labelKey: "due", icon: Banknote, perm: "parties" },
  { to: "/parties", labelKey: "parties", icon: Users, perm: "parties" },
  { to: "/purchases", labelKey: "new_purchase", icon: Package, perm: "purchases" },
  { to: "/expenses", labelKey: "expenses", icon: Receipt, perm: "expenses" },
  { to: "/trackback", labelKey: "trackback", icon: BarChart3, perm: "reports" },
  { to: "/settings", labelKey: "settings", icon: Settings, perm: "settings" },
];

interface UniversalSearchProps {
  role?: string;
  permissions?: PermissionSet;
}

export function UniversalSearch({ role, permissions }: UniversalSearchProps) {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const perms = resolvePermissions(role ?? "employee", permissions);
  const pages = PAGES.filter(p => !p.perm || canAccess(perms, p.perm));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isMobile) {
          setMobileExpanded(v => !v);
        } else {
          setOpen(v => !v);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobile]);

  useEffect(() => {
    if (!open && !mobileExpanded) return;
    void qc.prefetchQuery({ queryKey: ["products"], queryFn: getProducts });
    void qc.prefetchQuery({ queryKey: ["parties"], queryFn: getParties });
    void qc.prefetchQuery({ queryKey: ["sales"], queryFn: getSales });
  }, [open, mobileExpanded, qc]);

  const products = (qc.getQueryData(["products"]) as Product[] | undefined) ?? [];
  const parties = (qc.getQueryData(["parties"]) as Party[] | undefined) ?? [];
  const sales = (qc.getQueryData(["sales"]) as Sale[] | undefined) ?? [];

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) {
      return {
        pages,
        products: products.slice(0, 8),
        parties: parties.slice(0, 8),
        sales: sales.slice(0, 6),
      };
    }
    return {
      pages: pages.filter(p => t(p.labelKey).toLowerCase().includes(q)),
      products: products.filter(p => (p.name || "").toLowerCase().includes(q)).slice(0, 10),
      parties: parties.filter(p => (p.name || "").toLowerCase().includes(q) || (p.phone ?? "").includes(q)).slice(0, 10),
      sales: sales.filter(s => (s.product_name || "").toLowerCase().includes(q)).slice(0, 8),
    };
  }, [q, pages, products, parties, sales, t]);

  function go(to: string) {
    setOpen(false);
    setMobileExpanded(false);
    setQuery("");
    router.push(to);
  }

  if (isMobile) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => setMobileExpanded(true)}
          aria-label={t("search")}
        >
          <Search className="icon-sm" />
        </Button>

        {mobileExpanded && (
          <div className="fixed inset-x-0 top-0 h-12 bg-background border-b border-border flex items-center px-3 gap-2 z-[999] animate-in slide-in-from-top duration-200">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
              onClick={() => {
                setMobileExpanded(false);
                setQuery("");
              }}
            >
              <ArrowLeft className="icon-sm" />
            </Button>
            <Input
              className="flex-1 h-8 text-xs bg-muted/40 border-0 focus-visible:ring-1 focus-visible:ring-primary"
              placeholder={t("universal_search")}
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />

            {/* Results absolute container */}
            <div className="absolute top-12 inset-x-0 max-h-[calc(100vh-3rem)] overflow-y-auto bg-background border-b border-border shadow-2xl z-[999] p-2 space-y-3 pb-8">
              {filtered.pages.length === 0 && filtered.products.length === 0 && filtered.parties.length === 0 && filtered.sales.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">{t("no_results")}</div>
              )}

              {filtered.pages.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">{t("navigation")}</div>
                  {filtered.pages.map(p => (
                    <button
                      key={p.to}
                      onClick={() => go(p.to)}
                      className="w-full flex items-center text-left text-xs px-2.5 py-2 hover:bg-muted active:bg-muted/70 rounded-md gap-2.5 transition-colors"
                    >
                      <p.icon className="size-4 opacity-70 text-primary" />
                      <span className="font-medium">{t(p.labelKey)}</span>
                    </button>
                  ))}
                </div>
              )}

              {canAccess(perms, "products") && filtered.products.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">{t("products")}</div>
                  {filtered.products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => go("/products")}
                      className="w-full flex items-center justify-between text-left text-xs px-2.5 py-2 hover:bg-muted active:bg-muted/70 rounded-md gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Package className="size-4 opacity-70 text-primary shrink-0" />
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                      <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-mono shrink-0">
                        {p.stock} {t("stock")}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {canAccess(perms, "parties") && filtered.parties.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">{t("parties")}</div>
                  {filtered.parties.map(p => (
                    <button
                      key={p.id}
                      onClick={() => go(`/parties/detail?id=${p.id}`)}
                      className="w-full flex items-center justify-between text-left text-xs px-2.5 py-2 hover:bg-muted active:bg-muted/70 rounded-md gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="size-4 opacity-70 text-primary shrink-0" />
                        <span className="truncate font-medium">{p.name || "Unnamed"}</span>
                      </div>
                      {p.phone && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{p.phone}</span>}
                    </button>
                  ))}
                </div>
              )}

              {canAccess(perms, "sales") && filtered.sales.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1 font-semibold">{t("sales")}</div>
                  {filtered.sales.map(s => (
                    <button
                      key={s.id}
                      onClick={() => go("/sales")}
                      className="w-full flex items-center justify-between text-left text-xs px-2.5 py-2 hover:bg-muted active:bg-muted/70 rounded-md gap-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ShoppingBag className="size-4 opacity-70 text-primary shrink-0" />
                        <span className="truncate font-medium">{s.product_name}</span>
                      </div>
                      <span className="font-semibold text-primary shrink-0">{fmtMoney(s.sell_price * s.qty)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        onClick={() => setOpen(true)}
        aria-label={t("search")}
      >
        <Search className="icon-sm" />
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder={t("universal_search")}
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{t("no_results")}</CommandEmpty>
          {filtered.pages.length > 0 && (
            <CommandGroup heading={t("navigation")}>
              {filtered.pages.map(p => (
                <CommandItem key={p.to} value={`page-${p.to}`} onSelect={() => go(p.to)}>
                  <p.icon className="icon-sm mr-2 opacity-60" />
                  {t(p.labelKey)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {canAccess(perms, "products") && filtered.products.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("products")}>
                {filtered.products.map(p => (
                  <CommandItem key={p.id} value={`product-${p.id}-${p.name}`} onSelect={() => go("/products")}>
                    <Package className="icon-sm mr-2 opacity-60" />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{p.stock} {t("stock")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {canAccess(perms, "parties") && filtered.parties.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("parties")}>
                {filtered.parties.map(p => (
                  <CommandItem key={p.id} value={`party-${p.id}-${p.name}`} onSelect={() => go(`/parties/detail?id=${p.id}`)}>
                    <Users className="icon-sm mr-2 opacity-60" />
                    <span className="truncate">{p.name}</span>
                    {p.phone && <span className="ml-auto text-xs text-muted-foreground">{p.phone}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {canAccess(perms, "sales") && filtered.sales.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={t("sales")}>
                {filtered.sales.map(s => (
                  <CommandItem key={s.id} value={`sale-${s.id}-${s.product_name}`} onSelect={() => go("/sales")}>
                    <ShoppingBag className="icon-sm mr-2 opacity-60" />
                    <span className="truncate">{s.product_name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{fmtMoney(s.sell_price * s.qty)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
