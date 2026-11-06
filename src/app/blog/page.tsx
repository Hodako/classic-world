"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Search,
  ThumbsUp,
  Eye,
  Share2,
  Calendar,
  User,
  Sparkles,
  ArrowRight,
  Plus,
  BookOpen,
  Filter,
  Check,
  Tag,
  ChevronDown,
  Layers,
  HelpCircle,
  Clock,
  ArrowLeft,
  Flame,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { listBlogsFn, listDivisionsFn, upvoteBlogFn, incrementBlogViewsFn } from "@/lib/rpc-admin";
import type { BlogPost, DivisionItem } from "@/lib/firestore-admin-service";

export default function BlogPage() {
  const { lang } = useT();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedDivision, setSelectedDivision] = useState<string>("all");
  const [readingPost, setReadingPost] = useState<BlogPost | null>(null);
  const [upvotedPosts, setUpvotedPosts] = useState<Record<string, boolean>>({});

  // Fetch blogs & divisions
  const blogsQuery = useQuery({
    queryKey: ["public-blogs"],
    queryFn: () => listBlogsFn(),
  });

  const divisionsQuery = useQuery({
    queryKey: ["public-divisions"],
    queryFn: () => listDivisionsFn(),
  });

  const blogs: BlogPost[] = Array.isArray(blogsQuery.data) ? blogsQuery.data : [];
  const divisions: DivisionItem[] = Array.isArray(divisionsQuery.data) ? divisionsQuery.data : [];

  // Filter published blogs only for public view (unless admin preview)
  const publishedBlogs = useMemo(() => {
    return blogs.filter((b) => b.is_published !== false);
  }, [blogs]);

  const filteredBlogs = useMemo(() => {
    let list = publishedBlogs;
    if (selectedDivision !== "all") {
      list = list.filter((b) => b.division === selectedDivision);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.content.toLowerCase().includes(q) ||
          (b.tags && b.tags.some((t) => t.toLowerCase().includes(q))) ||
          (b.author_name && b.author_name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [publishedBlogs, selectedDivision, search]);

  const handleUpvote = async (post: BlogPost, e: React.MouseEvent) => {
    e.stopPropagation();
    if (upvotedPosts[post.id]) {
      toast.info(lang === "bn" ? "আপনি ইতোমধ্যে আপভোট করেছেন" : "Already upvoted!");
      return;
    }
    try {
      setUpvotedPosts((prev) => ({ ...prev, [post.id]: true }));
      await upvoteBlogFn(post.id);
      qc.setQueryData(["public-blogs"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((b: BlogPost) => (b.id === post.id ? { ...b, upvotes: (b.upvotes || 0) + 1 } : b));
      });
      toast.success(lang === "bn" ? "আপভোট সফল হয়েছে!" : "Upvoted!");
    } catch {
      toast.error(lang === "bn" ? "আপভোট ব্যর্থ হয়েছে" : "Failed to upvote");
    }
  };

  const handleOpenPost = (post: BlogPost) => {
    setReadingPost(post);
    void incrementBlogViewsFn(post.id);
  };

  const handleShare = (post: BlogPost, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.origin + `/blog?id=${post.id}`);
      toast.success(lang === "bn" ? "পোস্টের লিংক কপি করা হয়েছে!" : "Link copied to clipboard!");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Banner / Hero */}
      <div className="relative border-b border-border/80 bg-gradient-to-b from-primary/5 via-background to-background py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>{lang === "bn" ? "ড্যাশবোর্ডে ফিরুন" : "Back to Dashboard"}</span>
            </Link>

            <Link href="/whoisadmin">
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1.5 h-8 border-primary/30 text-primary hover:bg-primary/10">
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "প্রশ্ন বা আর্টিকেল লিখুন" : "Write Article / Ask"}</span>
              </Button>
            </Link>
          </div>

          <div className="space-y-2 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide">
              <Sparkles className="size-3.5" />
              <span>{lang === "bn" ? "ক্লাসিক ওয়ার্ল্ড ফ্যাশন ফোরাম ও স্পেস" : "Classic World Knowledge & Style Space"}</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">
              {lang === "bn" ? "ফ্যাশন টিপস, প্রোডাক্ট গাইড ও প্রশ্নোত্তর" : "Fashion Insights, Guides & Community Q&A"}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {lang === "bn"
                ? "আমাদের নতুন কালেকশন, সাইজ গাইড, ফ্যাব্রিক কেয়ার এবং ফ্যাশন বিষয়ক যে কোনো প্রশ্নোত্তর পড়ুন ও জানুন।"
                : "Explore style inspirations, garment care guides, questions, and expert fashion answers from our team."}
            </p>
          </div>

          {/* Search Box */}
          <div className="relative max-w-2xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                lang === "bn"
                  ? "যেকোনো ফ্যাশন প্রশ্ন, বিষয় বা ট্যাগ খুঁজুন..."
                  : "Search questions, fashion spaces, tags..."
              }
              className="h-11 pl-10 pr-4 rounded-2xl bg-card border-border/80 text-sm shadow-sm focus-visible:ring-primary/40"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Spaces / Division Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <Button
            size="sm"
            variant={selectedDivision === "all" ? "default" : "outline"}
            onClick={() => setSelectedDivision("all")}
            className="rounded-full text-xs font-semibold h-8 shrink-0 px-3.5 shadow-2xs"
          >
            <Layers className="size-3.5 mr-1.5" />
            <span>{lang === "bn" ? "সকল স্পেস" : "All Spaces"}</span>
          </Button>

          {divisions.map((div) => (
            <Button
              key={div.id}
              size="sm"
              variant={selectedDivision === div.name_bn || selectedDivision === div.name_en ? "default" : "outline"}
              onClick={() => setSelectedDivision(selectedDivision === div.name_bn ? "all" : div.name_bn)}
              className="rounded-full text-xs font-semibold h-8 shrink-0 px-3.5 shadow-2xs"
            >
              <span>{lang === "bn" ? div.name_bn : div.name_en}</span>
            </Button>
          ))}
        </div>

        {/* Content Feed */}
        {blogsQuery.isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="size-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">{lang === "bn" ? "পোস্ট লোড হচ্ছে..." : "Loading articles..."}</p>
          </div>
        ) : filteredBlogs.length === 0 ? (
          <Card className="p-12 text-center rounded-3xl border-dashed border-2 border-border/70 bg-card/40 space-y-4">
            <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto text-muted-foreground">
              <BookOpen className="size-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">
                {lang === "bn" ? "কোনো পোস্ট পাওয়া যায়নি" : "No articles or questions found"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {lang === "bn"
                  ? "এই বিভাগে এখনও কোনো আর্টিকেল বা প্রশ্নোত্তর যোগ করা হয়নি।"
                  : "No published questions or guides match your current filter."}
              </p>
            </div>
            <Link href="/whoisadmin">
              <Button size="sm" className="rounded-xl text-xs gap-1.5">
                <Plus className="size-3.5" />
                <span>{lang === "bn" ? "প্রথম পোস্টটি লিখুন" : "Create First Article"}</span>
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredBlogs.map((post) => (
              <Card
                key={post.id}
                onClick={() => handleOpenPost(post)}
                className="group p-5 sm:p-6 rounded-3xl border-border/80 bg-card hover:border-primary/40 hover:shadow-lg transition-all cursor-pointer space-y-4"
              >
                {/* Author & Meta Line */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar className="size-9 border border-border/70">
                      <AvatarImage src={post.author_avatar || "/logo.png"} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
                        {(post.author_name || "A")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{post.author_name || "Classic World Team"}</span>
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 rounded-md font-medium">
                          {post.division}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{post.author_role || "Fashion Editor"}</span>
                        <span>•</span>
                        <span>
                          {post.created_at ? new Date(post.created_at).toLocaleDateString(lang === "bn" ? "bn-BD" : "en-US") : "Recently"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <Badge variant="outline" className="text-[10px] font-mono border-primary/20 text-primary bg-primary/5">
                    {post.post_type === "qa" ? (lang === "bn" ? "প্রশ্নোত্তর" : "Q&A") : (lang === "bn" ? "আর্টিকেল" : "Article")}
                  </Badge>
                </div>

                {/* Title */}
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                  {post.title}
                </h2>

                {/* Cover Image (if any) */}
                {post.cover_image && (
                  <div className="rounded-2xl overflow-hidden border border-border/60 max-h-72 bg-muted/30">
                    <img
                      src={post.cover_image}
                      alt={post.title}
                      className="w-full h-full object-cover max-h-72 hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>
                )}

                {/* Excerpt / Summary */}
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                  {post.excerpt || post.content.replace(/<[^>]*>?/gm, "").slice(0, 200) + "..."}
                </p>

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-muted text-muted-foreground"
                      >
                        <Tag className="size-2.5 opacity-60" />
                        <span>#{tag}</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* Action Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleUpvote(post, e)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer ${
                        upvotedPosts[post.id]
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/60 hover:bg-muted text-foreground border-border/70"
                      }`}
                    >
                      <ThumbsUp className="size-3.5" />
                      <span>{post.upvotes || 0}</span>
                    </button>

                    <div className="flex items-center gap-1 px-2.5 py-1 text-muted-foreground">
                      <Eye className="size-3.5" />
                      <span>{post.views || 0}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleShare(post, e)}
                      className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title={lang === "bn" ? "শেয়ার করুন" : "Share post"}
                    >
                      <Share2 className="size-4" />
                    </button>
                    <span className="text-primary font-bold inline-flex items-center gap-1 text-xs group-hover:translate-x-0.5 transition-transform">
                      <span>{lang === "bn" ? "বিস্তারিত পড়ুন" : "Read more"}</span>
                      <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Full Article Reading Dialog */}
      {readingPost && (
        <Dialog open={Boolean(readingPost)} onOpenChange={() => setReadingPost(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8 bg-card border-border shadow-2xl z-[10000]">
            <DialogHeader className="space-y-3 pb-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-lg">
                  {readingPost.division}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {readingPost.created_at ? new Date(readingPost.created_at).toLocaleDateString() : ""}
                </span>
              </div>
              <DialogTitle className="text-xl sm:text-2xl font-black tracking-tight text-foreground leading-snug">
                {readingPost.title}
              </DialogTitle>
              <div className="flex items-center gap-2 pt-1">
                <Avatar className="size-8 border">
                  <AvatarImage src={readingPost.author_avatar || "/logo.png"} />
                  <AvatarFallback>{readingPost.author_name?.[0] || "A"}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-xs font-bold text-foreground">{readingPost.author_name}</div>
                  <div className="text-[10px] text-muted-foreground">{readingPost.author_role}</div>
                </div>
              </div>
            </DialogHeader>

            {readingPost.cover_image && (
              <div className="rounded-2xl overflow-hidden border border-border/60 my-4 max-h-80 bg-muted/20">
                <img
                  src={readingPost.cover_image}
                  alt={readingPost.title}
                  className="w-full h-full object-cover max-h-80"
                />
              </div>
            )}

            <div
              className="prose prose-sm sm:prose-base dark:prose-invert max-w-none py-4 text-foreground/90 leading-relaxed font-sans"
              dangerouslySetInnerHTML={{ __html: readingPost.content }}
            />

            {readingPost.tags && readingPost.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-border/60">
                {readingPost.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            <DialogFooter className="flex sm:flex-row flex-col justify-between items-center gap-2 pt-4 border-t border-border/60">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => handleUpvote(readingPost, e)}
                  className="rounded-xl text-xs gap-1.5 font-bold"
                >
                  <ThumbsUp className="size-3.5" />
                  <span>{lang === "bn" ? "আপভোট" : "Upvote"} ({readingPost.upvotes || 0})</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleShare(readingPost, e)}
                  className="rounded-xl text-xs gap-1.5"
                >
                  <Share2 className="size-3.5" />
                  <span>{lang === "bn" ? "শেয়ার" : "Share"}</span>
                </Button>
              </div>

              <Button
                size="sm"
                onClick={() => setReadingPost(null)}
                className="rounded-xl text-xs w-full sm:w-auto"
              >
                {lang === "bn" ? "বন্ধ করুন" : "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
