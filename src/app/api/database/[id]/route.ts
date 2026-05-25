import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

// Soft delete
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.databaseAffiliate.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
