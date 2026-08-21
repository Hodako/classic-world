"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Bot, HelpCircle, Loader2, ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export default function AiAuditsPage() {
  const { lang, t } = useT();
  const { user } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Suggested questions in English and Bangla
  const suggestions = lang === "bn"
    ? [
        { label: "আজকের লাভ বা মুনাফা কত?", text: "আজকের লাভ বা মুনাফা কত?" },
        { label: "কোথায় আমাদের ব্যবসার সমস্যা আছে?", text: "ব্যবসায়ের আর্থিক বা অপারেশনাল সমস্যা কোথায় কোথায় আছে?" },
        { label: "কোন পণ্যের স্টক সংকটজনক?", text: "কোন পণ্যগুলির স্টক সংকটজনক বা কম আছে এবং কখন নতুন পণ্য ক্রয় করতে হবে?" },
        { label: "কোথায় আমাদের ব্যবসার ডেটা আপডেট করতে হবে?", text: "উন্নতির জন্য ব্যবসায়ের কার্যক্রম এবং ইনভেন্টরি কোথায় আপডেট করা প্রয়োজন?" },
        { label: "ব্যবসার সার্বিক বিশ্লেষণ দিন", text: "দয়া করে আমার ব্যবসার সার্বিক আর্থিক স্বাস্থ্য, সেলস ট্রেন্ড এবং পারফরমেন্সের একটি সামগ্রিক বিশ্লেষণ দিন।" },
      ]
    : [
        { label: "What is the profits?", text: "What is the profits?" },
        { label: "Where is the business problems?", text: "Where is the business problems?" },
        { label: "What is the critical stocks?", text: "What is the critical stocks and which products have less number in stocks?" },
        { label: "Where have to update?", text: "Where do we have to update or make changes for the business?" },
        { label: "Total analyzation of the business", text: "Provide a total analyzation and health check of the business." },
      ];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend || !textToSend.trim() || loading) return;

    const userMessage: Message = { role: "user", content: textToSend.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const { callAiChat } = await import("@/lib/rpc");
      const res = await callAiChat(newMessages, lang);
      let data: any = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = { error: lang === "bn" ? "সার্ভার রেসপন্স প্রসেস করা যায়নি" : "Failed to parse AI server response" };
      }

      if (!res.ok || data?.error) {
        throw new Error(data?.error || (lang === "bn" ? "এআই সার্ভার থেকে সাড়া পাওয়া যায়নি" : "Failed to get response from AI"));
      }

      const replyText = data?.reply ? String(data.reply) : (lang === "bn" ? "কোন তথ্য পাওয়া যায়নি" : "No response generated");
      setMessages(prev => [...prev, { role: "assistant", content: replyText }]);
    } catch (err: any) {
      toast.error(err?.message || String(err));
      // Remove last user message on failure so they can retry
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
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
        if (isBold) el = <strong key={`b-${i}`} className="font-bold text-zinc-950 dark:text-white">{el}</strong>;
        if (isItalic) el = <em key={`i-${i}`} className="italic text-zinc-800 dark:text-zinc-200">{el}</em>;
        if (isUnderline) el = <u key={`u-${i}`}>{el}</u>;
        if (textColor) el = <span key={`s-${i}`} style={style}>{el}</span>;
        
        elements.push(<React.Fragment key={`frag-${i}`}>{el}</React.Fragment>);
      }
    }
    
    return elements.length > 0 ? elements : text;
  };

  // Structured renderer helper for formatting the AI's response
  const renderMessageContent = (content: string) => {
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
          <div key={`list-bullet-${keySuffix}`} className="space-y-1.5 my-2">
            {list.items.map((item, i) => {
              const colonIndex = item.indexOf(":");
              if (colonIndex > 0 && colonIndex < 35) {
                const keyText = item.substring(0, colonIndex).trim();
                const valText = item.substring(colonIndex + 1).trim();
                return (
                  <div key={`b-kv-${keySuffix}-${i}`} className="flex justify-between items-center text-xs py-1.5 border-b border-border/10 bg-white/5 dark:bg-zinc-950/20 px-2.5 rounded-lg backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="text-muted-foreground font-medium">{parseBold(keyText)}</span>
                    <span className="font-semibold text-foreground">{parseBold(valText)}</span>
                  </div>
                );
              }
              return (
                <div key={`b-item-${keySuffix}-${i}`} className="flex items-start gap-2 text-xs leading-relaxed pl-1 py-0.5">
                  <span className="text-primary mt-1.5 size-1.5 rounded-full bg-primary/80 shrink-0 shadow-sm" />
                  <span className="text-foreground/90">{parseBold(item)}</span>
                </div>
              );
            })}
          </div>
        );
      } else {
        return (
          <ol key={`list-num-${keySuffix}`} className="space-y-1.5 my-2 list-decimal pl-5">
            {list.items.map((item, i) => (
              <li key={`n-item-${keySuffix}-${i}`} className="text-xs leading-relaxed text-foreground/90 pl-0.5">
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
            <h2 key={`h1-${i}`} className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-4 mb-2 border-b border-indigo-500/20 pb-1 flex items-center gap-1.5 uppercase tracking-wider">
              {parseBold(text)}
            </h2>
          );
        } else if (level === 2) {
          elements.push(
            <h3 key={`h2-${i}`} className="text-xs font-bold text-zinc-950 dark:text-zinc-50 mt-3.5 mb-1.5 flex items-center gap-1.5">
              {parseBold(text)}
            </h3>
          );
        } else {
          elements.push(
            <h4 key={`h3-${i}`} className="text-[11px] font-bold text-primary mt-2.5 mb-1 flex items-center gap-1.5">
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
          <div key={`warn-${i}`} className="my-2.5 p-3.5 rounded-xl bg-amber-500/10 dark:bg-amber-950/20 border-l-4 border-amber-500 text-amber-800 dark:text-amber-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
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
          <div key={`success-${i}`} className="my-2.5 p-3.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/20 border-l-4 border-emerald-500 text-emerald-800 dark:text-emerald-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
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
          <div key={`idea-${i}`} className="my-2.5 p-3.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/20 border-l-4 border-indigo-500 text-indigo-800 dark:text-indigo-300 backdrop-blur-md shadow-sm flex items-start gap-2.5">
            <span className="text-base mt-0.5 shrink-0">💡</span>
            <div className="text-xs leading-relaxed font-medium">
              {parseBold(text)}
            </div>
          </div>
        );
        continue;
      }
      
      elements.push(
        <p key={`p-${i}`} className="text-xs leading-relaxed my-2 text-foreground/80">
          {parseBold(trimmed)}
        </p>
      );
    }
    
    if (currentList) {
      elements.push(flushList(lines.length));
    }
    
    return <div className="space-y-1">{elements}</div>;
  };

  // Prevent SSR/hydration mismatch during initial mount
  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 text-primary animate-spin" />
      </div>
    );
  }

  // Render access denied page for employees
  if (!user || user.role !== "owner") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
        <Bot className="size-16 text-muted-foreground animate-pulse" />
        <h2 className="text-xl font-bold">{lang === "bn" ? "অ্যাক্সেস অস্বীকার করা হয়েছে" : "Access Denied"}</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {lang === "bn"
            ? "দুঃখিত, এই বৈশিষ্ট্যটি শুধুমাত্র স্টোরের মালিক বা প্রশাসকের জন্য উন্মুক্ত।"
            : "Sorry, this feature is restricted to the store Owner (Admin) only."}
        </p>
        <Button onClick={() => router.push("/dashboard")}>{lang === "bn" ? "ড্যাশবোর্ডে ফিরে যান" : "Go to Dashboard"}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-4.5rem)] md:h-[calc(100vh-6rem)] w-full max-w-4xl mx-auto p-1.5 sm:p-3 space-y-2 sm:space-y-3.5 overflow-hidden">
      {/* Financial Banking Header Panel */}
      <div className="flex items-center justify-between bg-card/90 dark:bg-zinc-950/90 p-2.5 sm:p-3.5 rounded-2xl border border-border/80 shadow-md shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/more">
            <Button variant="ghost" size="icon" className="size-8 rounded-xl shrink-0 hover:bg-muted">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="size-9 sm:size-10 rounded-xl bg-gradient-to-tr from-amber-600 via-indigo-600 to-emerald-600 text-white flex items-center justify-center shadow-md border border-white/20 shrink-0">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xs sm:text-sm font-extrabold tracking-tight text-foreground truncate">
                {lang === "bn" ? "হাকিম ফাইন্যান্সিয়াল অডিট এজেন্ট" : "Classic World Financial Audit AI"}
              </h1>
              <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-emerald-500/20 uppercase tracking-widest shrink-0">
                PRO-BANKING
              </span>
            </div>
            <p className="text-[9.5px] sm:text-[10.5px] text-muted-foreground truncate mt-0.5 font-medium">
              {lang === "bn" ? "রিয়েল-টাইম ক্যাশফ্লো, স্টক ও লাভ-ক্ষতি বিশ্লেষণ" : "Real-time Cashflow, Inventory & Profit Analytics"}
            </p>
          </div>
        </div>
        
        <div className="hidden min-[420px]:flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider select-none border border-emerald-500/20 shrink-0">
          <span className="size-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          {lang === "bn" ? "লাইভ অডিট" : "Live Audit"}
        </div>
      </div>

      {/* Main Financial Audit Chat Interface */}
      <Card className="flex-1 min-h-0 bg-card/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-border/80 rounded-2xl flex flex-col overflow-hidden shadow-lg">
        {/* Messages scrollable area */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4 no-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center max-w-md mx-auto space-y-4 p-2">
              <div className="size-14 sm:size-16 rounded-2xl bg-gradient-to-br from-indigo-500/15 via-emerald-500/10 to-amber-500/10 text-primary flex items-center justify-center shadow-inner border border-primary/20">
                <Sparkles className="size-7 sm:size-8 text-primary" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-xs sm:text-sm text-foreground tracking-tight">
                  {lang === "bn" ? "স্মার্ট ফাইন্যান্সিয়াল অডিটর-এ আপনাকে স্বাগতম!" : "Welcome to Smart Financial Auditor!"}
                </h3>
                <p className="text-[10px] sm:text-xs text-muted-foreground leading-relaxed">
                  {lang === "bn"
                    ? "আমি আপনার ব্যবসায়ের ক্যাশবক্স, লাভ-ক্ষতি, ব্যয় এবং পণ্য স্টক বিশ্লেষণ করতে প্রস্তুত। নিচে থেকে প্রশ্ন বেছে নিন অথবা লিখুন।"
                    : "I am ready to audit your cashbox, margins, inventory, and net profits. Select a quick prompt below or type your inquiry."}
                </p>
              </div>

              {/* Banking Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full text-left pt-1">
                {suggestions.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s.text)}
                    className="p-2.5 sm:p-3 text-[10px] sm:text-xs font-semibold bg-background/90 hover:bg-primary/5 hover:border-primary/40 border border-border/70 rounded-xl text-foreground text-left transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <HelpCircle className="size-3.5 sm:size-4 text-primary shrink-0" />
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
                  <div key={idx} className={`flex items-start gap-2 sm:gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar */}
                    <div className={`size-7 sm:size-8 rounded-xl flex items-center justify-center border shrink-0 shadow-sm ${
                      isUser 
                        ? "bg-primary text-white border-primary/20" 
                        : "bg-secondary text-foreground border-border/80"
                    }`}>
                      {isUser ? <HelpCircle className="size-3.5 sm:size-4" /> : <Bot className="size-3.5 sm:size-4" />}
                    </div>

                    {/* Financial Chat Bubble */}
                    <Card className={`p-3 sm:p-4 max-w-[88%] sm:max-w-[82%] rounded-2xl ${
                      isUser 
                        ? "bg-primary text-primary-foreground rounded-tr-none border-0 shadow-md" 
                        : "bg-muted/70 text-foreground rounded-tl-none border-border/50 shadow-sm"
                    }`}>
                      {isUser ? <p className="leading-relaxed text-[11px] sm:text-xs whitespace-pre-wrap">{m.content}</p> : renderMessageContent(m.content)}
                    </Card>
                  </div>
                );
              })}

              {/* Loading indicator */}
              {loading && (
                <div className="flex items-start gap-2.5">
                  <div className="size-7 sm:size-8 rounded-xl bg-secondary text-foreground border border-border/80 flex items-center justify-center shrink-0">
                    <Bot className="size-3.5 sm:size-4" />
                  </div>
                  <Card className="p-3 rounded-2xl rounded-tl-none bg-muted/70 border border-border/50 flex items-center gap-1.5 shrink-0">
                    <span className="size-1.5 sm:size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="size-1.5 sm:size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="size-1.5 sm:size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </Card>
                </div>
              )}
              <div className="h-1" />
            </>
          )}
        </div>

        {/* Banking Quick Suggestion Pills */}
        {messages.length > 0 && (
          <div className="px-2.5 py-1.5 border-t border-border/50 bg-muted/30 flex gap-1.5 overflow-x-auto shrink-0 select-none no-scrollbar">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(s.text)}
                className="px-2.5 py-1 text-[9px] sm:text-[10px] font-semibold bg-background hover:bg-primary/5 hover:border-primary/30 border border-border/60 rounded-full text-foreground whitespace-nowrap transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Banking Input panel */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="p-2.5 sm:p-3 border-t border-border bg-background flex gap-2 shrink-0 items-center"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder={lang === "bn" ? "ড্যাশবোর্ড, ক্যাশবক্স, লাভ বা স্টক নিয়ে প্রশ্ন লিখুন..." : "Ask about cashflow, margins, inventory..."}
            className="flex-1 h-9 sm:h-10 rounded-xl border border-border bg-muted/40 px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-9 sm:h-10 px-3 sm:px-4 rounded-xl shrink-0 cursor-pointer flex gap-1.5 font-bold"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5 sm:size-4" />}
            <span className="hidden sm:inline text-xs">{lang === "bn" ? "পাঠান" : "Send"}</span>
          </Button>
        </form>
      </Card>
    </div>
  );
}
