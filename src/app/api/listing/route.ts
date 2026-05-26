import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { calcListingScore } from "@/lib/listingScore";
import { resolveWorkspaceId } from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const prisma = getPrisma();
  const url = new URL(req.url);
  const page           = parseInt(url.searchParams.get("page") || "1");
  const limit          = parseInt(url.searchParams.get("limit") || "50");
  const search         = url.searchParams.get("search") || "";
  const worthIt        = url.searchParams.get("worthIt") || "";
  const sampleFilter   = url.searchParams.get("sample") || "";
  const approvalFilter = url.searchParams.get("approval") || "";
  const visualTake     = url.searchParams.get("visualTake") || "";

  const wsId = resolveWorkspaceId(req) ?? 1;
  const where: Record<string, unknown> = { deletedAt: null, workspaceId: wsId };
  if (search)   where.usernameTiktok = { contains: search };
  if (worthIt)  where.worthIt = worthIt;
  if (sampleFilter) where.sampleDecision = sampleFilter;
  if (approvalFilter === "approved")  where.approvalSample = true;
  if (approvalFilter === "pending")   where.approvalSample = false;
  if (visualTake) where.jenisVisualTake = visualTake;

  const [total, items] = await Promise.all([
    prisma.listingAffiliate.count({ where }),
    prisma.listingAffiliate.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ total, items, page, limit });
}

export async function POST(req: Request) {
  const prisma = getPrisma();
  const wsId = resolveWorkspaceId(req) ?? 1;
  const body = await req.json();

  const scores = await calcListingScore({
    gmvPer30Hari:     Number(body.gmvPer30Hari)     || 0,
    qtyProdukTerjual: Number(body.qtyProdukTerjual) || 0,
    rataRataViews:    Number(body.rataRataViews)    || 0,
    kejelasanGambar:  body.kejelasanGambar  || "",
    visualisasiProduk: body.visualisasiProduk || "",
    audioSuara:        body.audioSuara        || "",
    jenisVisualTake:   body.jenisVisualTake   || "",
    qtyVideoPerProduk: Number(body.qtyVideoPerProduk) || 0,
  });

  // Auto-generate TikTok link from username
  const rawUsername = (body.usernameTiktok || "").replace(/^@/, "").trim();
  const linkTiktok = rawUsername ? `https://www.tiktok.com/@${rawUsername}` : "";

  const item = await prisma.listingAffiliate.create({
    data: {
      workspaceId:      wsId,
      usernameTiktok:   rawUsername,
      linkTiktok,
      followers:        Number(body.followers) || 0,
      mediaPromosiFocus: body.mediaPromosiFocus || "",
      kategoriAffiliate: body.kategoriAffiliate || "",
      gmvPer30Hari:     Number(body.gmvPer30Hari) || 0,
      qtyProdukTerjual: Number(body.qtyProdukTerjual) || 0,
      rataRataViews:    Number(body.rataRataViews) || 0,
      kejelasanGambar:  body.kejelasanGambar || "",
      visualisasiProduk: body.visualisasiProduk || "",
      audioSuara:        body.audioSuara || "",
      jenisVisualTake:   body.jenisVisualTake || "",
      qtyVideoPerProduk: Number(body.qtyVideoPerProduk) || 0,
      tanggalListing:    new Date(),
      bulanListing:      new Date().toISOString().slice(0, 7),
      skorGmv:           scores.skorGmv,
      skorQtyTerjual:    scores.skorQty,
      skorViews:         scores.skorViews,
      skorKualitas:      scores.skorKualitas,
      overallResult:     scores.overallResult,
      worthIt:           scores.worthIt,
      sampleDecision:    scores.sampleDecision,
      approvalSample:    false,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
