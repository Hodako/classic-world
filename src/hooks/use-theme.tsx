import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "mechanix" | "indigo" | "emerald" | "violet" | "blue" | "rose";
export type BgStyle = "default" | "warm" | "cool" | "clean" | "glass";

const STORAGE_KEY = "hz-theme";
const ACCENT_KEY = "hz-accent";
const BG_STYLE_KEY = "hz-bg-style";

const ACCENTS = {
  mechanix: { hue: 85, light: "#B8902E", dark: "#DFBB63" },
  emerald: { hue: 155, light: "oklch(0.38 0.12 155)", dark: "oklch(0.65 0.14 155)" },
  indigo: { hue: 264, light: "oklch(0.5 0.2 264)", dark: "oklch(0.68 0.18 264)" },
  violet: { hue: 290, light: "oklch(0.55 0.22 290)", dark: "oklch(0.7 0.2 290)" },
  blue: { hue: 245, light: "oklch(0.5 0.18 245)", dark: "oklch(0.68 0.16 245)" },
  rose: { hue: 15, light: "oklch(0.55 0.22 15)", dark: "oklch(0.7 0.18 15)" },
};

type ThemeCtx = {
  theme: ThemeMode;
  resolved: "light" | "dark";
  accentColor: AccentColor;
  bgStyle: BgStyle;
  setTheme: (t: ThemeMode) => void;
  setAccentColor: (a: AccentColor) => void;
  setBgStyle: (b: BgStyle) => void;
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light";
  return mode;
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");
  const [accentColor, setAccentColorState] = useState<AccentColor>("mechanix");
  const [bgStyle, setBgStyleState] = useState<BgStyle>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") {
      setThemeState(savedTheme);
    } else {
      setThemeState("light");
    }
    const savedAccent = localStorage.getItem(ACCENT_KEY) as AccentColor | null;
    if (savedAccent && savedAccent in ACCENTS) {
      setAccentColorState(savedAccent);
    }
    const savedBg = localStorage.getItem(BG_STYLE_KEY) as BgStyle | null;
    if (savedBg) {
      setBgStyleState(savedBg);
    }
  }, []);

  const resolved = resolveTheme(theme);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const isDark = resolved === "dark";
    const config = ACCENTS[accentColor] || ACCENTS.emerald;
    const primaryVal = isDark ? config.dark : config.light;

    root.style.setProperty("--primary", primaryVal);
    root.style.setProperty("--ring", primaryVal);
    root.style.setProperty("--loader-color", primaryVal);
    root.style.setProperty("--sidebar-primary", primaryVal);

    // Apply background preset styles
    let bgImg = "";
    const hue = config.hue;
    if (bgStyle === "clean") {
      bgImg = "none";
    } else if (bgStyle === "warm") {
      bgImg = isDark
        ? "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.4 0.08 75 / 0.15), transparent)"
        : "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.85 0.1 75 / 0.2), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.8 0.1 75 / 0.1), transparent)";
    } else if (bgStyle === "cool") {
      bgImg = isDark
        ? "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.4 0.08 220 / 0.15), transparent)"
        : "radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.85 0.1 220 / 0.2), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.8 0.1 220 / 0.1), transparent)";
    } else if (bgStyle === "glass") {
      bgImg = isDark
        ? `radial-gradient(circle at 0% 0%, oklch(0.4 0.15 ${hue} / 0.2), transparent 40%), radial-gradient(circle at 100% 100%, oklch(0.3 0.12 ${hue} / 0.15), transparent 40%)`
        : `radial-gradient(circle at 0% 0%, oklch(0.7 0.2 ${hue} / 0.25), transparent 45%), radial-gradient(circle at 100% 100%, oklch(0.6 0.18 ${hue} / 0.2), transparent 45%), radial-gradient(circle at 50% 50%, oklch(0.85 0.05 ${hue} / 0.15), transparent 70%)`;
    } else {
      // default
      bgImg = isDark
        ? `radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.65 0.14 ${hue} / 0.15), transparent)`
        : `radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.65 0.14 ${hue} / 0.15), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, oklch(0.45 0.12 ${hue} / 0.08), transparent)`;
    }

    document.body.style.backgroundImage = bgImg;
  }, [resolved, accentColor, bgStyle]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  };

  const setAccentColor = (a: AccentColor) => {
    setAccentColorState(a);
    localStorage.setItem(ACCENT_KEY, a);
  };

  const setBgStyle = (b: BgStyle) => {
    setBgStyleState(b);
    localStorage.setItem(BG_STYLE_KEY, b);
  };

  const toggle = () => setTheme(resolved === "dark" ? "light" : "dark");

  return (
    <Ctx.Provider value={{ theme, resolved, accentColor, bgStyle, setTheme, setAccentColor, setBgStyle, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
