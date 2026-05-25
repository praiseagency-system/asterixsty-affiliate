import { NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "agreements");
const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "png"];

// ─── POST /api/affiliate-program/[id]/upload ────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId   = parseInt(id);

  try {
    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!ALLOWED_EXTS.includes(ext)) {
      return NextResponse.json({ error: "Format tidak didukung. Gunakan PDF, JPG, atau PNG." }, { status: 400 });
    }

    // Delete old file if exists
    const old = await prisma.affiliateProgram.findUnique({ where: { id: numId }, select: { agreementPath: true } });
    if (old?.agreementPath) {
      const oldDisk = path.join(process.cwd(), "public", old.agreementPath);
      await unlink(oldDisk).catch(() => {/* ignore missing */});
    }

    // Save new file
    const filename  = `agreement_${numId}_${randomUUID()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    const bytes  = await file.arrayBuffer();
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(bytes));

    const filePath  = `/uploads/agreements/${filename}`;
    const updated   = await prisma.affiliateProgram.update({
      where: { id: numId },
      data: {
        agreementFilename:   file.name,
        agreementPath:       filePath,
        agreementSize:       file.size,
        agreementUploadedAt: new Date(),
        agreementStatus:     "Uploaded",
      },
    });

    return NextResponse.json({
      filename:   updated.agreementFilename,
      path:       updated.agreementPath,
      size:       updated.agreementSize,
      uploadedAt: updated.agreementUploadedAt,
      status:     updated.agreementStatus,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── DELETE /api/affiliate-program/[id]/upload ──────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId   = parseInt(id);

  try {
    const record = await prisma.affiliateProgram.findUnique({
      where: { id: numId },
      select: { agreementPath: true },
    });
    if (record?.agreementPath) {
      const diskPath = path.join(process.cwd(), "public", record.agreementPath);
      await unlink(diskPath).catch(() => {/* ignore */});
    }
    await prisma.affiliateProgram.update({
      where: { id: numId },
      data: {
        agreementFilename:   "",
        agreementPath:       "",
        agreementSize:       0,
        agreementUploadedAt: null,
        agreementStatus:     "Belum Upload",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── PATCH /api/affiliate-program/[id]/upload — mark as Signed ─────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await req.json();
  const allowed = ["Uploaded", "Signed", "Belum Upload"];
  if (!allowed.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  const updated = await prisma.affiliateProgram.update({
    where: { id: parseInt(id) },
    data: { agreementStatus: status },
  });
  return NextResponse.json({ agreementStatus: updated.agreementStatus });
}
