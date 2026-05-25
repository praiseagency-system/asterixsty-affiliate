import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body   = await req.json();
  const rawUsername = (body.usernameTiktok || "").replace(/^@/, "").trim();

  const item = await prisma.videoReferensi.update({
    where: { id: Number(id) },
    data: {
      usernameTiktok:  rawUsername,
      linkTiktok:      rawUsername ? `https://www.tiktok.com/@${rawUsername}` : "",
      linkVideo:       body.linkVideo,
      caption:         body.caption,
      hook:            body.hook,
      jenisVisualTake: body.jenisVisualTake,
      mediaFocus:      body.mediaFocus,
      kategori:        body.kategori,
      tags:            JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
      gmv:             Number(body.gmv) || 0,
      totalOrders:     Number(body.totalOrders) || 0,
      views:           Number(body.views) || 0,
      likes:           Number(body.likes) || 0,
      comments:        Number(body.comments) || 0,
      shares:          Number(body.shares) || 0,
      analisis:        body.analisis,
      kelebihan:       body.kelebihan,
      patternContent:  body.patternContent,
    },
  });
  return NextResponse.json({ ...item, tagsParsed: JSON.parse(item.tags) });
}

// Soft delete (keep file on disk — can clean up separately)
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const item = await prisma.videoReferensi.findUnique({ where: { id: Number(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.videoReferensi.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });

  // Optionally delete the physical file (best-effort)
  if (item.videoFilename) {
    try {
      await unlink(path.join(process.cwd(), "public", "uploads", "videos", item.videoFilename));
    } catch { /* ignore if already gone */ }
  }

  return NextResponse.json({ ok: true });
}
