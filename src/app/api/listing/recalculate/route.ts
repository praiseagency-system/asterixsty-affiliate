import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { calcListingScore } from "@/lib/listingScore";

export const dynamic = "force-dynamic";

/**
 * POST /api/listing/recalculate
 * Recalculates scores for all (non-deleted) listing items using current
 * ScoreConfig thresholds and updates them in the database.
 */
export async function POST() {
  const prisma = getPrisma();

  try {
    const items = await prisma.listingAffiliate.findMany({
      where: { deletedAt: null },
    });

    let updated = 0;
    for (const item of items) {
      const scores = await calcListingScore({
        gmvPer30Hari:      item.gmvPer30Hari,
        qtyProdukTerjual:  item.qtyProdukTerjual,
        rataRataViews:     item.rataRataViews,
        kejelasanGambar:   item.kejelasanGambar,
        visualisasiProduk: item.visualisasiProduk,
        audioSuara:        item.audioSuara,
        jenisVisualTake:   item.jenisVisualTake,
        qtyVideoPerProduk: item.qtyVideoPerProduk,
      });

      await prisma.listingAffiliate.update({
        where: { id: item.id },
        data: {
          skorGmv:        scores.skorGmv,
          skorQtyTerjual: scores.skorQty,
          skorViews:      scores.skorViews,
          skorKualitas:   scores.skorKualitas,
          overallResult:  scores.overallResult,
          worthIt:        scores.worthIt,
          sampleDecision: scores.sampleDecision,
        },
      });
      updated++;
    }

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    console.error("[POST listing/recalculate]", err);
    return NextResponse.json({ error: "Recalculate failed" }, { status: 500 });
  }
}
