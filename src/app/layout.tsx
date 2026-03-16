import type { Metadata } from "next";
import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Streaming Odcinków";

export const metadata: Metadata = {
  title: appName,
  description: "AniGuess PL: zgaduj anime po screenach i rywalizuj punktami.",
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
      </body>
    </html>
  );
}
