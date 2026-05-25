import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const formData = await req.formData();
    const file = formData.get("banner") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate type
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Format tidak didukung. Gunakan JPG, PNG, atau WEBP." }, { status: 400 });
    }
    // Max 5 MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 5 MB" }, { status: 400 });
    }

    const ext      = file.type.split("/")[1].replace("jpeg", "jpg");
    const filename = `banner-${id}-${Date.now()}.${ext}`;
    const dir      = join(process.cwd(), "public", "uploads", "banners");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(join(dir, filename), buffer);

    // Delete old banner if it exists
    const existing = await prisma.campaign.findUnique({ where: { id: Number(id) }, select: { bannerPath: true } });
    if (existing?.bannerPath) {
      const oldPath = join(process.cwd(), "public", existing.bannerPath.replace(/^\//, ""));
      try { await unlink(oldPath); } catch { /* ignore if not found */ }
    }

    const bannerPath = `/uploads/banners/${filename}`;
    await prisma.campaign.update({ where: { id: Number(id) }, data: { bannerPath } });
    return NextResponse.json({ bannerPath });
  } catch (err) {
    console.error("[POST banner]", err);
    return NextResponse.json({ error: "Upload gagal" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const existing = await prisma.campaign.findUnique({ where: { id: Number(id) }, select: { bannerPath: true } });
    if (existing?.bannerPath) {
      const path = join(process.cwd(), "public", existing.bannerPath.replace(/^\//, ""));
      try { await unlink(path); } catch { /* ignore */ }
    }
    await prisma.campaign.update({ where: { id: Number(id) }, data: { bannerPath: "" } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE banner]", err);
    return NextResponse.json({ error: "Gagal hapus banner" }, { status: 500 });
  }
}
