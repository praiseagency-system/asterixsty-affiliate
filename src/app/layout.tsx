import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { PermissionProvider } from "@/contexts/PermissionContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/components/AuthProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
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
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className={`${inter.className} h-full`}>
        {/* ThemeProvider must wrap everything so next-themes can set class on <html> */}
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider session={session}>
              <BrandingProvider>
                <WorkspaceProvider userId={session?.user?.id}>
                  <PermissionProvider>
                    <AppShell>{children}</AppShell>
                  </PermissionProvider>
                </WorkspaceProvider>
              </BrandingProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
