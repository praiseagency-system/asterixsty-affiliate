import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export async function GET() {
  const prisma = getPrisma();
  try {
    const presets = await prisma.broadcastPreset.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json(presets);
  } catch (err) {
    console.error("[GET presets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const prisma = getPrisma();
  try {
    const body = await req.json() as { name?: string; targetJson?: unknown };
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Nama preset wajib diisi" }, { status: 400 });

    const preset = await prisma.broadcastPreset.create({
      data: {
        name,
        targetJson: typeof body.targetJson === "string"
          ? body.targetJson
          : JSON.stringify(body.targetJson ?? {}),
      },
    });
    return NextResponse.json(preset, { status: 201 });
  } catch (err) {
    console.error("[POST presets]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
