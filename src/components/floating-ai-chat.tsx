"use client";

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, MessageSquare, Bot, AlertTriangle, HelpCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export function FloatingAiChat() {
  const { lang, t } = useT();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Suggested questions in English and Bangla
  const suggestions = lang === "bn"
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

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Only show for owner (admin) role on desktop/PC — hide AI overlay on mobile phones
  if (!user || user.role !== "owner" || isMobile) {
    return null;
  }

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage: Message = { role: "user", content: textToSend };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

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
      // Remove last user message on failure so they can retry easily
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  // Helper to parse both markdown **bold** and standard HTML tags in AI responses
  const parseBold = (text: string) => {
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
        if (isBold) el = <strong key={i} className="font-bold text-zinc-950 dark:text-white">{el}</strong>;
        if (isItalic) el = <em key={i} className="italic text-zinc-800 dark:text-zinc-200">{el}</em>;
        if (isUnderline) el = <u key={i}>{el}</u>;
        if (textColor) el = <span key={i} style={style}>{el}</span>;
        
        elements.push(el);
      }
    }
    
    return elements.length > 0 ? elements : text;
  };

  // Structured renderer helper for formatting the AI's response
  const renderMessageContent = (content: string) => {
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
    
    const flushList = (key: string | number) => {
      if (!currentList) return null;
      const list = currentList;
      currentList = null;
      
      if (list.type === "bullet") {
        return (
          <div key={`list-${key}`} className="space-y-1.5 my-2">
            {list.items.map((item, i) => {
              const colonIndex = item.indexOf(":");
              if (colonIndex > 0 && colonIndex < 35) {
                const keyText = item.substring(0, colonIndex).trim();
                const valText = item.substring(colonIndex + 1).trim();
                return (
                  <div key={i} className="flex justify-between items-center text-xs py-1.5 border-b border-border/10 bg-white/5 dark:bg-zinc-950/20 px-2.5 rounded-lg backdrop-blur-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="text-muted-foreground font-medium">{parseBold(keyText)}</span>
                    <span className="font-semibold text-foreground">{parseBold(valText)}</span>
                  </div>
                );
              }
              return (
                <div key={i} className="flex items-start gap-2 text-xs leading-relaxed pl-1 py-0.5">
                  <span className="text-primary mt-1.5 size-1.5 rounded-full bg-primary/80 shrink-0 shadow-sm" />
                  <span className="text-foreground/90">{parseBold(item)}</span>
                </div>
              );
            })}
          </div>
        );
      } else {
        return (
          <ol key={`list-${key}`} className="space-y-1.5 my-2 list-decimal pl-5">
            {list.items.map((item, i) => (
              <li key={i} className="text-xs leading-relaxed text-foreground/90 pl-0.5">
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
            <h2 key={i} className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 mt-4 mb-2 border-b border-indigo-500/20 pb-1 flex items-center gap-1.5 uppercase tracking-wider">
              {parseBold(text)}
            </h2>
          );
        } else if (level === 2) {
          elements.push(
            <h3 key={i} className="text-xs font-bold text-zinc-950 dark:text-zinc-50 mt-3.5 mb-1.5 flex items-center gap-1.5">
              {parseBold(text)}
            </h3>
          );
        } else {
          elements.push(
            <h4 key={i} className="text-[11px] font-bold text-primary mt-2.5 mb-1 flex items-center gap-1.5">
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

  return (
    <>
      {/* Floating Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9999 }}
        className="fixed bottom-6 right-6 z-[9999] size-12 rounded-full bg-gradient-to-tr from-primary via-indigo-500 to-indigo-600 text-white shadow-2xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer border border-primary/20"
        title={t("ai_audits")}
      >
        {isOpen ? <X className="size-5" /> : <Sparkles className="size-5" />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
        )}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <Card
          style={{ position: "fixed", bottom: "80px", right: "24px", zIndex: 9999 }}
          className="fixed bottom-[80px] right-6 w-96 max-w-[calc(100vw-2rem)] h-[550px] max-h-[calc(100vh-100px)] bg-card/95 backdrop-blur-xl border border-border/80 shadow-2xl rounded-3xl flex flex-col z-[9999] overflow-hidden transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
        >
          {/* Header */}
          <div className="p-3 bg-gradient-to-r from-primary/10 via-indigo-500/5 to-background border-b border-border/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center border border-primary/10">
                <Bot className="size-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs leading-none">{lang === "bn" ? "হাকিম কিউজেডজেড এআই অ্যাসিস্ট্যান্ট" : "Classic World AI Assistant"}</h3>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                  {lang === "bn" ? "অনলাইন এজেন্ট" : "Online Agent"}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg hover:bg-muted"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4 text-muted-foreground" />
            </Button>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="space-y-4 my-auto h-full flex flex-col justify-center text-center px-2">
                <div className="size-12 rounded-full bg-gradient-to-br from-primary/20 to-indigo-600/10 text-primary flex items-center justify-center mx-auto mb-2 border border-primary/10">
                  <Sparkles className="size-6 text-primary" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-xs text-foreground">
                    {lang === "bn" ? "হাকিম কিউজেডজেড অডিট এজেন্টের সাথে চ্যাট করুন" : "Chat with Classic World Audit Agent"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground leading-normal max-w-[240px] mx-auto">
                    {lang === "bn"
                      ? "আমি আপনার রিয়েল-টাইম স্টক, লাভ-ক্ষতি ও ব্যবসা বিশ্লেষণ করতে পারি। নিচের একটি প্রশ্ন নির্বাচন করুন বা সরাসরি লিখুন।"
                      : "I can analyze your real-time stocks, profits, expenses, and business metrics. Choose a prompt or type below."}
                  </p>
                </div>

                {/* Suggestions Grid */}
                <div className="grid grid-cols-1 gap-2 pt-2 text-left">
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s.text)}
                      className="p-2 text-[10px] font-semibold bg-secondary/30 hover:bg-primary/10 border border-border/50 rounded-xl text-foreground text-left transition-all active:scale-[0.98] flex items-center gap-2 cursor-pointer"
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
                    <div key={idx} className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                      {/* Avatar */}
                      <div className={`size-7 rounded-xl flex items-center justify-center border shrink-0 ${
                        isUser 
                          ? "bg-primary text-white border-primary/10" 
                          : "bg-secondary text-foreground border-border"
                      }`}>
                        {isUser ? <HelpCircle className="size-4" /> : <Bot className="size-4" />}
                      </div>

                      {/* Bubble */}
                      <Card className={`p-3 max-w-[80%] rounded-2xl text-[11px] ${
                        isUser 
                          ? "bg-primary text-primary-foreground rounded-tr-none border-0" 
                          : "bg-muted/75 text-foreground rounded-tl-none border-border/40"
                      }`}>
                        {isUser ? <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p> : renderMessageContent(m.content)}
                      </Card>
                    </div>
                  );
                })}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex items-start gap-2.5">
                    <div className="size-7 rounded-xl bg-secondary text-foreground border border-border flex items-center justify-center shrink-0">
                      <Bot className="size-4" />
                    </div>
                    <Card className="p-3 rounded-2xl rounded-tl-none bg-muted/75 border border-border/40 flex items-center gap-1.5 shrink-0">
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
            <div className="px-3 py-1.5 border-t border-border/40 bg-muted/30 flex gap-1.5 overflow-x-auto shrink-0 select-none no-scrollbar">
              {suggestions.slice(0, 3).map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s.text)}
                  className="px-2.5 py-1 text-[9px] font-semibold bg-background hover:bg-primary/10 border border-border/60 rounded-full text-foreground whitespace-nowrap transition-all active:scale-95 cursor-pointer shrink-0"
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
              handleSend(input);
            }}
            className="p-3 border-t border-border bg-background flex gap-2 shrink-0 items-center"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder={lang === "bn" ? "আপনার প্রশ্ন লিখুন..." : "Ask your question..."}
              className="flex-1 h-9 rounded-xl border border-border bg-muted/50 px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !input.trim()}
              className="size-9 rounded-xl shrink-0 cursor-pointer"
            >
              <Send className="size-3.5" />
            </Button>
          </form>
        </Card>
      )}
    </>
  );
}
