"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  RotateCcw,
  Save,
  CheckCircle2,
  XCircle,
  Shield,
  Layers,
  LayoutDashboard,
  ShoppingBag,
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  CreditCard,
  Box,
  UserCheck,
  BarChart3,
  Sliders,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getNavigationMenusFn, saveNavigationMenusFn } from "@/lib/rpc-admin";
import { DEFAULT_NAV_MENUS, type NavMenuItem } from "@/lib/firestore-admin-service";

export function AdminMenusManager() {
  const qc = useQueryClient();
  const menusQuery = useQuery({
    queryKey: ["admin-menus"],
    queryFn: getNavigationMenusFn,
  });

  const [activeSection, setActiveSection] = useState<"all" | "sidebar" | "header" | "mobile" | "footer">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NavMenuItem | null>(null);

  // Form states
  const [labelBn, setLabelBn] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [route, setRoute] = useState("");
  const [icon, setIcon] = useState("LayoutDashboard");
  const [section, setSection] = useState<"sidebar" | "header" | "mobile" | "footer">("sidebar");
  const [roles, setRoles] = useState<string>("all");
  const [badge, setBadge] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const menusList: NavMenuItem[] = menusQuery.data || DEFAULT_NAV_MENUS;

  const filteredMenus = menusList
    .filter((m) => activeSection === "all" || m.section === activeSection)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const openCreateModal = () => {
    setEditingItem(null);
    setLabelBn("");
    setLabelEn("");
    setRoute("/");
    setIcon("LayoutDashboard");
    setSection(activeSection === "all" ? "sidebar" : activeSection);
    setRoles("all");
    setBadge("");
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (item: NavMenuItem) => {
    setEditingItem(item);
    setLabelBn(item.label_bn || "");
    setLabelEn(item.label_en || "");
    setRoute(item.route || "/");
    setIcon(item.icon || "LayoutDashboard");
    setSection(item.section || "sidebar");
    setRoles(item.roles?.join(",") || "all");
    setBadge(item.badge || "");
    setIsActive(item.is_active ?? true);
    setModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!labelBn.trim() && !labelEn.trim()) {
      toast.error("Please provide a menu title in Bengali or English.");
      return;
    }

    setSaving(true);
    try {
      const updatedList = [...menusList];
      const rolesArray = roles.split(",").map((r) => r.trim()).filter(Boolean);

      if (editingItem) {
        const idx = updatedList.findIndex((m) => m.id === editingItem.id);
        if (idx >= 0) {
          updatedList[idx] = {
            ...updatedList[idx],
            label_bn: labelBn.trim() || labelEn.trim(),
            label_en: labelEn.trim() || labelBn.trim(),
            route: route.trim(),
            icon,
            section,
            roles: rolesArray.length > 0 ? rolesArray : ["all"],
            badge: badge.trim() || undefined,
            is_active: isActive,
          };
        }
      } else {
        const newItem: NavMenuItem = {
          id: `menu_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          label_bn: labelBn.trim() || labelEn.trim(),
          label_en: labelEn.trim() || labelBn.trim(),
          route: route.trim(),
          icon,
          section,
          roles: rolesArray.length > 0 ? rolesArray : ["all"],
          badge: badge.trim() || undefined,
          is_active: isActive,
          sort_order: updatedList.length + 1,
        };
        updatedList.push(newItem);
      }

      await saveNavigationMenusFn(updatedList);
      toast.success(editingItem ? "Menu item updated!" : "New menu item added!");
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-menus"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save menu");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    const updated = menusList.map((m) => (m.id === id ? { ...m, is_active: !current } : m));
    try {
      await saveNavigationMenusFn(updated);
      toast.success("Menu status updated");
      qc.invalidateQueries({ queryKey: ["admin-menus"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update menu");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove menu "${name}"?`)) return;
    const updated = menusList.filter((m) => m.id !== id);
    try {
      await saveNavigationMenusFn(updated);
      toast.success(`Menu "${name}" removed`);
      qc.invalidateQueries({ queryKey: ["admin-menus"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const handleMoveOrder = async (id: string, direction: "up" | "down") => {
    const sorted = [...menusList].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = sorted.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    // Swap sort orders
    const currentOrder = sorted[idx].sort_order;
    sorted[idx].sort_order = sorted[targetIdx].sort_order;
    sorted[targetIdx].sort_order = currentOrder;

    try {
      await saveNavigationMenusFn(sorted);
      qc.invalidateQueries({ queryKey: ["admin-menus"] });
    } catch (err: any) {
      toast.error("Failed to reorder");
    }
  };

  const handleResetDefaults = async () => {
    if (!confirm("Are you sure you want to reset all menus to system defaults?")) return;
    try {
      await saveNavigationMenusFn(DEFAULT_NAV_MENUS);
      toast.success("Navigation menus reset to defaults");
      qc.invalidateQueries({ queryKey: ["admin-menus"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to reset");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
            <Menu className="size-5 text-primary" />
            ন্যাভিগেশন ও মেনু ম্যানেজার (Navigation Menus)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            সাইডবার, মোবাইল বার ও হেডারের মেনু তালিকা ইচ্ছামতো সাজান, এডিট বা যোগ করুন
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleResetDefaults}
            className="text-xs h-8 rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            <span>ডিফল্ট রিস্টোর</span>
          </Button>
          <Button
            size="sm"
            onClick={openCreateModal}
            className="text-xs h-8 rounded-xl beveled-button gap-1.5 font-bold"
          >
            <Plus className="size-3.5" />
            <span>নতুন মেনু যোগ করুন</span>
          </Button>
        </div>
      </div>

      {/* Section Filter Pills */}
      <div className="flex items-center gap-1.5 bg-muted/50 p-1 rounded-2xl max-w-full overflow-x-auto border border-border/50">
        {[
          { id: "all", label: "সকল মেনু (All)" },
          { id: "sidebar", label: "সাইডবার মেনু (Sidebar)" },
          { id: "header", label: "হেডার লিংক (Header)" },
          { id: "mobile", label: "মোবাইল বার (Mobile Bar)" },
          { id: "footer", label: "ফুটার লিংক (Footer)" },
        ].map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => setActiveSection(sec.id as any)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 ${
              activeSection === sec.id
                ? "bg-background text-foreground shadow-xs border border-border/60"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* Menu Items Table / Cards */}
      <Card className="rounded-2xl border-border/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/60 text-muted-foreground uppercase font-semibold tracking-wider text-[10px] border-b border-border/60">
              <tr>
                <th className="py-3 px-4">ক্রম</th>
                <th className="py-3 px-4">মেনু শিরোনাম</th>
                <th className="py-3 px-4">রুট / লিংক</th>
                <th className="py-3 px-4">সেকশন</th>
                <th className="py-3 px-4">অনুমতি</th>
                <th className="py-3 px-4 text-center">স্ট্যাটাস</th>
                <th className="py-3 px-4 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredMenus.map((item, index) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span>{item.sort_order ?? index + 1}</span>
                      <div className="flex flex-col ml-1">
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(item.id, "up")}
                          className="hover:text-primary p-0.5"
                          title="Move Up"
                        >
                          <ArrowUp className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveOrder(item.id, "down")}
                          className="hover:text-primary p-0.5"
                          title="Move Down"
                        >
                          <ArrowDown className="size-3" />
                        </button>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                        <Layers className="size-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-foreground text-xs">{item.label_bn}</div>
                        <div className="text-[10px] text-muted-foreground">{item.label_en}</div>
                      </div>
                      {item.badge && (
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-primary border-primary/30">
                          {item.badge}
                        </Badge>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-foreground/80">
                    <span className="bg-muted px-2 py-0.5 rounded-md border border-border/50">{item.route}</span>
                  </td>

                  <td className="py-3 px-4">
                    <Badge variant="secondary" className="capitalize text-[10px] py-0 px-2 font-medium">
                      {item.section}
                    </Badge>
                  </td>

                  <td className="py-3 px-4 text-[11px] text-muted-foreground font-mono">
                    {item.roles?.includes("all") ? "সকল ব্যবহারকারী" : item.roles?.join(", ")}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item.id, item.is_active)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer transition-all ${
                        item.is_active
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {item.is_active ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                      <span>{item.is_active ? "সক্রিয়" : "বন্ধ"}</span>
                    </button>
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(item)}
                        className="size-7 rounded-lg text-foreground hover:bg-muted"
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(item.id, item.label_bn || item.label_en)}
                        className="size-7 rounded-lg text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit / Add Menu Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Menu className="size-5 text-primary" />
              <span>{editingItem ? "মেনু আইটেম সম্পাদনা" : "নতুন মেনু আইটেম যোগ"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveModal} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">শিরোনাম (বাংলায়) *</Label>
                <Input
                  required
                  placeholder="যেমন: বিক্রয় (POS)"
                  value={labelBn}
                  onChange={(e) => setLabelBn(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Title (English) *</Label>
                <Input
                  required
                  placeholder="e.g. Sales POS"
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">রুট / পেইজ লিংক (Route) *</Label>
              <Input
                required
                placeholder="যেমন: /sales বা /dashboard"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">সেকশন (Section)</Label>
                <Select value={section} onValueChange={(val: any) => setSection(val)}>
                  <SelectTrigger className="h-9 text-xs rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sidebar">সাইডবার (Sidebar)</SelectItem>
                    <SelectItem value="header">হেডার (Header)</SelectItem>
                    <SelectItem value="mobile">মোবাইল বার (Mobile)</SelectItem>
                    <SelectItem value="footer">ফুটার (Footer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">ব্যাজ (ঐচ্ছিক)</Label>
                <Input
                  placeholder="যেমন: New বা Pro"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">অনুমতি (Roles, কমা দিয়ে আলাদা করুন)</Label>
              <Input
                placeholder="all অথবা owner, manager, cashier"
                value={roles}
                onChange={(e) => setRoles(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-semibold cursor-pointer" htmlFor="menu-active">
                এই মেনু আইটেমটি সক্রিয় রাখুন
              </Label>
              <input
                id="menu-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4 rounded accent-primary cursor-pointer"
              />
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)} className="rounded-xl">
                বাতিল
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="rounded-xl beveled-button px-5 font-bold">
                {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
