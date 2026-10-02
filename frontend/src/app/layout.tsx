import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SessionGuard from '@/components/auth/SessionGuard';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BIST Tracker & Algo Scoring",
  description: "Matematiksel koşullara dayalı BIST hisse takip platformu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.className} antialiased bg-slate-950 text-slate-50 min-h-screen`}>
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}