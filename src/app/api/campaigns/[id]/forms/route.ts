import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  createCampaignRegistrationForm,
  createCampaignSubmissionForm,
  syncCampaignRegistrations,
  syncCampaignSubmissions,
} from "@/lib/google-forms-campaign";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GET /api/campaigns/[id]/forms — form info + stats
export async function GET(_req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  const campaignId = Number(id);

  try {
    const cf = await prisma.campaignForm.findUnique({
      where: { campaignId },
      include: {
        registrations: {
          select: { status: true },
        },
      },
    });

    if (!cf) return NextResponse.json({ campaignForm: null });

    const regs = cf.registrations;
    const stats = {
      totalRegistrations: regs.length,
      pending:            regs.filter((r) => r.status === "pending").length,
      approved:           regs.filter((r) => r.status === "approved" || r.status === "auto_approved").length,
      rejected:           regs.filter((r) => r.status === "rejected").length,
    };

    return NextResponse.json({
      campaignForm: {
        id:               cf.id,
        regFormId:        cf.regFormId,
        regFormPublicId:  cf.regFormPublicId,
        regFormLink:      cf.regFormPublicId ? `https://docs.google.com/forms/d/e/${cf.regFormPublicId}/viewform` : "",
        regFormEditLink:  cf.regFormId       ? `https://docs.google.com/forms/d/${cf.regFormId}/edit`            : "",
        lastRegSyncAt:    cf.lastRegSyncAt,
        subFormId:        cf.subFormId,
        subFormPublicId:  cf.subFormPublicId,
        subFormLink:      cf.subFormPublicId ? `https://docs.google.com/forms/d/e/${cf.subFormPublicId}/viewform` : "",
        subFormEditLink:  cf.subFormId       ? `https://docs.google.com/forms/d/${cf.subFormId}/edit`            : "",
        lastSubSyncAt:    cf.lastSubSyncAt,
        createdAt:        cf.createdAt,
      },
      stats,
    });
  } catch (err) {
    console.error("[GET /api/campaigns/:id/forms]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/campaigns/[id]/forms — generate or sync
// Body: { action: "generate_reg" | "generate_sub" | "generate_both" | "sync_reg" }
export async function POST(req: Request, { params }: Params) {
  const prisma = getPrisma();
  const { id } = await params;
  const campaignId = Number(id);

  try {
    const body   = await req.json() as { action?: string };
    const action = body.action || "generate_both";

    // Load campaign with product focus
    const campaign = await prisma.campaign.findUnique({
      where:   { id: campaignId },
      include: { productFocus: { include: { product: true } } },
    });
    if (!campaign || campaign.deletedAt) {
      return NextResponse.json({ error: "Campaign tidak ditemukan" }, { status: 404 });
    }

    // Load kategori affiliate names
    const kategoriList = await prisma.kategoriAffiliate.findMany({ orderBy: { no: "asc" } });
    const categories   = kategoriList.map((k) => k.nama);
    const productNames = campaign.productFocus.map((pf) => pf.product.nama);

    if (action === "generate_reg" || action === "generate_both") {
      await createCampaignRegistrationForm({
        campaignId,
        campaignName: campaign.nama,
        categories,
        bannerPath:   campaign.bannerPath || null,
      });
    }

    if (action === "generate_sub" || action === "generate_both") {
      await createCampaignSubmissionForm({
        campaignId,
        campaignName: campaign.nama,
        productNames,
        bannerPath:   campaign.bannerPath || null,
      });
    }

    if (action === "sync_reg") {
      const result = await syncCampaignRegistrations(campaignId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "sync_sub") {
      const result = await syncCampaignSubmissions(campaignId);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/campaigns/:id/forms]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
