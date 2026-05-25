"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface BrandConfig {
  brandName: string;
  brandSystem: string;
  primaryColor: string;
  secondaryColor: string;
  formHeader: string;
  formDescription: string;
  waFooter: string;
  logoPath: string;
  bannerPath: string;
}

const BRAND_DEFAULTS: BrandConfig = {
  brandName: "ASTERIXSTY",
  brandSystem: "Affiliate Manager",
  primaryColor: "#6d28d9",
  secondaryColor: "",
  formHeader: "Form Pengumpulan Konten Affiliate",
  formDescription: "Mohon isi form ini setiap kali selesai mengupload video ke TikTok.",
  waFooter: "Team Asterixsty ✨",
  logoPath: "",
  bannerPath: "",
};

// ── Context ───────────────────────────────────────────────────────────────────
interface BrandingContextValue {
  brand: BrandConfig;
  refreshBranding: () => Promise<void>;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  brand: BRAND_DEFAULTS,
  refreshBranding: async () => {},
  isLoading: true,
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(BRAND_DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const res = await fetch("/api/brand", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBrand({ ...BRAND_DEFAULTS, ...data });
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  return (
    <BrandingContext.Provider value={{ brand, refreshBranding, isLoading }}>
      {children}
    </BrandingContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useBranding() {
  return useContext(BrandingContext);
}
