import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vetro peg monitor",
  description: "Public read-only premiums, discounts, and trade-to-fair sizes for VUSD, sVUSD, vetBTC, and svetBTC.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.34_0.04_155/0.35),transparent_58%)]" />
        <SiteHeader />
        <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
