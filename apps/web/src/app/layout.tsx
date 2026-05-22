import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neportal",
  description: "Neportal — панель управления",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
