import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaAutoUpdater } from "@/components/pwa-auto-updater";
import "../styles.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://classicworld-pos.web.app"),
  title: "Classic World — Smart POS & Business Management Software",
  description: "Classic World POS — Cloud-powered point of sale, inventory tracking, invoice generator, somiti management, and accounting system for modern businesses.",
  applicationName: "Classic World POS",
  authors: [{ name: "Classic World" }],
  generator: "Next.js",
  keywords: [
    "Classic World",
    "Classic World POS",
    "POS software",
    "Point of Sale",
    "Inventory Management",
    "Invoice Generator",
    "Store Accounting",
    "Billing Software"
  ],
  icons: {
    icon: [
      { url: "/logo.png" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Classic World — Smart POS & Business Management Software",
    description: "Cloud-powered point of sale, live inventory management, automated invoices, somiti accounts, and multi-profile store billing.",
    url: "https://classicworld-pos.web.app",
    siteName: "Classic World",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Classic World POS & Billing Software",
      },
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Classic World Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Classic World — Smart POS & Business Management Software",
    description: "Cloud-powered point of sale, live inventory management, automated invoices, somiti accounts, and multi-profile store billing.",
    images: ["/og-image.jpg", "/logo.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Classic World POS",
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
      <head suppressHydrationWarning>
        <script
          id="theme-initializer"
          suppressHydrationWarning
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
        <div className="content relative z-10 w-full min-h-screen">
          <Providers>
            {children}
            <PwaInstallPrompt />
            <PwaAutoUpdater />
          </Providers>
        </div>
      </body>
    </html>
  );
}
