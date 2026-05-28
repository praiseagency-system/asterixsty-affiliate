import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, permError } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Soft delete
export async function DELETE(req: Request, { params }: Ctx) {
  const check = await requirePermission(req, PERMISSIONS.DELETE_AFFILIATE);
  if ("error" in check) return permError(check);

  const { id } = await params;
  await prisma.databaseAffiliate.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
