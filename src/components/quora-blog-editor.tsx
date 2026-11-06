"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  Quote,
  Code,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  Minus,
  Sparkles,
  Send,
  Eye,
  Check,
  X,
  Tag,
  Globe,
  Lock,
  MessageSquare,
  HelpCircle,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { BlogPost, DivisionItem } from "@/lib/firestore-admin-service";

interface QuoraBlogEditorProps {
  initialPost?: Partial<BlogPost> | null;
  divisions: DivisionItem[];
  onSave: (post: Partial<BlogPost>) => Promise<void>;
  onCancel?: () => void;
}

export function QuoraBlogEditor({ initialPost, divisions, onSave, onCancel }: QuoraBlogEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [postType, setPostType] = useState<"question" | "post">("post");
  const [title, setTitle] = useState(initialPost?.title || "");
  const [division, setDivision] = useState(initialPost?.division || (divisions[0]?.name_bn || "সাধারণ"));
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initialPost?.tags || ["ক্লাসিক ওয়ার্ল্ড"]);
  const [coverImage, setCoverImage] = useState(initialPost?.cover_image || "");
  const [status, setStatus] = useState<"published" | "draft">(initialPost?.status === "draft" ? "draft" : "published");
  const [previewMode, setPreviewMode] = useState(false);
  const [authorName, setAuthorName] = useState(initialPost?.author_name || "Azizul Hakim");
  const [authorRole, setAuthorRole] = useState(initialPost?.author_role || "Store Owner & Admin");
  const [saving, setSaving] = useState(false);

  // Initialize editor content
  useEffect(() => {
    if (editorRef.current && initialPost?.content) {
      editorRef.current.innerHTML = initialPost.content;
    }
  }, [initialPost]);

  // Execute formatting commands
  const format = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  };

  const handleAddLink = () => {
    const url = prompt("Enter link URL (e.g. https://...):");
    if (url) {
      format("createLink", url);
    }
  };

  const handleAddImage = () => {
    const url = prompt("Enter Image URL:");
    if (url) {
      format("insertImage", url);
    }
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = tagInput.trim().replace(/^#/, "");
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed]);
        setTagInput("");
      }
    }
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter((tag) => tag !== t));
  };

  const handleSubmit = async (submitStatus = status) => {
    const contentHtml = editorRef.current ? editorRef.current.innerHTML : "";
    if (!title.trim()) {
      toast.error("Please enter a question or title for your post.");
      return;
    }
    if (!contentHtml.trim() || contentHtml === "<br>") {
      toast.error("Please provide some content or details for your post.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initialPost?.id,
        title: title.trim(),
        division,
        content: contentHtml,
        tags,
        cover_image: coverImage.trim() || undefined,
        status: submitStatus,
        author_name: authorName.trim(),
        author_role: authorRole.trim(),
        created_at: initialPost?.created_at,
      });
      toast.success(submitStatus === "published" ? "Post published successfully!" : "Draft saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border/80 rounded-2xl shadow-xl overflow-hidden max-w-4xl mx-auto flex flex-col">
      {/* ── Quora-Style Top Tabs (Add Question vs Create Post) ── */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-3">
        <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setPostType("post")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              postType === "post" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>ব্লগ / অনুচ্ছেদ (Create Post)</span>
          </button>
          <button
            type="button"
            onClick={() => setPostType("question")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
              postType === "question" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HelpCircle className="size-3.5 text-amber-500" />
            <span>প্রশ্ন ও মতামত (Ask Question)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMode(!previewMode)}
            className="text-xs h-8 gap-1.5 font-medium"
          >
            <Eye className="size-3.5" />
            <span>{previewMode ? "এডিটর মোড" : "প্রিভিউ মোড"}</span>
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="size-8 rounded-full">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5 flex-1">
        {/* ── Quora-Style Author & Space Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm shadow-2xs">
              {authorName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{authorName}</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-primary border-primary/30">
                  {authorRole}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Globe className="size-3 text-emerald-500" />
                <span>সবার জন্য উন্মুক্ত • পাবলিক প্ল্যাটফর্ম</span>
              </div>
            </div>
          </div>

          {/* Division / Space Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <FolderTree className="size-3.5" /> বিভাগ / স্পেস:
            </span>
            <Select value={division} onValueChange={setDivision}>
              <SelectTrigger className="h-8 text-xs w-[180px] rounded-xl bg-background border-border">
                <SelectValue placeholder="বিভাগ নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.name_bn || d.name_en} className="text-xs">
                    {d.name_bn} ({d.name_en})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Title / Question Input ── */}
        <div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              postType === "question"
                ? "আপনার প্রশ্ন বা জিজ্ঞাসা কী? যেমন: 'কীভাবে দ্রুত বারকোড সেল করব?'..."
                : "ব্লগ বা লেখার আকর্ষণীয় শিরোনাম লিখুন..."
            }
            className="text-lg md:text-xl font-bold border-0 border-b border-border/60 rounded-none px-0 py-2 focus-visible:ring-0 placeholder:text-muted-foreground/60"
          />
        </div>

        {/* ── Cover Image (Optional) ── */}
        <div className="flex items-center gap-2 bg-muted/20 p-2 rounded-xl border border-dashed border-border/60 text-xs">
          <ImageIcon className="size-4 text-muted-foreground shrink-0" />
          <Input
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="কভার ছবি URL (ঐচ্ছিক, যেমন: https://.../banner.png)"
            className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-1"
          />
          {coverImage && (
            <img src={coverImage} alt="Cover" className="h-7 w-12 object-cover rounded border border-border" />
          )}
        </div>

        {/* ── Quora-Style Floating Toolbar ── */}
        {!previewMode && (
          <div className="flex flex-wrap items-center gap-1 bg-muted/40 p-1.5 rounded-xl border border-border/60 select-none shadow-2xs">
            <button
              type="button"
              onClick={() => format("bold")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Bold (Ctrl+B)"
            >
              <Bold className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("italic")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Italic (Ctrl+I)"
            >
              <Italic className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("strikeThrough")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Strikethrough"
            >
              <Strikethrough className="size-4" />
            </button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            <button
              type="button"
              onClick={() => format("formatBlock", "<h2>")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Large Heading"
            >
              <Heading2 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("formatBlock", "<h3>")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Medium Heading"
            >
              <Heading3 className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("formatBlock", "<blockquote>")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Quote Block"
            >
              <Quote className="size-4" />
            </button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            <button
              type="button"
              onClick={() => format("insertUnorderedList")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Bullet List"
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("insertOrderedList")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Numbered List"
            >
              <ListOrdered className="size-4" />
            </button>

            <div className="h-4 w-px bg-border/60 mx-1" />

            <button
              type="button"
              onClick={handleAddLink}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Insert Link"
            >
              <LinkIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={handleAddImage}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Insert Image"
            >
              <ImageIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => format("insertHorizontalRule")}
              className="p-1.5 rounded hover:bg-background text-foreground/80 hover:text-foreground transition-all"
              title="Horizontal Divider"
            >
              <Minus className="size-4" />
            </button>
          </div>
        )}

        {/* ── Content Area / Preview Mode ── */}
        {previewMode ? (
          <div className="min-h-[260px] p-4 bg-muted/10 rounded-xl border border-border/60 space-y-4">
            {coverImage && (
              <img src={coverImage} alt="Cover" className="w-full h-48 object-cover rounded-xl shadow-xs" />
            )}
            <h1 className="text-2xl font-bold text-foreground">{title || "শিরোনামহীন পোস্ট"}</h1>
            <div
              className="prose dark:prose-invert max-w-none text-sm text-foreground/90 space-y-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-bold [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
              dangerouslySetInnerHTML={{
                __html: editorRef.current?.innerHTML || "<p className='text-muted-foreground'>কোনো বিবরণ লেখা হয়নি...</p>",
              }}
            />
          </div>
        ) : (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[260px] max-h-[480px] overflow-y-auto p-4 rounded-xl border border-border/80 bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 text-sm leading-relaxed text-foreground [&_h2]:text-xl [&_h2]:font-bold [&_h2]:my-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:my-1.5 [&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline"
            data-placeholder="আপনার মতামত, উত্তর বা অনুচ্ছেদ এখানে সুন্দরভাবে সাজিয়ে লিখুন..."
          />
        )}

        {/* ── Tags / Topics Input (Quora Spaces) ── */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
            <Tag className="size-3.5" /> ট্যাগ ও প্রাসঙ্গিক বিষয়সমূহ (Enter চেপে ট্যাগ যোগ করুন):
          </Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="text-xs py-1 px-2.5 rounded-lg flex items-center gap-1.5 bg-muted/80 text-foreground font-medium"
              >
                <span>#{t}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-destructive transition-colors"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="নতুন ট্যাগ লিখুন..."
              className="h-7 text-xs w-36 rounded-lg bg-background border-border/60"
            />
          </div>
        </div>
      </div>

      {/* ── Action Footer ── */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-6 py-3.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleSubmit("draft")}
            disabled={saving}
            className="text-xs h-9 rounded-xl font-medium border-border"
          >
            খসড়া সংরক্ষণ (Save Draft)
          </Button>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {status === "published" ? "✓ এটি তাৎক্ষণিক লাইভ হবে" : "○ খসড়া হিসেবে সংরক্ষিত থাকবে"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={saving}
              className="text-xs h-9 rounded-xl"
            >
              বাতিল
            </Button>
          )}
          <Button
            type="button"
            onClick={() => handleSubmit("published")}
            disabled={saving}
            className="text-xs h-9 px-5 rounded-xl font-bold beveled-button gap-1.5"
          >
            <Send className="size-3.5" />
            <span>{saving ? "পোস্ট হচ্ছে..." : "প্রকাশ করুন (Publish)"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
