/**
 * POST /api/admin/seed-defaults
 * One-shot endpoint to initialise TierConfig + ScoreConfig on a fresh DB.
 * Safe to call multiple times — skips if data already exists.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const [tierCount, scoreCount] = await Promise.all([
      prisma.tierConfig.count(),
      prisma.scoreConfig.count(),
    ]);

    const created: string[] = [];

    // ── TierConfig ────────────────────────────────────────────────────────────
    if (tierCount === 0) {
      await prisma.tierConfig.createMany({
        data: [
          { tier: "A", label: "Elite",  minGmv: 10_000_000, color: "gold"   },
          { tier: "B", label: "Growth", minGmv:  5_000_000, color: "silver" },
          { tier: "C", label: "Entry",  minGmv:     50_000, color: "bronze" },
        ],
      });
      created.push("TierConfig (3 rows)");
    }

    // ── ScoreConfig — GMV Kriteria ────────────────────────────────────────────
    if (scoreCount === 0) {
      await prisma.scoreConfig.createMany({
        data: [
          // GMV — ascending thresholds; point = index+1
          { komponen: "gmv", level: 1, minValue:  5_000_000, label: "≥ Rp 5 Jt"  },
          { komponen: "gmv", level: 2, minValue: 10_000_000, label: "≥ Rp 10 Jt" },
          { komponen: "gmv", level: 3, minValue: 11_000_000, label: "≥ Rp 11 Jt" },
          // GMV baseline (level 0)
          { komponen: "gmv", level: 0, minValue:          0, label: "< Rp 5 Jt"  },
          // Qty
          { komponen: "qty", level: 3, minValue: 100, label: "≥ 100 pcs" },
          { komponen: "qty", level: 2, minValue:  50, label: "≥ 50 pcs"  },
          { komponen: "qty", level: 1, minValue:   1, label: "≥ 1 pcs"   },
          { komponen: "qty", level: 0, minValue:   0, label: "0 pcs"     },
          // Views
          { komponen: "views", level: 2, minValue: 5_000, label: "≥ 5 rb views" },
          { komponen: "views", level: 1, minValue: 1_000, label: "≥ 1 rb views" },
          { komponen: "views", level: 0, minValue:     0, label: "< 1 rb views" },
        ],
      });
      created.push("ScoreConfig (11 rows)");
    }

    if (created.length === 0) {
      return NextResponse.json({ ok: true, message: "Data already exists, nothing created." });
    }

    return NextResponse.json({ ok: true, created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
