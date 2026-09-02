"use client";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Store } from "lucide-react";

interface AppLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  src?: string;
  alt?: string;
}

const sizes = {
  sm: "h-8 sm:h-9 max-w-[180px]",
  md: "h-11 sm:h-12 max-w-[240px]",
  lg: "h-14 sm:h-16 max-w-[320px]",
  xl: "h-20 sm:h-24 max-w-[440px]",
};

/** Business logo from settings or default. Can toggle fullscreen on triple click. */
export function AppLogo({ className, size = "md", src, alt }: AppLogoProps) {
  const { user } = useAuth();
  const [clickCount, setClickCount] = useState(0);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (clickCount === 0) return;
    const timer = setTimeout(() => {
      setClickCount(0);
    }, 1500);
    return () => clearTimeout(timer);
  }, [clickCount]);

  const handleClick = () => {
    const nextCount = clickCount + 1;
    if (nextCount >= 3) {
      const docEl = document.documentElement as any;
      const doc = document as any;
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.mozFullScreenElement && !doc.msFullscreenElement) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      } else {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch(() => {});
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          doc.msExitFullscreen();
        }
      }
      setClickCount(0);
    } else {
      setClickCount(nextCount);
    }
  };

  const logoSrc = src ?? user?.logo_url ?? "/logo.png";
  const logoAlt = alt ?? user?.business_name ?? "Dream Fashion";

  if (imgError) {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1.5 font-bold font-serif tracking-tight cursor-pointer select-none text-foreground shrink-0",
          className
        )}
      >
        <div className="size-7 sm:size-8 rounded-lg bg-gradient-to-tr from-[#F7931A] to-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
          <Store className="size-4" />
        </div>
        <span className="truncate max-w-[120px] sm:max-w-[160px] text-xs sm:text-sm">{logoAlt}</span>
      </div>
    );
  }

  return (
    <img
      src={logoSrc}
      alt={logoAlt}
      onClick={handleClick}
      className={cn("w-auto object-contain cursor-pointer select-none shrink-0", sizes[size], className)}
      onError={() => { 
        setImgError(true);
      }}
    />
  );
}
