import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcListingScore } from "@/lib/listingScore";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  // Recalculate scores when performance data changes
  const scores = await calcListingScore({
    gmvPer30Hari:     Number(body.gmvPer30Hari)     || 0,
    qtyProdukTerjual: Number(body.qtyProdukTerjual)  || 0,
    rataRataViews:    Number(body.rataRataViews)     || 0,
    kejelasanGambar:  body.kejelasanGambar   || "",
    visualisasiProduk: body.visualisasiProduk || "",
    audioSuara:        body.audioSuara        || "",
    jenisVisualTake:   body.jenisVisualTake   || "",
    qtyVideoPerProduk: Number(body.qtyVideoPerProduk) || 0,
  });

  const rawUsername = (body.usernameTiktok || "").replace(/^@/, "").trim();

  const item = await prisma.listingAffiliate.update({
    where: { id: Number(id) },
    data: {
      usernameTiktok:    rawUsername,
      linkTiktok:        rawUsername ? `https://www.tiktok.com/@${rawUsername}` : "",
      followers:         Number(body.followers) || 0,
      mediaPromosiFocus: body.mediaPromosiFocus || "",
      kategoriAffiliate: body.kategoriAffiliate || "",
      gmvPer30Hari:      Number(body.gmvPer30Hari) || 0,
      qtyProdukTerjual:  Number(body.qtyProdukTerjual) || 0,
      rataRataViews:     Number(body.rataRataViews) || 0,
      kejelasanGambar:   body.kejelasanGambar || "",
      visualisasiProduk: body.visualisasiProduk || "",
      audioSuara:        body.audioSuara || "",
      jenisVisualTake:   body.jenisVisualTake || "",
      qtyVideoPerProduk: Number(body.qtyVideoPerProduk) || 0,
      skorGmv:           scores.skorGmv,
      skorQtyTerjual:    scores.skorQty,
      skorViews:         scores.skorViews,
      skorKualitas:      scores.skorKualitas,
      overallResult:     scores.overallResult,
      worthIt:           scores.worthIt,
      sampleDecision:    scores.sampleDecision,
    },
  });
  return NextResponse.json(item);
}

// Soft delete
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.listingAffiliate.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
