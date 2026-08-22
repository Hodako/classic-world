"use client";

import { useState, useMemo } from "react";
import { Search, ShoppingBag, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Product = {
  id: string;
  name: string;
  sell_price: number;
  stock: number;
  category?: string;
  description?: string;
};

type Business = {
  name: string;
  logo_url?: string;
};

export function StorefrontClient({
  business,
  initialProducts,
}: {
  business: Business;
  initialProducts: Product[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = initialProducts.map((p) => p.category).filter(Boolean) as string[];
    return Array.from(new Set(cats));
  }, [initialProducts]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return initialProducts.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.category || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = selectedCategory ? p.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [initialProducts, search, selectedCategory]);

  return (
    <div className="min-h-screen bg-gradient-to-tr from-zinc-50 via-zinc-100 to-zinc-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-foreground pb-12 font-sans">
      {/* Premium Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {business.logo_url ? (
              <img src={business.logo_url} className="size-8 object-contain rounded-md" alt={business.name} />
            ) : (
              <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
                {business.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="font-serif font-semibold text-lg">{business.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Public Catalog</span>
            <ShoppingBag className="size-5 text-muted-foreground" />
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="relative py-12 px-4 sm:px-6 text-center max-w-4xl mx-auto space-y-4">
        <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
          Welcome to <span className="text-primary">{business.name}</span>
        </h2>
        <p className="text-sm sm:text-base text-muted-foreground max-w-lg mx-auto">
          Browse our live collection of available products and items.
        </p>

        {/* Search Bar */}
        <div className="max-w-md mx-auto relative pt-4">
          <Search className="absolute left-3 top-[26px] size-4 text-muted-foreground" />
          <Input
            type="text"
            className="pl-9 h-10 bg-background border-border/80 rounded-full shadow-sm focus-visible:ring-1"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Categories Sidebar */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground px-1">Categories</h3>
          <div className="flex flex-wrap md:flex-col gap-1.5">
            <Button
              variant={selectedCategory === null ? "default" : "ghost"}
              size="sm"
              className="justify-start text-xs rounded-full md:rounded-md"
              onClick={() => setSelectedCategory(null)}
            >
              All Products ({initialProducts.length})
            </Button>
            {categories.map((cat) => {
              const count = initialProducts.filter((p) => p.category === cat).length;
              return (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "ghost"}
                  size="sm"
                  className="justify-start text-xs rounded-full md:rounded-md"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        <div className="md:col-span-3 space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Showing {filteredProducts.length} products</span>
          </div>

          {filteredProducts.length === 0 ? (
            <Card className="p-8 text-center border-dashed border-border/60">
              <Package className="size-10 mx-auto text-muted-foreground opacity-40 mb-3" />
              <p className="text-sm font-medium">No products found</p>
              <p className="text-xs text-muted-foreground mt-1">Try adjusting your search query or category filter.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((p) => (
                <Card
                  key={p.id}
                  className="flex flex-col p-4 bg-background border-border/60 rounded-xl hover:shadow-md transition-all duration-300"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 line-clamp-2">{p.name}</h4>
                      {p.category && (
                        <span className="text-[9px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase shrink-0">
                          {p.category}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{p.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 mt-auto border-t border-border/40">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-muted-foreground uppercase">Price</span>
                      <span className="font-serif font-bold text-sm text-primary">
                        {p.sell_price > 0 ? `৳${p.sell_price}` : "Contact Shop"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-muted-foreground uppercase block">Stock</span>
                      <span className={`text-[10px] font-semibold ${p.stock > 0 ? "text-success" : "text-destructive"}`}>
                        {p.stock > 0 ? `${p.stock} Available` : "Out of Stock"}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
