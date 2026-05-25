import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const picSelect = { select: { id: true, nama: true } } as const;
const productFocusInclude = {
  include: { product: { select: { id: true, nama: true } } },
} as const;

const toJsonStr = (v: unknown, fallback = "[]"): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return JSON.stringify(v);
  return fallback;
};

// GET /api/campaigns/[id]
export async function GET(_req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where:   { id: Number(id) },
    include: {
      picSpecialist: picSelect,
      participants:  { orderBy: { videoCount: "desc" } },
      productFocus:  productFocusInclude,
    },
  });
  if (!campaign || campaign.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(campaign);
}

// PATCH /api/campaigns/[id]
export async function PATCH(req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;

    const data: Record<string, unknown> = {};

    if ("nama"                in body) data.nama                = String(body.nama || "").trim();
    if ("slug"                in body) data.slug                = String(body.slug || "").trim();
    if ("objectives"          in body) data.objectives          = toJsonStr(body.objectives);
    if ("deskripsi"           in body) data.deskripsi           = String(body.deskripsi || "").trim();
    if ("bannerPath"          in body) data.bannerPath          = String(body.bannerPath || "").trim();
    if ("status"              in body) data.status              = String(body.status || "Draft");
    if ("visibility"          in body) data.visibility          = String(body.visibility || "Public");
    if ("affiliateCategories" in body) data.affiliateCategories = toJsonStr(body.affiliateCategories);
    if ("visualTake"          in body) data.visualTake          = toJsonStr(body.visualTake);
    if ("startDate"           in body) data.startDate           = body.startDate ? new Date(String(body.startDate)) : null;
    if ("endDate"             in body) data.endDate             = body.endDate   ? new Date(String(body.endDate))   : null;
    if ("rewardConfig"        in body) data.rewardConfig        = toJsonStr(body.rewardConfig, "{}");
    if ("rewardDeskripsi"     in body) data.rewardDeskripsi     = String(body.rewardDeskripsi || "").trim();
    if ("maxParticipants"     in body) data.maxParticipants     = Number(body.maxParticipants) || 0;
    if ("catatan"             in body) data.catatan             = String(body.catatan || "").trim();
    if ("isTemplate"          in body) data.isTemplate          = body.isTemplate === true || body.isTemplate === "true";
    if ("approvalMode"        in body) data.approvalMode        = String(body.approvalMode || "Auto");
    if ("joinSlug"            in body) data.joinSlug            = String(body.joinSlug || "").trim();
    if ("automationConfig"    in body) data.automationConfig    = typeof body.automationConfig === "string"
      ? body.automationConfig : JSON.stringify(body.automationConfig ?? {});
    if ("picSpecialistId"     in body) {
      data.picSpecialistId = body.picSpecialistId != null && body.picSpecialistId !== ""
        ? Number(body.picSpecialistId) || null
        : null;
    }

    // Handle productFocusIds — sync relation (delete old, create new)
    if ("productFocusIds" in body) {
      const newIds: number[] = Array.isArray(body.productFocusIds)
        ? (body.productFocusIds as unknown[]).map(Number).filter((n) => !isNaN(n) && n > 0)
        : [];

      // Delete all existing, then recreate (simple upsert strategy)
      await prisma.campaignProductFocus.deleteMany({ where: { campaignId: Number(id) } });
      if (newIds.length > 0) {
        await prisma.campaignProductFocus.createMany({
          data: newIds.map((pid) => ({ campaignId: Number(id), productId: pid })),
        });
      }
    }

    const updated = await prisma.campaign.update({
      where:   { id: Number(id) },
      data,
      include: {
        picSpecialist: picSelect,
        productFocus:  productFocusInclude,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/campaigns/:id]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/campaigns/[id] — soft delete
export async function DELETE(_req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  await prisma.campaign.update({
    where: { id: Number(id) },
    data:  { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
