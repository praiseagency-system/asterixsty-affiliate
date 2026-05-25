import { NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { saveBrandConfig } from "@/lib/brand";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("logo") as File | null;

  if (!file) return NextResponse.json({ error: "Tidak ada file" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type))
    return NextResponse.json({ error: "Hanya PNG, JPG, atau WEBP yang diizinkan" }, { status: 400 });
  if (file.size > MAX_SIZE)
    return NextResponse.json({ error: "Ukuran file melebihi 2 MB" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `brand-logo.${ext}`;
  const dest = path.join(process.cwd(), "public", "uploads", filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(dest, buf);

  const logoPath = `/uploads/${filename}`;
  await saveBrandConfig({ logoPath });

  return NextResponse.json({ ok: true, logoPath });
}

export async function DELETE() {
  const { unlink } = await import("fs/promises");
  const exts = ["png", "jpg", "webp"];
  for (const ext of exts) {
    const p = path.join(process.cwd(), "public", "uploads", `brand-logo.${ext}`);
    try { await unlink(p); } catch { /* ignore */ }
  }
  await saveBrandConfig({ logoPath: "" });
  return NextResponse.json({ ok: true });
}
