import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

/** Compact pagination controls for mobile lists. */
export function PaginationBar({ page, totalPages, total, pageSize, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;
  const showSummary = typeof total === "number" && typeof pageSize === "number";
  const from = showSummary ? (page - 1) * pageSize + 1 : page;
  const to = showSummary ? Math.min(page * pageSize, total) : totalPages;

  return (
    <div className="flex items-center justify-between gap-2 py-3 pr-14 pb-16 md:pr-0 md:pb-3 text-xs text-muted-foreground">
      {showSummary ? <span>{from}–{to} / {total}</span> : <span />}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 md:size-7"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-4 md:size-3.5" />
        </Button>
        <span className="px-2.5 font-medium text-foreground text-sm md:text-xs">{page}/{totalPages}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-9 md:size-7"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-4 md:size-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Slice an array for the current page (1-indexed). */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), totalPages, safePage };
}
