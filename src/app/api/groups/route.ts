import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const groups = await prisma.affiliateGroup.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(groups);
  } catch (err) {
    console.error("[GET groups]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, color } = await req.json() as { name?: string; color?: string };
    const trimmed = String(name || "").trim();
    if (!trimmed) return NextResponse.json({ error: "Nama group wajib diisi" }, { status: 400 });

    const group = await prisma.affiliateGroup.create({
      data: { name: trimmed, color: color || "indigo" },
    });
    return NextResponse.json(group, { status: 201 });
  } catch (err) {
    console.error("[POST groups]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Nama group sudah ada" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
