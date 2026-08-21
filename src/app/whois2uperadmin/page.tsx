"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  superAdminLoginFn,
  superAdminLogoutFn,
  superAdminCheckFn,
  generatePlatformLicenseFn,
  listPlatformLicensesFn,
  listBusinessesFn,
  listAllUsersFn,
  deleteLicenseFn,
  getPlatformStatsFn,
  getPlatformActivitiesFn,
  suspendBusinessFn,
  deleteBusinessFn,
  impersonateUserFn,
  deleteUserFn,
  changeUserPasswordFn,
  changeSuperAdminPasswordFn,
  resetSalesFn,
  resetSomitiFn,
  resetExpensesFn,
} from "@/lib/rpc-admin";
import {
  Trash2,
  RotateCcw,
  Activity,
  Users,
  Store,
  Box,
  TrendingUp,
  Ban,
  CheckCircle,
  RefreshCw,
  Search,
  Key,
  Shield,
  Clock,
  ShieldAlert,
  LogOut,
  Copy,
  LogIn,
  Lock,
} from "lucide-react";
import { SpeedLoader } from "@/components/speed-loader";
import { fmtDateTime } from "@/lib/format";

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const auth = useQuery({ queryKey: ["super-admin"], queryFn: superAdminCheckFn });
  
  const [username, setUsername] = useState("superadmin");
  const [password, setPassword] = useState("");
  const [limit, setLimit] = useState("5");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "businesses" | "users" | "licenses" | "settings">("feed");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Safe cascade delete modal state — Business
  const [bizToDelete, setBizToDelete] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Safe delete modal state — User
  const [userToDelete, setUserToDelete] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [userDeleteConfirmText, setUserDeleteConfirmText] = useState("");

  // User Password Change modal state
  const [userForPasswordChange, setUserForPasswordChange] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  // Super Admin Password Change modal state
  const [superAdminPassOpen, setSuperAdminPassOpen] = useState(false);
  const [superAdminCurrentPass, setSuperAdminCurrentPass] = useState("");
  const [superAdminNewPass, setSuperAdminNewPass] = useState("");
  const [superAdminPassBusy, setSuperAdminPassBusy] = useState(false);

  // Reset Business data modal state
  const [bizForReset, setBizForReset] = useState<{ id: string; name: string } | null>(null);
  const [resetType, setResetType] = useState<"sales" | "somiti" | "expenses" | null>(null);
  const [confirmResetText, setConfirmResetText] = useState("");

  const stats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: getPlatformStatsFn,
    enabled: auth.data?.authenticated === true,
  });

  const activities = useQuery({
    queryKey: ["platform-activities"],
    queryFn: getPlatformActivitiesFn,
    enabled: auth.data?.authenticated === true,
    refetchInterval: 10000, // Poll every 10 seconds for real-time surveillance feel!
  });

  const licenses = useQuery({
    queryKey: ["platform-licenses"],
    queryFn: listPlatformLicensesFn,
    enabled: auth.data?.authenticated === true,
  });

  const businesses = useQuery({
    queryKey: ["businesses-admin"],
    queryFn: listBusinessesFn,
    enabled: auth.data?.authenticated === true,
  });

  const users = useQuery({
    queryKey: ["users-admin"],
    queryFn: listAllUsersFn,
    enabled: auth.data?.authenticated === true,
  });

  const handleRefreshAll = () => {
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-activities"] });
    qc.invalidateQueries({ queryKey: ["platform-licenses"] });
    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
    qc.invalidateQueries({ queryKey: ["users-admin"] });
    toast.success("Surveillance dashboard updated!");
  };

  if (auth.isLoading) return <SpeedLoader />;

  if (!auth.data?.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="glass-card w-full max-w-sm p-6 space-y-4 border-primary/20">
          <div className="flex flex-col items-center space-y-2">
            <div className="p-3 bg-primary/10 rounded-full text-primary">
              <Shield className="size-8 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-center">Classic World Super Admin</h1>
            <p className="text-xs text-muted-foreground text-center">Enter your administrator credentials to access surveillance</p>
          </div>
          
          <form
            onSubmit={async e => {
              e.preventDefault();
              setBusy(true);
              try {
                await superAdminLoginFn({ data: { username, password } });
                qc.invalidateQueries({ queryKey: ["super-admin"] });
              } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : "Login failed");
              } finally {
                setBusy(false);
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label className="text-xs">Username</Label>
              <Input placeholder="superadmin" value={username} onChange={e => setUsername(e.target.value)} className="beveled-card bg-muted/40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Password</Label>
              <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="beveled-card bg-muted/40" />
            </div>
            <Button type="submit" className="w-full beveled-button" disabled={busy}>
              {busy ? "Authorizing..." : "Access Console"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Filter lists based on search query
  const filteredBiz = (businesses.data ?? []).filter((b: any) => {
    const name = String(b.name || "").toLowerCase();
    const email = String(b.owner_email || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const filteredLicenses = (licenses.data ?? []).filter((l: any) => {
    const id = String(l.id || "").toLowerCase();
    const note = String(l.note || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return id.includes(query) || note.includes(query);
  });

  const filteredUsers = (users.data ?? []).filter((u: any) => {
    const name = String(u.full_name || "").toLowerCase();
    const email = String(u.email || "").toLowerCase();
    const role = String(u.role || "").toLowerCase();
    const biz = String(u.business_name || "").toLowerCase();
    const id = String(u.id || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query) || email.includes(query) || role.includes(query) || biz.includes(query) || id.includes(query);
  });

  const selectedBizToDelete = (businesses.data ?? []).find((b: any) => b.id === bizToDelete);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/40 backdrop-blur-md p-6 rounded-2xl border border-border/60 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-500">
            <Shield className="size-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">HZ Surveillance Center</h1>
            <p className="text-sm text-muted-foreground">Global Platform Intelligence & Business Audit</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <span className="hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mr-1">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Live Surveillance Syncing
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSuperAdminPassOpen(true)}
            className="beveled-button border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            title="Change Super Admin Password"
          >
            <Lock className="size-3.5 mr-1.5" />
            Admin PW
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            className="beveled-button"
          >
            <RefreshCw className="size-4 mr-1.5" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await superAdminLogoutFn();
              qc.invalidateQueries({ queryKey: ["super-admin"] });
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4 mr-1.5" />
            Logout
          </Button>
        </div>
      </div>

      {/* KPI METRICS GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <Card className="glass-card p-4 space-y-2 border-border/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Businesses</span>
            <Store className="size-4.5 text-primary/80" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold tracking-tight">
              {stats.isLoading ? "…" : stats.data?.totalBusinesses ?? 0}
            </div>
            <p className="text-[10px] text-muted-foreground">Registered Tenants</p>
          </div>
        </Card>

        <Card className="glass-card p-4 space-y-2 border-border/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Users</span>
            <Users className="size-4.5 text-blue-500/80" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold tracking-tight">
              {stats.isLoading ? "…" : stats.data?.totalUsers ?? 0}
            </div>
            <p className="text-[10px] text-muted-foreground">Staff & Owners</p>
          </div>
        </Card>

        <Card className="glass-card p-4 space-y-2 border-border/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Products</span>
            <Box className="size-4.5 text-purple-500/80" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold tracking-tight">
              {stats.isLoading ? "…" : stats.data?.totalProducts ?? 0}
            </div>
            <p className="text-[10px] text-muted-foreground">Items Cataloged</p>
          </div>
        </Card>

        <Card className="glass-card p-4 space-y-2 border-border/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Gross Sales</span>
            <TrendingUp className="size-4.5 text-emerald-500/80" />
          </div>
          <div className="space-y-0.5">
            <div className="text-2xl font-bold tracking-tight text-emerald-500 font-mono">
              ৳{stats.isLoading ? "…" : (stats.data?.totalSalesVolume ?? 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground">Gross Receipts</p>
          </div>
        </Card>

        <Card className="glass-card p-4 space-y-2 border-border/40 col-span-2 md:col-span-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Platform Net Profit</span>
            <TrendingUp className={`size-4.5 ${(stats.data?.totalPlatformNetProfit ?? 0) >= 0 ? "text-emerald-500/80" : "text-destructive/80"}`} />
          </div>
          <div className="space-y-0.5">
            <div className={`text-2xl font-bold tracking-tight font-mono ${(stats.data?.totalPlatformNetProfit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              ৳{stats.isLoading ? "…" : (stats.data?.totalPlatformNetProfit ?? 0).toLocaleString()}
            </div>
            <p className="text-[10px] text-muted-foreground">Adjusted P&L</p>
          </div>
        </Card>
      </div>

      {/* SEARCH AND TABS FILTER WRAPPER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-3">
        {/* TABS CONTAINER */}
        <div className="flex gap-1 overflow-x-auto">
          <button
            onClick={() => { setActiveTab("feed"); setSearchQuery(""); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "feed"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Activity className="size-4" />
            Surveillance Feed
          </button>
          <button
            onClick={() => { setActiveTab("businesses"); setSearchQuery(""); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "businesses"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Store className="size-4" />
            Businesses ({businesses.data?.length ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab("users"); setSearchQuery(""); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "users"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Users className="size-4" />
            Users ({users.data?.length ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab("licenses"); setSearchQuery(""); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "licenses"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Key className="size-4" />
            Platform Licenses ({licenses.data?.length ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab("settings"); setSearchQuery(""); }}
            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 transition-all ${
              activeTab === "settings"
                ? "bg-primary/10 text-primary border border-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Shield className="size-4" />
            Admin Settings
          </button>
        </div>

        {/* SEARCH BOX FOR FILTERABLE TABS */}
        {activeTab !== "feed" && activeTab !== "settings" && (
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={
                activeTab === "businesses" ? "Filter by name or email..." :
                activeTab === "users" ? "Filter by name, email, role, or ID..." :
                "Filter license code..."
              }
              className="pl-9 bg-muted/20 border-border/40 focus:border-primary/50"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* TAB CONTENT AREAS */}
      <div className="space-y-4">
        
        {/* 1. SURVEILLANCE FEED */}
        {activeTab === "feed" && (
          <Card className="glass-card p-6 space-y-4 border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-5 text-emerald-500 animate-pulse" />
                <h2 className="font-semibold text-base">Real-Time Platform Audit Logs</h2>
              </div>
              <span className="text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <Clock className="size-3.5" />
                Auto-refreshing every 10s
              </span>
            </div>

            {activities.isLoading ? (
              <div className="py-20 text-center text-muted-foreground space-y-2">
                <RefreshCw className="size-8 animate-spin mx-auto text-primary" />
                <p className="text-sm">Polling global feeds...</p>
              </div>
            ) : (activities.data ?? []).length === 0 ? (
              <div className="py-20 text-center text-muted-foreground border border-dashed rounded-xl">
                No recent activity observed on the platform.
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {(activities.data ?? []).map((event: any) => {
                  let badgeColor = "bg-primary/10 text-primary border-primary/20";
                  if (event.type === "sale") badgeColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                  if (event.type === "product") badgeColor = "bg-blue-500/10 text-blue-500 border-blue-500/20";
                  if (event.type === "expense") badgeColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                  if (event.type === "business") badgeColor = "bg-purple-500/10 text-purple-500 border-purple-500/20";
                  if (event.type === "user") badgeColor = "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";

                  return (
                    <div
                      key={event.id}
                      className="p-3 bg-muted/15 border-l-4 border-border rounded-r-xl flex items-start justify-between gap-3 text-sm hover:bg-muted/30 transition-colors"
                      style={{
                        borderLeftColor:
                          event.type === "sale" ? "#10b981" :
                          event.type === "product" ? "#3b82f6" :
                          event.type === "expense" ? "#f59e0b" :
                          event.type === "business" ? "#a855f7" :
                          event.type === "user" ? "#06b6d4" : "var(--border)"
                      }}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                            {event.title}
                          </span>
                          <span className="font-semibold text-xs text-muted-foreground">
                            @ {event.businessName}
                          </span>
                        </div>
                        <p className="font-medium text-foreground">{event.detail}</p>
                        {event.type === "user" && (
                          <div className="flex items-center gap-1.5 pt-1">
                            <span
                              className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20 cursor-pointer hover:bg-cyan-500/20 transition-all flex items-center gap-1"
                              onClick={() => {
                                navigator.clipboard.writeText(event.id);
                                toast.success(`User ID copied: ${event.id}`);
                              }}
                              title="Click to copy User ID"
                            >
                              <Copy className="size-2.5" />
                              User ID: {event.id}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 font-mono">
                        {fmtDateTime(event.time)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* 2. BUSINESSES LIST & OPERATION SWEEP */}
        {activeTab === "businesses" && (
          <Card className="glass-card overflow-hidden border-border/40">
            {businesses.isLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <RefreshCw className="size-8 animate-spin mx-auto text-primary mb-2" />
                Loading tenants list...
              </div>
            ) : filteredBiz.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground border-t">
                No matching businesses found.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/35 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="p-4">Business Detail</th>
                        <th className="p-4">Owner & Email</th>
                        <th className="p-4 text-center">Resources Logged</th>
                        <th className="p-4">Registered On</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {(filteredBiz as any[]).map((b: any) => {
                        const isSuspended = b.status === "suspended";
                        return (
                          <tr key={b.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-foreground text-sm">{b.name}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    ID: {b.id.slice(0, 8)}…
                                  </span>
                                  {isSuspended ? (
                                    <span className="text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.2 rounded">
                                      SUSPENDED
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                      ACTIVE
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-foreground">{b.owner_email}</span>
                                <span className="text-xs font-mono">Limit: {b.employee_limit} Staff</span>
                                {b.owner_id && (
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span
                                      className="text-[10px] text-muted-foreground hover:text-primary transition-all font-mono flex items-center gap-1 cursor-pointer"
                                      onClick={() => {
                                        navigator.clipboard.writeText(b.owner_id);
                                        toast.success(`Owner ID copied: ${b.owner_id}`);
                                      }}
                                      title="Click to copy Owner User ID"
                                    >
                                      <Copy className="size-2.5" />
                                      Owner ID: {b.owner_id.slice(0, 8)}…
                                    </span>
                                    <button
                                      type="button"
                                      className="text-[10px] text-primary hover:text-primary-foreground font-semibold flex items-center gap-0.5 bg-primary/15 hover:bg-primary px-1.5 py-0.5 rounded transition-all cursor-pointer"
                                      onClick={async () => {
                                        try {
                                          await impersonateUserFn({ data: { userId: b.owner_id } });
                                          toast.success(`Logging in as ${b.owner_email}...`);
                                          window.location.href = "/dashboard";
                                        } catch (err: any) {
                                          toast.error(err.message || "Failed to login as owner");
                                        }
                                      }}
                                      title="Login to this Owner's dashboard"
                                    >
                                      <LogIn className="size-2.5" />
                                      Login As Owner
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-4 text-xs font-medium text-muted-foreground">
                                <div className="flex flex-col">
                                  <span className="text-foreground font-bold font-mono">{b.product_count ?? 0}</span>
                                  <span>Products</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-foreground font-bold font-mono">{b.sale_count ?? 0}</span>
                                  <span>Sales</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground text-xs font-mono">
                              {fmtDateTime(b.created_at)}
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant={isSuspended ? "default" : "outline"}
                                  className={`h-8 font-semibold beveled-button ${
                                    isSuspended 
                                      ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                                      : "text-amber-500 hover:text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                                  }`}
                                  onClick={async () => {
                                    try {
                                      await suspendBusinessFn({ data: { businessId: b.id, suspend: !isSuspended } });
                                      toast.success(isSuspended ? `Reactivated "${b.name}"` : `Suspended "${b.name}"`);
                                      qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                                    } catch (err: any) {
                                      toast.error(err.message || "Operation failed");
                                    }
                                  }}
                                >
                                  {isSuspended ? (
                                    <>
                                      <CheckCircle className="size-3.5 mr-1" />
                                      Activate
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="size-3.5 mr-1" />
                                      Suspend
                                    </>
                                  )}
                                </Button>
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-amber-500 hover:bg-amber-500/10"
                                  onClick={() => {
                                    setBizForReset({ id: b.id, name: b.name });
                                    setResetType(null);
                                    setConfirmResetText("");
                                  }}
                                  title="Reset sells, samity, or expenses"
                                >
                                  <RotateCcw className="size-3.5" />
                                </Button>

                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    setBizToDelete(b.id);
                                    setDeleteConfirmText("");
                                  }}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card List View */}
                <div className="block md:hidden divide-y divide-border/40">
                  {(filteredBiz as any[]).map((b: any) => {
                    const isSuspended = b.status === "suspended";
                    return (
                      <div key={b.id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <span className="font-bold text-foreground text-sm">{b.name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-muted-foreground font-mono">
                                ID: {b.id.slice(0, 8)}…
                              </span>
                              {isSuspended ? (
                                <span className="text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.2 rounded">
                                  SUSPENDED
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {fmtDateTime(b.created_at).split(" ")[0]}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex justify-between items-center">
                            <span>Owner:</span>
                            <span className="font-semibold text-foreground text-right truncate max-w-[200px]">
                              {b.owner_email}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Staff Limit:</span>
                            <span className="font-mono text-foreground">{b.employee_limit} Staff</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Resources:</span>
                            <span className="text-foreground">
                              <strong className="font-mono">{b.product_count ?? 0}</strong> products · <strong className="font-mono">{b.sale_count ?? 0}</strong> sales
                            </span>
                          </div>
                        </div>

                        {b.owner_id && (
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            <span
                              className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/80 hover:text-primary transition-all font-mono flex items-center gap-1 cursor-pointer"
                              onClick={() => {
                                navigator.clipboard.writeText(b.owner_id);
                                toast.success(`Owner ID copied: ${b.owner_id}`);
                              }}
                            >
                              <Copy className="size-2.5" />
                              Copy Owner ID
                            </span>
                            <button
                              type="button"
                              className="text-[10px] text-primary bg-primary/15 hover:bg-primary hover:text-primary-foreground font-semibold flex items-center gap-1 px-2 py-0.5 rounded transition-all cursor-pointer"
                              onClick={async () => {
                                try {
                                  await impersonateUserFn({ data: { userId: b.owner_id } });
                                  toast.success(`Logging in as ${b.owner_email}...`);
                                  window.location.href = "/dashboard";
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to login as owner");
                                }
                              }}
                            >
                              <LogIn className="size-2.5" />
                              Login As Owner
                            </button>
                          </div>
                        )}

                        <div className="flex justify-end gap-1.5 pt-2 border-t border-border/20">
                          <Button
                            size="sm"
                            variant={isSuspended ? "default" : "outline"}
                            className={`h-8 text-xs font-semibold beveled-button ${
                              isSuspended 
                                ? "bg-emerald-500 hover:bg-emerald-600 text-white" 
                                : "text-amber-500 hover:text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                            }`}
                            onClick={async () => {
                              try {
                                await suspendBusinessFn({ data: { businessId: b.id, suspend: !isSuspended } });
                                toast.success(isSuspended ? `Reactivated "${b.name}"` : `Suspended "${b.name}"`);
                                qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                              } catch (err: any) {
                                toast.error(err.message || "Operation failed");
                              }
                            }}
                          >
                            {isSuspended ? (
                              <>
                                <CheckCircle className="size-3.5 mr-1" />
                                Activate
                              </>
                            ) : (
                              <>
                                <Ban className="size-3.5 mr-1" />
                                Suspend
                              </>
                            )}
                          </Button>
                          
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-amber-500 hover:bg-amber-500/10 border border-border/40"
                            onClick={() => {
                              setBizForReset({ id: b.id, name: b.name });
                              setResetType(null);
                              setConfirmResetText("");
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive hover:bg-destructive/10 border border-border/40"
                            onClick={() => {
                              setBizToDelete(b.id);
                              setDeleteConfirmText("");
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        )}

        {/* 3. USERS LIST */}
        {activeTab === "users" && (
          <Card className="glass-card overflow-hidden border-border/40">
            {users.isLoading ? (
              <div className="py-20 text-center text-muted-foreground">
                <RefreshCw className="size-8 animate-spin mx-auto text-primary mb-2" />
                Loading users list...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground border-t">
                No matching users found.
              </div>
            ) : (
              <>
                {/* Desktop View Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/35 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="p-4">User Detail</th>
                        <th className="p-4">Role & Business</th>
                        <th className="p-4">Registered On</th>
                        <th className="p-4">Password</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {(filteredUsers as any[]).map((u: any) => {
                        const isOwner = u.role === "owner";
                        const isActivated = u.activated;
                        return (
                          <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-foreground text-sm">
                                  {u.full_name || "Unnamed User"}
                                </span>
                                <span className="text-xs text-muted-foreground">{u.email}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                    isOwner 
                                      ? "bg-purple-500/10 text-purple-500 border-purple-500/20" 
                                      : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                  }`}>
                                    {isOwner ? "Owner" : "Employee"}
                                  </span>
                                  {isActivated ? (
                                    <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                      Activated
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.2 rounded">
                                      Pending License
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">{u.business_name}</span>
                              </div>
                            </td>
                            <td className="p-4 text-muted-foreground text-xs font-mono">
                              {u.created_at ? fmtDateTime(u.created_at) : "N/A"}
                            </td>
                            <td className="p-4">
                              <span className="text-xs font-mono bg-muted/80 px-2 py-1 rounded border border-border/50 text-foreground font-medium select-all">
                                {u.plain_password}
                              </span>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span
                                  className="inline-flex items-center gap-1.5 text-xs font-mono bg-muted/65 text-foreground hover:text-primary border border-border/80 px-2.5 py-1 rounded-lg cursor-pointer hover:bg-muted/80 transition-all font-semibold"
                                  onClick={() => {
                                    navigator.clipboard.writeText(u.id);
                                    toast.success(`User ID copied: ${u.id}`);
                                  }}
                                  title="Click to copy User ID"
                                >
                                  <Copy className="size-3.5 text-muted-foreground/80" />
                                  <span className="select-all">{u.id.slice(0, 8)}…</span>
                                </span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 beveled-button text-xs font-semibold cursor-pointer"
                                  onClick={async () => {
                                    try {
                                      await impersonateUserFn({ data: { userId: u.id } });
                                      toast.success(`Logging in as ${u.email}...`);
                                      window.location.href = "/dashboard";
                                    } catch (err: any) {
                                      toast.error(err.message || "Failed to log in");
                                    }
                                  }}
                                  title="Log in as this user"
                                >
                                  <LogIn className="size-3.5 mr-1" />
                                  Login As
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 beveled-button text-xs font-semibold cursor-pointer"
                                  onClick={() => {
                                    setUserForPasswordChange({ id: u.id, email: u.email });
                                    setNewPassword("");
                                  }}
                                  title="Reset user password"
                                >
                                  <Key className="size-3.5 mr-1" />
                                  Reset PW
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 text-xs font-semibold cursor-pointer bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-white"
                                  onClick={() => {
                                    setUserToDelete({ id: u.id, full_name: u.full_name || u.email, email: u.email });
                                    setUserDeleteConfirmText("");
                                  }}
                                  title="Delete this user"
                                >
                                  <Trash2 className="size-3.5 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card List View */}
                <div className="block md:hidden divide-y divide-border/40">
                  {(filteredUsers as any[]).map((u: any) => {
                    const isOwner = u.role === "owner";
                    const isActivated = u.activated;
                    return (
                      <div key={u.id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-bold text-foreground text-sm">
                              {u.full_name || "Unnamed User"}
                            </span>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                            {u.created_at ? fmtDateTime(u.created_at).split(" ")[0] : "N/A"}
                          </span>
                        </div>

                        <div className="space-y-1.5 text-xs text-muted-foreground">
                          <div className="flex justify-between items-center">
                            <span>Role:</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                              isOwner 
                                ? "bg-purple-500/10 text-purple-500 border-purple-500/20" 
                                : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                            }`}>
                              {isOwner ? "Owner" : "Employee"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Status:</span>
                            {isActivated ? (
                              <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                Activated
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.2 rounded">
                                Pending License
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span>Business:</span>
                            <span className="font-semibold text-foreground truncate max-w-[200px]">{u.business_name}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span>Password:</span>
                            <span className="text-xs font-mono bg-muted/80 px-2 py-0.5 rounded border border-border/50 text-foreground font-semibold select-all">
                              {u.plain_password}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span
                            className="text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/80 hover:text-primary transition-all font-mono flex items-center gap-1 cursor-pointer font-semibold"
                            onClick={() => {
                              navigator.clipboard.writeText(u.id);
                              toast.success(`User ID copied: ${u.id}`);
                            }}
                          >
                            <Copy className="size-2.5" />
                            ID: {u.id.slice(0, 8)}…
                          </span>
                        </div>

                        <div className="flex justify-end gap-1.5 pt-2 border-t border-border/20 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-semibold beveled-button cursor-pointer flex-1 sm:flex-initial justify-center"
                            onClick={async () => {
                              try {
                                await impersonateUserFn({ data: { userId: u.id } });
                                toast.success(`Logging in as ${u.email}...`);
                                window.location.href = "/dashboard";
                              } catch (err: any) {
                                toast.error(err.message || "Failed to log in");
                              }
                            }}
                          >
                            <LogIn className="size-3.5 mr-1" />
                            Login
                          </Button>
                          
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-semibold beveled-button cursor-pointer flex-1 sm:flex-initial justify-center"
                            onClick={() => {
                              setUserForPasswordChange({ id: u.id, email: u.email });
                              setNewPassword("");
                            }}
                          >
                            <Key className="size-3.5 mr-1" />
                            Reset PW
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs font-semibold beveled-button cursor-pointer flex-1 sm:flex-initial justify-center bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-white"
                            onClick={() => {
                              setUserToDelete({ id: u.id, full_name: u.full_name || u.email, email: u.email });
                              setUserDeleteConfirmText("");
                            }}
                          >
                            <Trash2 className="size-3.5 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        )}

        {/* 3. LICENSES MANAGEMENT */}
        {activeTab === "licenses" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* GENERATOR */}
            <Card className="glass-card p-5 space-y-4 border-border/40">
              <div className="flex items-center gap-2">
                <Key className="size-5 text-primary" />
                <h3 className="font-semibold">Generate Platform License</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Platform licenses enable new business signups. Each generated key allows a business owner to activate their account and bounds their employee count limit.
              </p>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs">Employee Limit per business</Label>
                  <Input
                    className="beveled-card bg-muted/20"
                    type="number"
                    inputMode="numeric"
                    placeholder="Limit"
                    value={limit}
                    onChange={e => setLimit(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">License Note (e.g. Client Name / Payment ref)</Label>
                  <Input
                    className="beveled-card bg-muted/20"
                    placeholder="e.g. Hakim Dev Team"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full beveled-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await generatePlatformLicenseFn({
                        data: { employeeLimit: Number(limit) || 5, note: note || undefined },
                      });
                      toast.success(`Platform Key: ${res.key}`);
                      setNote("");
                      qc.invalidateQueries({ queryKey: ["platform-licenses"] });
                      qc.invalidateQueries({ queryKey: ["platform-stats"] });
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : String(err));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Generate HZ License
                </Button>
              </div>
            </Card>

            {/* PLATFORM LICENSES LIST */}
            <Card className="lg:col-span-2 glass-card divide-y divide-border/40 overflow-hidden border-border/40">
              <div className="p-4 font-semibold text-sm bg-muted/25 flex items-center justify-between">
                <span>License Register Logs</span>
                <span className="text-xs font-normal text-muted-foreground">Max 100 entries shown</span>
              </div>
              
              {licenses.isLoading ? (
                <div className="p-12 text-center text-muted-foreground">
                  <RefreshCw className="size-6 animate-spin mx-auto text-primary mb-2" />
                  Loading license keys...
                </div>
              ) : filteredLicenses.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground">
                  No licenses match search.
                </div>
              ) : (
                <div className="max-h-[500px] overflow-y-auto divide-y divide-border/40">
                  {(filteredLicenses as any[]).map((l: any) => (
                    <div key={l.id} className="p-3.5 flex items-center justify-between text-sm gap-4 hover:bg-muted/10 transition-colors">
                      <div className="space-y-0.5">
                        <code className="font-mono font-bold text-xs select-all bg-muted/65 px-2 py-0.5 rounded border border-border/80 text-foreground">
                          {l.id}
                        </code>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span>Limit: {l.employee_limit} staff</span>
                          {l.note && (
                            <>
                              <span>·</span>
                              <span className="italic text-foreground">"{l.note}"</span>
                            </>
                          )}
                          <span>·</span>
                          <span className="font-mono">{fmtDateTime(l.created_at)}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {l.used ? (
                          <span className="text-[10px] font-bold bg-muted/40 text-muted-foreground border px-2 py-0.5 rounded-full">
                            Used
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            Available
                          </span>
                        )}
                        
                        {!l.used && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={async () => {
                              try {
                                await deleteLicenseFn({ data: { licenseKey: l.id } });
                                qc.invalidateQueries({ queryKey: ["platform-licenses"] });
                                qc.invalidateQueries({ queryKey: ["platform-stats"] });
                                toast.success("License key deleted");
                              } catch (err: unknown) {
                                toast.error(err instanceof Error ? err.message : String(err));
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* 4. SUPERADMIN PASSWORD SETTINGS */}
        {activeTab === "settings" && (
          <Card className="glass-card p-6 border-border/40 max-w-md mx-auto space-y-4 bg-card relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center gap-3 border-b border-border/40 pb-4">
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl border border-primary/20 shadow-inner">
                <Shield className="size-5" />
              </div>
              <div>
                <h3 className="font-bold text-base tracking-tight text-foreground bg-gradient-to-r from-primary to-emerald-600 bg-clip-text text-transparent">
                  Superadmin Settings
                </h3>
                <p className="text-[10px] text-muted-foreground">Manage your credentials safely</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Use this form to change your superadmin account password. Make sure to keep it secure as this account can manage all store registers and licenses on this server.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const currentPw = (e.currentTarget.elements.namedItem("currentPassword") as HTMLInputElement).value;
                const newPw = (e.currentTarget.elements.namedItem("newPassword") as HTMLInputElement).value;
                const confirmPw = (e.currentTarget.elements.namedItem("confirmPassword") as HTMLInputElement).value;

                if (newPw.trim().length < 6) {
                  toast.error("New password must be at least 6 characters long");
                  return;
                }
                if (newPw !== confirmPw) {
                  toast.error("Passwords do not match");
                  return;
                }

                setBusy(true);
                try {
                  await changeSuperAdminPasswordFn({
                    data: { currentPassword: currentPw || undefined, newPassword: newPw }
                  });
                  toast.success("Superadmin password updated successfully!");
                  (e.target as HTMLFormElement).reset();
                } catch (err: any) {
                  toast.error(err.message || "Failed to update superadmin password");
                } finally {
                  setBusy(false);
                }
              }}
              className="space-y-4 pt-2 text-xs"
            >
              <div className="space-y-3.5 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Current Password</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground"><Key className="size-3.5" /></span>
                    <Input
                      name="currentPassword"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9 h-9 beveled-card bg-muted/20 border-border/60 text-xs focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">New Password (min 6 chars)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground"><Lock className="size-3.5" /></span>
                    <Input
                      name="newPassword"
                      type="password"
                      required
                      placeholder="Enter new password"
                      className="pl-9 h-9 beveled-card bg-muted/20 border-border/60 text-xs focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confirm Password</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground"><Lock className="size-3.5" /></span>
                    <Input
                      name="confirmPassword"
                      type="password"
                      required
                      placeholder="Confirm new password"
                      className="pl-9 h-9 beveled-card bg-muted/20 border-border/60 text-xs focus:ring-1 focus:ring-primary/40 focus:border-primary/50"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="w-full h-10 font-bold beveled-button mt-4 bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/95 hover:to-emerald-600/95 text-white shadow-lg active:scale-[0.99] transition-transform"
                >
                  {busy ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <RefreshCw className="size-3.5 animate-spin" />
                      Updating Password...
                    </span>
                  ) : (
                    "Save New Password"
                  )}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>

      {/* CASCADE DELETE DIALOG OVERLAY */}
      {bizToDelete && (
        <div className="fixed inset-0 bg-background/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="glass-card max-w-md w-full p-6 space-y-4 border-destructive/40 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="size-6 shrink-0" />
              <h3 className="font-bold text-lg tracking-tight">Confirm Cascade Deletion</h3>
            </div>
            
            <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
              <p>
                You are about to delete <strong className="text-foreground font-bold">"{selectedBizToDelete?.name}"</strong>.
              </p>
              <p className="text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-xs">
                <strong>WARNING:</strong> This action is permanent and completely irreversible! The following data will be deleted instantly from the database:
              </p>
              <ul className="text-xs space-y-1 list-disc pl-5">
                <li>Owner account and all associated staff/employee logins</li>
                <li>All products, sizes, inventory stocks, and catalogs</li>
                <li>All sales records, invoices, payments, and purchase logs</li>
                <li>All parties ledger, transactions, and outstanding dues</li>
                <li>All cashbox transactions and overhead expenses</li>
              </ul>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs text-foreground font-semibold">
                To confirm, type the business name <span className="text-destructive font-mono">"{selectedBizToDelete?.name}"</span>:
              </Label>
              <Input
                type="text"
                className="beveled-card bg-muted/20 border-destructive/30"
                placeholder={selectedBizToDelete?.name}
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
              />
            </div>

            <div className="flex gap-2.5 justify-end pt-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBizToDelete(null);
                  setDeleteConfirmText("");
                }}
                className="beveled-button h-9"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteConfirmText !== selectedBizToDelete?.name}
                onClick={async () => {
                  try {
                    await deleteBusinessFn({ data: { businessId: selectedBizToDelete.id } });
                    toast.success("Business cascade deletion successful");
                    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                    qc.invalidateQueries({ queryKey: ["platform-stats"] });
                    qc.invalidateQueries({ queryKey: ["platform-activities"] });
                    setBizToDelete(null);
                    setDeleteConfirmText("");
                  } catch (err: any) {
                    toast.error(err.message || "Cascade delete failed");
                  }
                }}
                className="h-9 font-semibold shadow-inner"
              >
                Confirm Cascade Delete
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ USER DELETE CONFIRMATION MODAL ═══════════ */}
      {userToDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setUserToDelete(null); setUserDeleteConfirmText(""); }} />
          <Card className="relative z-10 glass-card w-full max-w-md p-6 space-y-4 border-destructive/30 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg shrink-0">
                <Trash2 className="size-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-foreground">Delete User Account</h2>
                <p className="text-xs text-muted-foreground mt-0.5">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                You are about to delete <strong className="text-foreground font-bold">"{userToDelete.full_name}"</strong>.
              </p>
              <p className="text-xs text-muted-foreground">{userToDelete.email}</p>
              <p className="text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 text-xs">
                <strong>WARNING:</strong> The user account will be permanently removed. If this is a business owner, their unused employee licenses will also be deleted.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs text-foreground font-semibold">
                To confirm, type{" "}
                <span className="text-destructive font-mono">"Delete {userToDelete.full_name}"</span>:
              </label>
              <Input
                type="text"
                className="beveled-card bg-muted/20 border-destructive/30"
                placeholder={`Delete ${userToDelete.full_name}`}
                value={userDeleteConfirmText}
                onChange={e => setUserDeleteConfirmText(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-2.5 justify-end pt-1 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setUserToDelete(null); setUserDeleteConfirmText(""); }}
                className="beveled-button h-9"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={userDeleteConfirmText !== `Delete ${userToDelete.full_name}`}
                onClick={async () => {
                  try {
                    await deleteUserFn({ data: { userId: userToDelete.id } });
                    toast.success(`User "${userToDelete.full_name}" has been deleted.`);
                    qc.invalidateQueries({ queryKey: ["users-admin"] });
                    qc.invalidateQueries({ queryKey: ["platform-stats"] });
                    setUserToDelete(null);
                    setUserDeleteConfirmText("");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to delete user");
                  }
                }}
                className="h-9 font-semibold shadow-inner"
              >
                Confirm Delete User
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* ═══════════ USER PASSWORD RESET MODAL ═══════════ */}
      {userForPasswordChange && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setUserForPasswordChange(null); setNewPassword(""); }} />
          <Card className="relative z-10 glass-card w-full max-w-sm p-6 space-y-4 border-primary/20 shadow-2xl bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0 text-primary">
                <Key className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-foreground">Reset User Password</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Set a new password for this user account.</p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Email:</span> {userForPasswordChange.email}
            </div>

            <div className="space-y-2 pt-1">
              <label className="text-xs text-foreground font-semibold">New Password (min 6 characters):</label>
              <Input
                type="password"
                className="beveled-card bg-muted/20"
                placeholder="Enter new password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex gap-2.5 justify-end pt-1 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setUserForPasswordChange(null); setNewPassword(""); }}
                className="beveled-button h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={resetBusy || newPassword.trim().length < 6}
                onClick={async () => {
                  setResetBusy(true);
                  try {
                    await changeUserPasswordFn({ data: { userId: userForPasswordChange.id, newPassword } });
                    toast.success(`Password for ${userForPasswordChange.email} has been updated.`);
                    setUserForPasswordChange(null);
                    setNewPassword("");
                  } catch (err: any) {
                    toast.error(err.message || "Failed to update password");
                  } finally {
                    setResetBusy(false);
                  }
                }}
                className="h-9 font-semibold shadow-inner hover:bg-primary/95"
              >
                Update Password
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ BUSINESS DATA RESET MODAL ═══════════ */}
      {bizForReset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBizForReset(null)} />
          <Card className="relative z-10 glass-card w-full max-w-md p-6 space-y-4 border-amber-500/20 shadow-2xl bg-card animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500">
                <RotateCcw className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-foreground tracking-tight">Reset Business Data</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Clear records for <strong className="text-foreground font-bold">"{bizForReset.name}"</strong>.</p>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <Label className="font-semibold text-foreground">Select Data Type to Reset:</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => { setResetType("sales"); setConfirmResetText(""); }}
                  className={`p-3 rounded-xl border text-center font-bold transition-all text-xs cursor-pointer ${
                    resetType === "sales"
                      ? "bg-amber-500/10 border-amber-500 text-amber-500 shadow-sm"
                      : "bg-muted/10 border-border/40 hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  Sells (সিলস)
                </button>
                <button
                  type="button"
                  onClick={() => { setResetType("somiti"); setConfirmResetText(""); }}
                  className={`p-3 rounded-xl border text-center font-bold transition-all text-xs cursor-pointer ${
                    resetType === "somiti"
                      ? "bg-amber-500/10 border-amber-500 text-amber-500 shadow-sm"
                      : "bg-muted/10 border-border/40 hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  Samity (সমিতি)
                </button>
                <button
                  type="button"
                  onClick={() => { setResetType("expenses"); setConfirmResetText(""); }}
                  className={`p-3 rounded-xl border text-center font-bold transition-all text-xs cursor-pointer ${
                    resetType === "expenses"
                      ? "bg-amber-500/10 border-amber-500 text-amber-500 shadow-sm"
                      : "bg-muted/10 border-border/40 hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  Expenses (খরচ)
                </button>
              </div>
            </div>

            {resetType && (
              <div className="space-y-3 pt-2 text-xs border-t border-border/40 animate-in fade-in duration-200">
                <div className="p-3 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg text-xs leading-relaxed">
                  <strong>WARNING:</strong> This action is completely permanent and cannot be undone. All database records of this type will be deleted instantly.
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-foreground">
                    Type <code className="font-mono font-bold text-destructive select-all bg-muted px-1 py-0.5 rounded border border-border/80 text-xs">RESET</code> to confirm:
                  </Label>
                  <Input
                    type="text"
                    className="beveled-card bg-muted/20"
                    placeholder="Type RESET"
                    value={confirmResetText}
                    onChange={e => setConfirmResetText(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2.5 justify-end pt-2 text-xs border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBizForReset(null)}
                className="beveled-button h-9"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy || !resetType || confirmResetText !== "RESET"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    if (resetType === "sales") {
                      await resetSalesFn({ data: { businessId: bizForReset.id } });
                      toast.success(`Sells data for "${bizForReset.name}" reset successfully.`);
                    } else if (resetType === "somiti") {
                      await resetSomitiFn({ data: { businessId: bizForReset.id } });
                      toast.success(`Samity data for "${bizForReset.name}" reset successfully.`);
                    } else if (resetType === "expenses") {
                      await resetExpensesFn({ data: { businessId: bizForReset.id } });
                      toast.success(`Expenses data for "${bizForReset.name}" reset successfully.`);
                    }
                    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                    qc.invalidateQueries({ queryKey: ["platform-stats"] });
                    setBizForReset(null);
                  } catch (err: any) {
                    toast.error(err.message || "Failed to reset data");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="h-9 font-semibold shadow-inner"
              >
                Execute Reset
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ SUPER ADMIN PASSWORD CHANGE MODAL ═══════════ */}
      {superAdminPassOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setSuperAdminPassOpen(false); setSuperAdminCurrentPass(""); setSuperAdminNewPass(""); }} />
          <Card className="relative z-10 glass-card w-full max-w-sm p-6 space-y-4 border-amber-500/20 shadow-2xl bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 shrink-0">
                <Lock className="size-5" />
              </div>
              <div>
                <h2 className="font-bold text-lg text-foreground tracking-tight">Super Admin Credentials</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Update Super Admin Console access password.</p>
              </div>
            </div>

            <form
              onSubmit={async e => {
                e.preventDefault();
                if (superAdminNewPass.trim().length < 6) {
                  return toast.error("New password must be at least 6 characters long");
                }
                setSuperAdminPassBusy(true);
                try {
                  await changeSuperAdminPasswordFn({
                    data: {
                      currentPassword: superAdminCurrentPass || undefined,
                      newPassword: superAdminNewPass.trim(),
                    },
                  });
                  toast.success("Super Admin password updated & synchronized!");
                  setSuperAdminPassOpen(false);
                  setSuperAdminCurrentPass("");
                  setSuperAdminNewPass("");
                } catch (err: any) {
                  toast.error(err.message || "Failed to update password");
                } finally {
                  setSuperAdminPassBusy(false);
                }
              }}
              className="space-y-3 pt-1"
            >
              <div className="space-y-1.5">
                <label className="text-xs text-foreground font-semibold">Current Password (optional):</label>
                <Input
                  type="password"
                  className="beveled-card bg-muted/20"
                  placeholder="Enter current password"
                  value={superAdminCurrentPass}
                  onChange={e => setSuperAdminCurrentPass(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-foreground font-semibold">New Password (min 6 chars):</label>
                <Input
                  type="password"
                  className="beveled-card bg-muted/20"
                  placeholder="Enter new password"
                  value={superAdminNewPass}
                  onChange={e => setSuperAdminNewPass(e.target.value)}
                  required
                />
              </div>

              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] flex items-center gap-2">
                <CheckCircle className="size-4 shrink-0" />
                <span>Password will be permanently saved and updated in database.</span>
              </div>

              <div className="flex gap-2.5 justify-end pt-2 text-xs border-t border-border/40">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setSuperAdminPassOpen(false); setSuperAdminCurrentPass(""); setSuperAdminNewPass(""); }}
                  className="beveled-button h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={superAdminPassBusy || superAdminNewPass.trim().length < 6}
                  className="h-9 font-semibold shadow-inner bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {superAdminPassBusy ? "Updating…" : "Save Super Admin PW"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
