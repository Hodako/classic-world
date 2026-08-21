"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Customer } from "@/lib/queries";
import { useT } from "@/lib/i18n";

interface CustomerSearchProps {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

/** Searchable customer picker for credit sales and returns. Inline design avoids modal conflicts. */
export function CustomerSearchSelect({ customers, value, onChange, placeholder }: CustomerSearchProps) {
  const { t, lang } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedCustomer = customers.find(c => c.id === value);

  // Filter customers based on search query (name or phone)
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(c => 
      (c.name || "").toLowerCase().includes(q) || 
      (c.phone || "").includes(q)
    );
  }, [customers, searchQuery]);

  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    setHighlightIndex(0);
  }, [searchQuery]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearchQuery("");
    setHighlightIndex(0);
  };

  return (
    <div className="space-y-1">
      {selectedCustomer && !isOpen ? (
        <div className="flex items-center justify-between p-2 rounded-lg border border-border bg-card/60">
          <span className="text-xs font-semibold text-foreground truncate flex items-center gap-1.5">
            <span className="truncate">{selectedCustomer.name}</span>
            {selectedCustomer.phone && (
              <span className="text-[10px] text-muted-foreground font-mono">
                ({selectedCustomer.phone})
              </span>
            )}
          </span>
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-[11px] hover:bg-muted text-primary active:scale-95 transition-all shrink-0"
            onClick={() => {
              setIsOpen(true);
              setSearchQuery("");
            }}
          >
            {lang === "bn" ? "পরিবর্তন" : "Change"}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            type="text"
            inputMode="search"
            className="w-full pr-8 h-9 text-sm bg-background border-border/80"
            placeholder={placeholder ?? (lang === "bn" ? "গ্রাহক খুঁজুন (নাম বা ফোন)..." : "Search Customer (Name/Phone)...")}
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
                setHighlightIndex(prev => Math.min(prev + 1, Math.max(filteredCustomers.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIsOpen(true);
                setHighlightIndex(prev => Math.max(prev - 1, 0));
              } else if (e.key === "Enter") {
                if (filteredCustomers.length > 0 && filteredCustomers[highlightIndex]) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelect(filteredCustomers[highlightIndex].id);
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
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted-foreground">
                  {lang === "bn" ? "কোন কাস্টমার পাওয়া যায়নি" : "No customers found"}
                </div>
              ) : (
                filteredCustomers.map((c, idx) => {
                  const isHighlighted = idx === highlightIndex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer min-h-[44px] ${
                        isHighlighted
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-accent hover:text-accent-foreground"
                      }`}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        handleSelect(c.id);
                      }}
                      onMouseEnter={() => setHighlightIndex(idx)}
                      onClick={() => handleSelect(c.id)}
                    >
                      <span className="truncate flex-1">{c.name}</span>
                      {c.phone && (
                        <span className="shrink-0 text-[10px] opacity-80 font-mono">
                          {c.phone}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
