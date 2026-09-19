import type { Metadata } from "next";
import { Bebas_Neue, Geist, Geist_Mono, Oswald, Outfit } from "next/font/google";
import QueryProvider from "@/core/react-query/QueryProvider";
import "./globals.css";
import Providers from "./providers";
import { ToastProvider } from "@/shared/components/ui/Toast/Toast";
import ScrollToTop from "@/shared/components/ScrollToTop/ScrollToTop";
import ThemeScript from "@/shared/components/ThemeScript/ThemeScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bebasNeue = Bebas_Neue({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-ui-loaded",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-body-loaded",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Goatza",
  description: "Where the Greatest Get Discovered",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // theme-color is set per-section, not globally: landing + auth server pages
  // export viewport.themeColor = "#000000" (dark); in-app layouts render
  // <ThemeColorMeta />, which follows the user's theme (store/theme.store.ts).
  // This lets the status bar tint match each section. iOS standalone status
  // bar uses apple-mobile-web-app-status-bar-style (black-translucent) +
  // safe-area padding, independent of theme-color.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} ${oswald.variable} ${outfit.variable}`}
      // The theme is a user choice, not the OS's: every colour rule keys off
      // this attribute (globals.css `:root[data-theme="dark"]`), and the
      // server always says light so the pre-JS state is the default rather
      // than unset. <ThemeScript> below rewrites it from localStorage before
      // first paint, which is why hydration must not complain when the
      // attribute it finds is "dark" — the mismatch is deliberate and it is
      // the only one this element can have.
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        {/* First thing in <head>, before any stylesheet: it must have run
            before the body is parsed so a dark-theme user never sees a light
            frame. */}
        <ThemeScript />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Goatza" />
      </head>

      <body>
        <ScrollToTop />
        <QueryProvider>
          <Providers>
            <ToastProvider>
              {children}
            </ToastProvider>
          </Providers>
        </QueryProvider>
      </body>
    </html>
  );
}
