import { Plus } from "lucide-react";

export function FAB({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.75rem)] sm:bottom-6 right-4 z-40 min-h-[48px] min-w-[48px] size-12 rounded-full bg-primary text-primary-foreground grid place-items-center shadow-xl shadow-primary/35 active:scale-95 transition-all border border-white/20 hover:scale-105 cursor-pointer"
      aria-label="Add new item"
    >
      <Plus className="size-6 stroke-[2.5]" />
    </button>
  );
}
