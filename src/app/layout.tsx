import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import "../styles.css";

export const metadata: Metadata = {
  title: "Dream Fashion — Smart POS & Accounting",
  description: "Smart Inventory, Sales, POS & Accounting Management System.",
  authors: [{ name: "Dream Fashion" }],
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    title: "Dream Fashion",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Hind+Siliguri:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=Poppins:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Montserrat:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&family=Ubuntu:wght@400;500;700&family=Playfair+Display:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
        <link href="https://banglawebfonts.pages.dev/css/siyam-rupali.css" rel="stylesheet" />
        <link href="https://banglawebfonts.pages.dev/css/baloo-da-2.css" rel="stylesheet" />
        <link href="https://banglawebfonts.pages.dev/css/charukola.css" rel="stylesheet" />
        <link href="https://banglawebfonts.pages.dev/css/bensen-handwriting.css" rel="stylesheet" />
        {/* PWA meta — mobile-web-app-capable is the modern standard (replaces deprecated apple- version) */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Keep apple- variant for iOS Safari compatibility */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Dream Fashion" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var mode = localStorage.getItem('hz-theme') || 'light';
                  var accent = localStorage.getItem('hz-accent') || 'mechanix';
                  var doc = document.documentElement;
                  if (mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    doc.classList.add('dark');
                  } else {
                    doc.classList.remove('dark');
                  }
                  var accents = {
                    mechanix: { light: '#228B22', dark: '#228B22' },
                    emerald: { light: 'oklch(0.38 0.12 155)', dark: 'oklch(0.65 0.14 155)' },
                    indigo: { light: 'oklch(0.5 0.2 264)', dark: 'oklch(0.68 0.18 264)' },
                    violet: { light: 'oklch(0.55 0.22 290)', dark: 'oklch(0.7 0.2 290)' },
                    blue: { light: 'oklch(0.5 0.18 245)', dark: 'oklch(0.68 0.16 245)' },
                    rose: { light: 'oklch(0.55 0.22 15)', dark: 'oklch(0.7 0.18 15)' }
                  };
                  var isDark = doc.classList.contains('dark');
                  var cfg = accents[accent] || accents.mechanix;
                  var val = isDark ? cfg.dark : cfg.light;
                  doc.style.setProperty('--primary', val);
                  doc.style.setProperty('--ring', val);
                  doc.style.setProperty('--loader-color', val);
                  doc.style.setProperty('--sidebar-primary', val);
                } catch (e) {}

                // Register PWA Service Worker for phone browsers & standalone mode
                if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js').catch(function() {});
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased site-bg text-foreground min-h-screen relative overflow-x-hidden" suppressHydrationWarning>
        <div className="gear-ghost" />
        <div className="thread-rule" />
        <div className="content relative z-10 w-full min-h-screen">
          <Providers>
            {children}
            <PwaInstallPrompt />
          </Providers>
        </div>
      </body>
    </html>
  );
}
