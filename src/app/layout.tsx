import type { Metadata } from "next";
import { Inter, Teko } from "next/font/google";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const bodyFont = Inter({ subsets: ["latin"], variable: "--font-body" });
const displayFont = Teko({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "AniGuess",
  description: "Zgaduj anime po screenach i zdobywaj punkty.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
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
