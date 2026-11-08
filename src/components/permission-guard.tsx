"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, permissionForPath, resolvePermissions } from "@/lib/permissions";

/** Redirects employees away from routes they lack permission for. */
export function PermissionGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname() || "";
  const router = useRouter();

  const perms = user ? resolvePermissions(user.role, user.permissions) : null;
  const required = permissionForPath(pathname);
  const isEmployee = user?.role === "employee";
  const EMPLOYEE_CORE_ROUTES = [
    "/dashboard",
    "/sales",
    "/products",
    "/invoices",
    "/labels",
    "/printer-settings",
    "/cash-management",
    "/expenses",
    "/employee-hub",
    "/employees",
  ];
  const isCoreEmployeeRoute = isEmployee && EMPLOYEE_CORE_ROUTES.some(p => pathname === p || pathname.startsWith(p + "/"));
  const allowed = !user || isCoreEmployeeRoute || ( (!required || canAccess(perms ?? undefined, required)) && (!isEmployee || (!pathname.startsWith("/somiti") && !pathname.startsWith("/parties") && !pathname.startsWith("/customers") && !pathname.startsWith("/dues") && !pathname.startsWith("/settings"))) );

  useEffect(() => {
    if (!allowed) {
      router.replace("/dashboard");
    }
  }, [allowed, router]);

  if (!allowed) return null;

  return <>{children}</>;
}
