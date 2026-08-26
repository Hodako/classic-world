"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import {
  getMyPendingEmployeeInvitationsFn,
  respondToEmployeeInvitationFn,
} from "@/lib/rpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Building2,
  UserCheck,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  Loader2,
} from "lucide-react";

export function EmployeeInvitationModal() {
  const { user, refresh } = useAuth();
  const { lang } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const { data: invitations, isLoading } = useQuery({
    queryKey: ["my-pending-employee-invitations"],
    queryFn: () => getMyPendingEmployeeInvitationsFn(),
    enabled: Boolean(user && user.email),
    refetchInterval: 15000,
  });

  // Filter out any invitation the user dismissed in the current session
  const activeInvitations = (invitations || []).filter(
    (inv: any) => !dismissedIds.includes(inv.id)
  );

  const currentInvite = activeInvitations[0];

  if (!currentInvite || isLoading) {
    return null;
  }

  const handleRespond = async (action: "accept" | "reject") => {
    try {
      setSubmitting(true);
      await respondToEmployeeInvitationFn({
        data: {
          invitationId: currentInvite.id,
          action,
        },
      });

      if (action === "accept") {
        toast.success(
          lang === "bn"
            ? `অভিনন্দন! আপনি সফলভাবে "${currentInvite.business_name}" এর কর্মচারী হিসেবে যুক্ত হয়েছেন।`
            : `Congratulations! You have joined "${currentInvite.business_name}" as an employee.`
        );
        await qc.invalidateQueries({ queryKey: ["my-pending-employee-invitations"] });
        if (refresh) {
          await refresh();
        }
        router.push("/dashboard");
      } else {
        toast.info(
          lang === "bn"
            ? `"${currentInvite.business_name}" এর আমন্ত্রণ প্রত্যাখ্যান করা হয়েছে।`
            : `Invitation to join "${currentInvite.business_name}" was declined.`
        );
        setDismissedIds(prev => [...prev, currentInvite.id]);
        await qc.invalidateQueries({ queryKey: ["my-pending-employee-invitations"] });
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to process invitation response");
    } finally {
      setSubmitting(false);
    }
  };

  const perms = currentInvite.permissions || {};
  const activePermNames: string[] = [];
  if (perms.dashboard) activePermNames.push(lang === "bn" ? "ড্যাশবোর্ড" : "Dashboard");
  if (perms.sales) activePermNames.push(lang === "bn" ? "বিক্রয় ও পিওএস" : "POS Sales");
  if (perms.products) activePermNames.push(lang === "bn" ? "পণ্য পরিচালনা" : "Products");
  if (perms.parties) activePermNames.push(lang === "bn" ? "সাপ্লায়ার ও পার্টি" : "Parties");
  if (perms.purchases) activePermNames.push(lang === "bn" ? "পণ্য ক্রয়" : "Purchases");
  if (perms.expenses) activePermNames.push(lang === "bn" ? "খরচ হিসাব" : "Expenses");
  if (perms.cashbox) activePermNames.push(lang === "bn" ? "ক্যাশবক্স" : "Cashbox");
  if (perms.reports) activePermNames.push(lang === "bn" ? "রিপোর্টস" : "Reports");

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg p-6 sm:p-8 rounded-2xl sm:rounded-3xl border-emerald-500/30 bg-card shadow-2xl space-y-5 select-none"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader className="space-y-3 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3.5">
            <div className="size-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0">
              <Sparkles className="size-7 animate-pulse" />
            </div>
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {lang === "bn"
                  ? "দোকানের কর্মচারী হওয়ার আমন্ত্রণ!"
                  : "Company Employee Invitation"}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {lang === "bn"
                  ? `আপনাকে "${currentInvite.business_name}" এ যোগ দেওয়ার জন্য আমন্ত্রণ জানানো হয়েছে।`
                  : `You have received an invitation to join "${currentInvite.business_name}".`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Invitation Summary Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-muted/40 border border-border/80 space-y-3.5 text-xs sm:text-sm">
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="size-4 text-emerald-600" />
              <span>{lang === "bn" ? "দোকান / প্রতিষ্ঠান:" : "Business Name:"}</span>
            </div>
            <span className="font-bold text-foreground text-sm sm:text-base">
              {currentInvite.business_name}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserCheck className="size-4 text-blue-600" />
              <span>{lang === "bn" ? "আমন্ত্রণকারী:" : "Invited By:"}</span>
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">{currentInvite.owner_name}</p>
              {currentInvite.owner_email && (
                <p className="text-[11px] text-muted-foreground font-mono">
                  {currentInvite.owner_email}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Briefcase className="size-4 text-purple-600" />
              <span>{lang === "bn" ? "পদবী (Designation):" : "Designation:"}</span>
            </div>
            <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/30 font-semibold px-2.5 py-0.5">
              {currentInvite.designation || "Sales Staff"}
            </Badge>
          </div>

          {/* Granted Permissions */}
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>{lang === "bn" ? "অনুমোদিত কাজের সুযোগ:" : "Granted Permissions:"}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activePermNames.map(name => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="text-[11px] bg-card border border-border/80 font-medium px-2 py-0.5"
                >
                  ✓ {name}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleRespond("reject")}
            className="w-full sm:w-auto h-10 px-5 rounded-xl border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs font-semibold gap-1.5"
          >
            <XCircle className="size-4" />
            <span>{lang === "bn" ? "বাতিল / প্রত্যাখ্যান করুন" : "Decline Invitation"}</span>
          </Button>

          <Button
            type="button"
            disabled={submitting}
            onClick={() => handleRespond("accept")}
            className="w-full sm:w-auto h-10 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>{lang === "bn" ? "যুক্ত করা হচ্ছে..." : "Accepting..."}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                <span>{lang === "bn" ? "আমন্ত্রণ গ্রহণ করুন (Accept)" : "Accept & Join Company"}</span>
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
