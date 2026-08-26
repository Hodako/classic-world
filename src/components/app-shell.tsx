"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getProducts, getParties, getSales, getPurchases, getExpenses } from "@/lib/queries";
import {
  Home, Package, ShoppingBag, Users, MoreHorizontal,
  LogOut, Languages, Banknote, DollarSign, Settings,
  BarChart3, Receipt, PiggyBank, ShoppingCart, Moon, Sun, FileText,
  TrendingUp, TrendingDown, Sparkles, Palette, MessageSquare, HelpCircle,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { UniversalSearch } from "@/components/universal-search";
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

import { CustomHomeIcon } from "@/components/custom-home-icon";
import { AdminPopupDialog } from "@/components/admin-popup-dialog";

type NavItem = {
  to: string;
  labelKey: "home" | "products" | "sales" | "parties" | "settings" | "more" | "online_sell" | "cash_management" | "trackback" | "expenses" | "somiti" | "new_purchase" | "invoice_generator" | "due" | "profit" | "products_buy" | "losses" | "reports_generator" | "ai_audits" | "customers" | "theme_settings" | "sms";
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
    ],
  },
  {
    labelKey: "more",
    items: [
      { to: "/sms", labelKey: "sms", icon: MessageSquare, perm: "sales" },
      { to: "/invoices", labelKey: "invoice_generator", icon: FileText, perm: "sales" },
      { to: "/purchases", labelKey: "new_purchase", icon: ShoppingCart, perm: "purchases" },
      { to: "/expenses", labelKey: "expenses", icon: Receipt, perm: "expenses" },
      { to: "/somiti", labelKey: "somiti", icon: PiggyBank, perm: "expenses" },
      { to: "/online-sells", labelKey: "online_sell", icon: DollarSign, perm: "sales" },
      { to: "/cash-management", labelKey: "cash_management", icon: Banknote, perm: "expenses" },
    ],
  },
  {
    labelKey: "reports",
    items: [
      { to: "/reports", labelKey: "reports_generator", icon: FileText, perm: "reports" },
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
  const isEmployee = user.role === "employee";
  const sidebarGroups = filterGroups(desktopNavGroups, perms).map(group => ({
    ...group,
    items: group.items.filter(item => !(isEmployee && (item.to === "/somiti" || item.to === "/parties" || item.to === "/dues" || item.to === "/customers")))
  })).filter(group => group.items.length > 0);
  const bottomNav = filterNav(mobileNav, perms).filter(item => !(isEmployee && (item.to === "/somiti" || item.to === "/parties" || item.to === "/dues" || item.to === "/customers")));
  const brandName = user.business_name || "Classic World";
  const userInitials = user.email?.slice(0, 2).toUpperCase() ?? "CW";

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
          <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
            <div className="flex items-center overflow-hidden group-data-[collapsible=icon]:justify-center">
              <AppLogo size="md" className="h-9 max-w-[180px]" />
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
            <div className="text-[9px] text-center text-muted-foreground pb-2 pt-1 group-data-[collapsible=icon]:hidden border-t border-sidebar-border/30">
              Powered by Dream Fashion
            </div>
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
                <div className="flex items-center min-w-0">
                  <AppLogo size="sm" className="h-8 max-w-[150px]" />
                </div>
              ) : (
                <>
                  <SidebarTrigger className="size-7 shrink-0" />
                  <div className="min-w-0 flex flex-col justify-center">
                    <h1 className="font-serif font-semibold text-base truncate leading-none hidden sm:block">{brandName}</h1>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
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
              {!isMobile && (
                <span className="text-[10px] text-muted-foreground mr-1 hidden lg:block">
                  {new Date().toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}
                </span>
              )}
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
                  <Button variant="ghost" size="icon" className="size-8">
                    <Avatar className="size-5">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} className="aspect-square h-full w-full object-cover rounded-full" alt="Profile" />
                      ) : (
                        <AvatarFallback className="text-[9px] bg-primary text-primary-foreground">{userInitials}</AvatarFallback>
                      )}
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs max-w-[180px] truncate">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive text-xs">
                    <LogOut className="icon-sm mr-2" />
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
      <FloatingAiChat />
      <AdminPopupDialog />
    </div>
  );
}
