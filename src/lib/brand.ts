/**
 * Brand config utility — read/write branding settings from AppConfig.
 */
import { prisma } from "@/lib/prisma";

export interface BrandConfig {
  brandName: string;        // e.g. "ASTERIXSTY"
  brandSystem: string;      // e.g. "Affiliate Manager"
  primaryColor: string;     // hex e.g. "#6d28d9"
  secondaryColor: string;   // hex optional
  formHeader: string;       // e.g. "Form Pengumpulan Konten Affiliate"
  formDescription: string;  // e.g. "Mohon isi form setiap selesai upload video."
  waFooter: string;         // e.g. "Team Asterixsty ✨"
  logoPath: string;         // e.g. "/uploads/brand-logo.png" or ""
  bannerPath: string;       // e.g. "/uploads/brand-banner.jpg" or ""
}

export const BRAND_DEFAULTS: BrandConfig = {
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

export const BRAND_KEYS = Object.keys(BRAND_DEFAULTS) as (keyof BrandConfig)[];

export async function getBrandConfig(): Promise<BrandConfig> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: BRAND_KEYS } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    brandName:       map.brandName       ?? BRAND_DEFAULTS.brandName,
    brandSystem:     map.brandSystem     ?? BRAND_DEFAULTS.brandSystem,
    primaryColor:    map.primaryColor    ?? BRAND_DEFAULTS.primaryColor,
    secondaryColor:  map.secondaryColor  ?? BRAND_DEFAULTS.secondaryColor,
    formHeader:      map.formHeader      ?? BRAND_DEFAULTS.formHeader,
    formDescription: map.formDescription ?? BRAND_DEFAULTS.formDescription,
    waFooter:        map.waFooter        ?? BRAND_DEFAULTS.waFooter,
    logoPath:        map.logoPath        ?? BRAND_DEFAULTS.logoPath,
    bannerPath:      map.bannerPath      ?? BRAND_DEFAULTS.bannerPath,
  };
}

export async function saveBrandConfig(cfg: Partial<BrandConfig>) {
  for (const key of BRAND_KEYS) {
    if (key in cfg) {
      const value = String((cfg as Record<string, string>)[key] ?? "");
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
  }
}
