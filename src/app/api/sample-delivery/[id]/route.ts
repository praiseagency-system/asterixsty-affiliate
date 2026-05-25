import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function calcProgress(ceklis: { done: boolean }[], target: number) {
  const done = ceklis.filter((c) => c.done).length;
  const status =
    done === 0 ? "Belum Mulai" :
    done >= target ? "Selesai" :
    "On Progress";
  return { totalVideoDone: done, statusProgress: status };
}

// GET /api/sample-delivery/[id]  → full delivery + videoSubmissions (for lazy card expand)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const delivery = await prisma.sampleDelivery.findUnique({ where: { id: Number(id) } });
  if (!delivery) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const videoSubmissions = await prisma.videoSubmission.findMany({
    where: { sampleDeliveryId: Number(id) },
    orderBy: { videoNumber: "asc" },
  });

  return NextResponse.json({
    ...delivery,
    videoCeklisParsed: JSON.parse(delivery.videoCeklis || "[]"),
    videoSubmissions,
  });
}

// PATCH /api/sample-delivery/[id]  { videoCeklis, catatan, ... }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id   = Number(idStr);
  const body = await req.json();

  const current = await prisma.sampleDelivery.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let ceklis: { label: string; done: boolean }[] = JSON.parse(current.videoCeklis || "[]");

  // Patch a single checklist item: { checkIdx, done }
  if (body.checkIdx !== undefined) {
    ceklis = ceklis.map((c, i) => i === body.checkIdx ? { ...c, done: Boolean(body.done) } : c);
  }

  // Replace full checklist
  if (body.videoCeklis) {
    ceklis = body.videoCeklis;
  }

  const target = current.totalVideoTarget;
  const { totalVideoDone, statusProgress } = calcProgress(ceklis, target);

  const updated = await prisma.sampleDelivery.update({
    where: { id },
    data: {
      videoCeklis:    JSON.stringify(ceklis),
      totalVideoDone,
      statusProgress,
      catatan:        body.catatan !== undefined ? body.catatan : current.catatan,
    },
  });

  return NextResponse.json({
    ...updated,
    videoCeklisParsed: ceklis,
  });
}

// Soft delete
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.sampleDelivery.update({
    where: { id: Number(id) },
    data: { deletedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
