import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url         = new URL(req.url);
  const search      = url.searchParams.get("search") || "";
  const visualTake  = url.searchParams.get("visualTake") || "";
  const mediaFocus  = url.searchParams.get("mediaFocus") || "";
  const gmvMin      = parseFloat(url.searchParams.get("gmvMin") || "0") || 0;
  const page        = parseInt(url.searchParams.get("page") || "1");
  const limit       = parseInt(url.searchParams.get("limit") || "24");

  const where: Record<string, unknown> = { deletedAt: null };
  if (search)     where.usernameTiktok = { contains: search };
  if (visualTake) where.jenisVisualTake = visualTake;
  if (mediaFocus) where.mediaFocus = mediaFocus;
  if (gmvMin > 0) where.gmv = { gte: gmvMin };

  const [total, items] = await Promise.all([
    prisma.videoReferensi.count({ where }),
    prisma.videoReferensi.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { gmv: "desc" },
    }),
  ]);

  // Analytics summary
  const allActive = await prisma.videoReferensi.findMany({
    where: { deletedAt: null },
    select: { gmv: true, jenisVisualTake: true, tags: true, views: true },
  });

  const totalGmv = allActive.reduce((s, v) => s + v.gmv, 0);
  const totalViews = allActive.reduce((s, v) => s + v.views, 0);

  // Top visual take
  const vtCount: Record<string, number> = {};
  for (const v of allActive) { if (v.jenisVisualTake) vtCount[v.jenisVisualTake] = (vtCount[v.jenisVisualTake] || 0) + 1; }
  const topVisualTake = Object.entries(vtCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Top tag
  const tagCount: Record<string, number> = {};
  for (const v of allActive) {
    const tags: string[] = JSON.parse(v.tags || "[]");
    for (const t of tags) tagCount[t] = (tagCount[t] || 0) + 1;
  }
  const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return NextResponse.json({
    items: items.map((v) => ({ ...v, tagsParsed: JSON.parse(v.tags || "[]") as string[] })),
    total,
    analytics: {
      totalVideo: allActive.length,
      totalGmv,
      totalViews,
      topVisualTake,
      topTag,
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const rawUsername = (body.usernameTiktok || "").replace(/^@/, "").trim();

  const item = await prisma.videoReferensi.create({
    data: {
      usernameTiktok: rawUsername,
      linkTiktok:     rawUsername ? `https://www.tiktok.com/@${rawUsername}` : "",
      linkVideo:      body.linkVideo || "",
      videoPath:      body.videoPath || "",
      videoFilename:  body.videoFilename || "",
      caption:        body.caption || "",
      hook:           body.hook || "",
      jenisVisualTake: body.jenisVisualTake || "",
      mediaFocus:     body.mediaFocus || "",
      kategori:       body.kategori || "",
      tags:           JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      gmv:            Number(body.gmv) || 0,
      totalOrders:    Number(body.totalOrders) || 0,
      views:          Number(body.views) || 0,
      likes:          Number(body.likes) || 0,
      comments:       Number(body.comments) || 0,
      shares:         Number(body.shares) || 0,
      analisis:       body.analisis || "",
      kelebihan:      body.kelebihan || "",
      patternContent: body.patternContent || "",
    },
  });

  return NextResponse.json({ ...item, tagsParsed: JSON.parse(item.tags) }, { status: 201 });
}
