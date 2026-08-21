"use client";

import { useEffect, useState } from "react";

export type ThemeConfig = {
  primaryColor?: string;
  backgroundColor?: string;
  bgImage?: string;
  bgImageOpacity?: number;
  fontFamily?: string;
  fontSize?: string;
  textColor?: string;
  density?: "compact" | "standard" | "cozy";
  widgetOrder?: string[];
  isMaterialUI?: boolean;
  uiStyle?: "default" | "brutalism" | "new-brutalism" | "morphism" | "glassmorphism" | "flowerism" | "cyberpunk" | "minimalist" | "forest" | "luxury" | "feather";
  bevelStrength?: "none" | "light" | "medium" | "heavy";
  glowEnabled?: boolean;
  glowIntensity?: number;
  borderRadius?: "none" | "small" | "medium" | "large" | "full";
  borderWidth?: "none" | "thin" | "medium" | "thick" | "heavy";
  shadowStyle?: "none" | "soft" | "medium" | "deep" | "brutal";
  cardOpacity?: number;
  cardBlur?: number;
  animationSpeed?: "none" | "fast" | "normal" | "slow";
  cardDarkness?: number;
  kpiStyle?: "default" | "glass" | "neon" | "borderless";
  customFontUrl?: string;
  customFontName?: string;
};

