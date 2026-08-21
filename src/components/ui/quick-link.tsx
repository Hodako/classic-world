import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface QuickLinkProps {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

export const QuickLink = React.forwardRef<HTMLAnchorElement, QuickLinkProps>(
  ({ to, icon: Icon, label }, ref) => {
    return (
      <Link
        ref={ref}
        href={to}
        className="rounded-2xl bg-card border border-border p-3 flex flex-col items-center gap-1 text-xs font-medium hover:border-primary transition"
      >
        <Icon className="size-5 text-primary" />
        <span>{label}</span>
      </Link>
    );
  }
);
QuickLink.displayName = "QuickLink";