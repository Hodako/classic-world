"use client";

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Plus,
  Pencil,
  Trash2,
  Eye,
  ThumbsUp,
  Search,
  Sparkles,
  RefreshCw,
  FolderTree,
  Calendar,
  HelpCircle,
  FileText,
  Tag,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listBlogsFn, saveBlogFn, deleteBlogFn, listDivisionsFn } from "@/lib/rpc-admin";
import { QuoraBlogEditor } from "@/components/quora-blog-editor";
import { fmtDateTime } from "@/lib/format";
import type { BlogPost, DivisionItem } from "@/lib/firestore-admin-service";

export function AdminBlogsManager() {
  const qc = useQueryClient();
  const [selectedDivision, setSelectedDivision] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [previewPost, setPreviewPost] = useState<BlogPost | null>(null);

  const blogsQuery = useQuery({
    queryKey: ["admin-blogs", selectedDivision],
    queryFn: () => listBlogsFn({ division: selectedDivision }),
  });

  const divisionsQuery = useQuery({
    queryKey: ["admin-divisions"],
    queryFn: listDivisionsFn,
  });

  const divisionsList: DivisionItem[] = divisionsQuery.data || [];
  const posts: BlogPost[] = blogsQuery.data || [];

  const filteredPosts = posts.filter((p) => {
    const title = (p.title || "").toLowerCase();
    const content = (p.content || "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return title.includes(q) || content.includes(q);
  });

  const handleOpenCreate = () => {
    setEditingPost(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (post: BlogPost) => {
    setEditingPost(post);
    setIsEditorOpen(true);
  };

  const handleSavePost = async (postData: Partial<BlogPost>) => {
    await saveBlogFn(postData);
    setIsEditorOpen(false);
    setEditingPost(null);
    qc.invalidateQueries({ queryKey: ["admin-blogs"] });
  };

  const handleDeletePost = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      await deleteBlogFn(id);
      toast.success("Post deleted successfully");
      qc.invalidateQueries({ queryKey: ["admin-blogs"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete post");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Control Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-foreground">
            <MessageSquare className="size-5 text-pink-500" />
            কোওরা-স্টাইল ব্লগ ও প্রশ্নোত্তর এডিটর (Quora Blog & Q&A)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            প্রশ্নোত্তর, ফ্যাশন গাইড, বিজ্ঞপ্তি ও আর্টিকেল লিখুন, এডিট ও পাবলিশ করুন
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => blogsQuery.refetch()}
            className="text-xs h-8 rounded-xl gap-1.5"
          >
            <RefreshCw className="size-3.5" />
            <span>রিফ্রেশ</span>
          </Button>

          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="text-xs h-8 rounded-xl beveled-button gap-1.5 font-bold"
          >
            <Plus className="size-3.5" />
            <span>নতুন ব্লগ / প্রশ্ন লিখুন</span>
          </Button>
        </div>
      </div>

      {/* ── Inline Editor (When Open) ── */}
      {isEditorOpen ? (
        <div className="animate-in fade-in duration-300">
          <QuoraBlogEditor
            initialPost={editingPost}
            divisions={divisionsList}
            onSave={handleSavePost}
            onCancel={() => setIsEditorOpen(false)}
          />
        </div>
      ) : (
        <>
          {/* ── Search & Division Filter Bar ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-2xl max-w-full overflow-x-auto border border-border/50">
              <button
                type="button"
                onClick={() => setSelectedDivision("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 ${
                  selectedDivision === "all"
                    ? "bg-background text-foreground shadow-xs border border-border/60"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                সকল পোস্ট ({posts.length})
              </button>
              {divisionsList.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDivision(d.name_bn || d.name_en)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 ${
                    selectedDivision === (d.name_bn || d.name_en)
                      ? "bg-background text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.name_bn}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="size-3.5 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="ব্লগ বা প্রশ্ন খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 rounded-xl bg-card border-border/70"
              />
            </div>
          </div>

          {/* ── Quora-Style Posts Stream ── */}
          <div className="space-y-4">
            {filteredPosts.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl bg-card border-border/60 space-y-3">
                <div className="size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <FileText className="size-6" />
                </div>
                <h3 className="text-sm font-bold text-foreground">কোনো ব্লগ বা প্রশ্ন পাওয়া যায়নি</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  আপনার ক্লাসিক ওয়ার্ল্ড স্টোরে নতুন ফ্যাশন গাইড, প্রশ্নোত্তর বা বিজ্ঞপ্তি যোগ করতে ওপরের বাটনে ক্লিক করুন।
                </p>
                <Button size="sm" onClick={handleOpenCreate} className="text-xs rounded-xl beveled-button font-bold">
                  প্রথম পোস্ট তৈরি করুন
                </Button>
              </Card>
            ) : (
              filteredPosts.map((post) => (
                <Card
                  key={post.id}
                  className="p-5 rounded-2xl bg-card border-border/80 shadow-xs hover:shadow-md transition-all space-y-3"
                >
                  {/* Author & Meta */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs">
                        {post.author_name?.charAt(0) || "A"}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{post.author_name}</span>
                          <span className="text-[10px] text-muted-foreground">• {post.author_role || "Admin"}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-2.5" />
                          <span>{fmtDateTime(post.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={post.status === "published" ? "default" : "secondary"}
                        className="text-[10px] py-0 px-2 rounded-full font-medium"
                      >
                        {post.status === "published" ? "লাইভ (Published)" : "খসড়া (Draft)"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-2 rounded-full font-medium border-primary/30 text-primary">
                        {post.division}
                      </Badge>
                    </div>
                  </div>

                  {/* Title & Excerpt */}
                  <div className="space-y-1">
                    <h3
                      onClick={() => setPreviewPost(post)}
                      className="text-base font-bold text-foreground hover:text-primary cursor-pointer transition-colors leading-snug"
                    >
                      {post.title}
                    </h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {post.excerpt || post.content?.replace(/<[^>]*>?/gm, "").slice(0, 180)}
                    </p>
                  </div>

                  {/* Tags */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {post.tags.map((t) => (
                        <span key={t} className="text-[10px] text-primary/80 font-medium bg-primary/5 px-2 py-0.5 rounded-md">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer Stats & Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                    <div className="flex items-center gap-4 text-muted-foreground text-[11px]">
                      <span className="flex items-center gap-1 font-mono">
                        <ThumbsUp className="size-3 text-emerald-500" /> {post.upvotes || 0} লাইক
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <Eye className="size-3 text-blue-500" /> {post.views || 0} বার পঠিত
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <HelpCircle className="size-3 text-amber-500" /> {post.answers_count || 0} মন্তব্য
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewPost(post)}
                        className="h-7 text-xs rounded-lg gap-1 hover:bg-muted"
                      >
                        <Eye className="size-3" />
                        <span>প্রিভিউ</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(post)}
                        className="h-7 text-xs rounded-lg gap-1 hover:bg-muted"
                      >
                        <Pencil className="size-3" />
                        <span>এডিট</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePost(post.id, post.title)}
                        className="h-7 text-xs rounded-lg gap-1 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3" />
                        <span>মুছুন</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Preview Modal ── */}
      {previewPost && (
        <Dialog open={!!previewPost} onOpenChange={() => setPreviewPost(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl p-6 bg-card border-border shadow-2xl space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                  {previewPost.division}
                </Badge>
                <span className="text-xs text-muted-foreground">{fmtDateTime(previewPost.created_at)}</span>
              </div>
              <DialogTitle className="text-xl font-bold text-foreground leading-snug">
                {previewPost.title}
              </DialogTitle>
            </DialogHeader>

            {previewPost.cover_image && (
              <img
                src={previewPost.cover_image}
                alt="Cover"
                className="w-full h-56 object-cover rounded-2xl shadow-sm border border-border"
              />
            )}

            <div
              className="prose dark:prose-invert max-w-none text-sm text-foreground/90 space-y-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary"
              dangerouslySetInnerHTML={{ __html: previewPost.content }}
            />

            <div className="flex items-center justify-between pt-4 border-t border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">লেখক:</span>
                <span className="text-xs font-bold text-foreground">{previewPost.author_name}</span>
                <span className="text-xs text-muted-foreground">({previewPost.author_role})</span>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setPreviewPost(null)}
                className="rounded-xl text-xs"
              >
                বন্ধ করুন
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
