"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getProducts, getParties, getSales, getPurchases, getExpenses } from "@/lib/queries";
import {
  Home, Package, ShoppingBag, Users, MoreHorizontal,
  LogOut, Languages, Banknote, DollarSign, Settings,
  BarChart3, Receipt, PiggyBank, ShoppingCart, Moon, Sun, FileText,
  TrendingUp, TrendingDown, Sparkles, Palette, MessageSquare, HelpCircle,
  RefreshCw, Lock, Wallet, Plus, ChevronDown, Check, Crown, User, Shirt,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { UniversalSearch } from "@/components/universal-search";
import { toast } from "sonner";
import { createProfileFn, switchProfileFn } from "@/lib/rpc";
import { clearQueryCache } from "@/lib/query-cache";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarTrigger, SidebarContent, SidebarMenu,
  SidebarMenuItem, SidebarMenuButton, SidebarGroup, SidebarGroupLabel,
  SidebarGroupContent, SidebarFooter, SidebarHeader,
} from "@/components/ui/sidebar";
import type { PermissionSet } from "@/lib/permissions";
import { canAccess, resolvePermissions } from "@/lib/permissions";
import { PermissionGuard } from "@/components/permission-guard";
import { FloatingAiChat } from "@/components/floating-ai-chat";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { ModeSwitcherDialog } from "@/components/mode-switcher-dialog";
import { useCashboxQuery } from "@/hooks/use-cashbox-query";
import { fmtMoney } from "@/lib/format";
import { cashboxBalance } from "@/lib/cashbox-utils";

import { CustomHomeIcon } from "@/components/custom-home-icon";
import { AdminPopupDialog } from "@/components/admin-popup-dialog";

type NavItem = {
  to: string;
  labelKey: "home" | "products" | "sales" | "parties" | "settings" | "more" | "online_sell" | "cash_management" | "trackback" | "expenses" | "owner_expense" | "somiti" | "new_purchase" | "invoice_generator" | "due" | "profit" | "products_buy" | "losses" | "reports_generator" | "ai_audits" | "customers" | "theme_settings" | "sms" | "employees" | "employee_shopping";
  icon: React.ElementType;
  perm?: keyof PermissionSet;
};

type NavGroup = { labelKey: "navigation" | "more" | "reports"; items: NavItem[] };

const desktopNavGroups: NavGroup[] = [
  {
    labelKey: "navigation",
    items: [
      { to: "/dashboard", labelKey: "home", icon: CustomHomeIcon, perm: "dashboard" },
      { to: "/products", labelKey: "products", icon: Package, perm: "products" },
      { to: "/sales", labelKey: "sales", icon: ShoppingBag, perm: "sales" },
      { to: "/customers", labelKey: "customers", icon: Users, perm: "parties" },
      { to: "/dues", labelKey: "due", icon: Banknote, perm: "parties" },
      { to: "/parties", labelKey: "parties", icon: Users, perm: "parties" },
      { to: "/employees", labelKey: "employees", icon: Users, perm: "sales" },
      { to: "/employees?tab=shoppings", labelKey: "employee_shopping", icon: Shirt, perm: "sales" },
    ],
  },
  {
    labelKey: "more",
    items: [
      { to: "/employees", labelKey: "employees", icon: Users, perm: "sales" },
      { to: "/employees?tab=shoppings", labelKey: "employee_shopping", icon: Shirt, perm: "sales" },
      { to: "/sms", labelKey: "sms", icon: MessageSquare, perm: "sales" },
      { to: "/invoices", labelKey: "invoice_generator", icon: FileText, perm: "sales" },
      { to: "/purchases", labelKey: "new_purchase", icon: ShoppingCart, perm: "purchases" },
      { to: "/expenses", labelKey: "expenses", icon: Receipt, perm: "expenses" },
      { to: "/owners-wallet", labelKey: "owner_expense", icon: Wallet, perm: "expenses" },
      { to: "/somiti", labelKey: "somiti", icon: PiggyBank, perm: "expenses" },
      { to: "/online-sells", labelKey: "online_sell", icon: DollarSign, perm: "sales" },
      { to: "/cash-management", labelKey: "cash_management", icon: Banknote, perm: "expenses" },
    ],
  },
  {
    labelKey: "reports",
    items: [
      { to: "/reports", labelKey: "reports_generator", icon: FileText, perm: "reports" },
      { to: "/product-analytics", labelKey: "product_analytics" as any, icon: BarChart3, perm: "reports" },
      { to: "/profits", labelKey: "profit", icon: TrendingUp, perm: "reports" },
      { to: "/losses", labelKey: "losses", icon: TrendingDown, perm: "reports" },
      { to: "/trackback", labelKey: "trackback", icon: BarChart3, perm: "reports" },
      { to: "/purchase-reports", labelKey: "products_buy", icon: ShoppingCart, perm: "reports" },
      { to: "/ai-audits", labelKey: "ai_audits", icon: Sparkles, perm: "reports" },
      { to: "/settings", labelKey: "settings", icon: Settings, perm: "settings" },
    ],
  },
];

