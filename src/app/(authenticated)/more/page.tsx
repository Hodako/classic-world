"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  ShoppingCart, Receipt, PiggyBank, DollarSign,
  Banknote, BarChart3, Settings, FileText, Users,
  LogOut, TrendingUp, TrendingDown, GripVertical, Palette,
  Layout, Type, Image as ImageIcon, Sparkles, LayoutGrid, AlignLeft, AlignCenter, AlignRight,
  Bot, Send, Loader2, HelpCircle, RefreshCw, Landmark, MessageSquare, BarChart2,
  UserCheck, UserPlus, ShieldCheck, Check, Copy, Edit, Trash2, Key, KeyRound, Mail, Eye, EyeOff, Lock, User, Shield, AlertTriangle, Store, Upload, Wallet, Shirt
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { canAccess, resolvePermissions, type PermissionSet, DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createProfileFn,
  switchProfileFn,
  importProfileModuleFn,
  createSaleFn,
  createExpenseFn,
  createPurchaseFn,
  createCashboxFn,
  listShopEmployeesFn,
  createShopEmployeeFn,
  updateShopEmployeeFn,
  deleteShopEmployeeFn,
  inviteEmployeeByEmailFn,
  listEmployeeInvitationsFn,
  cancelEmployeeInvitationFn,
  uploadImageFn,
} from "@/lib/rpc";
import { updateBusinessSettingsFn, getBusinessSettingsFn } from "@/lib/rpc-admin";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { getProducts } from "@/lib/queries";
import { useCachedQuery } from "@/hooks/use-cached-query";
import { ProductSearchSelect } from "@/components/product-search";
import { PWAInstallButton } from "@/components/pwa-install-button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const businessLinks = [
  { to: "#shop-profile",   labelKey: "shop_profile",    desc: "Update shop name, logo, address & invoice terms", icon: Store, perm: "settings"   as const },
  { to: "/sms",            labelKey: "sms_management",  desc: "Send bulk SMS, offers & auto triggers", icon: MessageSquare, perm: "sales"      as const },
  { to: "/invoices",       labelKey: "invoice_generator", desc: "Create & customize invoices", icon: FileText,     perm: "sales"      as const },
  { to: "/purchases",      labelKey: "new_purchase",    desc: "Log product inventory buys", icon: ShoppingCart, perm: "purchases"  as const },
  { to: "/online-sells",   labelKey: "online_sell",     desc: "Track web and online sales", icon: DollarSign,   perm: "sales"      as const },
  { to: "/customers",      labelKey: "customers",       desc: "Customer profiles & transaction statistics", icon: Users, perm: "parties" as const },
  { to: "/dues",           labelKey: "due",             desc: "Customer dues & collections history", icon: Banknote, perm: "parties"    as const },
  { to: "/parties",        labelKey: "parties",         desc: "Suppliers, vendors, and partner logs", icon: Users, perm: "parties"    as const },
  { to: "/employees",      labelKey: "employees" as any, desc: "Employee accounts, salary ledger, attendance & permissions", icon: Users, perm: "sales" as const },
  { to: "/settings",       labelKey: "settings",        desc: "Advanced settings & configurations", icon: Settings,     perm: "settings"   as const },
] as const;

const financeLinks = [
  { to: "/product-analytics", labelKey: "product_analytics", desc: "Top sellers, sales growth, remaining & critical stock intelligence", icon: BarChart2, perm: "reports" as const },
  { to: "/bank",           labelKey: "bank_management", desc: "Bank accounts, loans & installment repayments", icon: Landmark, imageUrl: "https://img.icons8.com/color/48/bank-building.png", perm: "expenses" as const },
  { to: "/expenses",       labelKey: "expenses",        desc: "Record overhead expenses", icon: Receipt, imageUrl: "https://img.icons8.com/color/48/tax.png", perm: "expenses"   as const },
  { to: "/owners-wallet",  labelKey: "owners_wallet",   desc: "Personal & family expense wallet (cuts cash & profit)", icon: Wallet, imageUrl: "https://img.icons8.com/color/48/wallet--v1.png", perm: "cashbox" as const },
  { to: "/somiti",         labelKey: "somiti",          desc: "Manage Somiti accounts", icon: PiggyBank, imageUrl: "/icons/samity_icon.png",    perm: "expenses"   as const },
  { to: "/cash-management",labelKey: "cash_management", desc: "Cashbox ledger & cashflow", icon: Banknote, imageUrl: "/icons/cashbox_icon.png",     perm: "cashbox"   as const },
  { to: "/profits",        labelKey: "profit",          desc: "Sales margins & net profits", icon: TrendingUp, imageUrl: "/icons/profit_icon.png",  perm: "reports"    as const },
  { to: "/losses",         labelKey: "losses",          desc: "Analyze transactional losses", icon: TrendingDown, perm: "reports" as const },
  { to: "/trackback",      labelKey: "trackback",       desc: "Comparative metrics chart", icon: BarChart3,    perm: "reports"    as const },
  { to: "/reports",        labelKey: "reports_generator", desc: "Generate custom PDF reports", icon: FileText, perm: "reports"    as const },
  { to: "/ai-audits",      labelKey: "ai_audits",       desc: "Chat with AI about your business", icon: Sparkles, perm: "reports"    as const },
] as const;

