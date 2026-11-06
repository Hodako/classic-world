"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  RefreshCw,
  Folder,
  ShoppingBag,
  Shirt,
  Smile,
  BookOpen,
  MessageSquare,
  Tag,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listDivisionsFn, saveDivisionFn, deleteDivisionFn } from "@/lib/rpc-admin";
import type { DivisionItem } from "@/lib/firestore-admin-service";

const ICON_OPTIONS = [
  { name: "Folder", icon: Folder },
  { name: "Shirt", icon: Shirt },
  { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Sparkles", icon: Sparkles },
  { name: "Smile", icon: Smile },
  { name: "BookOpen", icon: BookOpen },
  { name: "MessageSquare", icon: MessageSquare },
  { name: "Tag", icon: Tag },
];

export function AdminDivisionsManager() {
  const qc = useQueryClient();
  const divisionsQuery = useQuery({
    queryKey: ["admin-divisions"],
    queryFn: listDivisionsFn,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Partial<DivisionItem> | null>(null);
  const [nameBn, setNameBn] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("Folder");
  const [color, setColor] = useState("#3B82F6");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(1);
  const [saving, setSaving] = useState(false);

  const openCreateModal = () => {
    setEditingDivision(null);
    setNameBn("");
    setNameEn("");
    setSlug("");
    setDescription("");
    setIcon("Folder");
    setColor("#3B82F6");
    setIsActive(true);
    setSortOrder((divisionsQuery.data?.length || 0) + 1);
    setModalOpen(true);
  };

  const openEditModal = (div: DivisionItem) => {
    setEditingDivision(div);
    setNameBn(div.name_bn || "");
    setNameEn(div.name_en || "");
    setSlug(div.slug || "");
    setDescription(div.description || "");
    setIcon(div.icon || "Folder");
    setColor(div.color || "#3B82F6");
    setIsActive(div.is_active ?? true);
    setSortOrder(div.sort_order ?? 1);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameBn.trim() && !nameEn.trim()) {
      toast.error("Please enter a division name in Bengali or English.");
      return;
    }

    setSaving(true);
    try {
      await saveDivisionFn({
        id: editingDivision?.id,
        name_bn: nameBn.trim() || nameEn.trim(),
        name_en: nameEn.trim() || nameBn.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        icon,
        color,
        is_active: isActive,
        sort_order: Number(sortOrder) || 1,
      });
      toast.success(editingDivision ? "Division updated successfully!" : "New division created successfully!");
      setModalOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-divisions"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save division");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete division "${name}"?`)) return;
    try {
      await deleteDivisionFn(id);
      toast.success(`Division "${name}" deleted`);
      qc.invalidateQueries({ queryKey: ["admin-divisions"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete division");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
            <FolderTree className="size-5 text-primary" />
            স্টোর ও ব্লগ বিভাগসমূহ (Divisions & Categories)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            পোশাক বিভাগ, ক্যাটাগরি এবং ব্লগের স্পেসগুলো পরিচালনা ও সাজিয়ে রাখুন
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => divisionsQuery.refetch()}
            className="text-xs h-8 rounded-xl gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            <span>রিফ্রেশ</span>
          </Button>
          <Button
            size="sm"
            onClick={openCreateModal}
            className="text-xs h-8 rounded-xl beveled-button gap-1.5 font-bold"
          >
            <Plus className="size-3.5" />
            <span>নতুন বিভাগ যোগ করুন</span>
          </Button>
        </div>
      </div>

      {/* Grid of Divisions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(divisionsQuery.data || []).map((div: DivisionItem) => (
          <Card
            key={div.id}
            className="p-4 rounded-2xl bg-card border-border/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="size-9 rounded-xl flex items-center justify-center text-white shadow-2xs font-bold"
                    style={{ backgroundColor: div.color || "#3B82F6" }}
                  >
                    <Folder className="size-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground leading-tight">{div.name_bn}</h3>
                    <span className="text-[11px] text-muted-foreground font-medium">{div.name_en}</span>
                  </div>
                </div>

                <Badge
                  variant={div.is_active ? "default" : "secondary"}
                  className="text-[10px] py-0 px-2 rounded-full font-medium"
                >
                  {div.is_active ? "সক্রিয় (Active)" : "নিষ্ক্রিয়"}
                </Badge>
              </div>

              {div.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{div.description}</p>
              )}

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono pt-1">
                <span>স্লাগ: /{div.slug}</span>
                <span>• ক্রম: {div.sort_order}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/60">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEditModal(div)}
                className="h-7 text-xs rounded-lg gap-1 hover:bg-muted text-foreground"
              >
                <Pencil className="size-3" />
                <span>এডিট</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(div.id, div.name_bn || div.name_en)}
                className="h-7 text-xs rounded-lg gap-1 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3" />
                <span>মুছুন</span>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Create / Edit Division Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <FolderTree className="size-5 text-primary" />
              <span>{editingDivision ? "বিভাগ সম্পাদনা করুন" : "নতুন বিভাগ যুক্ত করুন"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">নাম (বাংলায়) *</Label>
                <Input
                  required
                  placeholder="যেমন: ছেলেদের পোশাক"
                  value={nameBn}
                  onChange={(e) => setNameBn(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Name (English)</Label>
                <Input
                  placeholder="e.g. Men's Wear"
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">স্লাগ / URL কোড</Label>
              <Input
                placeholder="যেমন: mens-collection"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">বিবরণ (ঐচ্ছিক)</Label>
              <Input
                placeholder="এই বিভাগের সংক্ষিপ্ত পরিচিতি..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">রঙের কোড</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="size-8 rounded-lg border border-border cursor-pointer p-0.5"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="rounded-xl text-xs font-mono h-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">ক্রমিক নম্বর</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="rounded-xl text-xs h-8"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <Label className="text-xs font-semibold cursor-pointer" htmlFor="div-active">
                এই বিভাগটি সক্রিয় রাখুন
              </Label>
              <input
                id="div-active"
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
