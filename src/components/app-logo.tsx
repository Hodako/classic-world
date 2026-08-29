"use client";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";

interface AppLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  src?: string;
  alt?: string;
}

const sizes = {
  sm: "h-9.5 sm:h-10.5 max-w-[190px] sm:max-w-[220px]",
  md: "h-12 sm:h-14 max-w-[260px] sm:max-w-[300px]",
  lg: "h-16 sm:h-20 max-w-[340px] sm:max-w-[380px]",
  xl: "h-24 sm:h-28 max-w-[460px] sm:max-w-[500px]",
};

/** Business logo from settings or default. Can toggle fullscreen on triple click. */
export function AppLogo({ className, size = "md", src, alt }: AppLogoProps) {
  const { user } = useAuth();
  const [clickCount, setClickCount] = useState(0);

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

  let logoSrc = src ?? user?.logo_url ?? "/logo.png";

  const logoAlt = alt ?? user?.business_name ?? "Classic World";

  return (
    <img
      src={logoSrc}
      alt={logoAlt}
      onClick={handleClick}
      className={cn("w-auto object-contain cursor-pointer select-none", sizes[size], className)}
      onError={(e) => { 
        (e.target as HTMLImageElement).src = "/logo.png"; 
      }}
    />
  );
}
