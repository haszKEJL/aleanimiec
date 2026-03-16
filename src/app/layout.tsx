import type { Metadata } from "next";
import "./globals.css";
import CookieConsentBanner from "@/components/CookieConsentBanner";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Streaming Odcinków";

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
      <body>
        <main className="container">{children}</main>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
