import type { Metadata } from "next";
import { Inter, Teko } from "next/font/google";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Streaming Odcinków";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" });
const displayFont = Teko({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: appName,
  description: "Zgaduj anime po screenach i zdobywaj punkty.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <main className="container">{children}</main>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
