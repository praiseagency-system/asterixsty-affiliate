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

// Primary public URL — used for metadataBase, OG, canonical
// Falls back to custom domain so build-time metadata is always correct
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.praiseagency.id").replace(/\/$/, "");

export const metadata: Metadata = {
  // metadataBase makes all relative URLs in metadata absolute
  metadataBase: new URL(APP_URL),

  title:       "Praise Agency · Affiliate Platform",
  description: "TikTok Affiliate Marketing Management — Praise Agency",

  // Canonical URL (private app — keep it simple)
  alternates: { canonical: "/" },

  openGraph: {
    type:        "website",
    url:         APP_URL,
    title:       "Praise Agency · Affiliate Platform",
    description: "TikTok Affiliate Marketing Management — Praise Agency",
    siteName:    "Praise Agency",
  },

  // Private internal tool — do not index
  robots: { index: false, follow: false },
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