export function CustomThemeManager() {
  const [config, setConfig] = useState<ThemeConfig>({});

  const loadTheme = () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("hz_custom_theme");
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse custom theme config", e);
      }
    } else {
      setConfig({});
    }
  };

  useEffect(() => {
    loadTheme();

    const handleUpdate = () => {
      loadTheme();
    };

    window.addEventListener("hz-theme-updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("hz-theme-updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let styleEl = document.getElementById("hz-custom-theme-styles");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "hz-custom-theme-styles";
      document.head.appendChild(styleEl);
    }

    let css = "";

    // 0. Preset Style overrides
    if (config.uiStyle === "brutalism") {
      css += `
        /* Brutalism Overrides */
        :root {
          --radius: 0px !important;
          --background: #ffffff !important;
          --card: #ffffff !important;
          --muted: #f4f4f5 !important;
          --popover: #ffffff !important;
        }
        .dark {
          --radius: 0px !important;
          --background: #09090b !important;
          --card: #09090b !important;
          --muted: #27272a !important;
          --popover: #09090b !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          background: var(--card) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: 3.5px solid #000000 !important;
          border-radius: 0px !important;
          box-shadow: 6px 6px 0px #000000 !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          border: 3.5px solid #ffffff !important;
          box-shadow: 6px 6px 0px #ffffff !important;
        }
        .beveled-card:hover {
          box-shadow: 8px 8px 0px #000000 !important;
          transform: translate(-2px, -2px) !important;
        }
        .dark .beveled-card:hover {
          box-shadow: 8px 8px 0px #ffffff !important;
        }
        .beveled-card:active {
          box-shadow: 2px 2px 0px #000000 !important;
          transform: translate(4px, 4px) !important;
        }
        .dark .beveled-card:active {
          box-shadow: 2px 2px 0px #ffffff !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 0px !important;
          border: 3px solid #000000 !important;
          box-shadow: 4px 4px 0px #000000 !important;
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button, .dark button.beveled-button, .dark [class*="beveled-button"], .dark a.beveled-button {
          border: 3px solid #ffffff !important;
          box-shadow: 4px 4px 0px #ffffff !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 6px 6px 0px #000000 !important;
          transform: translate(-2px, -2px) !important;
        }
        .dark .beveled-button:hover, .dark button.beveled-button:hover, .dark [class*="beveled-button"]:hover, .dark a.beveled-button:hover {
          box-shadow: 6px 6px 0px #ffffff !important;
        }
        .beveled-button:active, button.beveled-button:active, [class*="beveled-button"]:active, a.beveled-button:active {
          box-shadow: 1px 1px 0px #000000 !important;
          transform: translate(3px, 3px) !important;
        }
        .dark .beveled-button:active, .dark button.beveled-button:active, .dark [class*="beveled-button"]:active, .dark a.beveled-button:active {
          box-shadow: 1px 1px 0px #ffffff !important;
        }
        
        /* Brutalist Tabs overrides */
        [role="tablist"] {
          border: 3px solid #000000 !important;
          border-radius: 0px !important;
          background-color: var(--muted) !important;
        }
        .dark [role="tablist"] {
          border: 3px solid #ffffff !important;
        }
        [role="tab"] {
          border-radius: 0px !important;
          border: none !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          transition: background-color 0.1s ease !important;
        }
        [role="tab"][data-state="active"] {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          border: 3px solid #000000 !important;
          box-shadow: 3px 3px 0px #000000 !important;
        }
        .dark [role="tab"][data-state="active"] {
          border: 3px solid #ffffff !important;
          box-shadow: 3px 3px 0px #ffffff !important;
        }

        input, select, textarea {
          border-radius: 0px !important;
          border: 3px solid #000000 !important;
          background-color: var(--background) !important;
          box-shadow: 3px 3px 0px #000000 !important;
        }
        .dark input, .dark select, .dark textarea {
          border: 3px solid #ffffff !important;
          box-shadow: 3px 3px 0px #ffffff !important;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--primary) !important;
          box-shadow: 4px 4px 0px var(--primary) !important;
          outline: none !important;
        }
      `;
    } else if (config.uiStyle === "new-brutalism") {
      css += `
        /* New Brutalism (Neo-Brutalism) Overrides */
        :root {
          --radius: 12px !important;
          --background: #ffffff !important;
          --card: #ffffff !important;
          --muted: #f4f4f5 !important;
          --popover: #ffffff !important;
        }
        .dark {
          --radius: 12px !important;
          --background: #09090b !important;
          --card: #09090b !important;
          --muted: #27272a !important;
          --popover: #09090b !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          background: var(--card) !important;
          border: 2px solid #18181b !important;
          border-radius: 12px !important;
          box-shadow: 4px 4px 0px #18181b !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          border: 2px solid #ffffff !important;
          box-shadow: 4px 4px 0px #ffffff !important;
        }
        .beveled-card:hover {
          box-shadow: 6px 6px 0px #18181b !important;
          transform: translate(-2px, -2px) !important;
        }
        .dark .beveled-card:hover {
          box-shadow: 6px 6px 0px #ffffff !important;
        }
        .beveled-card:active {
          box-shadow: 1px 1px 0px #18181b !important;
          transform: translate(3px, 3px) !important;
        }
        .dark .beveled-card:active {
          box-shadow: 1px 1px 0px #ffffff !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 10px !important;
          border: 2px solid #18181b !important;
          box-shadow: 3px 3px 0px #18181b !important;
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          font-weight: 600 !important;
          transition: transform 0.1s ease, box-shadow 0.1s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button, .dark button.beveled-button, .dark [class*="beveled-button"], .dark a.beveled-button {
          border: 2px solid #ffffff !important;
          box-shadow: 3px 3px 0px #ffffff !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 5px 5px 0px #18181b !important;
          transform: translate(-2px, -2px) !important;
        }
        .dark .beveled-button:hover, .dark button.beveled-button:hover, .dark [class*="beveled-button"]:hover, .dark a.beveled-button:hover {
          box-shadow: 5px 5px 0px #ffffff !important;
        }
        .beveled-button:active, button.beveled-button:active, [class*="beveled-button"]:active, a.beveled-button:active {
          box-shadow: 1px 1px 0px #18181b !important;
          transform: translate(2px, 2px) !important;
        }
        .dark .beveled-button:active, .dark button.beveled-button:active, .dark [class*="beveled-button"]:active, .dark a.beveled-button:active {
          box-shadow: 1px 1px 0px #ffffff !important;
        }

        /* Neo-brutalist tabs */
        [role="tablist"] {
          border: 2px solid #18181b !important;
          border-radius: 12px !important;
          background-color: var(--muted) !important;
        }
        .dark [role="tablist"] {
          border: 2px solid #ffffff !important;
        }
        [role="tab"] {
          border-radius: 8px !important;
          border: none !important;
          font-weight: 600 !important;
          transition: background-color 0.1s ease !important;
        }
        [role="tab"][data-state="active"] {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          border: 2px solid #18181b !important;
          box-shadow: 2px 2px 0px #18181b !important;
        }
        .dark [role="tab"][data-state="active"] {
          border: 2px solid #ffffff !important;
          box-shadow: 2px 2px 0px #ffffff !important;
        }

        input, select, textarea {
          border-radius: 10px !important;
          border: 2px solid #18181b !important;
          box-shadow: 2px 2px 0px #18181b !important;
        }
        .dark input, .dark select, .dark textarea {
          border: 2px solid #ffffff !important;
          box-shadow: 2px 2px 0px #ffffff !important;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--primary) !important;
          box-shadow: 3px 3px 0px var(--primary) !important;
          outline: none !important;
        }
      `;
    } else if (config.uiStyle === "morphism") {
      css += `
        /* Neumorphism (Morphism) Overrides */
        :root {
          --background: #e5e7eb !important;
          --card: #e5e7eb !important;
          --muted: #d1d5db !important;
          --muted-foreground: #4b5563 !important;
          --popover: #e5e7eb !important;
          --radius: 20px !important;
        }
        .dark {
          --background: #1e1e1e !important;
          --card: #1e1e1e !important;
          --muted: #2d2d2d !important;
          --muted-foreground: #a3a3a3 !important;
          --popover: #1e1e1e !important;
          --radius: 20px !important;
        }
        body {
          background-color: var(--background) !important;
          background-image: none !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background: var(--background) !important;
          border: none !important;
          border-radius: 20px !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          box-shadow:
            -10px -10px 20px white,
            10px 10px 20px rgb(153, 161, 175),
            inset -10px -10px 20px rgb(209, 213, 220) !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          box-shadow:
            -10px -10px 20px rgba(255, 255, 255, 0.03),
            10px 10px 20px rgba(0, 0, 0, 0.5),
            inset -10px -10px 20px rgba(255, 255, 255, 0.02) !important;
        }
        .beveled-card:hover {
          box-shadow:
            -12px -12px 24px white,
            12px 12px 24px rgb(153, 161, 175),
            inset -6px -6px 12px rgb(209, 213, 220) !important;
        }
        .dark .beveled-card:hover {
          box-shadow:
            -12px -12px 24px rgba(255, 255, 255, 0.04),
            12px 12px 24px rgba(0, 0, 0, 0.6),
            inset -6px -6px 12px rgba(255, 255, 255, 0.03) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 12px !important;
          border: none !important;
          background: var(--background) !important;
          color: var(--foreground) !important;
          box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.08), -4px -4px 8px rgba(255, 255, 255, 0.7) !important;
          transition: box-shadow 0.15s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button, .dark button.beveled-button, .dark [class*="beveled-button"], .dark a.beveled-button {
          box-shadow: 4px 4px 8px rgba(0, 0, 0, 0.4), -4px -4px 8px rgba(255, 255, 255, 0.04) !important;
          color: var(--foreground) !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.1), -5px -5px 10px rgba(255, 255, 255, 0.8) !important;
        }
        .beveled-button:active, button.beveled-button:active, [class*="beveled-button"]:active, a.beveled-button:active {
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.08), inset -3px -3px 6px rgba(255, 255, 255, 0.6) !important;
        }
        .dark .beveled-button:active, .dark button.beveled-button:active, .dark [class*="beveled-button"]:active, .dark a.beveled-button:active {
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.4), inset -3px -3px 6px rgba(255, 255, 255, 0.03) !important;
        }

        /* Neumorphic tabs */
        [role="tablist"] {
          border: none !important;
          border-radius: 14px !important;
          background: var(--background) !important;
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.06), inset -3px -3px 6px rgba(255, 255, 255, 0.6) !important;
        }
        .dark [role="tablist"] {
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.35), inset -3px -3px 6px rgba(255, 255, 255, 0.03) !important;
        }
        [role="tab"] {
          border-radius: 12px !important;
          border: none !important;
          transition: all 0.2s ease !important;
          color: var(--muted-foreground) !important;
        }
        [role="tab"][data-state="active"] {
          background: var(--background) !important;
          color: var(--foreground) !important;
          box-shadow: 3px 3px 6px rgba(0, 0, 0, 0.08), -3px -3px 6px rgba(255, 255, 255, 0.7) !important;
          font-weight: 600 !important;
        }
        .dark [role="tab"][data-state="active"] {
          box-shadow: 3px 3px 6px rgba(0, 0, 0, 0.4), -3px -3px 6px rgba(255, 255, 255, 0.04) !important;
        }

        input, select, textarea {
          border-radius: 12px !important;
          border: none !important;
          background: var(--background) !important;
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.06), inset -3px -3px 6px rgba(255, 255, 255, 0.6) !important;
        }
        .dark input, .dark select, .dark textarea {
          box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.35), inset -3px -3px 6px rgba(255, 255, 255, 0.03) !important;
        }
      `;
    } else if (config.uiStyle === "glassmorphism") {
      css += `
        /* Glassmorphism Overrides */
        :root, .dark {
          --radius: 16px !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background: rgba(255, 255, 255, 0.38) !important;
          backdrop-filter: blur(20px) saturate(160%) !important;
          -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
          border: 1px solid rgba(255, 255, 255, 0.22) !important;
          border-radius: 16px !important;
          box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.06) !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          background: rgba(20, 20, 20, 0.45) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          background: rgba(255, 255, 255, 0.3) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 12px !important;
          backdrop-filter: blur(10px) !important;
          -webkit-backdrop-filter: blur(10px) !important;
          color: var(--foreground) !important;
          box-shadow: 0 4px 12px 0 rgba(31, 38, 135, 0.04) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button, .dark button.beveled-button, .dark [class*="beveled-button"], .dark a.beveled-button {
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          background: rgba(255, 255, 255, 0.45) !important;
          box-shadow: 0 4px 16px 0 rgba(31, 38, 135, 0.08) !important;
        }
        .dark .beveled-button:hover, .dark button.beveled-button:hover, .dark [class*="beveled-button"]:hover, .dark a.beveled-button:hover {
          background: rgba(255, 255, 255, 0.15) !important;
        }

        /* Glassmorphic Tabs triggers */
        [role="tablist"] {
          background: rgba(255, 255, 255, 0.15) !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          backdrop-filter: blur(8px) !important;
          border-radius: 12px !important;
        }
        .dark [role="tablist"] {
          background: rgba(0, 0, 0, 0.2) !important;
          border: 1px solid rgba(255, 255, 255, 0.03) !important;
        }
        [role="tab"] {
          border-radius: 10px !important;
          border: none !important;
          color: var(--muted-foreground) !important;
        }
        [role="tab"][data-state="active"] {
          background: rgba(255, 255, 255, 0.3) !important;
          color: var(--foreground) !important;
          backdrop-filter: blur(4px) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow: 0 4px 12px rgba(31, 38, 135, 0.05) !important;
          font-weight: 600 !important;
        }
        .dark [role="tab"][data-state="active"] {
          background: rgba(255, 255, 255, 0.08) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }

        input, select, textarea {
          background: rgba(255, 255, 255, 0.2) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 12px !important;
          backdrop-filter: blur(5px) !important;
          -webkit-backdrop-filter: blur(5px) !important;
        }
        .dark input, .dark select, .dark textarea {
          background: rgba(0, 0, 0, 0.25) !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
        }
      `;
    } else if (config.uiStyle === "flowerism") {
      css += `
        /* Flowerism Overrides */
        :root {
          --radius: 24px !important;
          --font-serif: 'Playfair Display', Lora, Georgia, serif !important;
          --primary: #f43f5e !important; /* Rose accent */
          --ring: #f43f5e !important;
        }
        .dark {
          --radius: 24px !important;
          --font-serif: 'Playfair Display', Lora, Georgia, serif !important;
          --primary: #fda4af !important;
          --ring: #fda4af !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background: rgba(253, 244, 245, 0.82) !important; /* Pastel Blossom */
          border: 1.5px solid rgba(244, 63, 94, 0.16) !important;
          border-radius: 24px !important;
          box-shadow: 0 10px 24px rgba(244, 63, 94, 0.06) !important;
          backdrop-filter: blur(6px) !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          background: rgba(32, 22, 25, 0.85) !important;
          border: 1.5px solid rgba(244, 63, 94, 0.08) !important;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 16px !important;
          background: linear-gradient(135deg, #f43f5e, #ec4899) !important;
          color: #ffffff !important;
          border: none !important;
          box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button, .dark button.beveled-button, .dark [class*="beveled-button"], .dark a.beveled-button {
          background: linear-gradient(135deg, #fda4af, #f472b6) !important;
          color: #1e1b1c !important;
          box-shadow: 0 4px 12px rgba(244, 63, 94, 0.1) !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 0 6px 16px rgba(244, 63, 94, 0.35) !important;
          transform: translateY(-1px) !important;
        }

        /* Flowerism Tabs triggers */
        [role="tablist"] {
          background: rgba(253, 244, 245, 0.5) !important;
          border: 1px solid rgba(244, 63, 94, 0.08) !important;
          border-radius: 16px !important;
        }
        .dark [role="tablist"] {
          background: rgba(32, 22, 25, 0.5) !important;
          border: 1px solid rgba(244, 63, 94, 0.05) !important;
        }
        [role="tab"] {
          border-radius: 14px !important;
          color: var(--muted-foreground) !important;
        }
        [role="tab"][data-state="active"] {
          background: linear-gradient(135deg, #f43f5e, #ec4899) !important;
          color: #ffffff !important;
          box-shadow: 0 4px 10px rgba(244, 63, 94, 0.2) !important;
          font-weight: 600 !important;
        }
        .dark [role="tab"][data-state="active"] {
          background: linear-gradient(135deg, #fda4af, #f472b6) !important;
          color: #1e1b1c !important;
          box-shadow: 0 4px 10px rgba(244, 63, 94, 0.05) !important;
          font-weight: 600 !important;
        }

        input, select, textarea {
          border-radius: 16px !important;
          border: 1.5px solid rgba(244, 63, 94, 0.15) !important;
          background-color: rgba(255, 255, 255, 0.9) !important;
        }
        .dark input, .dark select, .dark textarea {
          border: 1.5px solid rgba(244, 63, 94, 0.08) !important;
          background-color: rgba(25, 20, 22, 0.9) !important;
        }
      `;
    } else if (config.uiStyle === "cyberpunk") {
      css += `
        /* Cyberpunk Presets */
        :root {
          --radius: 0px !important;
          --background: #0b0615 !important;
          --card: #150c25 !important;
          --muted: #22143b !important;
          --muted-foreground: #a88bf5 !important;
          --popover: #150c25 !important;
          --primary: #ff007f !important;
          --primary-foreground: #ffffff !important;
        }
        .dark {
          --radius: 0px !important;
          --background: #0b0615 !important;
          --card: #150c25 !important;
          --muted: #22143b !important;
          --muted-foreground: #a88bf5 !important;
          --popover: #150c25 !important;
          --primary: #ff007f !important;
          --primary-foreground: #ffffff !important;
        }
        body {
          background-color: var(--background) !important;
          color: #00f0ff !important;
          font-family: 'Fira Code', monospace !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          border: 2px solid #00f0ff !important;
          border-radius: 0px !important;
          box-shadow: 0px 0px 10px rgba(0, 240, 255, 0.25), 4px 4px 0px #ff007f !important;
        }
        .beveled-card:hover {
          box-shadow: 0px 0px 15px rgba(0, 240, 255, 0.4), 6px 6px 0px #ff007f !important;
          transform: translate(-2px, -2px) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 0px !important;
          border: 2px solid #ff007f !important;
          box-shadow: 3px 3px 0px #00f0ff !important;
          background-color: #ff007f !important;
          color: #ffffff !important;
          font-family: 'Fira Code', monospace !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          transition: all 0.1s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 4px 4px 0px #00f0ff !important;
          background-color: #00f0ff !important;
          color: #000000 !important;
          border-color: #00f0ff !important;
        }

        /* Cyberpunk tabs */
        [role="tablist"] {
          border: 2px solid #ff007f !important;
          border-radius: 0px !important;
          background-color: #0b0615 !important;
        }
        [role="tab"] {
          border-radius: 0px !important;
          font-family: 'Fira Code', monospace !important;
          color: #a88bf5 !important;
        }
        [role="tab"][data-state="active"] {
          background-color: #ff007f !important;
          color: #ffffff !important;
          box-shadow: 2px 2px 0px #00f0ff !important;
        }
      `;
    } else if (config.uiStyle === "minimalist") {
      css += `
        /* Minimalist Clean Overrides */
        :root {
          --radius: 4px !important;
          --background: #fbfbfb !important;
          --card: #ffffff !important;
          --muted: #f4f4f5 !important;
          --muted-foreground: #71717a !important;
          --popover: #ffffff !important;
          --primary: #18181b !important;
          --primary-foreground: #ffffff !important;
        }
        .dark {
          --radius: 4px !important;
          --background: #09090b !important;
          --card: #121214 !important;
          --muted: #1e1e21 !important;
          --muted-foreground: #a1a1aa !important;
          --popover: #121214 !important;
          --primary: #ffffff !important;
          --primary-foreground: #09090b !important;
        }
        body {
          background-color: var(--background) !important;
          color: var(--foreground) !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          border: 1px solid #e4e4e7 !important;
          border-radius: 4px !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02) !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          border: 1px solid #27272a !important;
        }
        .beveled-card:hover {
          border-color: var(--primary) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 4px !important;
          border: 1px solid var(--primary) !important;
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          font-weight: 500 !important;
          box-shadow: none !important;
          transition: all 0.2s ease !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          background-color: transparent !important;
          color: var(--primary) !important;
        }

        /* Minimalist tabs */
        [role="tablist"] {
          background-color: var(--muted) !important;
          border-radius: 6px !important;
        }
        [role="tab"] {
          border-radius: 4px !important;
        }
        [role="tab"][data-state="active"] {
          background-color: var(--card) !important;
          color: var(--foreground) !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
          font-weight: 500 !important;
        }
      `;
    } else if (config.uiStyle === "forest") {
      css += `
        /* Nature Forest Overrides */
        :root {
          --radius: 16px !important;
          --background: #f4f6f4 !important;
          --card: #ffffff !important;
          --muted: #e2e8e2 !important;
          --muted-foreground: #5e6e5f !important;
          --popover: #ffffff !important;
          --primary: #2d5a27 !important;
          --primary-foreground: #ffffff !important;
        }
        .dark {
          --radius: 16px !important;
          --background: #121812 !important;
          --card: #1a221a !important;
          --muted: #243024 !important;
          --muted-foreground: #8a9c8b !important;
          --popover: #1a221a !important;
          --primary: #8bc34a !important;
          --primary-foreground: #121812 !important;
        }
        body {
          background-color: var(--background) !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          border: 1px solid #d0dad0 !important;
          border-radius: 16px !important;
          box-shadow: 0 4px 12px rgba(45, 90, 39, 0.05) !important;
        }
        .dark .beveled-card, .dark [class*="beveled-card"] {
          border: 1px solid #2d3d2d !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 12px !important;
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          font-weight: 600 !important;
          box-shadow: 0 2px 6px rgba(45, 90, 39, 0.15) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .dark .beveled-button {
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2) !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          opacity: 0.9 !important;
          transform: translateY(-1px) !important;
        }

        /* Nature Forest Tabs */
        [role="tablist"] {
          background-color: var(--muted) !important;
          border-radius: 14px !important;
        }
        [role="tab"] {
          border-radius: 12px !important;
        }
        [role="tab"][data-state="active"] {
          background-color: var(--primary) !important;
          color: var(--primary-foreground) !important;
          font-weight: 600 !important;
        }
      `;
    } else if (config.uiStyle === "luxury") {
      css += `
        /* Luxury Gold Overrides */
        :root {
          --radius: 10px !important;
          --background: #09090b !important;
          --card: #121215 !important;
          --muted: #1c1c22 !important;
          --muted-foreground: #9a9a8d !important;
          --popover: #121215 !important;
          --primary: #d4af37 !important; /* Gold */
          --primary-foreground: #09090b !important;
        }
        .dark {
          --radius: 10px !important;
          --background: #09090b !important;
          --card: #121215 !important;
          --muted: #1c1c22 !important;
          --muted-foreground: #9a9a8d !important;
          --popover: #121215 !important;
          --primary: #d4af37 !important;
          --primary-foreground: #09090b !important;
        }
        body {
          background-color: var(--background) !important;
          color: #e5e5e0 !important;
        }
        .beveled-card, [class*="beveled-card"] {
          background-color: var(--card) !important;
          border: 1px solid rgba(212, 175, 55, 0.2) !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0px rgba(255, 255, 255, 0.05) !important;
        }
        .beveled-card:hover {
          border-color: rgba(212, 175, 55, 0.45) !important;
          box-shadow: 0 8px 32px rgba(212, 175, 55, 0.08), 0 12px 40px rgba(0, 0, 0, 0.5) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 8px !important;
          border: 1px solid #d4af37 !important;
          background: linear-gradient(135deg, #d4af37, #aa8010) !important;
          color: #09090b !important;
          font-weight: 600 !important;
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.15) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 0 6px 18px rgba(212, 175, 55, 0.3) !important;
          transform: translateY(-1px) !important;
        }

        /* Luxury tabs */
        [role="tablist"] {
          background-color: var(--muted) !important;
          border-radius: 10px !important;
        }
        [role="tab"] {
          border-radius: 8px !important;
          color: var(--muted-foreground) !important;
        }
        [role="tab"][data-state="active"] {
          background-color: #d4af37 !important;
          color: #09090b !important;
          font-weight: 600 !important;
        }
      `;
    } else if (config.uiStyle === "feather") {
      css += `
        /* Feather UI Overrides */
        :root {
          --radius: 14px !important;
          --background: oklch(0.99 0.005 180) !important;
          --card: oklch(1 0 0) !important;
          --muted: oklch(0.97 0.005 180) !important;
          --muted-foreground: oklch(0.5 0.01 180) !important;
          --popover: oklch(1 0 0) !important;
          --primary: oklch(0.6 0.16 195) !important;
          --primary-foreground: oklch(0.99 0.005 180) !important;
          --border: oklch(0.92 0.01 180) !important;
        }
        .dark {
          --radius: 14px !important;
          --background: oklch(0.12 0.01 195) !important;
          --card: oklch(0.16 0.02 195) !important;
          --muted: oklch(0.18 0.02 195) !important;
          --muted-foreground: oklch(0.65 0.03 195) !important;
          --popover: oklch(0.16 0.02 195) !important;
          --primary: oklch(0.75 0.14 195) !important;
          --primary-foreground: oklch(0.12 0.01 195) !important;
          --border: oklch(0.24 0.02 195) !important;
        }
        body {
          background-color: var(--background) !important;
          font-family: 'Poppins', sans-serif !important;
        }
        .beveled-card, [class*="beveled-card"], .card {
          background-color: var(--card) !important;
          border: 1px solid var(--border) !important;
          border-radius: 14px !important;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.015), 0 10px 40px rgba(0, 0, 0, 0.025) !important;
          backdrop-filter: blur(16px) !important;
          -webkit-backdrop-filter: blur(16px) !important;
        }
        .beveled-card:hover, .card:hover {
          border-color: var(--primary) !important;
          box-shadow: 0 6px 24px rgba(6, 182, 212, 0.08), 0 12px 48px rgba(0, 0, 0, 0.03) !important;
          transform: translateY(-1px) !important;
        }
        .beveled-button, button.beveled-button, [class*="beveled-button"], a.beveled-button {
          border-radius: 12px !important;
          border: 1px solid var(--primary) !important;
          background: linear-gradient(135deg, oklch(0.65 0.16 195), oklch(0.55 0.16 195)) !important;
          color: #ffffff !important;
          font-weight: 500 !important;
          box-shadow: 0 4px 14px rgba(6, 182, 212, 0.15) !important;
          transition: all 0.2s ease !important;
        }
        .beveled-button:hover, button.beveled-button:hover, [class*="beveled-button"]:hover, a.beveled-button:hover {
          box-shadow: 0 6px 20px rgba(6, 182, 212, 0.25) !important;
          transform: translateY(-1px) !important;
          opacity: 0.95;
        }
      `;
    }

    // Bevel Strength overrides
    if (config.bevelStrength && config.bevelStrength !== "none") {
      let bevelCss = "";
      if (config.bevelStrength === "light") {
        bevelCss = `
          box-shadow: inset 0 0.5px 0px 0px rgba(255,255,255,0.15), inset 0 -0.5px 0px 0px rgba(0,0,0,0.15) !important;
        `;
      } else if (config.bevelStrength === "medium") {
        bevelCss = `
          box-shadow: inset 0 1.5px 0px 0px rgba(255,255,255,0.2), inset 0 -1.5px 0px 0px rgba(0,0,0,0.2) !important;
          border-top: 1px solid rgba(255,255,255,0.15) !important;
          border-bottom: 1.5px solid rgba(0,0,0,0.2) !important;
        `;
      } else if (config.bevelStrength === "heavy") {
        bevelCss = `
          box-shadow: inset 0 3px 0px 0px rgba(255,255,255,0.35), inset 0 -3px 0px 0px rgba(0,0,0,0.35), 0 4px 10px rgba(0,0,0,0.1) !important;
          border-top: 2px solid rgba(255,255,255,0.25) !important;
          border-bottom: 3px solid rgba(0,0,0,0.4) !important;
        `;
      }
      
      css += `
        .beveled-button, .beveled-card, button[class*="beveled-button"], [class*="beveled-card"] {
          ${bevelCss}
        }
      `;
    }

    // Font Size overrides (Default: 14px, supporting 11px, 12px, 13px, 14px, 15px, 16px)
    const activeFontSize = config.fontSize || "14px";
    css += `
      html, body {
        font-size: ${activeFontSize} !important;
      }
    `;

    // Border Radius / Edges overrides (Default: Sharp 0px)
    let radiusVal = "0px";
    if (config.borderRadius === "small") radiusVal = "4px";
    else if (config.borderRadius === "medium") radiusVal = "8px";
    else if (config.borderRadius === "large") radiusVal = "16px";
    else if (config.borderRadius === "full") radiusVal = "9999px";
    else if (config.borderRadius === "none" || !config.borderRadius) radiusVal = "0px";

    css += `
      :root, .dark {
        --radius: ${radiusVal} !important;
      }
      .card, .beveled-card, .glass-card, [class*="glass-card"], [class*="beveled-card"], .kpi-card, button, input, select, textarea {
        border-radius: ${radiusVal} !important;
      }
    `;

    // Lightweight & Smooth Mobile Optimization
    css += `
      * {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }
      body {
        -webkit-overflow-scrolling: touch;
      }
    `;

    // Glow Effect overrides
    if (config.glowEnabled) {
      const intensity = config.glowIntensity ?? 15;
      css += `
        /* Glow Effect Overrides */
        button[class*="bg-primary"], .bg-primary, .beveled-button, button[class*="bg-indigo"] {
          box-shadow: 0 0 ${intensity}px var(--primary) !important;
        }
        .card, .beveled-card, .glass-card {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05), 0 0 ${intensity + 5}px rgba(99, 102, 241, ${Math.min(0.3, 0.05 + intensity * 0.005)}) !important;
        }
        .dark .card, .dark .beveled-card, .dark .glass-card {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35), 0 0 ${intensity + 5}px rgba(99, 102, 241, ${Math.min(0.4, 0.08 + intensity * 0.007)}) !important;
        }
      `;
    }

    // 1. Material UI overrides
    if (config.isMaterialUI) {
      css += `
        /* Material UI Mode Overrides */
        :root, .dark {
          --radius: 4px !important;
          --font-sans: Roboto, Inter, system-ui, -apple-system, sans-serif !important;
        }

        /* Material UI Page Background */
        body {
          background-image: none !important;
          background-color: var(--background) !important;
        }

        /* Material UI Cards - Elevation 1 */
        .card, .beveled-card, .glass-card, [class*="glass-card"], [class*="beveled-card"] {
          background-color: var(--card) !important;
          background: var(--card) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          border: none !important;
          border-radius: 4px !important;
          box-shadow: 0px 2px 1px -1px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12) !important;
        }

        /* Material UI Hover Elevation 4 */
        .card:hover, .beveled-card:hover, .glass-card:hover {
          box-shadow: 0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12) !important;
        }

        /* Material UI Raised Buttons */
        .button, .beveled-button, button[class*="beveled-button"], button[class*="bg-primary"], button[class*="bg-indigo-600"], [role="button"][class*="bg-primary"] {
          border-radius: 4px !important;
          text-transform: uppercase !important;
          font-weight: 500 !important;
          letter-spacing: 0.02857em !important;
          box-shadow: 0px 3px 1px -2px rgba(0,0,0,0.2), 0px 2px 2px 0px rgba(0,0,0,0.14), 0px 1px 5px 0px rgba(0,0,0,0.12) !important;
          border: none !important;
        }
        .button:active, .beveled-button:active {
          box-shadow: 0px 5px 5px -3px rgba(0,0,0,0.2), 0px 8px 10px 1px rgba(0,0,0,0.14), 0px 3px 14px 2px rgba(0,0,0,0.12) !important;
        }

        /* Material UI Form Fields - OutlinedInput style */
        input, select, textarea {
          border: 1px solid rgba(0,0,0,0.23) !important;
          border-radius: 4px !important;
          background-color: transparent !important;
          transition: border-color 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms, box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms !important;
        }
        .dark input, .dark select, .dark textarea {
          border: 1px solid rgba(255,255,255,0.23) !important;
        }
        input:focus, select:focus, textarea:focus {
          border-color: var(--primary) !important;
          border-width: 2px !important;
          box-shadow: none !important;
          outline: none !important;
        }

        /* Material App Bar / Header */
        header {
          background-color: var(--card) !important;
          border-bottom: none !important;
          box-shadow: 0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12) !important;
        }

        /* Material Sidebar */
        .sidebar {
          background-color: var(--card) !important;
          border-right: none !important;
          box-shadow: 0px 8px 10px -5px rgba(0,0,0,0.2), 0px 16px 24px 2px rgba(0,0,0,0.14), 0px 6px 30px 5px rgba(0,0,0,0.12) !important;
        }

        button, [role="button"] {
          position: relative;
          overflow: hidden;
        }
      `;
    }

    // 1. Accent / Primary Color
    if (config.primaryColor) {
      css += `
        :root, .dark {
          --primary: ${config.primaryColor} !important;
          --ring: ${config.primaryColor} !important;
          --sidebar-primary: ${config.primaryColor} !important;
          --loader-color: ${config.primaryColor} !important;
        }
        .text-primary {
          color: ${config.primaryColor} !important;
        }
        .bg-primary {
          background-color: ${config.primaryColor} !important;
        }
        .border-primary {
          border-color: ${config.primaryColor} !important;
        }
      `;
    }

    // 2. Background Color
    if (config.backgroundColor) {
      css += `
        :root, .dark {
          --background: ${config.backgroundColor} !important;
          --sidebar: ${config.backgroundColor} !important;
        }
        body {
          background-color: ${config.backgroundColor} !important;
        }
      `;
    }

    // 3. Text Color
    if (config.textColor) {
      css += `
        :root, .dark {
          --foreground: ${config.textColor} !important;
          --card-foreground: ${config.textColor} !important;
          --popover-foreground: ${config.textColor} !important;
          --sidebar-foreground: ${config.textColor} !important;
        }
        body {
          color: ${config.textColor} !important;
        }
        /* Custom text color overrides hardcoded classes */
        .text-black, 
        .text-zinc-950, .text-zinc-900, .text-zinc-800, .text-zinc-700,
        .text-slate-950, .text-slate-900, .text-slate-800, .text-slate-700,
        .text-neutral-950, .text-neutral-900, .text-neutral-800, .text-neutral-700,
        .text-gray-950, .text-gray-900, .text-gray-800, .text-gray-700 {
          color: ${config.textColor} !important;
        }
      `;
    }

    // 4. Custom Font File Injection
    if (config.customFontUrl) {
      css += `
        @font-face {
          font-family: 'CustomUploadedFont';
          src: url('${config.customFontUrl}') !important;
        }
      `;
    }

    // Load custom Google Font dynamically if configured
    if (typeof window !== "undefined" && config.fontFamily && config.fontFamily !== "CustomUploadedFont" && !config.fontFamily.includes(",") && !["sans-serif", "serif", "monospace", "system-ui"].includes(config.fontFamily)) {
      const fontName = config.fontFamily.trim().replace(/'/g, "").replace(/"/g, "");
      const linkId = "hz-custom-google-font";
      let linkEl = document.getElementById(linkId) as HTMLLinkElement;
      if (!linkEl) {
        linkEl = document.createElement("link");
        linkEl.id = linkId;
        linkEl.rel = "stylesheet";
        document.head.appendChild(linkEl);
      }
      linkEl.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, "+")}:wght@300;400;500;600;700&display=swap`;
    }

    // 4b. Font Family Apply
    if (config.fontFamily) {
      css += `
        :root, .dark {
          --font-sans: ${config.fontFamily} !important;
        }
        body, html, button, input, select, textarea {
          font-family: ${config.fontFamily} !important;
        }
      `;
    }

    // 5. Base Font Size
    if (config.fontSize) {
      css += `
        html {
          font-size: ${config.fontSize} !important;
        }
      `;
    }

    // 6. Density / Sizing
    if (config.density) {
      if (config.density === "compact") {
        css += `
          .p-4, .p-5, .p-6 {
            padding: 0.65rem !important;
          }
          .p-3 {
            padding: 0.5rem !important;
          }
          .space-y-6 > * + * {
            margin-top: 0.75rem !important;
          }
          .space-y-5 > * + * {
            margin-top: 0.5rem !important;
          }
          .space-y-4 > * + * {
            margin-top: 0.5rem !important;
          }
          .beveled-card, .glass-card, [class*="glass-card"] {
            padding: 0.65rem !important;
          }
        `;
      } else if (config.density === "cozy") {
        css += `
          .p-4, .p-5, .p-6 {
            padding: 1.5rem !important;
          }
          .space-y-6 > * + * {
            margin-top: 2rem !important;
          }
          .space-y-5 > * + * {
            margin-top: 1.75rem !important;
          }
          .space-y-4 > * + * {
            margin-top: 1.5rem !important;
          }
          .beveled-card, .glass-card, [class*="glass-card"] {
            padding: 1.5rem !important;
          }
        `;
      }
    }

    // 7. Background Image Overlay
    if (config.bgImage) {
      const opacity = config.bgImageOpacity !== undefined ? config.bgImageOpacity : 0.1;
      css += `
        html {
          background-color: hsl(var(--background)) !important;
        }
        body {
          background-image: linear-gradient(
            color-mix(in srgb, hsl(var(--background)) ${(1 - opacity) * 100}%, transparent),
            color-mix(in srgb, hsl(var(--background)) ${(1 - opacity) * 100}%, transparent)
          ), url('${config.bgImage}') !important;
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          background-attachment: fixed !important;
        }
      `;
    }

    // 8. Custom Card Opacity (using color-mix)
    if (config.cardOpacity !== undefined && config.cardOpacity !== 1) {
      css += `
        .beveled-card, [class*="beveled-card"], .card {
          background-color: color-mix(in srgb, var(--card) ${config.cardOpacity * 100}%, transparent) !important;
          background: color-mix(in srgb, var(--card) ${config.cardOpacity * 100}%, transparent) !important;
        }
      `;
    }

    // 9. Custom Card Blur
    if (config.cardBlur !== undefined) {
      css += `
        .beveled-card, [class*="beveled-card"], .card {
          backdrop-filter: blur(${config.cardBlur}px) !important;
          -webkit-backdrop-filter: blur(${config.cardBlur}px) !important;
        }
      `;
    }

    // 10. Custom Border Width
    if (config.borderWidth) {
      let borderW = "1px";
      if (config.borderWidth === "none") borderW = "0px";
      else if (config.borderWidth === "thin") borderW = "1px";
      else if (config.borderWidth === "medium") borderW = "2px";
      else if (config.borderWidth === "thick") borderW = "3.5px";
      else if (config.borderWidth === "heavy") borderW = "5px";

      css += `
        .beveled-card, [class*="beveled-card"], .card {
          border-width: ${borderW} !important;
        }
      `;
    }

    // 11. Custom Box Shadow Style
    if (config.shadowStyle) {
      let shadowVal = "none";
      if (config.shadowStyle === "none") shadowVal = "none";
      else if (config.shadowStyle === "soft") shadowVal = "0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)";
      else if (config.shadowStyle === "medium") shadowVal = "0 8px 16px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.02)";
      else if (config.shadowStyle === "deep") shadowVal = "0 20px 40px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.04)";
      else if (config.shadowStyle === "brutal") shadowVal = "6px 6px 0px var(--primary, #000000)";

      css += `
        .beveled-card, [class*="beveled-card"], .card {
          box-shadow: ${shadowVal} !important;
        }
      `;
    }

    // 12. Custom Animation/Transition Speed
    if (config.animationSpeed) {
      let speedVal = "0.2s";
      if (config.animationSpeed === "none") speedVal = "0s";
      else if (config.animationSpeed === "fast") speedVal = "0.12s";
      else if (config.animationSpeed === "normal") speedVal = "0.25s";
      else if (config.animationSpeed === "slow") speedVal = "0.5s";

      css += `
        *, *::before, *::after {
          transition-duration: ${speedVal} !important;
        }
      `;
    }

    // 13. General dark/cyberpunk/luxury text color overrides for hardcoded black utility classes
    const isDarkTheme = config.uiStyle === "cyberpunk" || config.uiStyle === "luxury";
    css += `
      .dark .text-black,
      .dark .text-zinc-950,
      .dark .text-zinc-900,
      .dark .text-zinc-800,
      .dark .text-zinc-700,
      .dark .text-slate-950,
      .dark .text-slate-900,
      .dark .text-slate-800,
      .dark .text-slate-700,
      .dark .text-neutral-950,
      .dark .text-neutral-900,
      .dark .text-neutral-800,
      .dark .text-neutral-700,
      .dark .text-gray-950,
      .dark .text-gray-900,
      .dark .text-gray-800,
      .dark .text-gray-700 ${isDarkTheme ? `,
      .text-black,
      .text-zinc-950,
      .text-zinc-900,
      .text-zinc-800,
      .text-zinc-700,
      .text-slate-950,
      .text-slate-900,
      .text-slate-800,
      .text-slate-700,
      .text-neutral-950,
      .text-neutral-900,
      .text-neutral-800,
      .text-neutral-700,
      .text-gray-950,
      .text-gray-900,
      .text-gray-800,
      .text-gray-700` : ""} {
        color: var(--foreground, #ffffff) !important;
      }
    `;

    // 14. Adjust green text (emerald-600, etc.) in dark/cyberpunk/luxury modes to have excellent contrast
    if (isDarkTheme) {
      if (config.uiStyle === "cyberpunk") {
        css += `
          .text-emerald-600, .text-emerald-700, .text-emerald-800, .text-emerald-900, .text-emerald-500 {
            color: #00f0ff !important;
          }
        `;
      } else if (config.uiStyle === "luxury") {
        css += `
          .text-emerald-600, .text-emerald-700, .text-emerald-800, .text-emerald-900, .text-emerald-500 {
            color: #d4af37 !important;
          }
        `;
      }
    } else {
      css += `
        .dark .text-emerald-600, .dark .text-emerald-700, .dark .text-emerald-800, .dark .text-emerald-900, .dark .text-emerald-500 {
          color: #34d399 !important;
        }
      `;
    }

    // 15. Make dark mode look premium by removing light gradients from cards and respecting theme card colors
    css += `
      .dark .card,
      .dark .beveled-card,
      .dark .card[class*="bg-gradient-"],
      .dark .beveled-card[class*="bg-gradient-"],
      .dark [class*="glass-card"] {
        background-image: none !important;
        background-color: var(--card) !important;
        border-color: var(--border, rgba(255,255,255,0.08)) !important;
      }
      ${isDarkTheme ? `
      .card,
      .beveled-card,
      .card[class*="bg-gradient-"],
      .beveled-card[class*="bg-gradient-"],
      [class*="glass-card"] {
        background-image: none !important;
        background-color: var(--card) !important;
        border-color: var(--border, rgba(255,255,255,0.08)) !important;
      }
      ` : ""}
    `;

    // 16. Custom Card Darkness Overlay
    if (config.cardDarkness !== undefined && config.cardDarkness > 0) {
      css += `
        .dark .card,
        .dark .beveled-card,
        .dark .glass-card,
        .card,
        .beveled-card,
        .glass-card {
          background-color: color-mix(in srgb, var(--card) ${(1 - config.cardDarkness) * 100}%, #000000) !important;
          background: color-mix(in srgb, var(--card) ${(1 - config.cardDarkness) * 100}%, #000000) !important;
        }
      `;
    }

    // 17. Custom KPI Card styles
    if (config.kpiStyle) {
      if (config.kpiStyle === "glass") {
        css += `
          .kpi-card, [key="kpis"] .card, [key="valuations"] > div {
            background: rgba(255, 255, 255, 0.03) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.1) !important;
          }
          .dark .kpi-card, .dark [key="kpis"] .card, .dark [key="valuations"] > div {
            background: rgba(0, 0, 0, 0.2) !important;
            border: 1px solid rgba(255, 255, 255, 0.05) !important;
          }
        `;
      } else if (config.kpiStyle === "neon") {
        css += `
          .kpi-card, [key="kpis"] .card, [key="valuations"] > div {
            background-color: var(--card) !important;
            border: 1.5px solid var(--primary) !important;
            box-shadow: 0 0 10px color-mix(in srgb, var(--primary) 20%, transparent) !important;
          }
        `;
      } else if (config.kpiStyle === "borderless") {
        css += `
          .kpi-card, [key="kpis"] .card, [key="valuations"] > div {
            background-color: var(--muted) !important;
            border: none !important;
            box-shadow: none !important;
          }
        `;
      }
    }

    styleEl.innerHTML = css;
  }, [config]);

  return null;
}
