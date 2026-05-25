import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { name, color } = await req.json() as { name?: string; color?: string };
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name  = String(name).trim();
    if (color !== undefined) data.color = String(color).trim();

    const group = await prisma.affiliateGroup.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json(group);
  } catch (err) {
    console.error("[PATCH group]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    if (msg.includes("Unique constraint")) {
      return NextResponse.json({ error: "Nama group sudah ada" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const group = await prisma.affiliateGroup.findUnique({ where: { id: Number(id) } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove this group name from all affiliates that have it
    const affiliates = await prisma.databaseAffiliate.findMany({
      where: { groups: { contains: group.name } },
      select: { id: true, groups: true },
    });
    for (const aff of affiliates) {
      let gs: string[] = [];
      try { gs = JSON.parse(aff.groups) as string[]; } catch { gs = []; }
      const updated = gs.filter((g) => g !== group.name);
      await prisma.databaseAffiliate.update({
        where: { id: aff.id },
        data: { groups: JSON.stringify(updated) },
      });
    }

    await prisma.affiliateGroup.delete({ where: { id: Number(id) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE group]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
