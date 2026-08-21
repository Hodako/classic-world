import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyToken } from "@/lib/auth-helpers";
import { requestStore } from "@/lib/request-store";
import type { PermissionSet } from "@/lib/permissions";
import { OWNER_PERMISSIONS } from "@/lib/permissions";

export type AppSession = {
  userId: string;
  ownerId: string;
  email: string;
  role: "owner" | "employee" | "superadmin";
  businessId: string | null;
  activated: boolean;
  permissions: PermissionSet;
  profileId: string;
};

export async function requireSession(requireActivated = true): Promise<AppSession> {
  const store = requestStore.getStore();
  let token = store?.token;
  const cookieStore = await cookies();

  if (!token) {
    token = cookieStore.get("token")?.value;
  }

  if (!token) {
    const headersList = await headers();
    const authHeader = headersList.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) throw new Error("Unauthorized");
  const payload = await verifyToken(token);
  if (!payload) throw new Error("Unauthorized");

  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: payload.userId } as any);
  if (!user) throw new Error("Unauthorized");

  const role = (user.role as AppSession["role"]) || "owner";
  const activated = user.activated === false ? false : Boolean(user.activated ?? true);
  if (requireActivated && !activated) throw new Error("Account not activated");

  const businessId = (user.business_id as string) || null;
  if (businessId) {
    const biz = await db.collection("businesses").findOne({ _id: businessId } as any);
    if (biz && biz.status === "suspended") {
      throw new Error("Business suspended. Please contact administrator.");
    }
  }

  const activeProfile = store?.activeProfile || cookieStore.get("active_profile")?.value || "default";
  const ownerIdBase = role === "employee" ? (user.owner_id as string) : (user._id as any as string);
  const ownerId = activeProfile === "default" ? ownerIdBase : `${ownerIdBase}:${activeProfile}`;
  const permissions = (user.permissions as PermissionSet) || (role === "owner" ? OWNER_PERMISSIONS : {});

  return {
    userId: user._id as any as string,
    ownerId,
    email: user.email as string,
    role,
    businessId,
    activated,
    permissions: role === "owner" ? OWNER_PERMISSIONS : permissions,
    profileId: activeProfile,
  };
}

export function generateLicenseKey(prefix: string) {
  const seg = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${prefix}-${seg()}-${seg()}-${seg()}`;
}
