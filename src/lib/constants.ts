// ─── Shared constants (use these everywhere — DO NOT duplicate) ───────────────

/**
 * Jenis Visual Take — shared between Database Affiliate, Affiliate Scouting,
 * and Campaign targeting. This is the source of truth.
 */
export const VISUAL_TAKE = [
  "Inframe",
  "Shake Product & Text Hook",
  "Clipper",
  "Review Product & Voice Over",
  "AI",
] as const;

export type VisualTake = (typeof VISUAL_TAKE)[number];

/**
 * Campaign Objectives — shared between Campaign Create/Edit and card display.
 */
export const CAMPAIGN_OBJECTIVES = [
  "Boost Sales",
  "Brand Awareness",
  "Creative Volume",
  "Product Launch",
  "Live Boosting",
  "Affiliate Recruitment",
  "GMV Scaling",
  "Spark Ads Material",
  "TikTok Traffic",
  "Marketplace Conversion",
  "Testing Creative",
  "Viral Campaign",
] as const;

export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const OBJECTIVE_META: Record<string, { bg: string; text: string; icon: string }> = {
  "Boost Sales":            { bg: "bg-emerald-100", text: "text-emerald-700", icon: "💰" },
  "Brand Awareness":        { bg: "bg-blue-100",    text: "text-blue-700",    icon: "📢" },
  "Creative Volume":        { bg: "bg-violet-100",  text: "text-violet-700",  icon: "🎥" },
  "Product Launch":         { bg: "bg-orange-100",  text: "text-orange-700",  icon: "🚀" },
  "Live Boosting":          { bg: "bg-red-100",     text: "text-red-700",     icon: "🔴" },
  "Affiliate Recruitment":  { bg: "bg-indigo-100",  text: "text-indigo-700",  icon: "👥" },
  "GMV Scaling":            { bg: "bg-green-100",   text: "text-green-700",   icon: "📈" },
  "Spark Ads Material":     { bg: "bg-pink-100",    text: "text-pink-700",    icon: "✨" },
  "TikTok Traffic":         { bg: "bg-cyan-100",    text: "text-cyan-700",    icon: "🎵" },
  "Marketplace Conversion": { bg: "bg-amber-100",   text: "text-amber-700",   icon: "🛒" },
  "Testing Creative":       { bg: "bg-purple-100",  text: "text-purple-700",  icon: "🧪" },
  "Viral Campaign":         { bg: "bg-rose-100",    text: "text-rose-700",    icon: "🔥" },
};
