import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  try {
    await prisma.broadcastPreset.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE preset]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
