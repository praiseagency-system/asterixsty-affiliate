import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/listing/approve  { id, approvalSample }
export async function PATCH(req: Request) {
  const { id, approvalSample } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updated = await prisma.listingAffiliate.update({
    where: { id: Number(id) },
    data: { approvalSample: Boolean(approvalSample) },
  });

  return NextResponse.json(updated);
}
