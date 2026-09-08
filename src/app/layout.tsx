import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Loyola School Taldanga — Timetable & Substitution Management",
  description: "Timetable and teacher substitution management system for Loyola School, Taldanga.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased text-brand-neutral">{children}</body>
    </html>
  );
}