const mobileNav: NavItem[] = [
  { to: "/dashboard", labelKey: "home", icon: CustomHomeIcon, perm: "dashboard" },
  { to: "/products", labelKey: "products", icon: Package, perm: "products" },
  { to: "/sales", labelKey: "sales", icon: ShoppingBag, perm: "sales" },
  { to: "/customers", labelKey: "customers", icon: Users, perm: "parties" },
  { to: "/more", labelKey: "more", icon: MoreHorizontal },
];

function filterNav(items: NavItem[], perms: PermissionSet) {
  return items.filter(item => !item.perm || perms[item.perm]);
}

function filterGroups(groups: NavGroup[], perms: PermissionSet): NavGroup[] {
  return groups
    .map(g => ({ ...g, items: filterNav(g.items, perms) }))
    .filter(g => g.items.length > 0);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useT();
  const { resolved, toggle } = useTheme();
  const { user, loading, logout, isUploading, uploadProgress } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "";
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { data: cashEntries = [] } = useCashboxQuery();
  const currentCashBalance = useMemo(() => cashboxBalance(cashEntries), [cashEntries]);

  useEffect(() => {
    if (!user?.activated) return;
    void qc.prefetchQuery({ queryKey: ["products"], queryFn: getProducts });
    void qc.prefetchQuery({ queryKey: ["sales"], queryFn: getSales });
    const perms = resolvePermissions(user.role, user.permissions);
    if (canAccess(perms, "parties")) {
      void qc.prefetchQuery({ queryKey: ["parties"], queryFn: getParties });
    }
    if (canAccess(perms, "purchases")) {
      void qc.prefetchQuery({ queryKey: ["purchases"], queryFn: getPurchases });
    }
    if (canAccess(perms, "expenses")) {
      void qc.prefetchQuery({ queryKey: ["expenses"], queryFn: getExpenses });
    }
  }, [user?.activated, user?.role, user?.permissions, qc]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          (active as HTMLElement).contentEditable === "true")
      ) {
        return;
      }

      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      const key = e.key.toLowerCase();
      const isCtrlK = (e.ctrlKey || e.metaKey) && key === "k";
      const isSlash = e.key === "/" && !e.shiftKey && !hasModifier;

      // Allow browser native shortcuts (Ctrl+C for copy, Ctrl+R for reload, etc.)
      if (hasModifier && !isCtrlK) {
        return;
      }

      if (key === "s" || isCtrlK || isSlash) {
        e.preventDefault();
        // Priority 1: Search inputs or filter inputs on the active page
        const searchInput = (
          document.querySelector('input[type="search"]:not([disabled])') ||
          document.querySelector('input[placeholder*="search" i]:not([disabled])') ||
          document.querySelector('input[placeholder*="খুঁজুন" i]:not([disabled])') ||
          document.querySelector('input[placeholder*="খুজুন" i]:not([disabled])') ||
          document.querySelector('input[placeholder*="Search" i]:not([disabled])') ||
          document.querySelector('#universal-search-input:not([disabled])') ||
          document.querySelector('main input:not([type="hidden"]):not([disabled])') ||
          document.querySelector('input:not([type="hidden"]):not([disabled])')
        ) as HTMLInputElement | null;

        if (searchInput) {
          searchInput.focus();
          if (typeof searchInput.select === "function") {
            searchInput.select();
          }
        } else {
          // Trigger search button or modal if present
          const searchBtn = document.querySelector('[data-search-trigger="true"], button[aria-label*="search" i]') as HTMLButtonElement | null;
          if (searchBtn) {
            searchBtn.click();
          }
        }
      } else if (key === "i") {
        e.preventDefault();
        router.push("/invoices");
      } else if (key === "p") {
        e.preventDefault();
        router.push("/products");
      } else if (key === "e") {
        e.preventDefault();
        router.push("/expenses");
      } else if (key === "r") {
        e.preventDefault();
        router.push("/reports");
      } else if (key === "b") {
        e.preventDefault();
        router.push("/purchases");
      } else if (key === "u") {
        e.preventDefault();
        router.push("/customers");
      } else if (key === "c") {
        e.preventDefault();
        router.push("/cash-management");
      } else if (key === "d") {
        e.preventDefault();
        router.push("/dashboard");
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  if (loading && !user) return <SpeedLoader />;
  if (!user) return null;

  const perms = resolvePermissions(user.role, user.permissions);
  const [activeEmpSession, setActiveEmpSession] = useState<any>(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("cw_active_employee_session") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleEmpSwitch = () => {
      try {
        setActiveEmpSession(JSON.parse(localStorage.getItem("cw_active_employee_session") || "null"));
      } catch {}
    };
    window.addEventListener("hz-employee-switched", handleEmpSwitch);
    window.addEventListener("storage", handleEmpSwitch);
    return () => {
      window.removeEventListener("hz-employee-switched", handleEmpSwitch);
      window.removeEventListener("storage", handleEmpSwitch);
    };
  }, []);

  const isEmployee = activeEmpSession ? true : user.role === "employee";
  const allowedPages = activeEmpSession?.allowedPages || (user as any).allowedPages;

  // Pages hidden from employees by default (when no explicit allowedPages list is set)
  const EMPLOYEE_DEFAULT_HIDDEN = new Set([
    "/trackback", "/profits", "/losses", "/reports", "/ai-audits",
    "/purchase-reports", "/somiti", "/parties",
    "/dues", "/customers", "/bank", "/cash-management",
  ]);

  const sidebarGroups = filterGroups(desktopNavGroups, perms).map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (isEmployee && allowedPages && Array.isArray(allowedPages) && allowedPages.length > 0) {
        return allowedPages.includes(item.to);
      }
      if (isEmployee && EMPLOYEE_DEFAULT_HIDDEN.has(item.to)) {
        return false;
      }
      return true;
    })
  })).filter(group => group.items.length > 0);

  const bottomNav = filterNav(mobileNav, perms).filter(item => {
    if (isEmployee && allowedPages && Array.isArray(allowedPages) && allowedPages.length > 0) {
      return allowedPages.includes(item.to) || item.to === "/more";
    }
    if (isEmployee && EMPLOYEE_DEFAULT_HIDDEN.has(item.to)) {
      return false;
    }
    return true;
  });

  const brandName = user.business_name || "Classic World";
  const userInitials = user.email?.slice(0, 2).toUpperCase() ?? "CW";

  // Profile / ID Switcher State
  const [modeSwitcherOpen, setModeSwitcherOpen] = useState(false);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [isSwitchingProfile, setIsSwitchingProfile] = useState(false);

  const activeProfileId = user.activeProfile || "default";
  const profiles = user.profiles && user.profiles.length > 0
    ? user.profiles
    : [{ id: "default", name: "Main ID", created_at: new Date().toISOString() }];
  const currentProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  const handleSwitchProfile = async (profileId: string) => {
    if (isSwitchingProfile) return;
    setIsSwitchingProfile(true);
    try {
      await switchProfileFn({ data: { profileId } });
      const pName = profiles.find(p => p.id === profileId)?.name || "Default";
      toast.success(lang === "bn" ? `আইডি "${pName}" এ পরিবর্তন করা হয়েছে` : `Switched to ID "${pName}"`);
      clearQueryCache();
      qc.clear();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsSwitchingProfile(false);
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim() || isSwitchingProfile) return;
    setIsSwitchingProfile(true);
    try {
      await createProfileFn({ data: { name: newProfileName.trim() } });
      toast.success(lang === "bn" ? `নতুন আইডি "${newProfileName}" তৈরি করা হয়েছে` : `New ID "${newProfileName}" created & switched`);
      setNewProfileName("");
      setCreateProfileOpen(false);
      clearQueryCache();
      qc.clear();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsSwitchingProfile(false);
    }
  };

  async function handleSignOut() {
    await logout();
    router.replace("/auth");
  }

  function isActive(to: string) {
    return pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
  }

  return (
    <div className="min-h-screen min-h-dvh bg-transparent flex w-full app-shell">
      {!isMobile && (
        <Sidebar collapsible="icon" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <SidebarHeader className="border-b border-sidebar-border px-3 py-3 space-y-2">
            <div className="flex items-center overflow-hidden group-data-[collapsible=icon]:justify-center">
              <AppLogo size="md" className="h-11 max-w-[210px]" />
            </div>
            
          </SidebarHeader>

          <SidebarContent>
            {sidebarGroups.map(group => (
              <SidebarGroup key={group.labelKey}>
                <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map(({ to, labelKey, icon: Icon }) => (
                      <SidebarMenuItem key={`${to}-${labelKey}`}>
                        <SidebarMenuButton
                          isActive={isActive(to)}
                          tooltip={t(labelKey)}
                          asChild
                        >
                          <Link href={to} prefetch={true} className="flex items-center gap-2 w-full">
                            <Icon className="icon-sm" />
                            <span className="truncate text-left">{t(labelKey)}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton size="lg" tooltip={user.email ?? "Account"}>
                      <Avatar className="size-6 shrink-0">
                        {user?.avatar_url ? (
                          <img src={user.avatar_url} className="aspect-square h-full w-full object-cover rounded-full" alt="Profile" />
                        ) : (
                          <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{userInitials}</AvatarFallback>
                        )}
                      </Avatar>
                      <span className="truncate text-sm">{user.email}</span>
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="w-52">
                    <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setLang("bn")}>বাংলা {lang === "bn" && "✓"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLang("en")}>English {lang === "en" && "✓"}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                      <LogOut className="icon-sm mr-2" />
                      {t("sign_out")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative">
        <header className="sticky top-0 inset-x-0 z-40 bg-card/98 backdrop-blur-md border-b border-border/50 shrink-0 shadow-xs" style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 0px)" }}>
          {isUploading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-200 dark:bg-zinc-800 z-50">
              <div
                className="h-full bg-gradient-to-r from-primary to-indigo-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
          <div className="flex items-center h-12 px-3 gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isMobile ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <AppLogo size="sm" className="h-8.5 max-w-[150px]" />
                </div>
              ) : (
                <>
                  <SidebarTrigger className="size-7 shrink-0" />
                  <div className="min-w-0 flex items-center gap-2">
                    <AppLogo size="sm" className="h-8.5 max-w-[170px] hidden md:block" />
                    <h1 className="font-serif font-semibold text-base truncate leading-none hidden sm:block">{brandName}</h1>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Live Cashbox Drawer Badge */}
              <Link
                href="/cash-management/cashbox"
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
                title={lang === "bn" ? "ক্যাশবক্স ব্যালেন্স (ক্লিক করে দেখুন)" : "Cashbox Balance (Click to view)"}
              >
                <Banknote className="size-3 text-emerald-600 dark:text-emerald-400" />
                <span className="font-serif font-bold">{fmtMoney(currentCashBalance)}</span>
              </Link>

              {/* Minimalist Top Owner/Employee Switcher Pill */}
              {activeEmpSession ? (
                <button
                  type="button"
                  onClick={() => setModeSwitcherOpen(true)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-700 dark:text-amber-400 text-[11px] font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
                  title={lang === "bn" ? "মোড পরিবর্তন করুন (মালিক/কর্মচারী)" : "Switch Mode (Owner/Employee)"}
                >
                  <User className="size-3 text-amber-600 dark:text-amber-400" />
                  <span className="truncate max-w-[80px] sm:max-w-[120px]">{activeEmpSession.name}</span>
                  <span className="text-[9px] opacity-70">⇄</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setModeSwitcherOpen(true)}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold transition-all cursor-pointer shrink-0 shadow-2xs"
                  title={lang === "bn" ? "মোড পরিবর্তন করুন (মালিক/কর্মচারী)" : "Switch Mode (Owner/Employee)"}
                >
                  <Crown className="size-3 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden min-[400px]:inline">{lang === "bn" ? "মালিক" : "Owner"}</span>
                  <span className="text-[9px] opacity-60">⇄</span>
                </button>
              )}
              <PWAInstallButton variant="outline" className="hidden sm:inline-flex h-8 px-2.5 text-xs" />
              <UniversalSearch role={user.role} permissions={user.permissions} />
              <Link href="/more" title={lang === "bn" ? "হেল্প ও সাপোর্ট" : "Help & Support"}>
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground">
                  <HelpCircle className="icon-sm" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" className="size-8" onClick={toggle} aria-label="Theme">
                {resolved === "dark" ? <Sun className="icon-sm" /> : <Moon className="icon-sm" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  sessionStorage.removeItem("app_pin_unlocked");
                  window.dispatchEvent(new Event("app_lock_screen"));
                }}
                className="size-8 text-amber-500 hover:bg-amber-500/10 hover:text-amber-600 rounded-lg cursor-pointer"
                title={lang === "bn" ? "স্ক্রিন লক করুন" : "Lock Screen"}
              >
                <Lock className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <Languages className="icon-sm" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setLang("bn")}>বাংলা {lang === "bn" && "✓"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLang("en")}>English {lang === "en" && "✓"}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 cursor-pointer ring-1 ring-border/50 hover:ring-primary/40 rounded-full">
                    <Avatar className="size-6">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} className="aspect-square h-full w-full object-cover rounded-full" alt="Profile" />
                      ) : (
                        <AvatarFallback className="text-[9px] font-bold bg-primary text-primary-foreground">{userInitials}</AvatarFallback>
                      )}
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-xl rounded-2xl border-border/80">
                  <div className="px-2 py-1.5 border-b border-border/60">
                    <div className="text-xs font-bold truncate text-foreground">{user.business_name || "Classic World"}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{user.email || (user as any).username || ""}</div>
                    <div className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-primary/10 text-primary border border-primary/20">
                      {user.role || "Admin / Owner"}
                    </div>
                  </div>

                  <div className="py-1">
                    <DropdownMenuItem
                      onClick={() => {
                        sessionStorage.removeItem("app_pin_unlocked");
                        window.dispatchEvent(new Event("app_lock_screen"));
                      }}
                      className="text-xs font-medium cursor-pointer"
                    >
                      <Lock className="size-3.5 mr-2 text-amber-500" />
                      {lang === "bn" ? "স্ক্রিন লক করুন" : "Lock Screen"}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => {
                        // Lock screen before entering Settings — owner must re-enter PIN
                        const pinEnabled = localStorage.getItem("app_pin_code_enabled") === "true";
                        const pinVal = localStorage.getItem("app_pin_code_val");
                        if (pinEnabled && pinVal) {
                          sessionStorage.removeItem("app_pin_unlocked");
                          window.dispatchEvent(new Event("app_lock_screen"));
                        }
                        router.push("/settings");
                      }}
                      className="text-xs font-medium cursor-pointer"
                    >
                      <Settings className="size-3.5 mr-2 text-muted-foreground" />
                      {lang === "bn" ? "সেটিংস ও নিরাপত্তা" : "Settings & Security"}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => setModeSwitcherOpen(true)}
                      className="text-xs font-medium cursor-pointer"
                    >
                      <RefreshCw className="size-3.5 mr-2 text-primary" />
                      {lang === "bn" ? "মোড / আইডি পরিবর্তন" : "Switch Mode / ID"}
                    </DropdownMenuItem>
                  </div>

                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive text-xs font-medium cursor-pointer">
                    <LogOut className="size-3.5 mr-2" />
                    {t("sign_out")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain pt-3 pb-16 md:pb-4 ${isMobile ? "px-3" : "px-6 py-4"}`}>
          <div className={isMobile ? "w-full max-w-lg mx-auto" : "w-full max-w-screen-2xl mx-auto"}>
            <PermissionGuard>
              {children}
            </PermissionGuard>
          </div>
          <div className="md:hidden mobile-bottom-spacer" aria-hidden />
          <ModeSwitcherDialog open={modeSwitcherOpen} onOpenChange={setModeSwitcherOpen} />
        </main>
      </div>

      {bottomNav.length > 0 && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-card/98 backdrop-blur-md border-t border-border/80 shadow-2xl safe-area-pb mobile-tab-bar select-none" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 6px)" }}>
          <div
            className="grid h-14 max-w-lg mx-auto w-full"
            style={{ gridTemplateColumns: `repeat(${bottomNav.length}, minmax(0, 1fr))` }}
          >
            {bottomNav.map(({ to, labelKey, icon: Icon }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  href={to}
                  prefetch={true}
                  className={`flex flex-col items-center justify-center py-1 gap-0.5 text-[10px] font-medium transition-colors active:scale-95 ${
                    active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`flex items-center justify-center px-3 py-0.5 rounded-full transition-all duration-150 ${
                    active ? "bg-primary/15 text-primary" : "text-muted-foreground/80"
                  }`}>
                    {labelKey === "home" ? (
                      <CustomHomeIcon className="size-5 shrink-0" />
                    ) : (
                      <Icon className="size-5 shrink-0" />
                    )}
                  </div>
                  <span className="leading-tight truncate max-w-[64px] text-center">{t(labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      {!isMobile && (pathname === "/dashboard" || pathname === "/") && (
        <FloatingAiChat />
      )}
      <AdminPopupDialog />

      {/* Create New Profile / ID Modal Dialog */}
      <Dialog open={createProfileOpen} onOpenChange={setCreateProfileOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Plus className="size-4 text-indigo-600" />
              {lang === "bn" ? "নতুন আইডি / প্রোফাইল তৈরি করুন" : "Create New ID / Branch Profile"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProfile} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {lang === "bn" ? "আইডি / প্রোফাইলের নাম" : "ID / Profile Name"}
              </Label>
              <Input
                required
                placeholder={lang === "bn" ? "যেমন: শাখা ২, ব্রাঞ্চ বা শোরুম..." : "e.g. Branch 2, Showroom..."}
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateProfileOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isSwitchingProfile} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                {isSwitchingProfile ? (lang === "bn" ? "তৈরি হচ্ছে..." : "Creating...") : (lang === "bn" ? "তৈরি করুন" : "Create ID")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
