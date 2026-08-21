export type PermissionSet = {
  dashboard: boolean;
  products: boolean;
  sales: boolean;
  parties: boolean;
  purchases: boolean;
  expenses: boolean;
  cashbox: boolean;
  settings: boolean;
  reports: boolean;
};

export const OWNER_PERMISSIONS: PermissionSet = {
  dashboard: true,
  products: true,
  sales: true,
  parties: true,
  purchases: true,
  expenses: true,
  cashbox: true,
  settings: true,
  reports: true,
};

export const DEFAULT_EMPLOYEE_PERMISSIONS: PermissionSet = {
  dashboard: true,
  products: true,
  sales: true,
  parties: false,
  purchases: false,
  expenses: false,
  cashbox: false,
  settings: false,
  reports: false,
};

/** Resolve effective permissions for the current user. */
export function resolvePermissions(role: string, permissions?: PermissionSet): PermissionSet {
  if (role === "owner") return OWNER_PERMISSIONS;
  return permissions ?? DEFAULT_EMPLOYEE_PERMISSIONS;
}

/** Check if user permissions allow a module. */
export function canAccess(permissions: PermissionSet | undefined, module: keyof PermissionSet) {
  return permissions?.[module] ?? false;
}

/** Route prefix → required permission (employees without access are redirected). */
export const ROUTE_PERMISSIONS: { prefix: string; perm: keyof PermissionSet }[] = [
  { prefix: "/parties", perm: "parties" },
  { prefix: "/customers", perm: "parties" },
  { prefix: "/dues", perm: "parties" },
  { prefix: "/expenses", perm: "expenses" },
  { prefix: "/trackback", perm: "reports" },
  { prefix: "/cash-management", perm: "cashbox" },
  { prefix: "/somiti", perm: "expenses" },
  { prefix: "/settings", perm: "settings" },
  { prefix: "/purchases", perm: "purchases" },
];

/** Return required permission for a pathname, if any. */
export function permissionForPath(pathname: string): keyof PermissionSet | null {
  const match = ROUTE_PERMISSIONS.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return match?.perm ?? null;
}
