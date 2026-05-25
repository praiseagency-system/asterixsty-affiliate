import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

// GET /api/campaigns/[id]/registrations — list registrations with optional status filter
export async function GET(req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  const campaignId = Number(id);

  try {
    const url    = new URL(req.url);
    const status = url.searchParams.get("status") || "";

    const where: Record<string, unknown> = { campaignId };
    if (status) where.status = status;

    const registrations = await prisma.campaignRegistration.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(registrations);
  } catch (err) {
    console.error("[GET /api/campaigns/:id/registrations]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
