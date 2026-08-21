"use client";

import { useState, useEffect } from "react";

export function SpeedLoader({
  fullScreen = true,
  statusText = "Loading workspace...",
}: {
  fullScreen?: boolean;
  statusText?: string;
}) {
  const [progress, setProgress] = useState(20);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 10) + 4;
      });
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className={`flex flex-col items-center justify-center select-none ${
        fullScreen
          ? "fixed inset-0 z-50 bg-background/98 backdrop-blur-xl"
          : "w-full py-12"
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .loader-dots {
          --color-1: #cbd5e1;
          --color-2: #ff3d00;
          --size: 1.5px;

          width: calc(16 * var(--size));
          height: calc(16 * var(--size));
          position: relative;
          left: calc(-32 * var(--size));
          border-radius: 50%;
          color: var(--color-1);
          background: currentColor;
          box-shadow:
            calc(32 * var(--size)) 0,
            calc(-32 * var(--size)) 0,
            calc(64 * var(--size)) 0;
        }

        .dark .loader-dots {
          --color-1: #475569;
          --color-2: #ff3d00;
        }

        .loader-dots::after {
          content: '';
          position: absolute;
          left: calc(-32 * var(--size));
          top: 0;
          width: calc(16 * var(--size));
          height: calc(16 * var(--size));
          border-radius: calc(10 * var(--size));
          background: var(--color-2);
          animation: move 3s linear infinite alternate;
        }

        @keyframes move {
          0%,
          5% {
            left: calc(-32 * var(--size));
            width: calc(16 * var(--size));
          }
          15%,
          20% {
            left: calc(-32 * var(--size));
            width: calc(48 * var(--size));
          }
          30%,
          35% {
            left: 0;
            width: calc(16 * var(--size));
          }
          45%,
          50% {
            left: 0;
            width: calc(48 * var(--size));
          }
          60%,
          65% {
            left: calc(32 * var(--size));
            width: calc(16 * var(--size));
          }

          75%,
          80% {
            left: calc(32 * var(--size));
            width: calc(48 * var(--size));
          }
          95%,
          100% {
            left: calc(64 * var(--size));
            width: calc(16 * var(--size));
          }
        }
      ` }} />

      <div className="relative flex flex-col items-center justify-center w-full max-w-sm px-6 gap-6">
        {/* Brand Logo */}
        <div className="flex flex-col items-center gap-2">
          <img
            src="/logo.svg"
            alt="Classic World"
            className="size-16 object-contain drop-shadow-md"
          />
          <span className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Classic World
          </span>
        </div>

        {/* Custom Moving Dots Loader */}
        <div className="flex items-center justify-center my-3 h-12 w-full">
          <div className="loader-dots" />
        </div>

        {/* Progress Bar & Status Text */}
        <div className="flex flex-col items-center gap-2.5 text-center w-full max-w-xs">
          <div className="w-full h-1.5 bg-muted/80 rounded-full overflow-hidden relative shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-primary to-orange-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(progress, 95)}%` }}
            />
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="inline-block size-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {statusText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