export default function MorePage() {
  const { lang, t } = useT();
  const { user, logout, refresh, isUploading, uploadProgress, uploadProfilePic } = useAuth();
  const perms = resolvePermissions(user?.role ?? "employee", user?.permissions);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const productsQuery = useCachedQuery(["products"], getProducts);
  const products = productsQuery.data ?? [];

  const handleRefresh = async () => {
    try {
      toast.info(lang === "bn" ? "পুরানো ক্যাশ মুছে তাজা ভার্সন লোড করা হচ্ছে..." : "Removing old caches and loading fresh version...");
      qc.clear();
      if (typeof window !== "undefined") {
        if ("caches" in window) {
          const keys = await window.caches.keys();
          for (const key of keys) {
            await window.caches.delete(key);
          }
        }
        try {
          sessionStorage.clear();
        } catch (_) {}
        setTimeout(() => {
          window.location.href = window.location.pathname + "?fresh=" + Date.now();
        }, 300);
      }
    } catch (e) {
      window.location.reload();
    }
  };

  interface Message {
    role: "system" | "user" | "assistant";
    content: string;
  }

  // AI Assistant Tab states
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const aiSuggestions = lang === "bn"
    ? [
        { label: "লাভ বা মুনাফা কত?", text: "লাভ বা মুনাফা কত?" },
        { label: "ব্যবসায়ের সমস্যা কোথায়?", text: "ব্যবসায়ের সমস্যা কোথায়?" },
        { label: "সংকটজনক স্টক কোনগুলো?", text: "সংকটজনক স্টক কোনগুলো এবং কোন পণ্যের স্টক কম?" },
        { label: "কোথায় আপডেট করতে হবে?", text: "ব্যবসায়ের উন্নতির জন্য কোথায় আপডেট বা পরিবর্তন করতে হবে?" },
        { label: "সার্বিক বিশ্লেষণ দিন", text: "দয়া করে আমার ব্যবসার একটি সার্বিক বিশ্লেষণ ও পরামর্শ দিন।" },
      ]
    : [
        { label: "What is the profits?", text: "What is the profits?" },
        { label: "Where is the business problems?", text: "Where is the business problems?" },
        { label: "What is the critical stocks?", text: "What is the critical stocks and which products have less number in stocks?" },
        { label: "Where have to update?", text: "Where do we have to update or make changes for the business?" },
        { label: "Total analyzation of the business", text: "Provide a total analyzation and health check of the business." },
      ];

  const handleAiSend = async (textToSend: string) => {
    if (!textToSend.trim() || aiLoading) return;

    const userMessage: Message = { role: "user", content: textToSend };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setAiInput("");
    setAiLoading(true);

    try {
      const { callAiChat } = await import("@/lib/rpc");
      const res = await callAiChat(newMessages, lang);
      const data = await res.json().catch(() => ({ error: "AI service failed to respond" }));

      if (!res.ok || data.error) {
        throw new Error(data.error || (lang === "bn" ? "এআই সার্ভার থেকে সাড়া পাওয়া যায়নি" : "Failed to get response from AI"));
      }

      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      toast.error(err.message || String(err));
      // Remove last user message on failure
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setAiLoading(false);
    }
  };

  // Helper to parse both markdown **bold** and standard HTML tags in AI responses
  const parseBold = (text: string) => {
    if (!text) return "";
    let converted = text.replace(/\*\*(?!\s)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
    converted = converted.replace(/\*(?!\s)([\s\S]*?\S)\*/g, "<em>$1</em>");
    const tagRegex = /(<[^>]+>)/g;
    const parts = converted.split(tagRegex);
    
    let elements: React.ReactNode[] = [];
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    let textColor = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      
      if (part.startsWith("<") && part.endsWith(">")) {
        const lowercaseTag = part.toLowerCase();
        if (lowercaseTag.startsWith("<span")) {
          const colorMatch = part.match(/style=["'][^"']*color:\s*([^;'"\s]+)/i);
          if (colorMatch) {
            textColor = colorMatch[1];
          }
          const classMatch = part.match(/class=["'][^"']*text-([a-z0-9-]+)/i);
          if (classMatch) {
            const colorClass = classMatch[1];
            if (colorClass === "primary") textColor = "var(--primary)";
            else if (colorClass === "rose-500") textColor = "#f43f5e";
            else if (colorClass === "emerald-500") textColor = "#10b981";
            else if (colorClass === "amber-500") textColor = "#f59e0b";
          }
        } else if (lowercaseTag === "</span>") {
          textColor = "";
        } else if (lowercaseTag === "<b>" || lowercaseTag === "<strong>") {
          isBold = true;
        } else if (lowercaseTag === "</b>" || lowercaseTag === "</strong>") {
          isBold = false;
        } else if (lowercaseTag === "<i>" || lowercaseTag === "<em>") {
          isItalic = true;
        } else if (lowercaseTag === "</i>" || lowercaseTag === "</em>") {
          isItalic = false;
        } else if (lowercaseTag === "<u>") {
          isUnderline = true;
        } else if (lowercaseTag === "</u>") {
          isUnderline = false;
        }
      } else {
        let style: React.CSSProperties = {};
        if (textColor) style.color = textColor;
        
        let el: React.ReactNode = part;
        if (isBold) el = <strong key={`mb-${i}`} className="font-bold text-zinc-950 dark:text-white">{el}</strong>;
        if (isItalic) el = <em key={`mi-${i}`} className="italic text-zinc-800 dark:text-zinc-200">{el}</em>;
        if (isUnderline) el = <u key={`mu-${i}`}>{el}</u>;
        if (textColor) el = <span key={`ms-${i}`} style={style}>{el}</span>;
        
        elements.push(<React.Fragment key={`mfrag-${i}`}>{el}</React.Fragment>);
      }
    }
    
    return elements.length > 0 ? elements : text;
  };

  const renderStructuredContent = (content: string) => {
    if (!content) return null;
    // Extract think tags and contents
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/i;
    const thinkMatch = content.match(thinkRegex);
    let thought: string | null = null;
    let cleanContent = content;

    if (thinkMatch) {
      thought = thinkMatch[1].trim();
      cleanContent = content.replace(thinkRegex, "").trim();
    }

    const lines = cleanContent.split("\n");
    let elements: React.ReactNode[] = [];
    
    // Add collapsible reasoning block at the top if present
    if (thought) {
      elements.push(
        <details key="thought-block" className="my-2 border border-muted-foreground/20 rounded-xl bg-muted/30 overflow-hidden text-[11px] text-muted-foreground transition-all duration-200">
          <summary className="cursor-pointer p-2.5 font-semibold bg-muted/50 hover:bg-muted/75 select-none flex items-center gap-1.5">
            <span>💭</span> {lang === "bn" ? "চিন্তা ধারা..." : "Thinking Process..."}
          </summary>
          <div className="p-2.5 leading-relaxed italic border-t border-muted-foreground/10 bg-muted/10 whitespace-pre-wrap">
            {parseBold(thought)}
          </div>
        </details>
      );
    }
    
    let currentList: { type: "bullet" | "number"; items: string[] } | null = null;
    
    const flushList = (keySuffix: string | number) => {
      if (!currentList) return null;
      const list = currentList;
      currentList = null;
      
      if (list.type === "bullet") {
        return (
          <div key={`mlist-bullet-${keySuffix}`} className="space-y-1.5 my-2">
            {list.items.map((item, i) => {
              const colonIndex = item.indexOf(":");
              if (colonIndex > 0 && colonIndex < 35) {
                const keyText = item.substring(0, colonIndex).trim();
                const valText = item.substring(colonIndex + 1).trim();
                return (
                  <div key={`mb-kv-${keySuffix}-${i}`} className="flex justify-between items-center text-xs py-1.5 border-b border-border/10 bg-white/5 dark:bg-zinc-950/20 px-2.5 rounded-lg backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="text-muted-foreground font-medium">{parseBold(keyText)}</span>
                    <span className="font-semibold text-foreground">{parseBold(valText)}</span>
                  </div>
                );
              }
              return (
                <div key={`mb-item-${keySuffix}-${i}`} className="flex items-start gap-2 text-xs leading-relaxed pl-1 py-0.5">
                  <span className="text-primary mt-1.5 size-1.5 rounded-full bg-primary/80 shrink-0 shadow-sm" />
                  <span className="text-foreground/90">{parseBold(item)}</span>
                </div>
              );
            })}
          </div>
        );
      } else {
        return (
          <ol key={`mlist-num-${keySuffix}`} className="space-y-1.5 my-2 list-decimal pl-5">
            {list.items.map((item, i) => (
              <li key={`mn-item-${keySuffix}-${i}`} className="text-xs leading-relaxed text-foreground/90 pl-0.5">
                {parseBold(item)}
              </li>
            ))}
          </ol>
        );
      }
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (!trimmed) {
        if (currentList) {
          elements.push(flushList(i));
        }
        continue;
      }
      
      if (trimmed.startsWith("#")) {
        if (currentList) elements.push(flushList(i));
        const level = trimmed.match(/^#+/)?.[0].length || 1;
        const text = trimmed.replace(/^#+\s*/, "");
        if (level === 1) {
          elements.push(
            <h2 key={`mh1-${i}`} className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-4 mb-2 border-b border-indigo-500/20 pb-1 flex items-center gap-1.5 uppercase tracking-wider">
              {parseBold(text)}
            </h2>
          );
        } else if (level === 2) {
          elements.push(
            <h3 key={`mh2-${i}`} className="text-xs font-bold text-zinc-950 dark:text-zinc-50 mt-3.5 mb-1.5 flex items-center gap-1.5">
              {parseBold(text)}
            </h3>
          );
        } else {
          elements.push(
            <h4 key={`mh3-${i}`} className="text-[11px] font-bold text-primary mt-2.5 mb-1 flex items-center gap-1.5">
              {parseBold(text)}
            </h4>
          );
        }
        continue;
      }
      
      if ((trimmed.startsWith("- ") || trimmed.startsWith("-\t") || trimmed === "-" ||
           trimmed.startsWith("• ") || trimmed.startsWith("•\t") ||
           trimmed.startsWith("* ")) && !trimmed.startsWith("**")) {
        const itemText = trimmed.substring(trimmed.startsWith("* ") || trimmed.startsWith("- ") || trimmed.startsWith("• ") ? 2 : 1).trim();
        if (!currentList || currentList.type !== "bullet") {
          if (currentList) elements.push(flushList(i));
          currentList = { type: "bullet", items: [] };
        }
        currentList.items.push(itemText);
        continue;
      }
      
      const numMatch = trimmed.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        const itemText = numMatch[2].trim();
        if (!currentList || currentList.type !== "number") {
          if (currentList) elements.push(flushList(i));
          currentList = { type: "number", items: [] };
        }
        currentList.items.push(itemText);
        continue;
      }
      
      if (currentList) {
        elements.push(flushList(i));
      }
      
      if (trimmed.includes("⚠️")) {
        const text = trimmed.replace("⚠️", "").trim();
        elements.push(
          <div key={i} className="my-2.5 p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/20 border-l-4 border-amber-500 text-amber-800 dark:text-amber-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5 shrink-0">⚠️</span>
            <div className="text-xs leading-relaxed font-medium">
              {parseBold(text)}
            </div>
          </div>
        );
        continue;
      }
      
      if (trimmed.includes("✅")) {
        const text = trimmed.replace("✅", "").trim();
        elements.push(
          <div key={i} className="my-2.5 p-3.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/20 border-l-4 border-emerald-500 text-emerald-800 dark:text-emerald-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5 shrink-0">✅</span>
            <div className="text-xs leading-relaxed font-medium">
              {parseBold(text)}
            </div>
          </div>
        );
        continue;
      }
      
      if (trimmed.includes("💡") || trimmed.toLowerCase().includes("recommendation")) {
        const text = trimmed.replace("💡", "").trim();
        elements.push(
          <div key={i} className="my-2.5 p-3.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/20 border-l-4 border-indigo-500 text-indigo-800 dark:text-indigo-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5 shrink-0">💡</span>
            <div className="text-xs leading-relaxed font-medium">
              {parseBold(text)}
            </div>
          </div>
        );
        continue;
      }
      
      elements.push(
        <p key={i} className="text-xs leading-relaxed my-2 text-foreground/80">
          {parseBold(trimmed)}
        </p>
      );
    }
    
    if (currentList) {
      elements.push(flushList(lines.length));
    }
    
    return <div className="space-y-1">{elements}</div>;
  };

  const renderMobileAiAssistant = () => {
    return (
      <Card className="flex flex-col h-[520px] bg-white/10 dark:bg-black/30 backdrop-blur-md border border-white/20 dark:border-white/10 shadow-lg rounded-2xl overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3.5 no-scrollbar">
          {messages.length === 0 ? (
            <div className="space-y-4 my-auto h-full flex flex-col justify-center text-center px-2">
              <div className="size-11 rounded-full bg-gradient-to-br from-primary/20 to-indigo-600/10 text-primary flex items-center justify-center mx-auto border border-primary/10 shadow-sm animate-pulse">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-foreground">
                  {lang === "bn" ? "ড্রিম আইটি অডিট এজেন্টের সাথে চ্যাট করুন" : "Chat with Dream IT Audit Agent"}
                </h4>
                <p className="text-[10px] text-muted-foreground leading-normal max-w-[240px] mx-auto">
                  {lang === "bn"
                    ? "আমি আপনার রিয়েল-টাইম স্টক, লাভ-ক্ষতি ও ব্যবসা বিশ্লেষণ করতে পারি। নিচের একটি প্রশ্ন নির্বাচন করুন বা সরাসরি লিখুন।"
                    : "I can analyze your real-time stocks, profits, expenses, and business metrics. Choose a prompt or type below."}
                </p>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 gap-2 pt-1 text-left">
                {aiSuggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAiSend(s.text)}
                    className="p-2.5 text-[10px] font-semibold bg-white/20 dark:bg-zinc-950/20 hover:bg-primary/10 border border-white/20 dark:border-white/5 rounded-xl text-foreground text-left transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-sm"
                  >
                    <HelpCircle className="size-3.5 text-primary shrink-0" />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div key={idx} className={`flex items-start gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar */}
                    <div className={`size-7 rounded-xl flex items-center justify-center border shrink-0 shadow-sm ${
                      isUser 
                        ? "bg-primary text-white border-primary/10" 
                        : "bg-white/30 dark:bg-zinc-950/30 text-foreground border-white/20 dark:border-white/5"
                    }`}>
                      {isUser ? <HelpCircle className="size-3.5" /> : <Bot className="size-3.5" />}
                    </div>

                    {/* Bubble */}
                    <Card className={`p-3 max-w-[85%] rounded-2xl text-[11px] shadow-sm ${
                      isUser 
                        ? "bg-primary text-primary-foreground rounded-tr-none border-0" 
                        : "bg-white/40 dark:bg-zinc-950/40 text-foreground rounded-tl-none border-white/20 dark:border-white/5 backdrop-blur-sm"
                    }`}>
                      {isUser ? <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p> : renderStructuredContent(m.content)}
                    </Card>
                  </div>
                );
              })}

              {/* Loading indicator */}
              {aiLoading && (
                <div className="flex items-start gap-2">
                  <div className="size-7 rounded-xl bg-white/30 dark:bg-zinc-950/30 text-foreground border border-white/20 dark:border-white/5 flex items-center justify-center shrink-0">
                    <Bot className="size-3.5" />
                  </div>
                  <Card className="p-3 rounded-2xl rounded-tl-none bg-white/40 dark:bg-zinc-950/40 border border-white/20 dark:border-white/5 backdrop-blur-sm flex items-center gap-1.5 shrink-0">
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </Card>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Quick pills above input */}
        {messages.length > 0 && (
          <div className="px-3 py-1.5 border-t border-white/10 dark:border-white/5 bg-white/5 dark:bg-black/10 flex gap-1.5 overflow-x-auto shrink-0 select-none no-scrollbar">
            {aiSuggestions.slice(0, 3).map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleAiSend(s.text)}
                className="px-2.5 py-1 text-[9px] font-semibold bg-white/20 dark:bg-zinc-950/20 hover:bg-primary/10 border border-white/20 dark:border-white/5 rounded-full text-foreground whitespace-nowrap transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm backdrop-blur-sm"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Input Panel */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAiSend(aiInput);
          }}
          className="p-2 border-t border-white/10 dark:border-white/5 bg-white/10 dark:bg-black/20 flex gap-2 shrink-0 items-center"
        >
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            disabled={aiLoading}
            placeholder={lang === "bn" ? "আপনার প্রশ্ন লিখুন..." : "Ask your question..."}
            className="flex-1 h-9 rounded-xl border border-white/20 dark:border-white/5 bg-white/20 dark:bg-zinc-950/20 px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50 text-foreground placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon"
            disabled={aiLoading || !aiInput.trim()}
            className="size-9 rounded-xl shrink-0 cursor-pointer shadow-md"
          >
            <Send className="size-3.5" />
          </Button>
        </form>
      </Card>
    );
  };

  // Custom date mutation states
  const [txnType, setTxnType] = useState<"sale" | "expense" | "purchase" | "withdraw" | "deposit">("sale");
  const [customDate, setCustomDate] = useState("");
  const [txnSubmitting, setTxnSubmitting] = useState(false);

  // Sale fields
  const [saleProdId, setSaleProdId] = useState("");
  const [saleProdName, setSaleProdName] = useState("");
  const [saleQty, setSaleQty] = useState("");
  const [saleBuyPrice, setSaleBuyPrice] = useState("");
  const [saleSellPrice, setSaleSellPrice] = useState("");
  const [saleType, setSaleType] = useState<"cash" | "credit">("cash");
  const [salePaidAmt, setSalePaidAmt] = useState("");
  const [saleDueAmt, setSaleDueAmt] = useState("");

  // Expense fields
  const [expTitle, setExpTitle] = useState("");
  const [expAmt, setExpAmt] = useState("");
  const [expNote, setExpNote] = useState("");

  // Purchase fields
  const [purProdId, setPurProdId] = useState("");
  const [purProdName, setPurProdName] = useState("");
  const [purQty, setPurQty] = useState("");
  const [purUnitCost, setPurUnitCost] = useState("");

  // Withdrawal fields
  const [withAmt, setWithAmt] = useState("");
  const [withNote, setWithNote] = useState("");

  async function handleAddCustomRecord(e: React.FormEvent) {
    e.preventDefault();
    if (txnSubmitting) return;

    const isoDate = customDate ? new Date(customDate).toISOString() : new Date().toISOString();
    setTxnSubmitting(true);
    try {
      if (txnType === "sale") {
        const qtyVal = Number(saleQty) || 0;
        const buyVal = Number(saleBuyPrice) || 0;
        const sellVal = Number(saleSellPrice) || 0;
        const paidVal = Number(salePaidAmt) || 0;
        const dueVal = Number(saleDueAmt) || 0;
        if (!saleProdName.trim() || qtyVal <= 0 || sellVal <= 0) {
          throw new Error("Please fill in all required sale fields.");
        }
        await createSaleFn({
          data: {
            product_id: saleProdId || null,
            product_name: saleProdName.trim(),
            qty: qtyVal,
            buy_price: buyVal,
            sell_price: sellVal,
            profit: (sellVal - buyVal) * qtyVal,
            type: saleType,
            paid_amount: paidVal,
            due_amount: dueVal,
            created_at: isoDate,
          }
        });
        toast.success(lang === "bn" ? "সরাসরি বিক্রি সফলভাবে যুক্ত হয়েছে!" : "Custom Sale record added successfully!");
        setSaleProdId(""); setSaleProdName(""); setSaleQty(""); setSaleBuyPrice(""); setSaleSellPrice(""); setSalePaidAmt(""); setSaleDueAmt("");
      } else if (txnType === "expense") {
        const amtVal = Number(expAmt) || 0;
        if (!expTitle.trim() || amtVal <= 0) {
          throw new Error("Please fill in all required expense fields.");
        }
        await createExpenseFn({
          data: {
            title: expTitle.trim(),
            amount: amtVal,
            note: expNote.trim() || null,
            created_at: isoDate,
          }
        });
        toast.success(lang === "bn" ? "সরাসরি খরচ সফলভাবে যুক্ত হয়েছে!" : "Custom Expense record added successfully!");
        setExpTitle(""); setExpAmt(""); setExpNote("");
      } else if (txnType === "purchase") {
        const qtyVal = Number(purQty) || 0;
        const costVal = Number(purUnitCost) || 0;
        if (!purProdName.trim() || qtyVal <= 0 || costVal <= 0) {
          throw new Error("Please fill in all required purchase fields.");
        }
        await createPurchaseFn({
          data: {
            product_id: purProdId || null,
            product_name: purProdName.trim(),
            qty: qtyVal,
            unit_cost: costVal,
            total: qtyVal * costVal,
            created_at: isoDate,
          }
        });
        toast.success(lang === "bn" ? "সরাসরি ক্রয় সফলভাবে যুক্ত হয়েছে!" : "Custom Purchase record added successfully!");
        setPurProdId(""); setPurProdName(""); setPurQty(""); setPurUnitCost("");
      } else if (txnType === "withdraw") {
        const amtVal = Number(withAmt) || 0;
        if (amtVal <= 0) {
          throw new Error("Please enter a valid withdrawal amount.");
        }
        await createCashboxFn({
          data: {
            kind: "withdraw",
            amount: amtVal,
            note: withNote.trim() || "Manual Backdated Withdrawal",
            created_at: isoDate,
          }
        });
        toast.success(lang === "bn" ? "ক্যাশবক্স উত্তোলন সফলভাবে যুক্ত হয়েছে!" : "Custom Cashbox Withdrawal added successfully!");
        setWithAmt(""); setWithNote("");
      } else if (txnType === "deposit") {
        const amtVal = Number(withAmt) || 0;
        if (amtVal <= 0) {
          throw new Error("Please enter a valid deposit amount.");
        }
        await createCashboxFn({
          data: {
            kind: "deposit",
            amount: amtVal,
            note: withNote.trim() || "Manual Cashbox Deposit",
            created_at: isoDate,
          }
        });
        toast.success(lang === "bn" ? "ক্যাশবক্স জমা সফলভাবে যুক্ত হয়েছে!" : "Custom Cashbox Deposit added successfully!");
        setWithAmt(""); setWithNote("");
      }
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setTxnSubmitting(false);
    }
  }

  // Theme states
  const [theme, setTheme] = useState({
    primaryColor: "",
    backgroundColor: "",
    bgImage: "",
    bgImageOpacity: 0.1,
    fontFamily: "",
    fontSize: "",
    textColor: "",
    density: "standard",
    isMaterialUI: false,
    uiStyle: "default",
    bevelStrength: "medium",
    glowEnabled: false,
    glowIntensity: 15,
    borderRadius: "",
    productBoxSize: "standard",
    borderWidth: "thin",
    shadowStyle: "soft",
    cardOpacity: 1,
    cardBlur: 0,
    animationSpeed: "normal",
    customFontUrl: "",
    customFontName: "",
    cardDarkness: 0,
    kpiStyle: "default",
  });

  // Helper to ensure purchases and somiti exist in kpi order
  const normalizeKpiOrder = (order?: string[]) => {
    const defaultList = ["credit_sale", "cash_sale", "online_sell", "purchases", "profit", "loss", "expense", "due", "cashbox", "somiti"];
    if (!order || !Array.isArray(order)) return defaultList;
    const list = [...order];
    if (!list.includes("purchases")) {
      const idx = list.indexOf("online_sell");
      if (idx !== -1) list.splice(idx + 1, 0, "purchases");
      else list.push("purchases");
    }
    if (!list.includes("somiti")) {
      const idx = list.indexOf("cashbox");
      if (idx !== -1) list.splice(idx + 1, 0, "somiti");
      else list.push("somiti");
    }
    return list;
  };

  // KPI config state
  const [kpiConfig, setKpiConfig] = useState({
    align: "left",
    size: "small",
    columns: 2,
    curve: "none",
    order: ["credit_sale", "cash_sale", "online_sell", "purchases", "profit", "loss", "expense", "due", "cashbox", "somiti"]
  });
  const [kpiDraggedIndex, setKpiDraggedIndex] = useState<number | null>(null);

  const kpiLabels: Record<string, string> = {
    credit_sale: lang === "bn" ? "বাকি বিক্রয়" : "Credit Sale",
    cash_sale: lang === "bn" ? "নগদ বিক্রয়" : "Cash Sale",
    online_sell: lang === "bn" ? "অনলাইন বিক্রয়" : "Online Sale",
    purchases: lang === "bn" ? "মাল ক্রয় (BUY)" : "BUY",
    profit: lang === "bn" ? "মোট মুনাফা" : "Total Profit",
    loss: lang === "bn" ? "মোট ক্ষতি" : "Total Loss",
    expense: lang === "bn" ? "মোট খরচ" : "Total Expenses",
    due: lang === "bn" ? "মোট বাকি" : "Total Due",
    cashbox: lang === "bn" ? "ক্যাশবক্স" : "Cashbox",
    somiti: lang === "bn" ? "সমিতি (Samity)" : "Samity",
  };

  const updateKpiConfig = (patch: Partial<typeof kpiConfig>) => {
    const next = { ...kpiConfig, ...patch };
    setKpiConfig(next);
    localStorage.setItem("hz_kpi_config", JSON.stringify(next));
    window.dispatchEvent(new Event("hz-kpi-config-updated"));
  };

  const handleKpiDragStart = (idx: number) => setKpiDraggedIndex(idx);
  const handleKpiDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (kpiDraggedIndex === null || kpiDraggedIndex === idx) return;
    const list = [...kpiConfig.order];
    const item = list[kpiDraggedIndex];
    list.splice(kpiDraggedIndex, 1);
    list.splice(idx, 0, item);
    setKpiDraggedIndex(idx);
    setKpiConfig(prev => ({ ...prev, order: list }));
  };
  const handleKpiDragEnd = () => {
    setKpiDraggedIndex(null);
    localStorage.setItem("hz_kpi_config", JSON.stringify(kpiConfig));
    window.dispatchEvent(new Event("hz-kpi-config-updated"));
  };

  // Widget ordering state
  const [widgets, setWidgets] = useState<any[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    // Load theme config
    const savedTheme = localStorage.getItem("hz_custom_theme");
    if (savedTheme) {
      try {
        setTheme(prev => ({ ...prev, ...JSON.parse(savedTheme) }));
      } catch (e) {
        console.error(e);
      }
    }

    // Load KPI config
    const savedKpi = localStorage.getItem("hz_kpi_config");
    if (savedKpi) {
      try {
        const parsed = JSON.parse(savedKpi);
        setKpiConfig(prev => ({
          ...prev,
          ...parsed,
          order: normalizeKpiOrder(parsed.order)
        }));
      } catch (e) {
        console.error(e);
      }
    }

    // Load widget order
    const savedOrder = localStorage.getItem("hz_dashboard_widget_order");
    const defaultOrder = ['kpis', 'valuations', 'graphs', 'reminders', 'quickLinks', 'bestSelling', 'recent'];
    let orderList = defaultOrder;
    if (savedOrder) {
      try {
        const parsed = JSON.parse(savedOrder);
        if (Array.isArray(parsed) && parsed.length > 0) orderList = parsed;
      } catch (e) {
        console.error(e);
      }
    }
    
    // Map ids to names
    const getWidgetName = (id: string) => {
      switch(id) {
        case 'kpis': return lang === "bn" ? "মূল সূচকসমূহ (KPI গ্রিড)" : "Key Metrics (KPI Grid)";
        case 'valuations': return lang === "bn" ? "ইনভেন্টরি স্টক মূল্যায়ন" : "Inventory Stock Valuation";
        case 'graphs': return lang === "bn" ? "চার্ট ও গ্রাফিক্স বিশ্লেষণ" : "Charts & Analytics Graph";
        case 'reminders': return lang === "bn" ? "রিমাইন্ডার ও টাস্ক লিস্ট" : "Reminders & Task List";
        case 'quickLinks': return lang === "bn" ? "শর্টকাট কুইক লিংকস" : "Shortcut Quick Links";
        case 'bestSelling': return lang === "bn" ? "বেস্ট সেলিং পণ্যসমূহ" : "Best Selling Items";
        case 'recent': return lang === "bn" ? "সাম্প্রতিক বিক্রয় কার্যক্রম" : "Recent Operations Feed";
        default: return id;
      }
    };

    setWidgets(orderList.map(id => ({ id, name: getWidgetName(id) })));
  }, [lang]);

  const updateThemeField = (field: string, value: any) => {
    const nextTheme = { ...theme, [field]: value };
    setTheme(nextTheme);
    localStorage.setItem("hz_custom_theme", JSON.stringify(nextTheme));
    window.dispatchEvent(new Event("hz-theme-updated"));
  };

  const handleResetTheme = () => {
    localStorage.removeItem("hz_custom_theme");
    setTheme({
      primaryColor: "",
      backgroundColor: "",
      bgImage: "",
      bgImageOpacity: 0.1,
      fontFamily: "",
      fontSize: "",
      textColor: "",
      density: "standard",
      isMaterialUI: false,
      uiStyle: "default",
      bevelStrength: "medium",
      glowEnabled: false,
      glowIntensity: 15,
      borderRadius: "",
      productBoxSize: "standard",
      borderWidth: "thin",
      shadowStyle: "soft",
      cardOpacity: 1,
      cardBlur: 0,
      animationSpeed: "normal",
      customFontUrl: "",
      customFontName: "",
      cardDarkness: 0,
      kpiStyle: "default",
    });
    window.dispatchEvent(new Event("hz-theme-updated"));
    toast.success(lang === "bn" ? "থিম রিসেট সফল হয়েছে" : "Theme settings reset successfully");
  };

  // Drag and Drop Logic
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const list = [...widgets];
    const draggedItem = list[draggedIndex];
    list.splice(draggedIndex, 1);
    list.splice(index, 0, draggedItem);
    setDraggedIndex(index);
    setWidgets(list);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    const order = widgets.map(w => w.id);
    localStorage.setItem("hz_dashboard_widget_order", JSON.stringify(order));
    window.dispatchEvent(new Event("hz-dashboard-order-updated"));
    toast.success(lang === "bn" ? "ড্যাশবোর্ড ক্রম হালনাগাদ হয়েছে" : "Dashboard widget order updated");
  };

  const handleAvatarClick = () => {
    if (isUploading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadProfilePic(file);
    }
  };

  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFont, setIsUploadingFont] = useState(false);
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
      toast.error(lang === "bn" ? "ফাইলটি অনেক বড়! ১.৫ এমবি এর কম ফাইল আপলোড করুন।" : "File is too large! Please upload a file smaller than 1.5MB.");
      return;
    }

    setIsUploadingFont(true);
    toast.info(lang === "bn" ? "ফাইল লোড হচ্ছে..." : "Loading font file...");

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const base64Url = reader.result as string;
        const fontName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        updateThemeField("customFontUrl", base64Url);
        updateThemeField("customFontName", fontName);
        updateThemeField("fontFamily", "CustomUploadedFont");
        toast.success(lang === "bn" ? "কাস্টম ফন্ট আপলোড সফল হয়েছে!" : "Custom font uploaded successfully!");
      } catch (err: any) {
        toast.error(err.message || String(err));
      } finally {
        setIsUploadingFont(false);
      }
    };
    reader.onerror = () => {
      toast.error(lang === "bn" ? "ফাইল পড়তে সমস্যা হয়েছে" : "Error reading file");
      setIsUploadingFont(false);
    };
    reader.readAsDataURL(file);
  };

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingBg(true);
    toast.info(lang === "bn" ? "ব্যাকগ্রাউন্ড ছবি আপলোড হচ্ছে..." : "Uploading background image...");
    try {
      const formData = new FormData();
      formData.append("image", file);

      const isCap = typeof window !== "undefined" && (
        !!(window as any).Capacitor ||
        window.location.hostname === "localhost" ||
        window.location.origin.includes("localhost") ||
        window.location.origin.startsWith("capacitor:") ||
        window.location.origin.startsWith("file:")
      );
      const uploadUrl = isCap ? "https://hakim.qzz.io/api/upload" : "/api/upload";

      const headers: Record<string, string> = {};
      if (isCap) {
        const token = localStorage.getItem("auth_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        headers,
      });

      if (!res.ok) {
        throw new Error(lang === "bn" ? "আপলোড ব্যর্থ হয়েছে" : "Upload failed");
      }

      const data = await res.json();
      if (data.url) {
        updateThemeField("bgImage", data.url);
        updateThemeField("bgImageOpacity", 0.15);
        toast.success(lang === "bn" ? "ব্যাকগ্রাউন্ড ছবি আপলোড সফল হয়েছে!" : "Background image uploaded successfully!");
      } else {
        throw new Error("No URL returned");
      }
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsUploadingBg(false);
    }
  };

  // ─── Shop Profile Management State (Available directly in /more) ───
  const [shopProfileOpen, setShopProfileOpen] = useState(false);
  const [shopProfileBusy, setShopProfileBusy] = useState(false);
  const [shopLogoUploading, setShopLogoUploading] = useState(false);
  const [shopProfileData, setShopProfileData] = useState({
    name: user?.business_name || "",
    tagline: "",
    address: "",
    phones: "",
    email: "",
    logoUrl: "",
    currency: "৳",
    invoiceTerms: "",
  });

  useEffect(() => {
    if (shopProfileOpen) {
      setShopProfileData(prev => ({
        ...prev,
        name: user?.business_name || prev.name,
      }));
      getBusinessSettingsFn().then((res: any) => {
        const b = res?.business || res?.data?.business || res?.data;
        if (b) {
          setShopProfileData({
            name: b.name || user?.business_name || "",
            tagline: b.tagline || "",
            address: b.address || "",
            phones: Array.isArray(b.phone_numbers) ? b.phone_numbers.join(", ") : (b.phone_numbers || ""),
            email: Array.isArray(b.emails) ? b.emails.join(", ") : (b.emails || ""),
            logoUrl: b.logo_url || "",
            currency: b.currency || "৳",
            invoiceTerms: b.invoice_terms || "",
          });
        }
      }).catch(() => {});
    }
  }, [shopProfileOpen, user]);

  const handleSaveShopProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setShopProfileBusy(true);
    try {
      const phonesArr = shopProfileData.phones.split(",").map(s => s.trim()).filter(Boolean);
      const emailsArr = shopProfileData.email.split(",").map(s => s.trim()).filter(Boolean);
      await updateBusinessSettingsFn({
        data: {
          name: shopProfileData.name,
          tagline: shopProfileData.tagline,
          address: shopProfileData.address,
          phone_numbers: phonesArr.join(", "),
          emails: emailsArr.join(", "),
          logo_url: shopProfileData.logoUrl,
          currency: shopProfileData.currency,
          invoice_terms: shopProfileData.invoiceTerms,
        }
      });
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["business-settings"] });
      toast.success(lang === "bn" ? "দোকানের প্রোফাইল সফলভাবে আপডেট হয়েছে!" : "Shop profile updated successfully!");
      setShopProfileOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update shop profile");
    } finally {
      setShopProfileBusy(false);
    }
  };

  const handleShopLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(lang === "bn" ? "লোগো সাইজ ৫ মেগাবাইট এর কম হতে হবে" : "Logo must be under 5MB");
      return;
    }
    setShopLogoUploading(true);
    const loadId = toast.loading(lang === "bn" ? "লোগো আপলোড হচ্ছে..." : "Uploading logo...");
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res: any = await uploadImageFn({ data: { base64, fileName: file.name } });
          const url = res?.url || res?.data?.url;
          if (url) {
            setShopProfileData(prev => ({ ...prev, logoUrl: url }));
            toast.success(lang === "bn" ? "লোগো আপলোড সম্পন্ন!" : "Logo uploaded!", { id: loadId });
          } else {
            toast.error(lang === "bn" ? "লোগো আপলোড ব্যর্থ হয়েছে" : "Upload failed", { id: loadId });
          }
        } catch (err: any) {
          toast.error(err.message || "Upload failed", { id: loadId });
        } finally {
          setShopLogoUploading(false);
        }
      };
      reader.onerror = () => {
        toast.error("Failed to read image file", { id: loadId });
        setShopLogoUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err.message || "Upload failed", { id: loadId });
      setShopLogoUploading(false);
    }
  };

  const visibleBiz = businessLinks.filter(item => canAccess(perms, item.perm));
  const visibleFin = financeLinks.filter(item => canAccess(perms, item.perm));

  const initials = user?.full_name
    ? user.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  // Preloaded Gradient Presets
  const bgPresets = [
    { name: "None", url: "" },
    { name: "Flowerism Pattern", url: "/flowerism_preset.png" },
    { name: "Glass Gradient", url: "/glassmorphism_preset.png" },
    { name: "Silk Mesh", url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=600&auto=format&fit=crop" },
    { name: "Abstract Gradient", url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop" },
    { name: "Dark Texture", url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop" },
  ];

  const renderOperations = () => (
    <>
      {/* Group 1: Business Operations */}
      {visibleBiz.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {lang === "bn" ? "ব্যবসা পরিচালনা" : "Business Operations"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {visibleBiz.map(({ to, labelKey, desc, icon: Icon }) => {
              if (to === "#shop-profile") {
                return (
                  <button
                    key={to}
                    type="button"
                    onClick={() => setShopProfileOpen(true)}
                    className="block group text-left w-full cursor-pointer"
                  >
                    <Card className="p-3.5 h-full flex flex-col justify-between gap-3 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all active:scale-[0.98] beveled-card bg-card/60 backdrop-blur-sm border-emerald-500/30">
                      <div className="size-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-600 grid place-items-center shrink-0 border border-emerald-500/20 shadow-sm">
                        <Icon className="size-4.5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 transition-colors flex items-center justify-between">
                          <span>{t(labelKey as any)}</span>
                          <span className="text-[9px] text-emerald-600 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">EDIT</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-tight">{desc}</p>
                      </div>
                    </Card>
                  </button>
                );
              }
              return (
                <Link key={to} href={to} className="block group">
                  <Card className="p-3.5 h-full flex flex-col justify-between gap-3 hover:border-primary/30 transition-all active:scale-[0.98] beveled-card bg-card/60 backdrop-blur-sm">
                    <div className="size-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary grid place-items-center shrink-0 border border-primary/10 shadow-sm">
                      <Icon className="size-4.5" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-primary transition-colors">{t(labelKey as any)}</div>
                      <p className="text-[9px] text-muted-foreground leading-tight">{desc}</p>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Group 2: Accounting & Finance */}
      {visibleFin.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            {lang === "bn" ? "হিসাব ও বিশ্লেষণ" : "Accounting & Financials"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {visibleFin.map(({ to, labelKey, desc, icon: Icon, imageUrl }: any) => (
              <Link key={to} href={to} className="block group">
                <Card className="p-3.5 h-full flex flex-col justify-between gap-3 hover:border-indigo-500/30 transition-all active:scale-[0.98] beveled-card bg-card/60 backdrop-blur-sm">
                  <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 text-indigo-600 dark:text-indigo-400 grid place-items-center shrink-0 border border-indigo-500/10 shadow-sm overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} className="size-5 object-contain" alt={t(labelKey as any)} />
                    ) : (
                      <Icon className="size-4.5" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 transition-colors">{t(labelKey as any)}</div>
                    <p className="text-[9px] text-muted-foreground leading-tight">{desc}</p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const renderMobileOperations = () => (
    <>
      {/* Group 1: Business Operations */}
      {visibleBiz.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1.5">
            {lang === "bn" ? "ব্যবসা পরিচালনা" : "Business Operations"}
          </h3>
          <Card className="overflow-hidden border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md rounded-2xl shadow-sm">
            <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/40">
              {visibleBiz.map(({ to, labelKey, desc, icon: Icon }) => {
                if (to === "#shop-profile") {
                  return (
                    <button
                      key={to}
                      type="button"
                      onClick={() => setShopProfileOpen(true)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-emerald-500/5 active:bg-emerald-500/10 transition-all text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="size-8.5 rounded-xl bg-emerald-500/10 text-emerald-600 grid place-items-center border border-emerald-500/20 shadow-sm">
                          <Icon className="size-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span>{t(labelKey as any)}</span>
                            <span className="text-[9px] text-emerald-600 font-bold bg-emerald-500/10 px-1 rounded">EDIT</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{desc}</p>
                        </div>
                      </div>
                      <span className="text-emerald-600 text-xs font-semibold select-none pr-1">→</span>
                    </button>
                  );
                }
                return (
                  <Link key={to} href={to} className="flex items-center justify-between p-3.5 hover:bg-muted/10 active:bg-muted/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="size-8.5 rounded-xl bg-primary/10 text-primary grid place-items-center border border-primary/15 shadow-sm">
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{t(labelKey as any)}</div>
                        <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{desc}</p>
                      </div>
                    </div>
                    <span className="text-zinc-400 text-xs font-semibold select-none pr-1">→</span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Group 2: Accounting & Finance */}
      {visibleFin.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest px-1.5">
            {lang === "bn" ? "হিসাব ও বিশ্লেষণ" : "Accounting & Financials"}
          </h3>
          <Card className="overflow-hidden border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md rounded-2xl shadow-sm">
            <div className="divide-y divide-zinc-200/50 dark:divide-zinc-800/40">
              {visibleFin.map(({ to, labelKey, desc, icon: Icon, imageUrl }: any) => (
                <Link key={to} href={to} className="flex items-center justify-between p-3.5 hover:bg-muted/10 active:bg-muted/20 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="size-8.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 grid place-items-center border border-indigo-500/15 shadow-sm overflow-hidden">
                      {imageUrl ? (
                        <img src={imageUrl} className="size-4.5 object-contain" alt={t(labelKey as any)} />
                      ) : (
                        <Icon className="size-4" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">{t(labelKey as any)}</div>
                      <p className="text-[9px] text-muted-foreground mt-0.5 leading-none">{desc}</p>
                    </div>
                  </div>
                  <span className="text-zinc-400 text-xs font-semibold select-none pr-1">→</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );

  const renderSignOut = () => (
    <div className="pt-2 space-y-2">
      {isMobile && (
        <Button
          onClick={handleRefresh}
          variant="outline"
          className="w-full h-10 border-primary/20 text-primary hover:bg-primary/5 beveled-button rounded-xl text-xs font-semibold"
        >
          <RefreshCw className="size-4 mr-2" />
          {lang === "bn" ? "রিফ্রেশ" : "Refresh"}
        </Button>
      )}
      <Button
        onClick={() => {
          if (confirm(lang === "bn" ? "আপনি কি লগআউট করতে চান?" : "Are you sure you want to sign out?")) {
            logout();
          }
        }}
        variant="outline"
        className="w-full h-10 border-rose-500/20 text-rose-600 hover:bg-rose-500/5 dark:hover:bg-rose-950/20 beveled-button rounded-xl text-xs font-semibold"
      >
        <LogOut className="size-4 mr-2" />
        {lang === "bn" ? "লগ আউট" : "Sign Out"}
      </Button>
    </div>
  );



  const renderThemeCustomization = () => (
    <div className="space-y-2.5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 flex items-center gap-1.5">
          <Palette className="size-4 text-primary" />
          {lang === "bn" ? "থিম ও লেআউট কাস্টমাইজেশন" : "Themes & Customization"}
        </h3>
        
        <Card className="p-4 bg-card/60 backdrop-blur-sm border-border beveled-card space-y-5">
          {/* Design Style Selector */}
          <div className="space-y-3 pb-3 border-b border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="size-4 text-primary" />
              <span>{lang === "bn" ? "ইউজার ইন্টারফেস ডিজাইন স্টাইল" : "User Interface Design Style"}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "default", label: lang === "bn" ? "ডিফল্ট গ্লাস" : "Default Glass", icon: Layout, desc: lang === "bn" ? "আধুনিক কাঁচ ও বেভেল" : "Standard glass & bevel", setup: { uiStyle: "default", isMaterialUI: false, bgImage: "" } },
                { id: "morphism", label: lang === "bn" ? "নিউমর্ফিজম" : "Neumorphism", icon: Palette, desc: lang === "bn" ? "নরম ত্রিমাত্রিক ছায়া" : "Soft 3D extruded shadows", setup: { uiStyle: "morphism", isMaterialUI: false, fontFamily: "Nunito, sans-serif", bgImage: "" } },
                { id: "brutalism", label: lang === "bn" ? "ব্রুটালিজম" : "Brutalism", icon: LayoutGrid, desc: lang === "bn" ? "কঠোর কালো বর্ডার" : "Thick borders & monospace", setup: { uiStyle: "brutalism", isMaterialUI: false, fontFamily: "'Fira Code', monospace", bgImage: "" } },
                { id: "new-brutalism", label: lang === "bn" ? "নিও-ব্রুটালিজম" : "Neo-Brutalism", icon: Sparkles, desc: lang === "bn" ? "উজ্জ্বল কার্টুনিশ" : "High contrast colorful", setup: { uiStyle: "new-brutalism", isMaterialUI: false, fontFamily: "Poppins, sans-serif", bgImage: "" } },
                { id: "glassmorphic", label: lang === "bn" ? "গ্লাসমর্ফিজম" : "Glassmorphism", icon: ImageIcon, desc: lang === "bn" ? "স্বচ্ছ ফ্রস্টেড গ্লাস" : "Frosted glass on gradient", setup: { uiStyle: "glassmorphism", isMaterialUI: false, bgImage: "/glassmorphism_preset.png", bgImageOpacity: 0.22 } },
                { id: "flowerism", label: lang === "bn" ? "ফ্লাওয়ারিজম" : "Flowerism", icon: Sparkles, desc: lang === "bn" ? "ফ্লোরাল নরম পেস্টেল" : "Organic pastel floral theme", setup: { uiStyle: "flowerism", isMaterialUI: false, bgImage: "/flowerism_preset.png", bgImageOpacity: 0.15, primaryColor: "#f43f5e" } },
                { id: "cyberpunk", label: lang === "bn" ? "সাইবারপাংক" : "Cyberpunk 👾", icon: Bot, desc: lang === "bn" ? "নিয়ন গ্লো ও হ্যাকার ভাইব" : "Neon pink/cyan console vibe", setup: { uiStyle: "cyberpunk", isMaterialUI: false, primaryColor: "#ff007f", fontFamily: "'Fira Code', monospace" } },
                { id: "minimalist", label: lang === "bn" ? "মিনিমালিস্ট" : "Minimalist Clean 🕊️", icon: AlignLeft, desc: lang === "bn" ? "অত্যন্ত পরিষ্কার ও সাধারণ" : "Ultra clean flat design", setup: { uiStyle: "minimalist", isMaterialUI: false, shadowStyle: "none", borderWidth: "thin", borderRadius: "small", primaryColor: "#18181b", fontFamily: "'Playfair Display', serif" } },
                { id: "forest", label: lang === "bn" ? "অরণ্য (নেচার)" : "Nature Forest 🌿", icon: Palette, desc: lang === "bn" ? "ভেষজ সবুজ ও শান্ত ভাব" : "Sage & deep forest green theme", setup: { uiStyle: "forest", isMaterialUI: false, primaryColor: "#2d5a27", borderRadius: "large" } },
                { id: "luxury", label: lang === "bn" ? "লাক্সারি গোল্ড" : "Luxury Gold 👑", icon: Sparkles, desc: lang === "bn" ? "অভিজাত অবসিডিয়ান ও সোনা" : "Obsidian dark & gold foiled", setup: { uiStyle: "luxury", isMaterialUI: false, primaryColor: "#d4af37", fontFamily: "'Playfair Display', serif", borderRadius: "medium" } },
                { id: "feather", label: lang === "bn" ? "ফেদার ইউআই" : "Feather UI 🪶", icon: Sparkles, desc: lang === "bn" ? "অত্যন্ত হালকা ও সফট সায়ান থিম" : "Lightweight soft cyan minimalist", setup: { uiStyle: "feather", isMaterialUI: false, primaryColor: "#0ea5e9", fontFamily: "Poppins, sans-serif", borderRadius: "large", shadowStyle: "soft" } },
                { id: "material", label: lang === "bn" ? "মেটেরিয়াল ইউআই" : "Material UI", icon: Settings, desc: lang === "bn" ? "ফ্ল্যাট এলিভেশন ছায়া" : "Standard flat elevation", setup: { uiStyle: "default", isMaterialUI: true, fontFamily: "Roboto, sans-serif", bgImage: "" } }
              ].map(s => {
                const isActive = s.id === "material" ? theme.isMaterialUI : (theme.uiStyle === s.id && !theme.isMaterialUI);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const next = { ...theme, ...s.setup, uiStyle: s.setup.uiStyle as any };
                      setTheme(next);
                      localStorage.setItem("hz_custom_theme", JSON.stringify(next));
                      window.dispatchEvent(new Event("hz-theme-updated"));
                      toast.success(lang === "bn" ? `${s.label} স্টাইল লোড হয়েছে` : `Loaded ${s.label} style`);
                    }}
                    className={`p-2 rounded-xl border text-left flex flex-col justify-between gap-1 transition-all duration-200 active:scale-95 cursor-pointer hover:bg-muted/10 ${
                      isActive 
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30" 
                        : "border-border bg-card/40"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className={`size-5 rounded-lg grid place-items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <s.icon className="size-3" />
                      </div>
                      <span className="font-semibold text-xs text-foreground truncate">{s.label}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground leading-normal">{s.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Bevels & Glows */}
          <div className="space-y-3 pb-3 border-b border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="size-4 text-indigo-500" />
              <span>{lang === "bn" ? "বর্ডার বেভেল এবং নিয়ন গ্লো ইফেক্টস" : "Bevels & Glow Effects"}</span>
            </div>

            <div className="space-y-2">
              {/* Bevel selector */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "বেভেল স্টাইল (Bevel Strength)" : "Bevel Style & Highlight"}</Label>
                <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full">
                  {[
                    { id: "none", label: lang === "bn" ? "কিছু না" : "None" },
                    { id: "light", label: lang === "bn" ? "হালকা" : "Light" },
                    { id: "medium", label: lang === "bn" ? "মাঝারি" : "Medium" },
                    { id: "heavy", label: lang === "bn" ? "গাঢ়" : "Heavy" }
                  ].map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => updateThemeField("bevelStrength", b.id)}
                      className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                        theme.bevelStrength === b.id
                          ? "bg-background text-foreground shadow font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Glow toggle */}
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-semibold text-foreground">{lang === "bn" ? "নিওন গ্লো ইফেক্ট সক্রিয় করুন" : "Enable Neon Glow Effects"}</Label>
                  <p className="text-[9px] text-muted-foreground">{lang === "bn" ? "কার্ড এবং সক্রিয় বাটনে সুন্দর ব্যাকলাইট গ্লো ছায়ো" : "Adds backlighting glows matching the brand accent"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateThemeField("glowEnabled", !theme.glowEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    theme.glowEnabled ? "bg-primary" : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      theme.glowEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {theme.glowEnabled && (
                <div className="space-y-1 pt-2 border-t border-border/20">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                    <Label>{lang === "bn" ? "গ্লো তীব্রতা (Glow Intensity)" : "Neon Glow Intensity"}</Label>
                    <span className="font-mono text-[9px]">{theme.glowIntensity ?? 15}px</span>
                  </div>
                  <Slider
                    min={5}
                    max={40}
                    step={1}
                    value={[theme.glowIntensity ?? 15]}
                    onValueChange={val => updateThemeField("glowIntensity", val[0])}
                    className="py-2"
                  />
                </div>
              )}

              {/* Card Roundness & Sharpness selector */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কার্ড ও মেট্রিক্স কোণার রাউন্ডনেস (শার্পনেস)" : "Card Roundness & Sharpness"}</Label>
                <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
                  {[
                    { id: "none", label: lang === "bn" ? "তীক্ষ্ণ" : "Sharp" },
                    { id: "small", label: lang === "bn" ? "সামান্য" : "Small" },
                    { id: "medium", label: lang === "bn" ? "মাঝারি" : "Medium" },
                    { id: "large", label: lang === "bn" ? "গোল" : "Rounded" },
                    { id: "full", label: lang === "bn" ? "বৃত্তাকার" : "Pill" }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => updateThemeField("borderRadius", r.id)}
                      className={`flex-1 py-1 rounded-md text-[9px] text-center font-medium transition-all ${
                        theme.borderRadius === r.id
                          ? "bg-background text-foreground shadow font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Card Opacity Slider */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                  <Label>{lang === "bn" ? "কার্ডের অস্বচ্ছতা (Opacity)" : "Card Opacity"}</Label>
                  <span className="font-mono text-[9px]">{Math.round((theme.cardOpacity ?? 1) * 100)}%</span>
                </div>
                <Slider
                  min={0.2}
                  max={1.0}
                  step={0.05}
                  value={[theme.cardOpacity ?? 1]}
                  onValueChange={val => updateThemeField("cardOpacity", val[0])}
                  className="py-2"
                />
              </div>

              {/* Card Blur Slider */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                  <Label>{lang === "bn" ? "কার্ডের ব্যাকগ্রাউন্ড ব্লার (Blur)" : "Card Backdrop Blur"}</Label>
                  <span className="font-mono text-[9px]">{theme.cardBlur ?? 0}px</span>
                </div>
                <Slider
                  min={0}
                  max={30}
                  step={1}
                  value={[theme.cardBlur ?? 0]}
                  onValueChange={val => updateThemeField("cardBlur", val[0])}
                  className="py-2"
                />
              </div>

              {/* Card Border Width */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কার্ডের বর্ডারের পুরুত্ব" : "Card Border Width"}</Label>
                <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
                  {[
                    { id: "none", label: lang === "bn" ? "কিছু না" : "None" },
                    { id: "thin", label: lang === "bn" ? "চিকন" : "Thin" },
                    { id: "medium", label: lang === "bn" ? "মাঝারি" : "Medium" },
                    { id: "thick", label: lang === "bn" ? "মোটা" : "Thick" },
                    { id: "heavy", label: lang === "bn" ? "গাঢ়" : "Heavy" }
                  ].map(w => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => updateThemeField("borderWidth", w.id)}
                      className={`flex-1 py-1 rounded-md text-[9px] text-center font-medium transition-all ${
                        theme.borderWidth === w.id
                          ? "bg-background text-foreground shadow font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Box Shadow Selector */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কার্ড শ্যাডো (ছায়া)" : "Box Shadow Intensity"}</Label>
                <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
                  {[
                    { id: "none", label: lang === "bn" ? "ফ্ল্যাট" : "None" },
                    { id: "soft", label: lang === "bn" ? "হালকা" : "Soft" },
                    { id: "medium", label: lang === "bn" ? "মাঝারি" : "Medium" },
                    { id: "deep", label: lang === "bn" ? "গভীর" : "Deep" },
                    { id: "brutal", label: lang === "bn" ? "ত্রিমাত্রিক" : "Brutal" }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => updateThemeField("shadowStyle", s.id)}
                      className={`flex-1 py-1 rounded-md text-[9px] text-center font-medium transition-all ${
                        theme.shadowStyle === s.id
                          ? "bg-background text-foreground shadow font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Animation Speed Selector */}
              <div className="space-y-1 pt-2 border-t border-border/20">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "অ্যানিমেশন ট্রানজিশন গতি" : "Transition Animation Speed"}</Label>
                <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
                  {[
                    { id: "none", label: lang === "bn" ? "বন্ধ" : "None" },
                    { id: "fast", label: lang === "bn" ? "দ্রুত" : "Fast" },
                    { id: "normal", label: lang === "bn" ? "স্বাভাবিক" : "Normal" },
                    { id: "slow", label: lang === "bn" ? "ধীর" : "Slow" }
                  ].map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => updateThemeField("animationSpeed", a.id)}
                      className={`flex-1 py-1 rounded-md text-[9px] text-center font-medium transition-all ${
                        theme.animationSpeed === a.id
                          ? "bg-background text-foreground shadow font-semibold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section A: Typography */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Type className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "টাইপোগ্রাফি ও ফন্ট" : "Typography & Fonts"}</span>
            </div>
            
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "ফন্ট ফ্যামিলি" : "Font Family"}</Label>
                <select
                  value={theme.fontFamily}
                  onChange={e => updateThemeField("fontFamily", e.target.value)}
                  className="w-full h-8 rounded border border-border bg-background px-2 text-xs"
                >
                  <option value="">{lang === "bn" ? "ডিফল্ট ফন্ট" : "Default Font"}</option>
                  <option value="Roboto, sans-serif">Roboto (Google — Clean)</option>
                  <option value="Montserrat, sans-serif">Montserrat (Google — Bold)</option>
                  <option value="Nunito, sans-serif">Nunito (Google — Rounded)</option>
                  <option value="Ubuntu, sans-serif">Ubuntu (Google — Friendly)</option>
                  <option value="'Playfair Display', serif">Playfair Display (Elegant Serif)</option>
                  <option value="Poppins, 'Hind Siliguri', sans-serif">Poppins & Hind Siliguri (Modern)</option>
                  <option value="Lora, Georgia, serif">Lora (Classic Serif)</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman (Traditional Serif)</option>
                  <option value="'Fira Code', monospace">Fira Code (Developer Mono)</option>
                  <option value="system-ui, -apple-system, sans-serif">System UI (Native OS)</option>
                  <option value="sans-serif">Sans-Serif (Browser Default)</option>
                  <option value="Arial, Helvetica, sans-serif">Arial / Helvetica (Classic)</option>
                  <option value="Georgia, 'Times New Roman', serif">Georgia (Elegant Serif)</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                  <Label>{lang === "bn" ? "ফন্ট সাইজ (স্কেল)" : "Base Font Size"}</Label>
                  <span className="font-mono">{theme.fontSize || "16px"}</span>
                </div>
                <Slider
                  min={13}
                  max={22}
                  step={1}
                  value={[parseInt(theme.fontSize || "16")]}
                  onValueChange={val => updateThemeField("fontSize", `${val[0]}px`)}
                  className="py-2"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "গুগল ফন্ট নাম (যেকোনো ফন্ট)" : "Custom Google Font Name"}</Label>
                <Input
                  className="bg-background h-8 text-xs placeholder:text-[10px]"
                  placeholder="E.g. Lobster, Pacifico, Orbitron, Great Vibes"
                  value={theme.fontFamily && !theme.fontFamily.includes(",") && !["Roboto", "Montserrat", "Nunito", "Ubuntu", "Playfair", "Poppins", "Lora", "Times", "Fira", "system", "sans", "Arial", "Georgia", "CustomUploadedFont"].some(x => theme.fontFamily?.toLowerCase().includes(x)) ? theme.fontFamily : ""}
                  onChange={e => updateThemeField("fontFamily", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কাস্টম ফন্ট ফাইল আপলোড করুন" : "Upload Custom Font File (.ttf, .otf, .woff, .woff2)"}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] px-2.5 shrink-0 flex-1"
                    onClick={() => fontFileInputRef.current?.click()}
                    disabled={isUploadingFont}
                  >
                    {isUploadingFont ? "..." : (theme.customFontName ? (lang === "bn" ? `ফন্ট: ${theme.customFontName}` : `Font: ${theme.customFontName}`) : (lang === "bn" ? "ফন্ট ফাইল সিলেক্ট করুন" : "Choose Font File"))}
                  </Button>
                  {theme.customFontUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[10px] px-2 text-destructive shrink-0"
                      onClick={() => {
                        updateThemeField("customFontUrl", "");
                        updateThemeField("customFontName", "");
                        updateThemeField("fontFamily", "");
                      }}
                    >
                      {lang === "bn" ? "মুছুন" : "Clear"}
                    </Button>
                  )}
                  <input
                    type="file"
                    ref={fontFileInputRef}
                    onChange={handleFontUpload}
                    accept=".ttf,.otf,.woff,.woff2"
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section B: Colors & Styling */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Palette className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "রং ও প্যালেট" : "Colors & Aesthetics"}</span>
            </div>

            <div className="space-y-3">
              {/* Accent Color Preset Buttons */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "অ্যাকসেন্ট রং (থিম কালার)" : "Primary Brand Color"}</Label>
                <div className="flex gap-2 flex-wrap items-center pt-1">
                  {[
                    { hex: "#10b981", label: "Green" },
                    { hex: "#6366f1", label: "Indigo" },
                    { hex: "#0ea5e9", label: "Sky" },
                    { hex: "#f97316", label: "Orange" },
                    { hex: "#f43f5e", label: "Rose" },
                  ].map(c => (
                    <button
                      key={c.hex}
                      onClick={() => updateThemeField("primaryColor", c.hex)}
                      className={`size-6 rounded-full border-2 transition-transform active:scale-90 ${
                        theme.primaryColor === c.hex ? "border-foreground scale-110 shadow-sm" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.label}
                    />
                  ))}
                  
                  {/* Custom Color Selector */}
                  <div className="flex items-center gap-1.5 border border-border rounded px-1.5 py-0.5 bg-background">
                    <input
                      type="color"
                      value={theme.primaryColor || "#10b981"}
                      onChange={e => updateThemeField("primaryColor", e.target.value)}
                      className="size-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                    />
                    <span className="text-[9px] font-mono">{theme.primaryColor || "#10b981"}</span>
                  </div>
                </div>
              </div>

              {/* Text and Background Custom Pickers */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "ব্যাকগ্রাউন্ড রং" : "Background Color"}</Label>
                  <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1 bg-background h-8">
                    <input
                      type="color"
                      value={theme.backgroundColor || "#fafafa"}
                      onChange={e => updateThemeField("backgroundColor", e.target.value)}
                      className="size-5 rounded cursor-pointer"
                    />
                    <span className="text-[9px] font-mono truncate">{theme.backgroundColor || "Default"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "টেক্সট রং" : "Text Color"}</Label>
                  <div className="flex items-center gap-1.5 border border-border rounded px-2 py-1 bg-background h-8">
                    <input
                      type="color"
                      value={theme.textColor || "#18181b"}
                      onChange={e => updateThemeField("textColor", e.target.value)}
                      className="size-5 rounded cursor-pointer"
                    />
                    <span className="text-[9px] font-mono truncate">{theme.textColor || "Default"}</span>
                  </div>
                </div>
              </div>

              {/* Card Darkness and KPI style */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                    <Label>{lang === "bn" ? "কার্ড ডার্কনেস (অন্ধকার)" : "Card Darkness (Overlay)"}</Label>
                    <span className="font-mono">{Math.round((theme.cardDarkness || 0) * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={0.9}
                    step={0.05}
                    value={[theme.cardDarkness || 0]}
                    onValueChange={val => updateThemeField("cardDarkness", val[0])}
                    className="py-2"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কেপিআই ডিজাইন স্টাইল" : "KPI Metric Card Style"}</Label>
                  <select
                    value={theme.kpiStyle || "default"}
                    onChange={e => updateThemeField("kpiStyle", e.target.value)}
                    className="w-full h-8 rounded border border-border bg-background px-2 text-xs"
                  >
                    <option value="default">{lang === "bn" ? "ডিফল্ট (সফট গ্রেডিয়েন্ট)" : "Default Soft Gradient"}</option>
                    <option value="glass">{lang === "bn" ? "গ্লাস মরফিজম (স্বচ্ছ)" : "Glassmorphic Translucent"}</option>
                    <option value="neon">{lang === "bn" ? "নিয়ন বর্ডার ও গ্লো" : "Neon Bordered Glow"}</option>
                    <option value="borderless">{lang === "bn" ? "বর্ডারলেস মিনিমাল" : "Borderless Flat"}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Density & Spacing */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Layout className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "প্যাডিং ও লেআউট ডেনসিটি" : "Density & Spacing"}</span>
            </div>
            
            <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
              {[
                { id: "compact", label: lang === "bn" ? "কম্প্যাক্ট" : "Compact" },
                { id: "standard", label: lang === "bn" ? "স্ট্যান্ডার্ড" : "Standard" },
                { id: "cozy", label: lang === "bn" ? "কোজি (বড়)" : "Cozy" },
              ].map(d => (
                <button
                  key={d.id}
                  onClick={() => updateThemeField("density", d.id)}
                  className={`flex-1 py-1 rounded-md text-center font-medium transition-all ${
                    theme.density === d.id ? "bg-background text-foreground shadow" : "text-muted-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section C.5: Product Card Size */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <LayoutGrid className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "পণ্য বাক্সের সাইজ (মোবাইল ও ডেক্সটপ)" : "Product Card Size (Mobile & Desktop)"}</span>
            </div>
            
            <div className="flex bg-muted rounded-lg p-0.5 text-xs w-full justify-between">
              {[
                { id: "small", label: lang === "bn" ? "ছোট (৪ কলাম)" : "Small (4 Col)" },
                { id: "standard", label: lang === "bn" ? "মাঝারি (৩ কলাম)" : "Standard (3 Col)" },
                { id: "large", label: lang === "bn" ? "বড় (২ কলাম)" : "Large (2 Col)" }
              ].map(sz => (
                <button
                  key={sz.id}
                  type="button"
                  onClick={() => updateThemeField("productBoxSize", sz.id)}
                  className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                    theme.productBoxSize === sz.id
                      ? "bg-background text-foreground shadow font-semibold"
                      : "text-muted-foreground"
                  }`}
                >
                  {sz.label}
                </button>
              ))}
            </div>
          </div>

          {/* Section D: KPI Card Customization */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <LayoutGrid className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "KPI কার্ড কাস্টমাইজেশন" : "KPI Card Customization"}</span>
            </div>

            {/* KPI Alignment */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কার্ড টেক্সট অ্যালাইনমেন্ট" : "Card Text Alignment"}</Label>
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => updateKpiConfig({ align: a })}
                    className={`flex-1 h-8 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                      kpiConfig.align === a
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {a === "left" && <AlignLeft className="size-3.5" />}
                    {a === "center" && <AlignCenter className="size-3.5" />}
                    {a === "right" && <AlignRight className="size-3.5" />}
                    {lang === "bn" ? (a === "left" ? "বাম" : a === "center" ? "মাঝ" : "ডান") : (a === "left" ? "Left" : a === "center" ? "Center" : "Right")}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Card Size */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কার্ড সাইজ (KPI Box Size)" : "Card Size (KPI Height)"}</Label>
              <div className="grid grid-cols-6 gap-1 bg-muted rounded-lg p-1 text-xs w-full">
                {[
                  { id: "xxs", label: "XXS" },
                  { id: "xs", label: "XS" },
                  { id: "small", label: lang === "bn" ? "ছোট" : "Small" },
                  { id: "standard", label: lang === "bn" ? "মাঝারি" : "Med" },
                  { id: "large", label: lang === "bn" ? "বড়" : "Large" },
                  { id: "xl", label: "XL" },
                ].map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => updateKpiConfig({ size: s.id as any })}
                    className={`py-1.5 rounded-md text-center text-[10px] font-bold transition-all ${
                      kpiConfig.size === s.id
                        ? "bg-background text-primary shadow font-extrabold ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Corner Sharpness / Edges */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কেপিআই কর্নার শার্পনেস (Sharp Edges)" : "KPI Edge Sharpness & Curve"}</Label>
              <div className="grid grid-cols-6 gap-1 bg-muted rounded-lg p-1 text-xs w-full">
                {[
                  { id: "none", label: lang === "bn" ? "শার্প (Sharp)" : "Sharp" },
                  { id: "sm", label: "Small" },
                  { id: "md", label: "Med" },
                  { id: "lg", label: "Round" },
                  { id: "xl", label: "XL" },
                  { id: "full", label: "Pill" },
                ].map(cr => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => updateKpiConfig({ curve: cr.id as any })}
                    className={`py-1.5 rounded-md text-center text-[10px] font-bold transition-all ${
                      (kpiConfig.curve || "none") === cr.id
                        ? "bg-background text-primary shadow font-extrabold ring-1 ring-primary/40"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cr.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Columns */}
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "কলাম সংখ্যা (মোবাইল)" : "Columns per Row (Mobile)"}</Label>
              <div className="flex bg-muted rounded-lg p-0.5 text-xs">
                {[1, 2, 3].map(c => (
                  <button
                    key={c}
                    onClick={() => updateKpiConfig({ columns: c })}
                    className={`flex-1 py-1.5 rounded-md text-center font-medium transition-all ${
                      kpiConfig.columns === c
                        ? "bg-background text-foreground shadow font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {c} {lang === "bn" ? "কলাম" : "Col"}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Drag-and-Drop Order */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "KPI ক্রম (ড্র্যাগ করে পরিবর্তন করুন)" : "KPI Order (Drag to reorder)"}</Label>
              <div className="space-y-1">
                {kpiConfig.order.map((id, idx) => (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => handleKpiDragStart(idx)}
                    onDragOver={(e) => handleKpiDragOver(e, idx)}
                    onDragEnd={handleKpiDragEnd}
                    className={`p-2 bg-background border border-border/75 rounded-lg flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all select-none hover:bg-muted/20 ${
                      kpiDraggedIndex === idx ? "opacity-40 scale-[0.98] border-primary" : ""
                    }`}
                  >
                    <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[11px] font-semibold text-foreground flex-1">{kpiLabels[id] || id}</span>
                    <span className="text-[9px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section E: Background Image */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <ImageIcon className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "ব্যাকগ্রাউন্ড ছবি" : "Background Image"}</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "ব্যাকগ্রাউন্ড ছবি আপলোড অথবা ইউআরএল" : "Custom Background Image"}</Label>
                <div className="flex gap-2">
                  <Input
                    className="bg-background h-8 text-xs placeholder:text-[10px] flex-1"
                    placeholder="https://example.com/bg.jpg"
                    value={theme.bgImage}
                    onChange={e => updateThemeField("bgImage", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-[10px] px-2.5 shrink-0"
                    onClick={() => bgFileInputRef.current?.click()}
                    disabled={isUploadingBg}
                  >
                    {isUploadingBg ? "..." : (lang === "bn" ? "আপলোড" : "Upload")}
                  </Button>
                  <input
                    type="file"
                    ref={bgFileInputRef}
                    onChange={handleBgUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              {theme.bgImage && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                    <Label>{lang === "bn" ? "ছবির অপাসিটি" : "Background Opacity"}</Label>
                    <span className="font-mono">{Math.round(theme.bgImageOpacity * 100)}%</span>
                  </div>
                  <Slider
                    min={0.02}
                    max={0.40}
                    step={0.01}
                    value={[theme.bgImageOpacity]}
                    onValueChange={val => updateThemeField("bgImageOpacity", val[0])}
                    className="py-2"
                  />
                </div>
              )}

              {/* Presets Grid */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{lang === "bn" ? "ডিফল্ট ব্যাকগ্রাউন্ড প্রিসেটস" : "Quick Image Presets"}</Label>
                <div className="grid grid-cols-4 gap-2">
                  {bgPresets.map(p => (
                    <button
                      key={p.name}
                      onClick={() => {
                        updateThemeField("bgImage", p.url);
                        updateThemeField("bgImageOpacity", 0.1);
                      }}
                      className={`h-10 text-[9px] font-semibold border rounded-lg overflow-hidden flex items-center justify-center p-1 bg-cover bg-center text-center transition-all ${
                        theme.bgImage === p.url ? "border-primary font-bold shadow-md scale-105" : "border-border hover:bg-muted/30 text-muted-foreground"
                      }`}
                      style={p.url ? { backgroundImage: `linear-gradient(rgba(255,255,255,0.8), rgba(255,255,255,0.8)), url('${p.url}')` } : {}}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section G: Dashboard Widget Drag-and-Drop */}
          <div className="space-y-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Sparkles className="size-4 text-muted-foreground" />
              <span>{lang === "bn" ? "ড্যাশবোর্ড লেআউট (ড্র্যাগ অ্যান্ড ড্রপ)" : "Dashboard Layout (Drag & Drop)"}</span>
            </div>
            
            <p className="text-[10px] text-muted-foreground leading-normal">
              {lang === "bn"
                ? "ড্যাশবোর্ডের উপাদানগুলোর ক্রম পরিবর্তন করতে তাদের উপর ক্লিক করে ড্র্যাগ করে উপরে-নিচে নামান।"
                : "Drag and drop the cards below to change the order they appear on your main dashboard."}
            </p>

            <div className="space-y-1.5">
              {widgets.map((w, index) => (
                <div
                  key={w.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`p-2 bg-background border border-border/75 rounded-lg flex items-center gap-2 cursor-grab active:cursor-grabbing transition-all select-none hover:bg-muted/20 ${
                    draggedIndex === index ? "opacity-40 scale-[0.98] border-primary" : ""
                  }`}
                >
                  <GripVertical className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] font-semibold text-foreground">{w.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reset button */}
          <Button
            onClick={handleResetTheme}
            variant="outline"
            className="w-full h-8 text-[11px] border-zinc-200 hover:bg-muted font-medium"
          >
            {lang === "bn" ? "থিম সেটিংস ডিফল্ট করুন" : "Reset Custom Theme to Default"}
          </Button>

        </Card>
      </div>
    );

  // Profile Switcher State
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceProfileId, setImportSourceProfileId] = useState("");
  const [importModule, setImportModule] = useState<"products" | "somiti" | "party" | "customer" | "sales" | "purchases" | "expenses" | "cashbox" | "">("");
  const [isProcessingProfile, setIsProcessingProfile] = useState(false);

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim() || isProcessingProfile) return;
    setIsProcessingProfile(true);
    try {
      await createProfileFn({ data: { name: newProfileName.trim() } });
      toast.success(lang === "bn" ? `প্রোফাইল "${newProfileName}" তৈরি এবং পরিবর্তন করা হয়েছে` : `Profile "${newProfileName}" created & switched`);
      setNewProfileName("");
      setCreateProfileOpen(false);
      await refresh();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsProcessingProfile(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (isProcessingProfile) return;
    setIsProcessingProfile(true);
    try {
      await switchProfileFn({ data: { profileId } });
      const pName = user?.profiles?.find(p => p.id === profileId)?.name || "Default";
      toast.success(lang === "bn" ? `প্রোফাইল "${pName}" এ পরিবর্তন করা হয়েছে` : `Switched to profile "${pName}"`);
      await refresh();
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsProcessingProfile(false);
    }
  };

  const handleImportModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importSourceProfileId || !importModule || isProcessingProfile) return;
    setIsProcessingProfile(true);
    try {
      const res = await importProfileModuleFn({
        data: {
          fromProfileId: importSourceProfileId,
          module: importModule as any
        }
      });
      toast.success(lang === "bn"
        ? `সফলভাবে ${res.importedCount}টি তথ্য আমদানি করা হয়েছে!`
        : `Successfully imported ${res.importedCount} records!`);
      setImportOpen(false);
      setImportModule("");
      setImportSourceProfileId("");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || String(err));
    } finally {
      setIsProcessingProfile(false);
    }
  };

  const renderProfileSwitcher = () => {
    const currentProfileObj = user?.profiles?.find(p => p.id === (user?.activeProfile || "default"));
    const currentProfileName = currentProfileObj?.name || (user?.activeProfile === "default" || !user?.activeProfile ? "Default Profile" : "Active Profile");
    const otherProfiles = user?.profiles?.filter(p => p.id !== (user?.activeProfile || "default")) || [];

    return (
      <Card className="p-2.5 sm:p-4 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-background border-indigo-500/25 beveled-card relative overflow-hidden space-y-2 sm:space-y-3.5">
        <div className="absolute top-0 right-0 w-20 h-20 sm:w-24 sm:h-24 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="size-6.5 sm:size-8.5 rounded-lg sm:rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 grid place-items-center border border-indigo-500/20 shadow-sm shrink-0">
              <RefreshCw className={`size-3.5 sm:size-4.5 ${isProcessingProfile ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                {lang === "bn" ? "প্রোফাইল সুইচার" : "Profile Switcher"}
              </div>
              <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-zinc-50 flex items-center gap-1 mt-0.5">
                <span className="truncate max-w-[110px] sm:max-w-none">{currentProfileName}</span>
                <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.2 rounded border border-emerald-500/20 uppercase tracking-wide">
                  {lang === "bn" ? "সক্রিয়" : "Active"}
                </span>
              </div>
            </div>
          </div>
          
          <Button
            size="sm"
            onClick={() => setCreateProfileOpen(true)}
            className="h-6.5 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white beveled-button"
          >
            <Plus className="size-3 sm:size-3.5 mr-1" />
            {lang === "bn" ? "নতুন প্রোফাইল" : "New Profile"}
          </Button>
        </div>

        {/* Profiles Dropdown / Swapper */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-1 border-t border-dashed border-border/70">
          <div className="text-[10px] sm:text-xs text-muted-foreground shrink-0">
            {lang === "bn" ? "প্রোফাইল পরিবর্তন:" : "Switch Profile:"}
          </div>
          <div className="flex-1 flex gap-1 sm:gap-1.5 flex-wrap">
            {user?.profiles?.map(p => {
              const isActive = p.id === (user?.activeProfile || "default");
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => !isActive && handleSwitchProfile(p.id)}
                  disabled={isProcessingProfile}
                  className={`h-5.5 sm:h-7 px-2 sm:px-2.5 text-[9px] sm:text-[10px] rounded-md sm:rounded-lg transition-all ${
                    isActive
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                      : "text-zinc-700 dark:text-zinc-300 hover:bg-muted font-medium"
                  }`}
                >
                  {p.name}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Data Import Section */}
        {user?.activeProfile !== "default" && user?.activeProfile && otherProfiles.length > 0 && (
          <div className="pt-2 border-t border-dashed border-border/70 space-y-2">
            <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
              {lang === "bn" ? "অন্য প্রোফাইল থেকে ডাটা আমদানি" : "Import Data from Other Profiles"}
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {lang === "bn"
                ? "আপনি চাইলে অন্য কোনো প্রোফাইলের পণ্য, সমিতি বা পার্টনার (গ্রাহক বকেয়া) ডাটা এই প্রোফাইলে আমদানি করতে পারেন।"
                : "You can import products, samity, or customer debt logs from another profile into this profile to get started quickly."}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="w-full h-8 text-[11px] font-semibold border-indigo-500/20 text-indigo-600 hover:bg-indigo-500/5 beveled-button"
            >
              {lang === "bn" ? "ডাটা আমদানি করুন" : "Import Modules"}
            </Button>
          </div>
        )}
      </Card>
    );
  };

  const renderBackdateManager = () => {
    return (
      <Card className="p-4 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-background border-amber-500/25 beveled-card space-y-4">
        <div>
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold">
            {lang === "bn" ? "কাস্টম ও ব্যাকডেট এন্ট্রি" : "Backdate Manager"}
          </div>
          <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-50 mt-0.5">
            {lang === "bn" ? "তারিখ অনুযায়ী সরাসরি হিসাব যোগ করুন" : "Add Custom Records on Custom Dates"}
          </h2>
        </div>

        <form onSubmit={handleAddCustomRecord} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "লেনদেনের ধরন" : "Record Type *"}</Label>
              <Select value={txnType} onValueChange={(v: any) => setTxnType(v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">{lang === "bn" ? "বিক্রি (Sale)" : "Sale"}</SelectItem>
                  <SelectItem value="expense">{lang === "bn" ? "খরচ (Expense)" : "Expense"}</SelectItem>
                  <SelectItem value="purchase">{lang === "bn" ? "ক্রয় (Purchase/Buy)" : "Purchase"}</SelectItem>
                  <SelectItem value="deposit">{lang === "bn" ? "ক্যাশবক্স জমা (Deposit / Add Money)" : "Cashbox Deposit (Add Money)"}</SelectItem>
                  <SelectItem value="withdraw">{lang === "bn" ? "ক্যাশবক্স উত্তোলন (Withdrawal)" : "Cashbox Withdrawal"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "তারিখ ও সময়" : "Custom Date & Time *"}</Label>
              <Input
                type="datetime-local"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                required
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Conditional Forms */}
          {txnType === "sale" && (
            <div className="space-y-3 p-3 bg-background/50 rounded-lg border border-amber-500/10 animate-in fade-in duration-200">
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "বিদ্যমান পণ্য নির্বাচন করুন (খুঁজুন)" : "Select Existing Product"}</Label>
                  <ProductSearchSelect
                    products={products}
                    value={saleProdId}
                    onChange={(val) => {
                      setSaleProdId(val);
                      const prod = products.find(p => p.id === val);
                      if (prod) {
                        setSaleProdName(prod.name);
                        setSaleBuyPrice(String(prod.buy_price || 0));
                        setSaleSellPrice(String(prod.sell_price || 0));
                      }
                    }}
                    placeholder={lang === "bn" ? "পণ্য খুঁজুন বা সিলেক্ট করুন" : "Search or select product"}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "পণ্যের নাম (সরাসরি টাইপও করা যাবে)" : "Product Name (Can also type manually) *"}</Label>
                  <Input value={saleProdName} onChange={e => setSaleProdName(e.target.value)} required placeholder="E.g. Cotton Panjabi" className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "পরিমাণ" : "Quantity *"}</Label>
                  <Input type="number" step="1" inputMode="numeric" pattern="[0-9]*" value={saleQty} onChange={e => setSaleQty(e.target.value)} required placeholder="1" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "কেনা দাম (প্রতি পিস)" : "Buy Price (Unit)"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={saleBuyPrice} onChange={e => setSaleBuyPrice(e.target.value)} placeholder="0" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "বিক্রি দাম (প্রতি পিস)" : "Sell Price (Unit) *"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={saleSellPrice} onChange={e => setSaleSellPrice(e.target.value)} required placeholder="0" className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "পেমেন্ট টাইপ" : "Payment Type"}</Label>
                  <Select value={saleType} onValueChange={(v: any) => setSaleType(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{lang === "bn" ? "নগদ (Cash)" : "Cash"}</SelectItem>
                      <SelectItem value="credit">{lang === "bn" ? "বাকী (Credit)" : "Credit"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "আদায় (Paid)" : "Paid Amount"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={salePaidAmt} onChange={e => setSalePaidAmt(e.target.value)} placeholder="0" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "বাকী (Due)" : "Due Amount"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={saleDueAmt} onChange={e => setSaleDueAmt(e.target.value)} placeholder="0" className="h-8 text-xs" />
                </div>
              </div>
            </div>
          )}

          {txnType === "expense" && (
            <div className="space-y-3 p-3 bg-background/50 rounded-lg border border-amber-500/10 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "খরচের শিরোনাম" : "Expense Title *"}</Label>
                  <Input value={expTitle} onChange={e => setExpTitle(e.target.value)} required placeholder="E.g. Tea & Snacks" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "টাকার পরিমাণ" : "Amount *"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={expAmt} onChange={e => setExpAmt(e.target.value)} required placeholder="0" className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{lang === "bn" ? "নোট/মন্তব্য" : "Note/Details"}</Label>
                <Input value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="E.g. Shop visitors tea" className="h-8 text-xs" />
              </div>
            </div>
          )}

          {txnType === "purchase" && (
            <div className="space-y-3 p-3 bg-background/50 rounded-lg border border-amber-500/10 animate-in fade-in duration-200">
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "বিদ্যমান পণ্য নির্বাচন করুন (খুঁজুন)" : "Select Existing Product"}</Label>
                  <ProductSearchSelect
                    products={products}
                    value={purProdId}
                    onChange={(val) => {
                      setPurProdId(val);
                      const prod = products.find(p => p.id === val);
                      if (prod) {
                        setPurProdName(prod.name);
                        setPurUnitCost(String(prod.buy_price || 0));
                      }
                    }}
                    placeholder={lang === "bn" ? "পণ্য খুঁজুন বা সিলেক্ট করুন" : "Search or select product"}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "পণ্যের নাম (সরাসরি টাইপও করা যাবে)" : "Product Name (Can also type manually) *"}</Label>
                  <Input value={purProdName} onChange={e => setPurProdName(e.target.value)} required placeholder="E.g. Premium Silk Saree" className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "পরিমাণ" : "Quantity *"}</Label>
                  <Input type="number" step="1" inputMode="numeric" pattern="[0-9]*" value={purQty} onChange={e => setPurQty(e.target.value)} required placeholder="1" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "কেনা দাম (ইউনিট)" : "Unit Cost *"}</Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={purUnitCost} onChange={e => setPurUnitCost(e.target.value)} required placeholder="0" className="h-8 text-xs" />
                </div>
              </div>
            </div>
          )}

          {(txnType === "withdraw" || txnType === "deposit") && (
            <div className="space-y-3 p-3 bg-background/50 rounded-lg border border-amber-500/10 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {txnType === "deposit"
                      ? (lang === "bn" ? "জমার পরিমাণ *" : "Deposit Amount *")
                      : (lang === "bn" ? "উত্তোলন পরিমাণ *" : "Withdrawal Amount *")}
                  </Label>
                  <Input type="number" step="any" inputMode="decimal" pattern="[0-9.]*" value={withAmt} onChange={e => setWithAmt(e.target.value)} required placeholder="0" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{lang === "bn" ? "নোট/বিবরণ" : "Note"}</Label>
                  <Input value={withNote} onChange={e => setWithNote(e.target.value)} placeholder={txnType === "deposit" ? (lang === "bn" ? "যেমন: নগদ জমা" : "E.g. Cash float added") : "E.g. Owner emergency cash"} className="h-8 text-xs" />
                </div>
              </div>
            </div>
          )}

          <Button type="submit" disabled={txnSubmitting} className="w-full h-8.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold beveled-button">
            {txnSubmitting ? "Processing..." : (lang === "bn" ? "লেনদেন যুক্ত করুন" : "Add Record")}
          </Button>
        </form>
      </Card>
    );
  };

  // ─── Employee Management Section (Shop Owner only) ────────────────────────
  const [addEmpModalOpen, setAddEmpModalOpen] = useState(false);
  const [editEmpModalOpen, setEditEmpModalOpen] = useState(false);
  const [resetEmpModalOpen, setResetEmpModalOpen] = useState(false);
  const [deleteEmpModalOpen, setDeleteEmpModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  const [empFullName, setEmpFullName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empUsername, setEmpUsername] = useState("");
  const [empPhone, setEmpPhone] = useState("");
  const [empPassword, setEmpPassword] = useState("");
  const [empDesignation, setEmpDesignation] = useState("Sales Staff");
  const [empPermissions, setEmpPermissions] = useState<PermissionSet>(DEFAULT_EMPLOYEE_PERMISSIONS);
  const [empSaving, setEmpSaving] = useState(false);
  const [newEmpPassword, setNewEmpPassword] = useState("");
  const [addEmpMode, setAddEmpMode] = useState<"invite" | "manual">("invite");
  const [employeeTab, setEmployeeTab] = useState<"active" | "invitations">("active");

  const employeesQuery = useQuery({
    queryKey: ["shop-employees"],
    queryFn: listShopEmployeesFn,
    enabled: user?.role === "owner",
  });

  const invitationsQuery = useQuery({
    queryKey: ["shop-employee-invitations"],
    queryFn: listEmployeeInvitationsFn,
    enabled: user?.role === "owner",
  });

  const shopEmployees = employeesQuery.data ?? [];
  const employeeInvitations = invitationsQuery.data ?? [];

  const handleOpenAddEmployee = () => {
    setEmpFullName("");
    setEmpEmail("");
    setEmpUsername("");
    setEmpPhone("");
    setEmpPassword("");
    setAddEmpMode("invite");
    setEmpDesignation(lang === "bn" ? "বিক্রয় কর্মী" : "Sales Staff");
    setEmpPermissions({
      dashboard: true,
      products: true,
      sales: true,
      parties: false,
      purchases: false,
      expenses: false,
      cashbox: false,
      settings: false,
      reports: false,
      danger_zone: false,
    });
    setAddEmpModalOpen(true);
  };

  const handleOpenEditEmployee = (emp: any) => {
    setSelectedEmp(emp);
    setEmpFullName(emp.full_name || "");
    setEmpPhone(emp.phone || "");
    setEmpDesignation(emp.designation || "Sales Staff");
    setEmpPermissions(emp.permissions || DEFAULT_EMPLOYEE_PERMISSIONS);
    setEditEmpModalOpen(true);
  };

  const handleOpenResetPassword = (emp: any) => {
    setSelectedEmp(emp);
    setNewEmpPassword("");
    setResetEmpModalOpen(true);
  };

  const handleSaveNewEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmpSaving(true);
    try {
      if (addEmpMode === "invite") {
        if (!empEmail.trim() || !empEmail.includes("@")) {
          toast.error(lang === "bn" ? "সঠিক ইমেইল এড্রেস লিখুন" : "Please enter a valid employee email address");
          return;
        }

        await inviteEmployeeByEmailFn({
          data: {
            email: empEmail.trim().toLowerCase(),
            fullName: empFullName.trim(),
            designation: empDesignation.trim(),
            permissions: empPermissions,
            phone: empPhone.trim(),
          },
        });

        toast.success(
          lang === "bn"
            ? `কর্মচারী আমন্ত্রণ পাঠানো হয়েছে! ইউজার '${empEmail.trim()}' লগইন বা একাউন্ট তৈরি করলেই পপআপ দেখতে পাবেন।`
            : `Employee invitation sent! When '${empEmail.trim()}' logs in or registers, they will receive an invitation popup.`
        );
        setAddEmpModalOpen(false);
        qc.invalidateQueries({ queryKey: ["shop-employee-invitations"] });
        qc.invalidateQueries({ queryKey: ["shop-employees"] });
        setEmployeeTab("invitations");
      } else {
        if (!empFullName.trim() || !empUsername.trim() || !empPassword.trim()) {
          toast.error(lang === "bn" ? "সকল প্রয়োজনীয় তথ্য পূরণ করুন" : "Please fill all required fields");
          return;
        }

        await createShopEmployeeFn({
          data: {
            fullName: empFullName.trim(),
            username: empUsername.trim().toLowerCase(),
            phone: empPhone.trim() || empUsername.trim(),
            password: empPassword.trim(),
            designation: empDesignation.trim(),
            permissions: empPermissions,
          },
        });

        toast.success(lang === "bn" ? "নতুন কর্মচারী সফলভাবে যুক্ত হয়েছে!" : "Employee account created successfully!");
        setAddEmpModalOpen(false);
        qc.invalidateQueries({ queryKey: ["shop-employees"] });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to add employee");
    } finally {
      setEmpSaving(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await cancelEmployeeInvitationFn({
        data: { invitationId },
      });
      toast.success(lang === "bn" ? "আমন্ত্রণ বাতিল করা হয়েছে" : "Invitation cancelled successfully");
      qc.invalidateQueries({ queryKey: ["shop-employee-invitations"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel invitation");
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setEmpSaving(true);
    try {
      await updateShopEmployeeFn({
        data: {
          employeeId: selectedEmp.id,
          fullName: empFullName.trim(),
          phone: empPhone.trim(),
          designation: empDesignation.trim(),
          permissions: empPermissions,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারীর তথ্য ও পারমিশন আপডেট হয়েছে!" : "Employee updated successfully!");
      setEditEmpModalOpen(false);
      qc.invalidateQueries({ queryKey: ["shop-employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update employee");
    } finally {
      setEmpSaving(false);
    }
  };

  const handleSaveResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp || !newEmpPassword || newEmpPassword.length < 4) {
      toast.error(lang === "bn" ? "কমপক্ষে ৪ ডিজিটের পাসওয়ার্ড দিন" : "Password must be at least 4 characters");
      return;
    }
    setEmpSaving(true);
    try {
      await updateShopEmployeeFn({
        data: {
          employeeId: selectedEmp.id,
          password: newEmpPassword.trim(),
        },
      });
      toast.success(lang === "bn" ? "পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে!" : "Password reset successfully!");
      setResetEmpModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setEmpSaving(false);
    }
  };

  const handleToggleStatus = async (emp: any) => {
    try {
      const newStatus = !emp.is_active;
      await updateShopEmployeeFn({
        data: {
          employeeId: emp.id,
          isActive: newStatus,
        },
      });
      toast.success(
        newStatus
          ? (lang === "bn" ? "কর্মচারী একাউন্ট সক্রিয় করা হয়েছে" : "Employee activated")
          : (lang === "bn" ? "কর্মচারী একাউন্ট নিষ্ক্রিয় করা হয়েছে" : "Employee deactivated")
      );
      qc.invalidateQueries({ queryKey: ["shop-employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to change status");
    }
  };

  const handleDeleteEmployee = async () => {
    if (!selectedEmp) return;
    setEmpSaving(true);
    try {
      await deleteShopEmployeeFn({
        data: {
          employeeId: selectedEmp.id,
        },
      });
      toast.success(lang === "bn" ? "কর্মচারী মুছে ফেলা হয়েছে" : "Employee deleted");
      setDeleteEmpModalOpen(false);
      qc.invalidateQueries({ queryKey: ["shop-employees"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete employee");
    } finally {
      setEmpSaving(false);
    }
  };

  const renderEmployeeManagement = () => {
    if (user?.role !== "owner") return null;

    return (
      <Card className="p-4 sm:p-5 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <UserCheck className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  {lang === "bn" ? "কর্মচারী ব্যবস্থাপনা ও আমন্ত্রণ" : "Employee Management & Invitations"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "bn"
                    ? "ইমেইল দিয়ে কর্মচারী আমন্ত্রণ পাঠান, পারমিশন নিয়ন্ত্রণ করুন এবং একাউন্ট পরিচালনা করুন।"
                    : "Invite employees by email, configure granular module permissions, and manage staff accounts."}
                </p>
              </div>
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleOpenAddEmployee}
            className="h-9 px-3.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 beveled-button shrink-0 shadow-md"
          >
            <UserPlus className="size-4" />
            <span>{lang === "bn" ? "নতুন কর্মচারী যোগ / আমন্ত্রণ" : "Add / Invite Employee"}</span>
          </Button>
        </div>

        {/* Section Segmented Tabs (Active Employees vs Pending Invitations) */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/80 w-fit text-xs font-semibold">
          <button
            type="button"
            onClick={() => setEmployeeTab("active")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              employeeTab === "active"
                ? "bg-card text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="size-3.5 text-emerald-600" />
            <span>{lang === "bn" ? "সক্রিয় কর্মচারী" : "Active Staff"}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {shopEmployees.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setEmployeeTab("invitations")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
              employeeTab === "invitations"
                ? "bg-card text-primary shadow-xs border border-primary/30 font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="size-3.5 text-blue-500" />
            <span>{lang === "bn" ? "ইমেইল আমন্ত্রণসমূহ" : "Pending Invitations"}</span>
            {employeeInvitations.filter((i: any) => i.status === "pending").length > 0 && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-500 hover:bg-amber-500 text-white">
                {employeeInvitations.filter((i: any) => i.status === "pending").length}
              </Badge>
            )}
          </button>
        </div>

        {/* TAB 1: ACTIVE EMPLOYEES */}
        {employeeTab === "active" && (
          <>
            {employeesQuery.isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span>{lang === "bn" ? "কর্মচারীদের তালিকা লোড হচ্ছে..." : "Loading employees list..."}</span>
              </div>
            ) : shopEmployees.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-border/70 rounded-xl space-y-2.5 bg-muted/20">
                <div className="p-3 bg-muted/60 rounded-full inline-block text-muted-foreground">
                  <Users className="size-6 opacity-60" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto px-4">
                  <p className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "এখনও কোনো কর্মচারী যুক্ত করা হয়নি" : "No employees active yet"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "bn"
                      ? "ইমেইল দিয়ে আপনার কর্মচারীকে আমন্ত্রণ জানান অথবা সরাসরি ইউজারনেম পাসওয়ার্ড দিয়ে একাউন্ট তৈরি করুন।"
                      : "Invite your staff via email or create login credentials directly."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAddEmployee}
                  className="text-xs rounded-xl gap-1.5 h-8 mt-1"
                >
                  <Plus className="size-3.5" />
                  <span>{lang === "bn" ? "প্রথম কর্মচারী যোগ করুন" : "Add First Employee"}</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {shopEmployees.map((emp: any) => {
                  const p = emp.permissions || DEFAULT_EMPLOYEE_PERMISSIONS;
                  const grantedCount = Object.values(p).filter(Boolean).length;

                  return (
                    <div
                      key={emp.id}
                      className="p-3.5 sm:p-4 rounded-xl bg-muted/30 border border-border/70 hover:border-border transition-all space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2.5">
                        {/* Header: Name, Designation & Status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar className="size-10 rounded-xl border border-border/80 shadow-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-sm shrink-0">
                              <AvatarFallback className="rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                                {(emp.full_name || "EM").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-foreground truncate">
                                {emp.full_name}
                              </h4>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  {emp.designation || (lang === "bn" ? "বিক্রয় কর্মী" : "Sales Staff")}
                                </span>
                                {emp.email && !emp.email.endsWith("@employee.local") && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-[10px]">{emp.email}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              variant={emp.is_active ? "outline" : "secondary"}
                              className={`text-[10px] font-medium rounded-md px-1.5 py-0.5 ${
                                emp.is_active
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                  : "bg-zinc-500/15 text-zinc-500 border-zinc-500/30"
                              }`}
                            >
                              {emp.is_active
                                ? (lang === "bn" ? "সক্রিয়" : "Active")
                                : (lang === "bn" ? "নিষ্ক্রিয়" : "Inactive")}
                            </Badge>
                          </div>
                        </div>

                        {/* Contact details */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-background/60 p-2 rounded-lg border border-border/50 font-mono">
                          <div className="truncate">
                            <span className="text-muted-foreground block text-[9px] uppercase font-sans font-semibold">Phone / User</span>
                            <span className="text-foreground">{emp.phone || emp.username || "—"}</span>
                          </div>
                          <div className="truncate">
                            <span className="text-muted-foreground block text-[9px] uppercase font-sans font-semibold">Permissions</span>
                            <span className="text-foreground font-sans font-medium">{grantedCount} modules</span>
                          </div>
                        </div>

                        {/* Permissions Badges */}
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {p.sales && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              🛒 POS Sales
                            </span>
                          )}
                          {p.products && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                              📦 Products
                            </span>
                          )}
                          {p.purchases && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                              🛍️ Purchases
                            </span>
                          )}
                          {p.expenses && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                              💸 Expenses
                            </span>
                          )}
                          {p.cashbox && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                              💵 Cashbox
                            </span>
                          )}
                          {p.parties && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              👥 Parties
                            </span>
                          )}
                          {p.reports && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                              📈 Reports
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-border/50">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEditEmployee(emp)}
                            className="h-7.5 px-2 text-[11px] rounded-lg gap-1"
                            title="Edit permissions and details"
                          >
                            <Edit className="size-3" />
                            <span>{lang === "bn" ? "পারমিশন" : "Edit"}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenResetPassword(emp)}
                            className="h-7.5 px-2 text-[11px] rounded-lg gap-1"
                            title="Change employee password"
                          >
                            <Key className="size-3 text-amber-500" />
                            <span>{lang === "bn" ? "পাসওয়ার্ড" : "Password"}</span>
                          </Button>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(emp)}
                            className={`h-7.5 px-2 text-[11px] rounded-lg ${
                              emp.is_active
                                ? "text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                            }`}
                          >
                            {emp.is_active
                              ? (lang === "bn" ? "নিষ্ক্রিয় করুন" : "Deactivate")
                              : (lang === "bn" ? "সক্রিয় করুন" : "Activate")}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedEmp(emp);
                              setDeleteEmpModalOpen(true);
                            }}
                            className="h-7.5 px-2 text-[11px] rounded-lg text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 2: PENDING EMAIL INVITATIONS */}
        {employeeTab === "invitations" && (
          <>
            {invitationsQuery.isLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Loader2 className="size-5 animate-spin text-primary" />
                <span>Loading invitations...</span>
              </div>
            ) : employeeInvitations.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-border/70 rounded-xl space-y-2 bg-muted/20">
                <div className="p-3 bg-muted/60 rounded-full inline-block text-muted-foreground">
                  <Mail className="size-6 opacity-60" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto px-4">
                  <p className="text-xs font-bold text-foreground">
                    {lang === "bn" ? "কোন পেন্ডিং আমন্ত্রণ নেই" : "No pending invitations"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "bn"
                      ? "কর্মচারীর ইমেইল দিয়ে আমন্ত্রণ পাঠালে তারা লগইন করার পর পপআপে আমন্ত্রণ গ্রহণ করতে পারবে।"
                      : "Send invitations to staff email addresses. When they login, an invitation popup will appear."}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenAddEmployee}
                  className="text-xs rounded-xl gap-1.5 h-8 mt-1"
                >
                  <UserPlus className="size-3.5 text-emerald-600" />
                  <span>{lang === "bn" ? "ইমেইলে আমন্ত্রণ পাঠান" : "Invite Employee by Email"}</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
                {employeeInvitations.map((inv: any) => {
                  const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "";
                  const isPending = inv.status === "pending";

                  return (
                    <div
                      key={inv.id}
                      className="p-3.5 rounded-xl bg-card border border-border/80 shadow-xs space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="size-9 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center justify-center font-bold text-xs shrink-0">
                              <Mail className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-foreground truncate font-mono">
                                {inv.employee_email}
                              </h4>
                              <p className="text-[11px] text-muted-foreground">
                                {inv.employee_name ? `${inv.employee_name} • ` : ""}{inv.designation || "Sales Staff"}
                              </p>
                            </div>
                          </div>

                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              isPending
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/30 animate-pulse"
                                : inv.status === "accepted"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                : "bg-red-500/10 text-red-600 border-red-500/30"
                            }`}
                          >
                            {isPending ? "Pending Invite" : inv.status}
                          </Badge>
                        </div>

                        <p className="text-[11px] text-muted-foreground">
                          {lang === "bn" ? "আমন্ত্রণ পাঠানোর তারিখ:" : "Sent on:"} {dateStr}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                        <span className="text-[11px] text-muted-foreground">
                          {isPending ? "Waiting for employee to login" : `Status: ${inv.status}`}
                        </span>

                        {isPending && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCancelInvitation(inv.id)}
                            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 rounded-lg gap-1"
                          >
                            <Trash2 className="size-3" />
                            <span>{lang === "bn" ? "বাতিল করুন" : "Cancel"}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Profile Header */}
      <Card className="p-4 bg-gradient-to-br from-primary/10 via-indigo-500/5 to-background border-primary/20 beveled-card">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 select-none">
            <Avatar
              onClick={handleAvatarClick}
              className={`size-14 border-2 border-background shadow-md shrink-0 cursor-pointer transition-transform active:scale-95 group hover:brightness-90 ${isUploading ? 'pointer-events-none' : ''}`}
            >
              {user?.avatar_url ? (
                <img src={user.avatar_url} className="aspect-square h-full w-full object-cover rounded-full" alt="Profile" />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-primary to-indigo-600 text-white font-bold text-lg">{initials}</AvatarFallback>
              )}
            </Avatar>

            {isUploading ? (
              <div className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center text-[9px] text-white font-bold pointer-events-none">
                <span>{uploadProgress}%</span>
                <div className="w-8 h-1 bg-white/30 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            ) : (
              <div
                onClick={handleAvatarClick}
                className="absolute inset-0 bg-black/35 opacity-0 hover:opacity-100 rounded-full flex items-center justify-center text-[8px] text-white font-medium cursor-pointer transition-opacity pointer-events-none"
              >
                {lang === "bn" ? "আপলোড" : "Upload"}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base text-zinc-950 dark:text-zinc-50 truncate">{user?.full_name || "User"}</h2>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide border uppercase ${
                user?.role === "owner"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
              }`}>
                {user?.role === "owner" ? (lang === "bn" ? "মালিক" : "Owner") : (lang === "bn" ? "কর্মচারী" : "Employee")}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Store className="size-3.5 text-primary" />
                <span>{user?.business_name || "Dream IT Shop"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {user?.role === "owner" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShopProfileOpen(true)}
                    className="h-7 text-[11px] px-2.5 rounded-lg border-border/80 bg-background/80 hover:bg-muted font-bold text-foreground gap-1 cursor-pointer"
                  >
                    <Edit className="size-3 text-primary" />
                    <span>{lang === "bn" ? "দোকান প্রোফাইল" : "Shop Profile"}</span>
                  </Button>
                )}
                <PWAInstallButton variant="outline" className="h-7 text-[11px] px-2.5" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Profile Switcher */}
      {renderProfileSwitcher()}

      {isMobile ? (
        <Tabs defaultValue="menu" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full h-10 p-1 bg-muted/65 backdrop-blur-sm rounded-xl border border-border/40">
            <TabsTrigger value="menu" className="rounded-lg text-xs font-semibold">{lang === "bn" ? "মেনু ও লিংক" : "Operations"}</TabsTrigger>
            <TabsTrigger value="ui" className="rounded-lg text-xs font-semibold">{lang === "bn" ? "ইউআই সেটিংস" : "UI Style"}</TabsTrigger>
            <TabsTrigger value="backdate" className="rounded-lg text-xs font-semibold">{lang === "bn" ? "কাস্টম এন্ট্রি" : "Backdate"}</TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="space-y-5 outline-none mt-0">
            {renderMobileOperations()}
            {renderEmployeeManagement()}
            {renderSignOut()}
          </TabsContent>

          <TabsContent value="ui" className="space-y-5 outline-none mt-0 animate-in fade-in duration-200">
            {renderThemeCustomization()}
          </TabsContent>

          <TabsContent value="backdate" className="space-y-5 outline-none mt-0 animate-in fade-in duration-200">
            {renderBackdateManager()}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-5">
          {renderOperations()}
          {renderThemeCustomization()}
          {renderBackdateManager()}
          {renderEmployeeManagement()}
          {renderSignOut()}
        </div>
      )}

      {/* Create Profile Dialog */}
      <Dialog open={createProfileOpen} onOpenChange={setCreateProfileOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? "নতুন প্রোফাইল তৈরি করুন" : "Create New Profile"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProfile} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "প্রোফাইলের নাম *" : "Profile Name *"}</Label>
              <Input
                required
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                placeholder="e.g. Fresh Start, Branch 2"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreateProfileOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={isProcessingProfile}>
                {isProcessingProfile ? "…" : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Module Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif">
              {lang === "bn" ? "অন্য প্রোফাইল থেকে তথ্য আমদানি" : "Import Data from Profile"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImportModule} className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "উৎস প্রোফাইল (যেখান থেকে আসবে) *" : "Source Profile *"}</Label>
              <Select value={importSourceProfileId} onValueChange={setImportSourceProfileId} required>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {user?.profiles?.filter(p => p.id !== (user?.activeProfile || "default")).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{lang === "bn" ? "মডিউল বা বিভাগ *" : "Module to Import *"}</Label>
              <Select value={importModule} onValueChange={setImportModule as any} required>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="products">{lang === "bn" ? "পণ্য মডিউল (Products)" : "Products Module"}</SelectItem>
                  <SelectItem value="somiti">{lang === "bn" ? "সমিতি মডিউল (Samity)" : "Samity Module"}</SelectItem>
                  <SelectItem value="customer">{lang === "bn" ? "কাস্টমার ও বাকী মডিউল (Customers & Receivables)" : "Customers & Receivables Module"}</SelectItem>
                  <SelectItem value="party">{lang === "bn" ? "সাপ্লায়ার ও পার্টনার মডিউল (Suppliers & Payables)" : "Suppliers & Payables Module"}</SelectItem>
                  <SelectItem value="sales">{lang === "bn" ? "বিক্রয় ও লাভ মডিউল (Sales & Profits)" : "Sales & Profits Module"}</SelectItem>
                  <SelectItem value="purchases">{lang === "bn" ? "ক্রয় মডিউল (Purchases)" : "Purchases Module"}</SelectItem>
                  <SelectItem value="expenses">{lang === "bn" ? "খরচ মডিউল (Expenses)" : "Expenses Module"}</SelectItem>
                  <SelectItem value="cashbox">{lang === "bn" ? "ক্যাশ হিসাব মডিউল (Cashbox Ledger)" : "Cashbox Ledger Module"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={isProcessingProfile || !importSourceProfileId || !importModule}>
                {isProcessingProfile ? "…" : (lang === "bn" ? "আমদানি নিশ্চিত করুন" : "Confirm Import")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 1. Add Employee Dialog ─── */}
      <Dialog open={addEmpModalOpen} onOpenChange={setAddEmpModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-serif flex items-center gap-2">
              <UserPlus className="size-5 text-emerald-600" />
              <span>{lang === "bn" ? "নতুন কর্মচারী যোগ / আমন্ত্রণ" : "Add / Invite Employee"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {lang === "bn"
                ? "কর্মচারীর ইমেইল দিয়ে আমন্ত্রণ পাঠান অথবা সরাসরি লগইন একাউন্ট তৈরি করুন।"
                : "Invite staff by email or create direct credentials with module permissions."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2 p-1 bg-muted/60 rounded-xl border border-border/80 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setAddEmpMode("invite")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                addEmpMode === "invite"
                  ? "bg-card text-emerald-600 shadow-xs border border-emerald-500/30 font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="size-3.5" />
              <span>{lang === "bn" ? "ইমেইলে আমন্ত্রণ (সুপারিশকৃত)" : "Invite via Email (Recommended)"}</span>
            </button>
            <button
              type="button"
              onClick={() => setAddEmpMode("manual")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                addEmpMode === "manual"
                  ? "bg-card text-foreground shadow-xs border border-border/80 font-bold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="size-3.5" />
              <span>{lang === "bn" ? "সরাসরি একাউন্ট" : "Direct Account"}</span>
            </button>
          </div>

          <form onSubmit={handleSaveNewEmployee} className="space-y-4 pt-1">
            {addEmpMode === "invite" ? (
              <div className="space-y-3">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11.5px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  💡 {lang === "bn"
                    ? "কর্মচারীর জিমেইল/ইমেইল লিখুন। সেই ইমেইল দিয়ে ইউজার লগইন বা সাইন-আপ করলেই সাথে সাথে এই দোকানে যুক্ত হওয়ার জন্য এক্সেপ্ট/রিজেক্ট পপআপ দেখতে পাবেন।"
                    : "Enter employee's email. When they sign up or log in with this email, they will automatically receive a popup invitation to accept becoming an employee of your shop."}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারীর ইমেইল এড্রেস *" : "Employee Email Address *"}</Label>
                  <Input
                    required
                    type="email"
                    placeholder="e.g. staff.employee@gmail.com"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারীর নাম (ঐচ্ছিক)" : "Full Name (Optional)"}</Label>
                    <Input
                      placeholder="e.g. Rahim Ahmed"
                      value={empFullName}
                      onChange={(e) => setEmpFullName(e.target.value)}
                      className="h-8.5 text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পদবী (Designation)" : "Designation"}</Label>
                    <Input
                      placeholder="e.g. Sales Staff, Cashier"
                      value={empDesignation}
                      onChange={(e) => setEmpDesignation(e.target.value)}
                      className="h-8.5 text-xs rounded-xl"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">{lang === "bn" ? "কর্মচারীর পুরো নাম *" : "Full Name *"}</Label>
                  <Input
                    required
                    placeholder="e.g. Rahim Ahmed"
                    value={empFullName}
                    onChange={(e) => setEmpFullName(e.target.value)}
                    className="h-8.5 text-xs rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "ইউজারনেম (লগইনের জন্য) *" : "Username (For Login) *"}</Label>
                    <Input
                      required
                      placeholder="e.g. rahim"
                      value={empUsername}
                      onChange={(e) => setEmpUsername(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "মোবাইল নম্বর *" : "Phone Number *"}</Label>
                    <Input
                      required
                      placeholder="e.g. 01700000000"
                      value={empPhone}
                      onChange={(e) => setEmpPhone(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "লগইন পাসওয়ার্ড *" : "Login Password *"}</Label>
                    <Input
                      required
                      type="password"
                      placeholder="e.g. 123456"
                      value={empPassword}
                      onChange={(e) => setEmpPassword(e.target.value)}
                      className="h-8.5 text-xs rounded-xl font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">{lang === "bn" ? "পদবী (Designation)" : "Designation"}</Label>
                    <Input
                      placeholder="e.g. Sales Staff, Cashier"
                      value={empDesignation}
                      onChange={(e) => setEmpDesignation(e.target.value)}
                      className="h-8.5 text-xs rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Granular Permissions Box */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span>{lang === "bn" ? "মডিউল এক্সেস পারমিশন নির্ধারণ করুন:" : "Module Access Permissions:"}</span>
              </Label>

              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border/70 text-xs">
                {/* POS Sales */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold block text-foreground">🛒 POS Sales & Orders</span>
                    <span className="text-[10.5px] text-muted-foreground">Make sales, print invoices & search products</span>
                  </div>
                  <Switch
                    checked={empPermissions.sales}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, sales: val }))}
                  />
                </div>

                {/* Stock & Products */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📦 Product Catalog & Stock</span>
                    <span className="text-[10.5px] text-muted-foreground">View stock quantity and barcode prices</span>
                  </div>
                  <Switch
                    checked={empPermissions.products}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, products: val }))}
                  />
                </div>

                {/* Dashboard */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📊 Dashboard Overview</span>
                    <span className="text-[10.5px] text-muted-foreground">View daily transaction summaries</span>
                  </div>
                  <Switch
                    checked={empPermissions.dashboard}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, dashboard: val }))}
                  />
                </div>

                {/* Purchases */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">🛍️ Purchases & Stock In</span>
                    <span className="text-[10.5px] text-muted-foreground">Log supplier product restocks</span>
                  </div>
                  <Switch
                    checked={empPermissions.purchases}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, purchases: val }))}
                  />
                </div>

                {/* Expenses */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">💸 Expenses & Overheads</span>
                    <span className="text-[10.5px] text-muted-foreground">Record tea, shop rent & staff expense</span>
                  </div>
                  <Switch
                    checked={empPermissions.expenses}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, expenses: val }))}
                  />
                </div>

                {/* Cashbox */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">💵 Cash Management & Ledger</span>
                    <span className="text-[10.5px] text-muted-foreground">Cashbox in/out and drawer balance</span>
                  </div>
                  <Switch
                    checked={empPermissions.cashbox}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, cashbox: val }))}
                  />
                </div>

                {/* Parties / Dues */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">👥 Customers, Dues & Suppliers</span>
                    <span className="text-[10.5px] text-muted-foreground">Customer balances & due collections</span>
                  </div>
                  <Switch
                    checked={empPermissions.parties}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, parties: val }))}
                  />
                </div>

                {/* Reports */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📈 Profit & Sales Reports</span>
                    <span className="text-[10.5px] text-muted-foreground">Sales analytics, profits & loss margins</span>
                  </div>
                  <Switch
                    checked={empPermissions.reports}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, reports: val }))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddEmpModalOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={empSaving} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                {empSaving ? "…" : (lang === "bn" ? "কর্মচারী সেভ করুন" : "Save Employee")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 2. Edit Employee & Permissions Dialog ─── */}
      <Dialog open={editEmpModalOpen} onOpenChange={setEditEmpModalOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-serif flex items-center gap-2">
              <Edit className="size-5 text-primary" />
              <span>{lang === "bn" ? "কর্মচারী পারমিশন ও তথ্য এডিট" : "Edit Employee Permissions"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              @{selectedEmp?.username} ({selectedEmp?.full_name})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateEmployee} className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "পুরো নাম *" : "Full Name *"}</Label>
              <Input
                required
                value={empFullName}
                onChange={(e) => setEmpFullName(e.target.value)}
                className="h-8.5 text-xs rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মোবাইল নম্বর" : "Phone"}</Label>
                <Input
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                  className="h-8.5 text-xs rounded-xl font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">{lang === "bn" ? "পদবী (Designation)" : "Designation"}</Label>
                <Input
                  value={empDesignation}
                  onChange={(e) => setEmpDesignation(e.target.value)}
                  className="h-8.5 text-xs rounded-xl"
                />
              </div>
            </div>

            {/* Granular Permissions Box */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span>{lang === "bn" ? "মডিউল এক্সেস পারমিশন পরিবর্তন করুন:" : "Modify Access Permissions:"}</span>
              </Label>

              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border/70 text-xs">
                {/* POS Sales */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold block text-foreground">🛒 POS Sales & Orders</span>
                    <span className="text-[10.5px] text-muted-foreground">Make sales & search items</span>
                  </div>
                  <Switch
                    checked={empPermissions.sales}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, sales: val }))}
                  />
                </div>

                {/* Stock & Products */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📦 Product Catalog & Stock</span>
                    <span className="text-[10.5px] text-muted-foreground">View stock quantity</span>
                  </div>
                  <Switch
                    checked={empPermissions.products}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, products: val }))}
                  />
                </div>

                {/* Dashboard */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📊 Dashboard Overview</span>
                    <span className="text-[10.5px] text-muted-foreground">View daily transaction summaries</span>
                  </div>
                  <Switch
                    checked={empPermissions.dashboard}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, dashboard: val }))}
                  />
                </div>

                {/* Purchases */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">🛍️ Purchases & Stock In</span>
                    <span className="text-[10.5px] text-muted-foreground">Log supplier product restocks</span>
                  </div>
                  <Switch
                    checked={empPermissions.purchases}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, purchases: val }))}
                  />
                </div>

                {/* Expenses */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">💸 Expenses & Overheads</span>
                    <span className="text-[10.5px] text-muted-foreground">Record tea, shop rent & staff expense</span>
                  </div>
                  <Switch
                    checked={empPermissions.expenses}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, expenses: val }))}
                  />
                </div>

                {/* Cashbox */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">💵 Cash Management & Ledger</span>
                    <span className="text-[10.5px] text-muted-foreground">Cashbox in/out and drawer balance</span>
                  </div>
                  <Switch
                    checked={empPermissions.cashbox}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, cashbox: val }))}
                  />
                </div>

                {/* Parties / Dues */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">👥 Customers, Dues & Suppliers</span>
                    <span className="text-[10.5px] text-muted-foreground">Customer balances & due collections</span>
                  </div>
                  <Switch
                    checked={empPermissions.parties}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, parties: val }))}
                  />
                </div>

                {/* Reports */}
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <div>
                    <span className="font-semibold block text-foreground">📈 Profit & Sales Reports</span>
                    <span className="text-[10.5px] text-muted-foreground">Sales analytics, profits & loss margins</span>
                  </div>
                  <Switch
                    checked={empPermissions.reports}
                    onCheckedChange={(val) => setEmpPermissions((prev) => ({ ...prev, reports: val }))}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditEmpModalOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={empSaving} className="bg-primary text-white font-semibold">
                {empSaving ? "…" : (lang === "bn" ? "পারমিশন আপডেট করুন" : "Update Permissions")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 3. Reset Password Dialog ─── */}
      <Dialog open={resetEmpModalOpen} onOpenChange={setResetEmpModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif flex items-center gap-2">
              <Key className="size-5 text-amber-500" />
              <span>{lang === "bn" ? "পাসওয়ার্ড রিসেট করুন" : "Reset Password"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs font-mono">
              Employee: @{selectedEmp?.username} ({selectedEmp?.full_name})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveResetPassword} className="space-y-4 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">{lang === "bn" ? "নতুন পাসওয়ার্ড *" : "New Password *"}</Label>
              <Input
                required
                type="password"
                placeholder="At least 4 characters"
                value={newEmpPassword}
                onChange={(e) => setNewEmpPassword(e.target.value)}
                className="h-8.5 text-xs rounded-xl font-mono"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setResetEmpModalOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={empSaving || !newEmpPassword} className="bg-amber-600 hover:bg-amber-500 text-white font-semibold">
                {empSaving ? "…" : (lang === "bn" ? "পাসওয়ার্ড পরিবর্তন করুন" : "Change Password")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── 4. Delete Employee Confirmation Dialog ─── */}
      <Dialog open={deleteEmpModalOpen} onOpenChange={setDeleteEmpModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-serif text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              <span>{lang === "bn" ? "কর্মচারী মুছে ফেলবেন?" : "Delete Employee Account?"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {lang === "bn"
                ? `আপনি কি নিশ্চিত যে '${selectedEmp?.full_name}' (@${selectedEmp?.username}) এর একাউন্ট মুছে ফেলতে চান?`
                : `Are you sure you want to delete '${selectedEmp?.full_name}' (@${selectedEmp?.username})?`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteEmpModalOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={empSaving}
              onClick={handleDeleteEmployee}
              className="font-semibold"
            >
              {empSaving ? "…" : (lang === "bn" ? "হ্যাঁ, মুছে ফেলুন" : "Yes, Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Shop Profile Management Dialog (Directly in /more) ─── */}
      <Dialog open={shopProfileOpen} onOpenChange={setShopProfileOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-5 sm:p-6 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 shadow-2xl text-slate-900 dark:text-zinc-100">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Store className="size-6 text-emerald-600" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold">
                  {lang === "bn" ? "দোকানের প্রোফাইল ও বিবরণ" : "Shop Profile & Details"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {lang === "bn"
                    ? "দোকানের নাম, লোগো, যোগাযোগের নম্বর ও ইনভয়েস বিবরণ হালনাগাদ করুন।"
                    : "Update your shop name, logo, contacts, and invoice header information."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveShopProfile} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "দোকানের নাম *" : "Shop Name *"}</Label>
              <Input
                required
                value={shopProfileData.name}
                onChange={(e) => setShopProfileData({ ...shopProfileData, name: e.target.value })}
                placeholder="e.g. Dream Fashion"
                className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center justify-between">
                <span>{lang === "bn" ? "দোকানের লোগো (ঐচ্ছিক)" : "Shop Logo (Optional)"}</span>
                {shopLogoUploading && <span className="text-[10px] text-emerald-600 animate-pulse">Uploading...</span>}
              </Label>
              <div className="flex items-center gap-3">
                {shopProfileData.logoUrl ? (
                  <div className="relative size-12 rounded-xl border border-border p-1 bg-slate-50 dark:bg-zinc-900 shrink-0">
                    <img src={shopProfileData.logoUrl} alt="Logo" className="w-full h-full object-contain rounded-lg" />
                  </div>
                ) : (
                  <div className="size-12 rounded-xl border border-dashed border-border bg-slate-50 dark:bg-zinc-900 flex items-center justify-center text-muted-foreground shrink-0">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleShopLogoUpload}
                    className="h-9 rounded-xl text-xs file:mr-2 file:py-0.5 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-emerald-600 file:text-white cursor-pointer"
                  />
                  <Input
                    type="text"
                    placeholder={lang === "bn" ? "অথবা ছবির URL দিন" : "Or enter image URL"}
                    value={shopProfileData.logoUrl}
                    onChange={(e) => setShopProfileData({ ...shopProfileData, logoUrl: e.target.value })}
                    className="h-8 text-[11px] rounded-lg bg-slate-50 dark:bg-zinc-900"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "ট্যাগলাইন / স্লোগান" : "Tagline"}</Label>
                <Input
                  value={shopProfileData.tagline}
                  onChange={(e) => setShopProfileData({ ...shopProfileData, tagline: e.target.value })}
                  placeholder="e.g. Quality Products & Service"
                  className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "মুদ্রা প্রতীক" : "Currency Symbol"}</Label>
                <Input
                  value={shopProfileData.currency}
                  onChange={(e) => setShopProfileData({ ...shopProfileData, currency: e.target.value })}
                  placeholder="৳"
                  className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "ফোন নম্বর (কমা দিয়ে একাধিক)" : "Phone Numbers"}</Label>
                <Input
                  value={shopProfileData.phones}
                  onChange={(e) => setShopProfileData({ ...shopProfileData, phones: e.target.value })}
                  placeholder="017XXXXXXXX, 018XXXXXXXX"
                  className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">{lang === "bn" ? "ইমেইল এড্রেস" : "Email Address"}</Label>
                <Input
                  value={shopProfileData.email}
                  onChange={(e) => setShopProfileData({ ...shopProfileData, email: e.target.value })}
                  placeholder="shop@example.com"
                  className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "দোকানের ঠিকানা" : "Shop Address"}</Label>
              <Input
                value={shopProfileData.address}
                onChange={(e) => setShopProfileData({ ...shopProfileData, address: e.target.value })}
                placeholder="e.g. Shop #12, Level 2, Market Plaza, Dhaka"
                className="h-10 rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{lang === "bn" ? "ইনভয়েস শর্তাবলী ও বিবরণ" : "Invoice Terms & Notes"}</Label>
              <Textarea
                value={shopProfileData.invoiceTerms}
                onChange={(e) => setShopProfileData({ ...shopProfileData, invoiceTerms: e.target.value })}
                placeholder={lang === "bn" ? "যেমন: বিক্রিত পণ্য ফেরত নেওয়া হয় না। ৭ দিনের মধ্যে পরিবর্তন সম্ভব।" : "e.g. Thank you for shopping with us! No cash refund."}
                className="min-h-[70px] rounded-xl text-xs bg-slate-50 dark:bg-zinc-900"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShopProfileOpen(false)} className="rounded-xl text-xs">
                {t("cancel")}
              </Button>
              <Button type="submit" size="sm" disabled={shopProfileBusy || !shopProfileData.name.trim()} className="rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                {shopProfileBusy ? <RefreshCw className="size-3.5 animate-spin mr-1.5" /> : <Check className="size-3.5 mr-1.5" />}
                <span>{lang === "bn" ? "সংরক্ষণ করুন" : "Save Changes"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
