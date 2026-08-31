import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PaginationBarProps {
  page?: number;
  currentPage?: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Compact pagination controls for mobile & desktop lists. */
export function PaginationBar({
  page,
  currentPage,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className = "",
}: PaginationBarProps) {
  if (totalPages <= 1) return null;
  const activePage = page ?? currentPage ?? 1;

  const showRange = total !== undefined && pageSize !== undefined;
  const from = showRange ? (activePage - 1) * pageSize + 1 : null;
  const to = showRange ? Math.min(activePage * pageSize, total) : null;

  return (
    <div className={`flex items-center justify-between gap-2 py-2 text-xs text-muted-foreground ${className}`}>
      {showRange && (
        <span className="font-medium text-foreground">
          {from}–{to} / {total}
        </span>
      )}
      <div className="flex items-center gap-1 ml-auto">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 sm:size-7 rounded-lg"
          disabled={activePage <= 1}
          onClick={() => onPageChange(activePage - 1)}
        >
          <ChevronLeft className="size-4 sm:size-3.5" />
        </Button>
        <span className="px-2.5 font-bold text-foreground text-xs">
          {activePage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 sm:size-7 rounded-lg"
          disabled={activePage >= totalPages}
          onClick={() => onPageChange(activePage + 1)}
        >
          <ChevronRight className="size-4 sm:size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Slice an array for the current page (1-indexed). */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), totalPages, safePage, total };
}
