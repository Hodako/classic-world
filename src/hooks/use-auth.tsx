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
    full_name: u.full_name,
    activated: u.activated,
    role: u.role,
    business_id: u.business_id,
    business_name: u.business_name,
    logo_url: u.logo_url,
    avatar_url: u.avatar_url,
    profiles: u.profiles,
    activeProfile: u.activeProfile,
  } as any);
}

function profileToUser(p: ReturnType<typeof readAuthProfile>): AuthUser | null {
  if (!p) return null;
  return {
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    activated: p.activated,
    role: p.role,
    business_id: p.business_id,
    business_name: p.business_name,
    logo_url: p.logo_url,
    avatar_url: p.avatar_url,
    profiles: (p as any).profiles,
    activeProfile: (p as any).activeProfile,
  };
}

function getInitialUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const cached = readAuthProfile();
  const tokenExists = !!window.localStorage.getItem("auth_token");
  if (cached && tokenExists) {
    return profileToUser(cached);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getInitialUser);
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    const tokenExists = !!window.localStorage.getItem("auth_token");
    const cached = readAuthProfile();
    if (tokenExists && cached) return false;
    if (!tokenExists) return false;
    return true;
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { lang } = useT();

  async function checkUser() {
    try {
      const data = await getMeFn();
      const next = data.user as AuthUser | null;
      if (next) {
        setUser(next);
        cacheUser(next);
        writeBrand({ name: next.business_name, logo_url: next.logo_url });
      } else if (!window.localStorage.getItem("auth_token")) {
        setUser(null);
        clearAuthProfile();
      }
    } catch (err: any) {
      console.warn("Background auth check info:", err?.message || err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkUser();

    // Listen to Firebase Auth state to seamlessly restore auth_token
    let unsubscribe: (() => void) | null = null;
    (async () => {
      try {
        const { auth } = await import("@/lib/firebase");
        const { onAuthStateChanged } = await import("firebase/auth");
        unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
          if (fbUser && fbUser.email && !window.localStorage.getItem("auth_token")) {
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
                if (res.user) {
                  setUser(res.user as AuthUser);
                  cacheUser(res.user as AuthUser);
                  writeBrand({ name: res.user.business_name, logo_url: res.user.logo_url });
                }
              }
            } catch (syncErr) {
              console.warn("Firebase auto-sync on auth state changed failed:", syncErr);
            }
          }
        });
      } catch (_) {}
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const login = (newUser: AuthUser, token?: string) => {
    if (token && typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", token);
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("active_profile");
    }
    setUser(null);
    clearAuthProfile();
    setLoading(false);
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
