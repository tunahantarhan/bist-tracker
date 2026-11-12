import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import SessionGuard from '@/components/auth/SessionGuard';
import { BRAND } from '@/lib/brand';

// latin-ext carries the Turkish letters (ğ, ş, ı, İ)
const inter = Inter({ subsets: ["latin", "latin-ext"] });
// Tabular figures for prices, scores and codes (`font-data` utility)
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name} · ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "Matematiksel koşullara dayalı BIST hisse takip platformu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={jetbrainsMono.variable} data-scroll-behavior="smooth">
      <body className={`${inter.className} antialiased bg-slate-950 text-slate-50 min-h-screen`}>
        <SessionGuard />
        {children}
      </body>
    </html>
  );
}
