import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSampleDeliveryWA } from "@/lib/send-sample-delivery-wa";
import { generatePersonalFormLink } from "@/lib/google-auth";

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
  const url         = new URL(req.url);
  const username    = url.searchParams.get("username") || "";
  const page        = parseInt(url.searchParams.get("page") || "1");
  const limit       = parseInt(url.searchParams.get("limit") || "10");
  const includeSubs = url.searchParams.get("subs") !== "0"; // skip with ?subs=0

  const where: Record<string, unknown> = { deletedAt: null };
  if (username) where.affiliateUsername = { contains: username };

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

  const parsed = items.map((d) => ({
    ...d,
    videoCeklisParsed: JSON.parse(d.videoCeklis || "[]") as { label: string; done: boolean }[],
    noWhatsapp: affiliateMap[d.affiliateUsername.toLowerCase()]?.noWhatsapp ?? "",
    pic: affiliateMap[d.affiliateUsername.toLowerCase()]?.pic ?? "",
    videoSubmissions: includeSubs ? (subsByDelivery[d.id] ?? []) : undefined,
  }));

  return NextResponse.json({ total, items: parsed, page, limit });
}

export async function POST(req: Request) {
  const body = await req.json();
  const target = Number(body.totalVideoTarget) || 0;

  // Generate checklist items
  const ceklis: { label: string; done: boolean }[] = Array.from({ length: target }, (_, i) => ({
    label: `Video ${i + 1}`,
    done: false,
  }));

  const { totalVideoDone, statusProgress } = calcProgress(ceklis, target);

  const item = await prisma.sampleDelivery.create({
    data: {
      affiliateUsername: (body.affiliateUsername || "").replace(/^@/, ""),
      tanggalKirim:      body.tanggalKirim ? new Date(body.tanggalKirim) : new Date(),
      produk:            body.produk || "",
      qtyProduk:         Number(body.qtyProduk) || 1,
      totalVideoTarget:  target,
      videoCeklis:       JSON.stringify(ceklis),
      totalVideoDone,
      statusProgress,
      catatan:           body.catatan || "",
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

  // ── Auto-send WhatsApp with submission form link ───────────────────────────
  const host     = req.headers.get("host") || "localhost:3000";
  const proto    = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const baseUrl  = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`;

  const { waStatus, phone, submissionLink, waError } = await sendSampleDeliveryWA({
    deliveryId:        item.id,
    affiliateUsername: item.affiliateUsername,
    produk:            item.produk,
    baseUrl,
    googleFormLink,    // will override internal link in the WA message if set
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
