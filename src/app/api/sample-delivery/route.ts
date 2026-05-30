import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSampleDeliveryWA } from "@/lib/send-sample-delivery-wa";
import { generatePersonalFormLink } from "@/lib/google-auth";
import { resolveWorkspaceId } from "@/lib/workspace-guard";
import { requirePermission, permError } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function calcProgress(ceklis: { done: boolean }[], target: number) {
  const done = ceklis.filter((c) => c.done).length;
  const status =
    done === 0 ? "Belum Mulai" :
    done >= target ? "Selesai" :
    "On Progress";
  return { totalVideoDone: done, statusProgress: status };
}

export async function GET(req: Request) {
  const url             = new URL(req.url);
  const username        = url.searchParams.get("username") || "";
  const page            = parseInt(url.searchParams.get("page") || "1");
  const limit           = parseInt(url.searchParams.get("limit") || "10");
  const includeSubs     = url.searchParams.get("subs") !== "0"; // skip with ?subs=0
  const categoryFilter  = url.searchParams.get("category")   || "";
  const campaignIdParam = url.searchParams.get("campaignId") || "";
  const picIdParam      = url.searchParams.get("picId") || "";

  const wsId = resolveWorkspaceId(req) ?? 1;
  const where: Record<string, unknown> = { deletedAt: null, workspaceId: wsId };
  if (username)        where.affiliateUsername = { contains: username };
  if (categoryFilter)  where.sampleCategory    = categoryFilter;
  if (campaignIdParam) where.relatedCampaignId = Number(campaignIdParam);
  if (picIdParam)      where.picId             = Number(picIdParam);

  const [total, items] = await Promise.all([
    prisma.sampleDelivery.count({ where }),
    prisma.sampleDelivery.findMany({
      where, skip: (page - 1) * limit, take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Fetch affiliate contact info
  const usernames = [...new Set(items.map(d => d.affiliateUsername))];
  const affiliates = await prisma.databaseAffiliate.findMany({
    where: { tiktokUsername: { in: usernames } },
    select: { tiktokUsername: true, noWhatsapp: true, affiliateSpecialist: true },
  });
  const affiliateMap: Record<string, { noWhatsapp: string; pic: string }> = {};
  for (const a of affiliates) {
    affiliateMap[a.tiktokUsername.toLowerCase()] = {
      noWhatsapp: a.noWhatsapp,
      pic: a.affiliateSpecialist,
    };
  }

  // Fetch video submissions for all deliveries (skip with ?subs=0 for faster list loads)
  const deliveryIds = items.map((d) => d.id);
  const subsByDelivery: Record<number, { id: number; sampleDeliveryId: number; affiliateUsername: string; videoNumber: number; tiktokLink: string; sparkCode: string; notes: string; submittedAt: Date; createdAt: Date; updatedAt: Date }[]> = {};
  if (includeSubs) {
    const videoSubs = await prisma.videoSubmission.findMany({
      where: { sampleDeliveryId: { in: deliveryIds } },
      orderBy: { videoNumber: "asc" },
    });
    for (const sub of videoSubs) {
      if (!subsByDelivery[sub.sampleDeliveryId]) subsByDelivery[sub.sampleDeliveryId] = [];
      subsByDelivery[sub.sampleDeliveryId].push(sub);
    }
  }

  // Enrich with ScrapedOrder tracking data for linked entries
  const scrapedIds = items.map((d) => d.scrapedOrderId).filter((id): id is number => id != null);
  const scrapedMap: Record<number, {
    orderId: string; trackingNumber: string; shippingProvider: string;
    shipmentStatus: string; shippedAt: string; deliveredAt: string; estimatedDelivery: string;
    productSku: string; productLink: string; platform: string;
  }> = {};
  if (scrapedIds.length) {
    const scraped = await prisma.scrapedOrder.findMany({
      where: { id: { in: scrapedIds } },
      select: {
        id: true, orderId: true, trackingNumber: true, shippingProvider: true,
        shipmentStatus: true, shippedAt: true, deliveredAt: true, estimatedDelivery: true,
        productSku: true, productLink: true, platform: true,
      },
    });
    for (const s of scraped) scrapedMap[s.id] = s;
  }

  const parsed = items.map((d) => {
    const scraped = d.scrapedOrderId ? scrapedMap[d.scrapedOrderId] : null;
    return {
      ...d,
      videoCeklisParsed: JSON.parse(d.videoCeklis || "[]") as { label: string; done: boolean }[],
      noWhatsapp: affiliateMap[d.affiliateUsername.toLowerCase()]?.noWhatsapp ?? "",
      pic: affiliateMap[d.affiliateUsername.toLowerCase()]?.pic ?? "",
      videoSubmissions: includeSubs ? (subsByDelivery[d.id] ?? []) : undefined,
      // TikTok / scraped data (null if no linked scraped order)
      tiktokOrderId:      scraped?.orderId          ?? null,
      trackingNumber:     scraped?.trackingNumber   ?? null,
      shippingProvider:   scraped?.shippingProvider ?? null,
      shipmentStatus:     scraped?.shipmentStatus   ?? null,
      shippedAt:          scraped?.shippedAt        ?? null,
      deliveredAt:        scraped?.deliveredAt      ?? null,
      estimatedDelivery:  scraped?.estimatedDelivery ?? null,
      productSku:         scraped?.productSku       ?? null,
      productLink:        scraped?.productLink      ?? null,
      platform:           scraped?.platform         ?? null,
    };
  });

  return NextResponse.json({ total, items: parsed, page, limit });
}

export async function POST(req: Request) {
  const check = await requirePermission(req, PERMISSIONS.CREATE_SAMPLE);
  if ("error" in check) return permError(check);

  const wsId = resolveWorkspaceId(req) ?? 1;
  const body = await req.json();
  const target = Number(body.totalVideoTarget) || 0;

  // Generate checklist items
  const ceklis: { label: string; done: boolean }[] = Array.from({ length: target }, (_, i) => ({
    label: `Video ${i + 1}`,
    done: false,
  }));

  const { totalVideoDone, statusProgress } = calcProgress(ceklis, target);

  // ── Resolve PIC ───────────────────────────────────────────────────────────
  // Priority: explicit picId > campaign.picSpecialistId (if Campaign Support) > none
  let picId:   number | null = body.picId ? Number(body.picId) : null;
  let picName: string        = "";

  // If category is Campaign Support and no picId provided, inherit from campaign
  const sampleCat = String(body.sampleCategory || "First Collaboration");
  if (!picId && sampleCat === "Campaign Support" && body.relatedCampaignId) {
    try {
      const camp = await prisma.campaign.findUnique({
        where: { id: Number(body.relatedCampaignId) },
        select: { picSpecialistId: true, picSpecialist: { select: { nama: true } } },
      });
      if (camp?.picSpecialistId) {
        picId   = camp.picSpecialistId;
        picName = camp.picSpecialist?.nama ?? "";
      }
    } catch { /* non-critical */ }
  }

  // If picId set but picName still empty, resolve name from AffiliateSpecialist
  if (picId && !picName) {
    try {
      const spec = await prisma.affiliateSpecialist.findUnique({ where: { id: picId }, select: { nama: true } });
      if (spec) picName = spec.nama;
    } catch { /* non-critical */ }
  }

  const item = await prisma.sampleDelivery.create({
    data: {
      workspaceId:        wsId,
      affiliateUsername:  (body.affiliateUsername || "").replace(/^@/, ""),
      tanggalKirim:       body.tanggalKirim ? new Date(body.tanggalKirim) : new Date(),
      produk:             body.produk || "",
      qtyProduk:          Number(body.qtyProduk) || 1,
      totalVideoTarget:   target,
      videoCeklis:        JSON.stringify(ceklis),
      totalVideoDone,
      statusProgress,
      catatan:            body.catatan || "",
      sampleCategory:     sampleCat,
      relatedCampaignId:  body.relatedCampaignId  ? Number(body.relatedCampaignId)  : null,
      previousDeliveryId: body.previousDeliveryId ? Number(body.previousDeliveryId) : null,
      deliveryReason:     String(body.deliveryReason || ""),
      isRepeatCreator:    Boolean(body.isRepeatCreator),
      picId,
      picName,
    },
  });

  // ── Generate personal prefilled Google Form link ─────────────────────────────
  let googleFormLink = "";
  try {
    googleFormLink = await generatePersonalFormLink({
      deliveryId: item.id,
      username:   item.affiliateUsername,
      produk:     item.produk,
    });
    if (googleFormLink) {
      await prisma.sampleDelivery.update({ where: { id: item.id }, data: { googleFormLink } });
    }
  } catch { /* non-critical — don't fail the request */ }

  // ── Resolve category-specific campaign info ───────────────────────────────
  const host     = req.headers.get("host") || "localhost:3000";
  const proto    = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  let campaignFormLink = "";
  let campaignName     = "";
  if (item.sampleCategory === "Campaign Support" && item.relatedCampaignId) {
    try {
      const GFORM = "https://docs.google.com/forms/d/e";
      const [cf, camp] = await Promise.all([
        prisma.campaignForm.findUnique({
          where:  { campaignId: item.relatedCampaignId },
          select: { subFormPublicId: true },
        }),
        prisma.campaign.findUnique({
          where:  { id: item.relatedCampaignId },
          select: { nama: true },
        }),
      ]);
      if (cf?.subFormPublicId) campaignFormLink = `${GFORM}/${cf.subFormPublicId}/viewform`;
      if (camp?.nama)          campaignName     = camp.nama;
    } catch { /* non-critical */ }
  }

  // ── Auto-send WhatsApp ─────────────────────────────────────────────────────
  const { waStatus, phone, submissionLink, waError } = await sendSampleDeliveryWA({
    deliveryId:        item.id,
    affiliateUsername: item.affiliateUsername,
    produk:            item.produk,
    baseUrl,
    googleFormLink,
    sampleCategory:    item.sampleCategory,
    campaignName,
    campaignFormLink,
    picName:           item.picName || undefined,
  });

  return NextResponse.json({
    ...item,
    googleFormLink,
    submissionLink,
    waStatus,   // "sent" | "failed" | "no_phone" | "no_wa"
    waPhone: phone,
    waError,
  }, { status: 201 });
}
