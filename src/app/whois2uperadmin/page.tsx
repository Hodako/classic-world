"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  superAdminLoginFn,
  superAdminLogoutFn,
  superAdminCheckFn,
  listBusinessesFn,
  listAllUsersFn,
  getPlatformStatsFn,
  getPlatformActivitiesFn,
  deleteBusinessFn,
  impersonateUserFn,
  deleteUserFn,
  changeUserPasswordFn,
  changeSuperAdminPasswordFn,
  resetSalesFn,
  resetSomitiFn,
  resetExpensesFn,
  refillBusinessSmsFn,
  freezeBusinessFn,
  setBusinessLimitsFn,
  createAdminPopupFn,
  listAdminPopupsFn,
  deleteAdminPopupFn,
  getMasterSmsSettingsFn,
  updateMasterSmsSettingsFn,
  directSendSmsAsAdminFn,
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
  CheckCircle2,
  RefreshCw,
  Search,
  Key,
  Shield,
  Clock,
  ShieldAlert,
  LogOut,
  LogIn,
  Lock,
  MessageSquare,
  MessageCircle,
  Sparkles,
  PhoneCall,
  Flame,
  AlertTriangle,
  Send,
  Sliders,
  Calendar,
  ExternalLink,
  Plus,
  Radio,
} from "lucide-react";
import { SpeedLoader } from "@/components/speed-loader";
import { fmtDateTime } from "@/lib/format";

