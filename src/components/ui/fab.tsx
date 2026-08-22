import { Plus } from "lucide-react";

export function FAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.5rem)] sm:bottom-6 right-3 sm:right-4 z-40 min-h-[38px] min-w-[38px] size-9.5 sm:size-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-lg shadow-primary/30 active:scale-90 transition-all border border-white/20 hover:scale-105 cursor-pointer"
      aria-label="Add new item"
    >
      <Plus className="size-4.5 sm:size-6 stroke-[2.5]" />
    </button>
  );
}
