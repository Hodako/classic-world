"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveAdminPopupsFn, dismissAdminPopupFn } from "@/lib/rpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Info, AlertTriangle, Flame, Sparkles, Check } from "lucide-react";
import { useT } from "@/lib/i18n";

export function AdminPopupDialog() {
  const { lang } = useT();
  const qc = useQueryClient();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dismissed_admin_popups");
      if (stored) setDismissedIds(JSON.parse(stored));
    } catch {}
  }, []);

  const popupsQuery = useQuery({
    queryKey: ["active-admin-popups"],
    queryFn: getActiveAdminPopupsFn,
    refetchInterval: 30000, // Check every 30s
  });

  const dismissMutation = useMutation({
    mutationFn: (popupId: string) => dismissAdminPopupFn({ data: { popupId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["active-admin-popups"] });
    },
  });

  const activePopups = (popupsQuery.data ?? []).filter(
    (p: any) => !dismissedIds.includes(p.id)
  );

  const currentPopup = activePopups[0];

  const handleDismiss = (id: string) => {
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    try {
      localStorage.setItem("dismissed_admin_popups", JSON.stringify(updated));
    } catch {}
    dismissMutation.mutate(id);
  };

  if (!currentPopup) return null;

  const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    info: {
      icon: Info,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    urgent: {
      icon: Flame,
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
    promo: {
      icon: Sparkles,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
  };

  const currentType = typeConfig[currentPopup.popup_type || "info"] || typeConfig.info;
  const TypeIcon = currentType.icon;

  return (
    <Dialog open={true} onOpenChange={() => handleDismiss(currentPopup.id)}>
      <DialogContent className="max-w-md p-6 sm:p-7 rounded-2xl border border-primary/20 shadow-2xl space-y-4">
        <DialogHeader className="flex flex-col items-center text-center space-y-3">
          <div className={`p-3.5 rounded-2xl ${currentType.bg} border ${currentType.border} ${currentType.color} shadow-inner`}>
            <TypeIcon className="size-8 animate-pulse" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {currentPopup.title}
          </DialogTitle>
        </DialogHeader>

        <div className={`p-4 rounded-xl ${currentType.bg} border ${currentType.border} text-sm text-foreground leading-relaxed whitespace-pre-wrap`}>
          {currentPopup.message}
        </div>

        <DialogFooter className="pt-2 sm:justify-center">
          <Button
            type="button"
            onClick={() => handleDismiss(currentPopup.id)}
            className="w-full sm:w-auto px-8 rounded-xl beveled-button gap-2 text-sm font-semibold"
          >
            <Check className="size-4" />
            {lang === "bn" ? "ঠিক আছে, বুঝেছি" : "Got it, Dismiss"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
