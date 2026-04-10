import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import QueryProvider from "@/core/react-query/QueryProvider";
import "./globals.css";
import Providers from "./providers";
import { ToastProvider, useToast, type ToastPosition } from "@/shared/components/ui/Toast/Toast"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goatza",
  description: "Where the Greatest Get Discovered",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
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
