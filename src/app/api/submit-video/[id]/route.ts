import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBrandConfig } from "@/lib/brand";

// ── GET: Fetch form data (delivery info + brand + existing submissions) ───────
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deliveryId = parseInt(id);
  if (isNaN(deliveryId))
    return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

  const [delivery, submissions, brand] = await Promise.all([
    prisma.sampleDelivery.findUnique({ where: { id: deliveryId } }),
    prisma.videoSubmission.findMany({
      where: { sampleDeliveryId: deliveryId },
      orderBy: { videoNumber: "asc" },
    }),
    getBrandConfig(),
  ]);

  if (!delivery || delivery.deletedAt)
    return NextResponse.json({ error: "Pengiriman tidak ditemukan" }, { status: 404 });

  // Submitted video numbers (to prevent duplicates)
  const submittedNumbers = submissions.map((s) => s.videoNumber);

  return NextResponse.json({
    delivery: {
      id: delivery.id,
      affiliateUsername: delivery.affiliateUsername,
      produk: delivery.produk,
      totalVideoTarget: delivery.totalVideoTarget,
    },
    submissions,
    submittedNumbers,
    brand,
  });
}

// ── POST: Submit a video ──────────────────────────────────────────────────────
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deliveryId = parseInt(id);
  if (isNaN(deliveryId))
    return NextResponse.json({ error: "ID tidak valid" }, { status: 400 });

  const body = await req.json() as {
    affiliateUsername: string;
    videoNumber: number;
    tiktokLink: string;
    sparkCode: string;
    notes?: string;
  };

  const { affiliateUsername, videoNumber, tiktokLink, sparkCode, notes = "" } = body;

  // Validate
  if (!tiktokLink?.trim())
    return NextResponse.json({ error: "Link TikTok wajib diisi" }, { status: 400 });
  if (!sparkCode?.trim())
    return NextResponse.json({ error: "Spark Code wajib diisi" }, { status: 400 });
  if (!videoNumber || videoNumber < 1)
    return NextResponse.json({ error: "Nomor video tidak valid" }, { status: 400 });

  const delivery = await prisma.sampleDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery || delivery.deletedAt)
    return NextResponse.json({ error: "Pengiriman tidak ditemukan" }, { status: 404 });

  // Duplicate check
  const existing = await prisma.videoSubmission.findUnique({
    where: { sampleDeliveryId_videoNumber: { sampleDeliveryId: deliveryId, videoNumber } },
  });
  if (existing)
    return NextResponse.json(
      { error: `Video ${videoNumber} sudah pernah disubmit sebelumnya` },
      { status: 409 }
    );

  // Create submission
  const submission = await prisma.videoSubmission.create({
    data: {
      sampleDeliveryId: deliveryId,
      affiliateUsername: affiliateUsername || delivery.affiliateUsername,
      videoNumber,
      tiktokLink: tiktokLink.trim(),
      sparkCode: sparkCode.trim(),
      notes: notes.trim(),
    },
  });

  // ── Auto-checklist engine ──────────────────────────────────────────────────
  const ceklis: { label: string; done: boolean }[] = (() => {
    try { return JSON.parse(delivery.videoCeklis); } catch { return []; }
  })();

  const idx = videoNumber - 1;
  if (idx >= 0 && idx < ceklis.length) {
    ceklis[idx].done = true;
  }

  const totalVideoDone = ceklis.filter((c) => c.done).length;
  const statusProgress =
    totalVideoDone === 0 ? "Belum Mulai" :
    totalVideoDone >= delivery.totalVideoTarget ? "Selesai" :
    "On Progress";

  await prisma.sampleDelivery.update({
    where: { id: deliveryId },
    data: {
      videoCeklis: JSON.stringify(ceklis),
      totalVideoDone,
      statusProgress,
    },
  });

  return NextResponse.json({ ok: true, submission }, { status: 201 });
}
