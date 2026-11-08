import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMeFn, logoutFn, updateUserAvatarFn, API_BASE } from "@/lib/rpc";
import type { PermissionSet } from "@/lib/permissions";
import { clearAuthProfile, readAuthProfile, writeAuthProfile, writeBrand } from "@/lib/local-cache";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  activated: boolean;
  role: string;
  business_id: string | null;
  business_name: string;
  business_address?: string;
  business_phone_numbers?: string;
  business_emails?: string;
  invoice_page_size?: string;
  invoice_page_width?: string;
  invoice_page_height?: string;
  invoice_font_size?: string;
  invoice_scale?: string;
  invoice_line_spacing?: string;
  invoice_terms?: string;
  logo_url: string;
  avatar_url?: string;
  permissions?: PermissionSet;
  profiles?: { id: string; name: string; created_at: string }[];
  activeProfile?: string;
  status?: string;
  frozen_reason?: string;
  subscription_expires_at?: string;
  sms_credits?: number;
  admin_whatsapp?: string;
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  login: (user: AuthUser, token?: string) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  uploadProfilePic: (file: File) => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  isUploading: false,
  uploadProgress: 0,
  login: () => {},
  logout: async () => {},
  refresh: async () => {},
  updateUser: () => {},
  uploadProfilePic: async () => {},
});

function cacheUser(u: AuthUser | null) {
  if (!u) {
    clearAuthProfile();
    return;
  }
  writeAuthProfile({
    id: u.id,
    email: u.email,
    full_name: u.full_name || (u as any).name || "Owner",
    activated: u.activated ?? (u as any).is_activated ?? true,
    role: u.role || "owner",
    business_id: u.business_id || "classic-world-default",
    business_name: u.business_name || "Classic World",
    business_address: u.business_address,
    business_phone_numbers: u.business_phone_numbers,
    business_emails: u.business_emails,
    invoice_page_size: u.invoice_page_size,
    invoice_page_width: u.invoice_page_width,
    invoice_page_height: u.invoice_page_height,
    invoice_font_size: u.invoice_font_size,
    invoice_scale: u.invoice_scale,
    invoice_line_spacing: u.invoice_line_spacing,
    invoice_terms: u.invoice_terms,
    logo_url: u.logo_url || "/logo.png",
    avatar_url: u.avatar_url,
    permissions: u.permissions,
    profiles: u.profiles,
    activeProfile: u.activeProfile,
    status: u.status,
    frozen_reason: u.frozen_reason,
    subscription_expires_at: u.subscription_expires_at,
    sms_credits: u.sms_credits,
    admin_whatsapp: u.admin_whatsapp,
  } as any);
}

