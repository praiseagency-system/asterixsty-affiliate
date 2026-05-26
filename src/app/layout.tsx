import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { auth } from "@/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Praise Agency · Affiliate Platform",
  description: "TikTok Affiliate Marketing Management — Praise Agency",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <html lang="id" className="h-full">
      <body className={`${inter.className} h-full bg-gray-50 text-gray-900`}>
        <AuthProvider session={session}>
          <BrandingProvider>
            <WorkspaceProvider userId={session?.user?.id}>
              <AppShell>{children}</AppShell>
            </WorkspaceProvider>
          </BrandingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