export default function SuperAdminPage() {
  const qc = useQueryClient();
  const auth = useQuery({ queryKey: ["super-admin"], queryFn: superAdminCheckFn });

  const [username, setUsername] = useState("superadmin");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "businesses" | "users" | "sms_gateway" | "settings">("feed");
  const [searchQuery, setSearchQuery] = useState("");
  const [bizStatusFilter, setBizStatusFilter] = useState<"all" | "active" | "frozen">("all");

  // ─── Modal States ─────────────────────────────────────────────────────────

  // 1. Refill SMS Modal
  const [refillModalOpen, setRefillModalOpen] = useState(false);
  const [refillBiz, setRefillBiz] = useState<any>(null);
  const [refillAmount, setRefillAmount] = useState("100");
  const [refillType, setRefillType] = useState<"add" | "set" | "deduct">("add");
  const [refillNote, setRefillNote] = useState("");
  const [refillBusy, setRefillBusy] = useState(false);

  // 2. Freeze / Unfreeze Modal
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [freezeBiz, setFreezeBiz] = useState<any>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [freezeExpiresAt, setFreezeExpiresAt] = useState("");
  const [freezeBusy, setFreezeBusy] = useState(false);

  // 3. Limits & Subscription Modal
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);
  const [limitsBiz, setLimitsBiz] = useState<any>(null);
  const [maxProducts, setMaxProducts] = useState("500");
  const [maxInvoices, setMaxInvoices] = useState("10000");
  const [subExpiryDate, setSubExpiryDate] = useState("");
  const [limitsBusy, setLimitsBusy] = useState(false);

  // 4. Send Popup Modal
  const [popupModalOpen, setPopupModalOpen] = useState(false);
  const [popupTargetType, setPopupTargetType] = useState<"all" | "business">("all");
  const [popupBiz, setPopupBiz] = useState<any>(null);
  const [popupTitle, setPopupTitle] = useState("");
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState<"info" | "warning" | "urgent" | "promo">("info");
  const [popupBusy, setPopupBusy] = useState(false);

  // 5. Delete Business Modal
  const [bizToDelete, setBizToDelete] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // 6. User Deletion & Password Change
  const [userToDelete, setUserToDelete] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [userDeleteConfirmText, setUserDeleteConfirmText] = useState("");
  const [userForPasswordChange, setUserForPasswordChange] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  // 7. SuperAdmin Password Change
  const [superAdminPassOpen, setSuperAdminPassOpen] = useState(false);
  const [superAdminCurrentPass, setSuperAdminCurrentPass] = useState("");
  const [superAdminNewPass, setSuperAdminNewPass] = useState("");
  const [superAdminPassBusy, setSuperAdminPassBusy] = useState(false);

  // 8. Reset Business Data
  const [bizForReset, setBizForReset] = useState<{ id: string; name: string } | null>(null);
  const [resetType, setResetType] = useState<"sales" | "somiti" | "expenses" | null>(null);
  const [confirmResetText, setConfirmResetText] = useState("");

  // 9. Master SMS Gateway state
  const [masterApiKey, setMasterApiKey] = useState("");
  const [masterUserName, setMasterUserName] = useState("");
  const [masterSenderName, setMasterSenderName] = useState("");
  const [adminWhatsapp, setAdminWhatsapp] = useState("");
  const [masterSmsSaving, setMasterSmsSaving] = useState(false);

  // 10. Direct SMS from Admin
  const [directPhone, setDirectPhone] = useState("");
  const [directMsg, setDirectMsg] = useState("");
  const [directRoute, setDirectRoute] = useState<"T" | "P">("T");
  const [directSending, setDirectSending] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const stats = useQuery({
    queryKey: ["platform-stats"],
    queryFn: getPlatformStatsFn,
    enabled: auth.data?.authenticated === true,
  });

  const activities = useQuery({
    queryKey: ["platform-activities"],
    queryFn: getPlatformActivitiesFn,
    enabled: auth.data?.authenticated === true,
    refetchInterval: 10000,
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

  const popups = useQuery({
    queryKey: ["admin-popups-list"],
    queryFn: listAdminPopupsFn,
    enabled: auth.data?.authenticated === true,
  });

  const masterSmsSettings = useQuery({
    queryKey: ["master-sms-settings"],
    queryFn: async () => {
      const data = await getMasterSmsSettingsFn();
      setMasterApiKey(data.apiKey || "");
      setMasterUserName(data.userName || "");
      setMasterSenderName(data.senderName || "DreamFashion");
      setAdminWhatsapp(data.adminWhatsapp || "8801700000000");
      return data;
    },
    enabled: auth.data?.authenticated === true,
  });

  const handleRefreshAll = () => {
    qc.invalidateQueries({ queryKey: ["platform-stats"] });
    qc.invalidateQueries({ queryKey: ["platform-activities"] });
    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
    qc.invalidateQueries({ queryKey: ["users-admin"] });
    qc.invalidateQueries({ queryKey: ["admin-popups-list"] });
    toast.success("Surveillance dashboard refreshed!");
  };

  if (auth.isLoading) return <SpeedLoader />;

  if (!auth.data?.authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="glass-card w-full max-w-sm p-6 space-y-4 border-primary/20 shadow-2xl">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="p-3.5 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-inner">
              <Shield className="size-8 animate-pulse" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">HakimQzz Super Admin</h1>
            <p className="text-xs text-muted-foreground">Authorized platform administration console</p>
          </div>

          <form
            onSubmit={async (e) => {
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
            className="space-y-3 pt-2"
          >
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Administrator Username</Label>
              <Input
                placeholder="superadmin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="rounded-xl bg-muted/40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Master Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl bg-muted/40"
              />
            </div>
            <Button type="submit" className="w-full rounded-xl beveled-button" disabled={busy}>
              {busy ? "Authorizing..." : "Access Command Console"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // Filter businesses
  const filteredBiz = (businesses.data ?? []).filter((b: any) => {
    const name = String(b.name || "").toLowerCase();
    const email = String(b.owner_email || "").toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = name.includes(query) || email.includes(query);
    if (!matchesSearch) return false;

    if (bizStatusFilter === "active") return b.status !== "frozen" && b.status !== "suspended";
    if (bizStatusFilter === "frozen") return b.status === "frozen" || b.status === "suspended";
    return true;
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

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ─── Top Control Header ────────────────────────────────────────── */}
      <header className="border-b border-border/80 bg-card/80 backdrop-blur sticky top-0 z-40 px-4 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
              HakimQzz Super Admin
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-mono">
                COMMAND v2.5
              </Badge>
            </h1>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Centralized platform governance, SMS gateway, subscription management & user control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleRefreshAll} className="h-8 text-xs rounded-xl gap-1.5">
            <RefreshCw className="size-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPopupTargetType("all");
              setPopupModalOpen(true);
            }}
            className="h-8 text-xs rounded-xl bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 gap-1.5"
          >
            <Radio className="size-3.5 animate-pulse" />
            <span>Broadcast Popup</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await superAdminLogoutFn();
              qc.invalidateQueries({ queryKey: ["super-admin"] });
            }}
            className="h-8 text-xs rounded-xl text-destructive hover:bg-destructive/10 gap-1.5"
          >
            <LogOut className="size-3.5" />
            <span>Exit</span>
          </Button>
        </div>
      </header>

      {/* ─── Main Content Container ───────────────────────────────────── */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* KPI Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Store className="size-3.5 text-blue-500" /> Total Shops
            </span>
            <p className="text-xl font-bold font-num text-foreground">
              {(stats.data?.totalBusinesses ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-emerald-600 font-semibold">
              {stats.data?.activeBusinesses ?? 0} Active / {stats.data?.frozenBusinesses ?? 0} Frozen
            </span>
          </Card>

          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Users className="size-3.5 text-emerald-500" /> Users & Staff
            </span>
            <p className="text-xl font-bold font-num text-foreground">
              {(stats.data?.totalUsers ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-muted-foreground">Platform accounts</span>
          </Card>

          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Box className="size-3.5 text-purple-500" /> Total Products
            </span>
            <p className="text-xl font-bold font-num text-foreground">
              {(stats.data?.totalProducts ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-muted-foreground">Inventory SKUs</span>
          </Card>

          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <MessageSquare className="size-3.5 text-amber-500" /> SMS Sent
            </span>
            <p className="text-xl font-bold font-num text-foreground">
              {(stats.data?.totalSmsSent ?? 0).toLocaleString()}
            </p>
            <span className="text-[10px] text-emerald-600 font-semibold">Delivered via MiMSMS</span>
          </Card>

          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <TrendingUp className="size-3.5 text-emerald-500" /> Total Sales Vol.
            </span>
            <p className="text-xl font-bold font-num text-emerald-600 dark:text-emerald-400 truncate">
              ৳{((stats.data?.totalSalesVolume ?? 0) / 1000).toFixed(1)}k
            </p>
            <span className="text-[10px] text-muted-foreground">Across all stores</span>
          </Card>

          <Card className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Sparkles className="size-3.5 text-indigo-500" /> Platform Profit
            </span>
            <p className="text-xl font-bold font-num text-indigo-600 dark:text-indigo-400 truncate">
              ৳{((stats.data?.totalPlatformNetProfit ?? 0) / 1000).toFixed(1)}k
            </p>
            <span className="text-[10px] text-muted-foreground">Net store profits</span>
          </Card>
        </div>

        {/* ─── Navigation Tabs ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-1.5 bg-muted/70 p-1 rounded-2xl overflow-x-auto max-w-full no-scrollbar whitespace-nowrap shadow-inner border border-border/40">
            <button
              onClick={() => setActiveTab("feed")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 ${
                activeTab === "feed" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Activity className="size-3.5 inline mr-1.5 text-blue-500" />
              Surveillance Feed
            </button>
            <button
              onClick={() => setActiveTab("businesses")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 ${
                activeTab === "businesses" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Store className="size-3.5 inline mr-1.5 text-emerald-500" />
              Shops ({filteredBiz.length})
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 ${
                activeTab === "users" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="size-3.5 inline mr-1.5 text-indigo-500" />
              Users ({filteredUsers.length})
            </button>
            <button
              onClick={() => setActiveTab("sms_gateway")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 ${
                activeTab === "sms_gateway" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="size-3.5 inline mr-1.5 text-amber-500" />
              Master SMS & Popups
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 ${
                activeTab === "settings" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Shield className="size-3.5 inline mr-1.5 text-purple-500" />
              Admin Settings
            </button>
          </div>

          {(activeTab === "businesses" || activeTab === "users") && (
            <div className="relative w-full sm:w-64">
              <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search shops or users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 rounded-xl text-xs bg-muted/40"
              />
            </div>
          )}
        </div>

        {/* ─── TAB 1: SURVEILLANCE FEED ──────────────────────────────── */}
        {activeTab === "feed" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <Radio className="size-4 text-red-500 animate-ping" />
                Live System Audit & Event Surveillance
              </h2>
              <span className="text-xs text-muted-foreground font-mono">Auto-polling every 10s</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(activities.data ?? []).map((ev: any, idx: number) => {
                const isSale = ev.type === "sale";
                const isProd = ev.type === "product";
                const isExpense = ev.type === "expense";
                const isBiz = ev.type === "business";

                return (
                  <Card key={idx} className="p-3.5 rounded-2xl bg-card border-border/80 shadow-xs flex items-start gap-3">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        isSale
                          ? "bg-emerald-500/10 text-emerald-600"
                          : isExpense
                          ? "bg-rose-500/10 text-rose-600"
                          : isProd
                          ? "bg-blue-500/10 text-blue-600"
                          : "bg-purple-500/10 text-purple-600"
                      }`}
                    >
                      {isSale ? (
                        <TrendingUp className="size-4" />
                      ) : isExpense ? (
                        <RotateCcw className="size-4" />
                      ) : isProd ? (
                        <Box className="size-4" />
                      ) : (
                        <Store className="size-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground truncate">{ev.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {fmtDateTime(ev.time)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{ev.detail}</p>
                      <span className="inline-block text-[10px] font-semibold text-primary/80 bg-primary/5 px-2 py-0.5 rounded-md mt-1">
                        🏪 {ev.businessName}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB 2: SHOPS & BUSINESSES MANAGEMENT ──────────────────── */}
        {activeTab === "businesses" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Filter by Status:</span>
                <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
                  <button
                    onClick={() => setBizStatusFilter("all")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      bizStatusFilter === "all" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    All ({businesses.data?.length ?? 0})
                  </button>
                  <button
                    onClick={() => setBizStatusFilter("active")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      bizStatusFilter === "active" ? "bg-card text-emerald-600 shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setBizStatusFilter("frozen")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      bizStatusFilter === "frozen" ? "bg-card text-rose-600 shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    Frozen / Banned
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredBiz.map((biz: any) => {
                const isFrozen = biz.status === "frozen" || biz.status === "suspended";

                return (
                  <Card
                    key={biz.id}
                    className={`p-4 rounded-2xl border transition-all shadow-xs space-y-3 ${
                      isFrozen
                        ? "border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/10"
                        : "border-border/80 bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-foreground">{biz.name}</h3>
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold uppercase ${
                              isFrozen
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            }`}
                          >
                            {isFrozen ? "Frozen / Banned" : "Active"}
                          </Badge>
                          {biz.subscription_expires_at && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">
                              <Calendar className="size-3" />
                              Sub: {new Date(biz.subscription_expires_at).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>👤 {biz.owner_email}</span>
                          <span>•</span>
                          <span>📦 {biz.product_count} products</span>
                          <span>•</span>
                          <span>🧾 {biz.sale_count} sales</span>
                          <span>•</span>
                          <span>💬 {biz.sms_sent_count || 0} SMS sent</span>
                        </p>
                        {isFrozen && biz.frozen_reason && (
                          <p className="text-xs text-rose-600 font-medium bg-rose-500/10 px-2.5 py-1 rounded-lg inline-block">
                            🔒 Freeze Reason: {biz.frozen_reason}
                          </p>
                        )}
                      </div>

                      {/* SMS Balance & Fast Actions */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted/60 border border-border">
                          <MessageSquare className="size-3.5 text-amber-500" />
                          <span className="text-xs font-bold font-num">{biz.sms_credits ?? 0}</span>
                          <span className="text-[10px] text-muted-foreground">SMS</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRefillBiz(biz);
                              setRefillAmount("100");
                              setRefillType("add");
                              setRefillModalOpen(true);
                            }}
                            className="h-6 px-1.5 text-[10px] text-primary hover:bg-primary/10 ml-1 font-bold"
                          >
                            + Refill
                          </Button>
                        </div>

                        {/* Action Buttons */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFreezeBiz(biz);
                            setFreezeReason(biz.frozen_reason || "Subscription renewal required");
                            setFreezeModalOpen(true);
                          }}
                          className={`h-8 text-xs rounded-xl gap-1 font-medium ${
                            isFrozen
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20"
                              : "text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                          }`}
                        >
                          {isFrozen ? <CheckCircle2 className="size-3.5" /> : <Ban className="size-3.5" />}
                          <span>{isFrozen ? "Unfreeze" : "Freeze"}</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setLimitsBiz(biz);
                            setMaxProducts(String(biz.max_products || 500));
                            setMaxInvoices(String(biz.max_invoices || 10000));
                            setSubExpiryDate(biz.subscription_expires_at ? biz.subscription_expires_at.slice(0, 10) : "");
                            setLimitsModalOpen(true);
                          }}
                          className="h-8 text-xs rounded-xl gap-1"
                        >
                          <Sliders className="size-3.5 text-primary" />
                          <span>Limits</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPopupBiz(biz);
                            setPopupTargetType("business");
                            setPopupTitle("");
                            setPopupMessage("");
                            setPopupModalOpen(true);
                          }}
                          className="h-8 text-xs rounded-xl gap-1 text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <Radio className="size-3.5" />
                          <span>Popup</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await impersonateUserFn({ data: { userId: biz.owner_id } });
                              toast.success(`Logged in as ${biz.name}`);
                              window.location.href = "/dashboard";
                            } catch (err: any) {
                              toast.error(err.message || "Impersonation failed");
                            }
                          }}
                          className="h-8 text-xs rounded-xl gap-1 text-primary border-primary/30"
                        >
                          <LogIn className="size-3.5" />
                          <span>Login As</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setBizForReset(biz);
                            setResetType("sales");
                            setConfirmResetText("");
                          }}
                          className="h-8 text-xs rounded-xl gap-1 text-amber-600 border-amber-500/30"
                        >
                          <RotateCcw className="size-3.5" />
                          <span>Reset</span>
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setBizToDelete(biz.id);
                            setDeleteConfirmText("");
                          }}
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── TAB 3: USERS MANAGEMENT ───────────────────────────────── */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredUsers.map((u: any) => (
                <Card key={u.id} className="p-4 rounded-2xl bg-card border-border/80 shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{u.full_name || "Unnamed User"}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{u.email}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold uppercase">
                      {u.role}
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border/50">
                    <p>🏪 Shop: <span className="font-semibold text-foreground">{u.business_name}</span></p>
                    <p>🕒 Created: {fmtDateTime(u.created_at)}</p>
                    {u.plain_password && (
                      <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                        🔑 Password: {u.plain_password}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setUserForPasswordChange({ id: u.id, email: u.email });
                        setNewPassword("");
                      }}
                      className="h-7 text-xs rounded-lg"
                    >
                      Change Pass
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await impersonateUserFn({ data: { userId: u.id } });
                          toast.success(`Logged in as ${u.email}`);
                          window.location.href = "/dashboard";
                        } catch (err: any) {
                          toast.error(err.message || "Failed");
                        }
                      }}
                      className="h-7 text-xs rounded-lg text-primary"
                    >
                      Login As
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setUserToDelete(u);
                        setUserDeleteConfirmText("");
                      }}
                      className="h-7 w-7 p-0 text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ─── TAB 4: MASTER SMS GATEWAY & POPUPS ────────────────────── */}
        {activeTab === "sms_gateway" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Master MiMSMS Gateway Configuration */}
            <Card className="p-5 sm:p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Shield className="size-5 text-emerald-600" />
                  Master MiMSMS Gateway Credentials
                </h3>
                <p className="text-xs text-muted-foreground">
                  Centrally configured gateway. All shops use this master gateway to dispatch SMS.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Master API Key</Label>
                  <Input
                    type="password"
                    placeholder="e.g. 1OSY3FSZ7H4IHOU..."
                    value={masterApiKey}
                    onChange={(e) => setMasterApiKey(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Master Username</Label>
                    <Input
                      placeholder="e.g. admin@domain.com"
                      value={masterUserName}
                      onChange={(e) => setMasterUserName(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Sender Name</Label>
                    <Input
                      placeholder="e.g. DreamFashion"
                      value={masterSenderName}
                      onChange={(e) => setMasterSenderName(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Admin WhatsApp Hotline (for Refill & Unfreeze)</Label>
                  <Input
                    placeholder="e.g. 8801700000000"
                    value={adminWhatsapp}
                    onChange={(e) => setAdminWhatsapp(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    This phone number is prefilled in user "Recharge SMS" and "Unfreeze Account" WhatsApp buttons.
                  </p>
                </div>

                <Button
                  onClick={async () => {
                    setMasterSmsSaving(true);
                    try {
                      await updateMasterSmsSettingsFn({
                        data: {
                          apiKey: masterApiKey,
                          userName: masterUserName,
                          senderName: masterSenderName,
                          adminWhatsapp,
                        },
                      });
                      toast.success("Master SMS Gateway settings saved!");
                      qc.invalidateQueries({ queryKey: ["master-sms-settings"] });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to save");
                    } finally {
                      setMasterSmsSaving(false);
                    }
                  }}
                  disabled={masterSmsSaving}
                  className="w-full rounded-xl beveled-button"
                >
                  {masterSmsSaving ? "Saving..." : "Save Master Gateway Settings"}
                </Button>
              </div>
            </Card>

            {/* Direct Send SMS to Any Number */}
            <Card className="p-5 sm:p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Send className="size-5 text-primary" />
                  Direct Send SMS to Any Mobile Number
                </h3>
                <p className="text-xs text-muted-foreground">
                  Send live administrative notifications or test SMS to any BD mobile number.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Mobile Number</Label>
                  <Input
                    placeholder="01XXXXXXXXX"
                    value={directPhone}
                    onChange={(e) => setDirectPhone(e.target.value)}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Message Text</Label>
                  <Textarea
                    placeholder="Write administrative message..."
                    rows={3}
                    value={directMsg}
                    onChange={(e) => setDirectMsg(e.target.value)}
                    className="rounded-xl text-xs leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Select value={directRoute} onValueChange={(v: "T" | "P") => setDirectRoute(v)}>
                    <SelectTrigger className="w-40 h-9 rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="T">Transactional (T)</SelectItem>
                      <SelectItem value="P">Promotional (P)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={async () => {
                      if (!directPhone || !directMsg) {
                        toast.error("Please enter phone number and message");
                        return;
                      }
                      setDirectSending(true);
                      try {
                        const res = await directSendSmsAsAdminFn({
                          data: {
                            mobileNumber: directPhone,
                            message: directMsg,
                            routeType: directRoute,
                          },
                        });
                        toast.success(`SMS dispatched! Status: ${res.status}`);
                        setDirectMsg("");
                      } catch (err: any) {
                        toast.error(err.message || "Failed to send SMS");
                      } finally {
                        setDirectSending(false);
                      }
                    }}
                    disabled={directSending}
                    className="rounded-xl px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs h-9"
                  >
                    {directSending ? "Sending..." : "Dispatch SMS"}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Active Popups & Announcements */}
            <Card className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Radio className="size-5 text-amber-500" />
                    Active Dashboard Popups & Announcements
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Popups currently visible to users inside their POS dashboard.
                  </p>
                </div>

                <Button
                  size="sm"
                  onClick={() => {
                    setPopupTargetType("all");
                    setPopupTitle("");
                    setPopupMessage("");
                    setPopupModalOpen(true);
                  }}
                  className="rounded-xl text-xs gap-1.5 beveled-button"
                >
                  <Plus className="size-3.5" />
                  <span>Create Announcement</span>
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(popups.data ?? []).map((p: any) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-foreground">{p.title}</span>
                        <Badge variant="outline" className="text-[9px] uppercase font-mono">
                          {p.popup_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{p.message}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                      <span>Target: {p.target_type === "all" ? "All Shops" : `Shop ${p.target_id}`}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await deleteAdminPopupFn({ data: { popupId: p.id } });
                          toast.success("Announcement deleted");
                          qc.invalidateQueries({ queryKey: ["admin-popups-list"] });
                        }}
                        className="h-6 px-2 text-destructive hover:bg-destructive/10 text-[10px]"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ─── TAB 5: ADMIN SETTINGS ─────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="max-w-xl mx-auto space-y-6">
            <Card className="p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Lock className="size-5 text-primary" />
                  Change Super Administrator Password
                </h3>
                <p className="text-xs text-muted-foreground">
                  Update the master password used to access this console.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Current Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={superAdminCurrentPass}
                    onChange={(e) => setSuperAdminCurrentPass(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">New Master Password</Label>
                  <Input
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={superAdminNewPass}
                    onChange={(e) => setSuperAdminNewPass(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <Button
                  onClick={async () => {
                    if (!superAdminNewPass || superAdminNewPass.length < 6) {
                      toast.error("Password must be at least 6 characters");
                      return;
                    }
                    setSuperAdminPassBusy(true);
                    try {
                      await changeSuperAdminPasswordFn({
                        data: {
                          currentPassword: superAdminCurrentPass,
                          newPassword: superAdminNewPass,
                        },
                      });
                      toast.success("Master password updated successfully!");
                      setSuperAdminCurrentPass("");
                      setSuperAdminNewPass("");
                    } catch (err: any) {
                      toast.error(err.message || "Failed to update password");
                    } finally {
                      setSuperAdminPassBusy(false);
                    }
                  }}
                  disabled={superAdminPassBusy}
                  className="w-full rounded-xl beveled-button"
                >
                  {superAdminPassBusy ? "Updating..." : "Update Master Password"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* ─── MODAL 1: REFILL SMS ──────────────────────────────────────── */}
      {refillModalOpen && refillBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-primary/30 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sparkles className="size-5 text-amber-500" />
                Refill SMS Credits for {refillBiz.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Current Balance: <span className="font-bold text-foreground">{refillBiz.sms_credits ?? 0} SMS</span>
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Action Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: "add", label: "+ Add Credits" },
                    { type: "set", label: "= Set Exactly" },
                    { type: "deduct", label: "- Deduct" },
                  ].map((item) => (
                    <Button
                      key={item.type}
                      type="button"
                      variant={refillType === item.type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRefillType(item.type as any)}
                      className="rounded-xl text-xs"
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Amount of SMS</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={refillAmount}
                  onChange={(e) => setRefillAmount(e.target.value)}
                  className="rounded-xl text-sm font-bold font-num"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Note / Transaction Ref (Optional)</Label>
                <Input
                  placeholder="e.g. bKash payment TrxID #88219"
                  value={refillNote}
                  onChange={(e) => setRefillNote(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setRefillModalOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    setRefillBusy(true);
                    try {
                      await refillBusinessSmsFn({
                        data: {
                          businessId: refillBiz.id,
                          amount: Number(refillAmount),
                          type: refillType,
                          note: refillNote,
                        },
                      });
                      toast.success(`SMS balance updated for ${refillBiz.name}!`);
                      setRefillModalOpen(false);
                      qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to refill SMS");
                    } finally {
                      setRefillBusy(false);
                    }
                  }}
                  disabled={refillBusy}
                  className="rounded-xl px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  {refillBusy ? "Saving..." : "Confirm Refill"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 2: FREEZE / UNFREEZE ACCOUNT ────────────────────────── */}
      {freezeModalOpen && freezeBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-primary/30 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ShieldAlert className="size-5 text-rose-500" />
                {freezeBiz.status === "frozen" || freezeBiz.status === "suspended" ? "Unfreeze Account" : "Freeze / Suspend Account"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Shop: <span className="font-semibold text-foreground">{freezeBiz.name}</span> ({freezeBiz.owner_email})
              </p>
            </div>

            <div className="space-y-3">
              {freezeBiz.status !== "frozen" && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Freeze / Lock Reason (Shown to User)</Label>
                  <Textarea
                    placeholder="e.g. Monthly subscription expired. Please contact admin to unfreeze."
                    rows={3}
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    className="rounded-xl text-xs leading-relaxed"
                  />
                </div>
              )}

              {freezeBiz.status === "frozen" && (
                <p className="text-xs text-emerald-600 font-medium bg-emerald-500/10 p-3 rounded-xl">
                  Unfreezing will restore full access to POS dashboard, sales, products, and invoices immediately.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setFreezeModalOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    setFreezeBusy(true);
                    try {
                      const willFreeze = freezeBiz.status !== "frozen" && freezeBiz.status !== "suspended";
                      await freezeBusinessFn({
                        data: {
                          businessId: freezeBiz.id,
                          freeze: willFreeze,
                          reason: freezeReason,
                        },
                      });
                      toast.success(willFreeze ? `Account frozen for ${freezeBiz.name}` : `Account unfrozen for ${freezeBiz.name}!`);
                      setFreezeModalOpen(false);
                      qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to update status");
                    } finally {
                      setFreezeBusy(false);
                    }
                  }}
                  disabled={freezeBusy}
                  className={`rounded-xl px-5 ${
                    freezeBiz.status === "frozen" || freezeBiz.status === "suspended"
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                >
                  {freezeBusy ? "Updating..." : freezeBiz.status === "frozen" || freezeBiz.status === "suspended" ? "Unfreeze Account" : "Freeze Account"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 3: SET LIMITS & SUBSCRIPTION ───────────────────────── */}
      {limitsModalOpen && limitsBiz && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-primary/30 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Sliders className="size-5 text-primary" />
                Set Limits & Subscription for {limitsBiz.name}
              </h3>
              <p className="text-xs text-muted-foreground">Adjust maximum capacity and subscription duration</p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Max Products</Label>
                  <Input
                    type="number"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(e.target.value)}
                    className="rounded-xl text-xs font-num"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Max Invoices</Label>
                  <Input
                    type="number"
                    value={maxInvoices}
                    onChange={(e) => setMaxInvoices(e.target.value)}
                    className="rounded-xl text-xs font-num"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Subscription Expiry Date</Label>
                <Input
                  type="date"
                  value={subExpiryDate}
                  onChange={(e) => setSubExpiryDate(e.target.value)}
                  className="rounded-xl text-xs font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setLimitsModalOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    setLimitsBusy(true);
                    try {
                      await setBusinessLimitsFn({
                        data: {
                          businessId: limitsBiz.id,
                          max_products: Number(maxProducts),
                          max_invoices: Number(maxInvoices),
                          subscription_expires_at: subExpiryDate ? new Date(subExpiryDate).toISOString() : undefined,
                        },
                      });
                      toast.success(`Limits updated for ${limitsBiz.name}!`);
                      setLimitsModalOpen(false);
                      qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to update limits");
                    } finally {
                      setLimitsBusy(false);
                    }
                  }}
                  disabled={limitsBusy}
                  className="rounded-xl px-5 beveled-button"
                >
                  {limitsBusy ? "Saving..." : "Save Limits"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 4: SEND POPUP ANNOUNCEMENT ─────────────────────────── */}
      {popupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-primary/30 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Radio className="size-5 text-amber-500" />
                {popupTargetType === "all" ? "Broadcast Announcement to All Users" : `Send Popup Alert to ${popupBiz?.name}`}
              </h3>
              <p className="text-xs text-muted-foreground">
                This message will pop up as a modal in the user's dashboard.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Alert Tone / Type</Label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { type: "info", label: "Info", color: "text-blue-500" },
                    { type: "warning", label: "Warning", color: "text-amber-500" },
                    { type: "urgent", label: "Urgent", color: "text-red-500" },
                    { type: "promo", label: "Promo", color: "text-purple-500" },
                  ].map((t) => (
                    <Button
                      key={t.type}
                      type="button"
                      variant={popupType === t.type ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPopupType(t.type as any)}
                      className="rounded-xl text-xs"
                    >
                      {t.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Popup Title</Label>
                <Input
                  placeholder="e.g. System Maintenance Notice"
                  value={popupTitle}
                  onChange={(e) => setPopupTitle(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Message Body</Label>
                <Textarea
                  placeholder="Write the announcement message..."
                  rows={4}
                  value={popupMessage}
                  onChange={(e) => setPopupMessage(e.target.value)}
                  className="rounded-xl text-xs leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setPopupModalOpen(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!popupTitle || !popupMessage) {
                      toast.error("Title and message are required");
                      return;
                    }
                    setPopupBusy(true);
                    try {
                      await createAdminPopupFn({
                        data: {
                          target_type: popupTargetType,
                          target_id: popupTargetType === "business" ? popupBiz?.id : undefined,
                          title: popupTitle,
                          message: popupMessage,
                          popup_type: popupType,
                        },
                      });
                      toast.success("Popup published!");
                      setPopupModalOpen(false);
                      qc.invalidateQueries({ queryKey: ["admin-popups-list"] });
                    } catch (err: any) {
                      toast.error(err.message || "Failed to publish");
                    } finally {
                      setPopupBusy(false);
                    }
                  }}
                  disabled={popupBusy}
                  className="rounded-xl px-5 beveled-button"
                >
                  {popupBusy ? "Publishing..." : "Send Popup"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 5: DELETE BUSINESS ─────────────────────────────────── */}
      {bizToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-destructive/30 shadow-2xl space-y-4">
            <div className="space-y-1 text-destructive">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="size-5" /> Cascade Delete Business
              </h3>
              <p className="text-xs text-muted-foreground">
                This will PERMANENTLY delete the business, owner account, employees, products, sales, expenses, and logs.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Type &quot;DELETE&quot; to confirm:</Label>
              <Input
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBizToDelete(null)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteConfirmText !== "DELETE"}
                onClick={async () => {
                  try {
                    await deleteBusinessFn({ data: { businessId: bizToDelete } });
                    toast.success("Business deleted permanently");
                    setBizToDelete(null);
                    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                  } catch (err: any) {
                    toast.error(err.message || "Failed to delete");
                  }
                }}
                className="rounded-xl"
              >
                Delete Everything
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 6: RESET BUSINESS DATA ─────────────────────────────── */}
      {bizForReset && resetType && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-amber-500/30 shadow-2xl space-y-4">
            <div className="space-y-1 text-amber-600">
              <h3 className="text-base font-bold flex items-center gap-2">
                <RotateCcw className="size-5" /> Reset {resetType.toUpperCase()} Data
              </h3>
              <p className="text-xs text-muted-foreground">
                Shop: <span className="font-semibold text-foreground">{bizForReset.name}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Select data to wipe:</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["sales", "somiti", "expenses"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={resetType === t ? "default" : "outline"}
                    onClick={() => setResetType(t)}
                    className="rounded-xl text-xs uppercase"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Type &quot;RESET&quot; to confirm:</Label>
              <Input
                placeholder="RESET"
                value={confirmResetText}
                onChange={(e) => setConfirmResetText(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setBizForReset(null)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={confirmResetText !== "RESET"}
                onClick={async () => {
                  try {
                    if (resetType === "sales") await resetSalesFn({ data: { businessId: bizForReset.id } });
                    if (resetType === "somiti") await resetSomitiFn({ data: { businessId: bizForReset.id } });
                    if (resetType === "expenses") await resetExpensesFn({ data: { businessId: bizForReset.id } });
                    toast.success(`${resetType.toUpperCase()} reset completed!`);
                    setBizForReset(null);
                    qc.invalidateQueries({ queryKey: ["businesses-admin"] });
                  } catch (err: any) {
                    toast.error(err.message || "Failed to reset");
                  }
                }}
                className="rounded-xl bg-amber-600 hover:bg-amber-500 text-white"
              >
                Confirm Reset
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 7: CHANGE USER PASSWORD ────────────────────────────── */}
      {userForPasswordChange && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-primary/30 shadow-2xl space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Key className="size-5 text-primary" />
                Change Password for {userForPasswordChange.email}
              </h3>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">New Password</Label>
              <Input
                type="text"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setUserForPasswordChange(null)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  if (!newPassword || newPassword.length < 6) {
                    toast.error("Password must be at least 6 characters");
                    return;
                  }
                  setResetBusy(true);
                  try {
                    await changeUserPasswordFn({
                      data: {
                        userId: userForPasswordChange.id,
                        newPassword,
                      },
                    });
                    toast.success("Password changed successfully!");
                    setUserForPasswordChange(null);
                    qc.invalidateQueries({ queryKey: ["users-admin"] });
                  } catch (err: any) {
                    toast.error(err.message || "Failed to change password");
                  } finally {
                    setResetBusy(false);
                  }
                }}
                disabled={resetBusy}
                className="rounded-xl beveled-button"
              >
                {resetBusy ? "Saving..." : "Update Password"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ─── MODAL 8: DELETE USER ─────────────────────────────────────── */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-6 rounded-2xl bg-card border border-destructive/30 shadow-2xl space-y-4">
            <div className="space-y-1 text-destructive">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Trash2 className="size-5" /> Delete User Account
              </h3>
              <p className="text-xs text-muted-foreground">
                Are you sure you want to delete {userToDelete.full_name} ({userToDelete.email})?
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Type &quot;DELETE&quot; to confirm:</Label>
              <Input
                placeholder="DELETE"
                value={userDeleteConfirmText}
                onChange={(e) => setUserDeleteConfirmText(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setUserToDelete(null)} className="rounded-xl">
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={userDeleteConfirmText !== "DELETE"}
                onClick={async () => {
                  try {
                    await deleteUserFn({ data: { userId: userToDelete.id } });
                    toast.success("User account deleted");
                    setUserToDelete(null);
                    qc.invalidateQueries({ queryKey: ["users-admin"] });
                  } catch (err: any) {
                    toast.error(err.message || "Failed to delete");
                  }
                }}
                className="rounded-xl"
              >
                Confirm Delete
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