function profileToUser(p: ReturnType<typeof readAuthProfile>): AuthUser | null {
  if (!p) return null;
  const anyP = p as any;
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name || anyP.name || "Owner",
    activated: p.activated ?? anyP.is_activated ?? true,
    role: p.role || "owner",
    business_id: p.business_id || "classic-world-default",
    business_name: p.business_name || "Classic World",
    business_address: anyP.business_address,
    business_phone_numbers: anyP.business_phone_numbers,
    business_emails: anyP.business_emails,
    invoice_page_size: anyP.invoice_page_size,
    invoice_page_width: anyP.invoice_page_width,
    invoice_page_height: anyP.invoice_page_height,
    invoice_font_size: anyP.invoice_font_size,
    invoice_scale: anyP.invoice_scale,
    invoice_line_spacing: anyP.invoice_line_spacing,
    invoice_terms: anyP.invoice_terms,
    logo_url: p.logo_url || "/logo.png",
    avatar_url: p.avatar_url,
    permissions: anyP.permissions,
    profiles: anyP.profiles,
    activeProfile: anyP.activeProfile,
    status: anyP.status,
    frozen_reason: anyP.frozen_reason,
    subscription_expires_at: anyP.subscription_expires_at,
    sms_credits: anyP.sms_credits,
    admin_whatsapp: anyP.admin_whatsapp,
  };
}


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { lang } = useT();

  async function checkUser() {
    try {
      const isEmp = typeof window !== "undefined" && (
        !!window.localStorage.getItem("cw_active_employee_session") ||
        window.localStorage.getItem("cw_active_session_role") === "employee"
      );
      const data = await getMeFn();
      const next = data?.user as AuthUser | null;
      if (next) {
        setUser(next);
        cacheUser(next);
        writeBrand({ name: next.business_name, logo_url: next.logo_url });
      } else if (!isEmp) {
        // Check if Firebase Auth has an active user that can re-sync the session
        let syncedFromFirebase = false;
        try {
          const { auth } = await import("@/lib/firebase");
          const fbUser = auth.currentUser;
          if (fbUser && fbUser.email && !fbUser.isAnonymous) {
            const { firebaseAuthSyncFn } = await import("@/lib/rpc");
            const syncRes = await firebaseAuthSyncFn({
              data: {
                email: fbUser.email,
                fullName: fbUser.displayName || undefined,
                photoUrl: fbUser.photoURL || undefined,
                firebaseUid: fbUser.uid,
              },
            });
            if (syncRes?.user) {
              if (syncRes.token && typeof window !== "undefined") {
                window.localStorage.setItem("auth_token", syncRes.token);
              }
              setUser(syncRes.user as AuthUser);
              cacheUser(syncRes.user as AuthUser);
              writeBrand({ name: syncRes.user.business_name, logo_url: syncRes.user.logo_url });
              syncedFromFirebase = true;
            }
          }
        } catch (_) {}

        if (!syncedFromFirebase) {
          const cached = readAuthProfile();
          if (cached) {
            setUser(profileToUser(cached));
          } else {
            setUser(null);
            clearAuthProfile();
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("auth_token");
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("Background auth check info:", err?.message || err);
      const isEmp = typeof window !== "undefined" && (
        !!window.localStorage.getItem("cw_active_employee_session") ||
        window.localStorage.getItem("cw_active_session_role") === "employee"
      );
      if (!isEmp && (err?.message?.includes("401") || err?.message?.includes("Unauthorized"))) {
        setUser(null);
        clearAuthProfile();
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("auth_token");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Restore locally cached session immediately on client mount
    try {
      const tokenExists = typeof window !== "undefined" && !!window.localStorage.getItem("auth_token");
      const cached = readAuthProfile();
      if (tokenExists && cached) {
        setUser(profileToUser(cached));
        setLoading(false);
      } else if (!tokenExists) {
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }

    void checkUser();

    // Listen to Firebase Auth state to seamlessly restore auth_token
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        const { auth } = await import("@/lib/firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
          const isEmp = typeof window !== "undefined" && (
            !!window.localStorage.getItem("cw_active_employee_session") ||
            window.localStorage.getItem("cw_active_session_role") === "employee"
          );
          const currentToken = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
          const needsJwtSync = !currentToken || !currentToken.includes(".");
          if (fbUser && fbUser.email && !fbUser.isAnonymous && needsJwtSync && !isEmp) {
            try {
              const { firebaseAuthSyncFn } = await import("@/lib/rpc");
              const res = await firebaseAuthSyncFn({
                data: {
                  email: fbUser.email,
                  fullName: fbUser.displayName || undefined,
                  photoUrl: fbUser.photoURL || undefined,
                  firebaseUid: fbUser.uid,
                },
              });
              if (res?.token) {
                window.localStorage.setItem("auth_token", res.token);
              }
              if (res?.user) {
                setUser(res.user as AuthUser);
                cacheUser(res.user as AuthUser);
                writeBrand({ name: res.user.business_name, logo_url: res.user.logo_url });
              }
            } catch (syncErr) {
              console.warn("Firebase auto-sync on auth state changed failed:", syncErr);
            }
          }
        });
      } catch (_) {}
    })();

    const handleRoleSwitch = () => {
      try {
        const cached = readAuthProfile();
        if (cached) {
          setUser(profileToUser(cached));
        }
      } catch (_) {}
      void checkUser();
    };
    window.addEventListener("hz-employee-switched", handleRoleSwitch);
    const deviceSessionTimer = window.setInterval(() => {
      if (localStorage.getItem("cw_employee_device_link_id")) void checkUser();
    }, 60000);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener("hz-employee-switched", handleRoleSwitch);
      window.clearInterval(deviceSessionTimer);
    };
  }, []);

  const login = (newUser: AuthUser, token?: string) => {
    if (token && typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", token);
    }
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("app_pin_unlocked");
    }
    setUser(newUser);
    cacheUser(newUser);
    writeBrand({ name: newUser.business_name, logo_url: newUser.logo_url });
    setLoading(false);

    // Clear browser Cache Storage on login
    if (typeof window !== "undefined" && "caches" in window) {
      window.caches.keys().then((keys) => {
        return Promise.all(keys.map((key) => window.caches.delete(key)));
      }).catch((err) => {
        console.error("Failed to clear caches on login:", err);
      });
    }
  };

  const logout = async () => {
    try { await logoutFn(); } catch { /* ignore */ }
    try {
      const { auth } = await import("@/lib/firebase");
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
    } catch (_) {}
    setUser(null);
    clearAuthProfile();
    setLoading(false);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("cw_active_employee_session");
      window.localStorage.removeItem("cw_active_session_role");
      window.localStorage.removeItem("cw_owner_backup_profile");
      window.localStorage.removeItem("cw_owner_backup_token");
      window.sessionStorage.removeItem("app_pin_unlocked");
      window.location.href = "/auth";
    }
  };

  const uploadProfilePic = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise<{ url: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              if (res.error) {
                reject(new Error(res.error));
              } else {
                resolve(res);
              }
            } catch {
              reject(new Error("Failed to parse response"));
            }
          } else {
            reject(new Error(`Upload failed with status: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.open("POST", `${API_BASE}/api/upload`);
        const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
        if (token) {
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        }
        xhr.send(formData);
      });

      const result = await uploadPromise;
      
      const updateRes = await updateUserAvatarFn({ data: { avatar_url: result.url } });
      if (updateRes.user) {
        login(updateRes.user as AuthUser);
      }
      toast.success(lang === "bn" ? "প্রোফাইল ছবি সফলভাবে আপডেট করা হয়েছে" : "Profile picture updated successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const updateUser = (patch: Partial<AuthUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      cacheUser(next);
      if (patch.logo_url || patch.business_name) {
        writeBrand({ name: next.business_name, logo_url: next.logo_url });
      }
      return next;
    });
  };

  return (
    <Ctx.Provider value={{ user, loading, isUploading, uploadProgress, login, logout, refresh: checkUser, updateUser, uploadProfilePic }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
