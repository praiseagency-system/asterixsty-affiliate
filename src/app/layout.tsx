import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { BrandingProvider } from "@/contexts/BrandingContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Asterixsty | Affiliate Marketing",
  description: "TikTok Affiliate Marketing Management — Asterixsty Perfumery",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 text-gray-900`}>
        <BrandingProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <div className="p-6 max-w-screen-2xl mx-auto">{children}</div>
            </main>
          </div>
        </BrandingProvider>
      </body>
    </html>
  );
}
