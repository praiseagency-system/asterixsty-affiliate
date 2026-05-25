import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { saveBrandConfig } from "@/lib/brand";
import { syncBannerToGoogleForm } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("banner") as File | null;

  if (!file) return NextResponse.json({ error: "Tidak ada file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Hanya PNG, JPG, atau WEBP yang diizinkan" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Ukuran file melebihi 3 MB" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `brand-banner.${ext}`;
  const dest = path.join(process.cwd(), "public", "uploads", filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buf);

  const bannerPath = `/uploads/${filename}`;
  await saveBrandConfig({ bannerPath });

  // Auto-sync banner to Google Form header (fire-and-forget — don't block upload response)
  syncBannerToGoogleForm("default").catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true, bannerPath });
}

export async function DELETE() {
  const { unlink } = await import("fs/promises");
  const exts = ["png", "jpg", "webp"];
  for (const ext of exts) {
    const p = path.join(process.cwd(), "public", "uploads", `brand-banner.${ext}`);
    try { await unlink(p); } catch { /* ignore */ }
  }
  await saveBrandConfig({ bannerPath: "" });
  return NextResponse.json({ ok: true });
}
