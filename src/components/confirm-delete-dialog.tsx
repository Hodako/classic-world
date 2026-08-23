import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
  loading?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  busy = false,
  loading = false,
}: ConfirmDeleteDialogProps) {
  const isBusy = busy || loading;
  const [clickCount, setClickCount] = React.useState(0);

  React.useEffect(() => {
    if (!open) {
      setClickCount(0);
    }
  }, [open]);

  const handleConfirmClick = () => {
    if (clickCount === 0) {
      setClickCount(1);
    } else {
      onConfirm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-destructive/20 shadow-2xl glass-card">
        <DialogHeader className="space-y-1">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-3 border border-destructive/20">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="text-center">
            <span className="text-[10px] uppercase font-bold text-red-500 tracking-widest block mb-1">
              {clickCount > 0 ? "Double Confirmation Required" : "Danger Zone"}
            </span>
          </div>
          <DialogTitle className="text-center text-base font-bold tracking-tight text-foreground">{title}</DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground mt-1 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row gap-2 mt-4 sm:justify-center">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-9 text-xs beveled-button"
            onClick={() => onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className={`flex-1 h-9 text-xs font-semibold shadow-inner transition-all duration-200 ${
              clickCount > 0 ? "bg-red-700 hover:bg-red-800 scale-105 border border-red-500 shadow-lg animate-pulse" : ""
            }`}
            onClick={handleConfirmClick}
            disabled={isBusy}
          >
            {isBusy
              ? "Deleting..."
              : clickCount === 0
              ? "Confirm Delete"
              : "Click Again to Confirm!"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
