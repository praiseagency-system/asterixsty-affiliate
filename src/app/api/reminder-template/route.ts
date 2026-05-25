import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_TEMPLATES = [
  {
    nama: "Reminder Pengiriman",
    tipeReminder: "Reminder Pengiriman",
    isiPesan: "Halo kak {username} 👋\nReminder bahwa produk *{produk}* sudah kami kirimkan.\nMohon konfirmasi saat produk sudah diterima ya kak 🙏\nEstimasi tiba dalam 3-5 hari kerja.\nJika ada kendala boleh langsung hubungi PIC:\n{pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 1",
    tipeReminder: "Reminder Video 1",
    isiPesan: "Halo kak {username} 👋\nReminder untuk deliver video affiliate produk *{produk}* ya 🙌\nVideo ke-{video_ke} masih belum terupload.\nMohon upload sebelum:\n*{deadline}*\nJika ada kendala boleh langsung hubungi PIC:\n{pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 2",
    tipeReminder: "Reminder Video 2",
    isiPesan: "Halo kak {username} 👋\nReminder untuk deliver video affiliate produk *{produk}* ya 🙌\nVideo ke-{video_ke} masih belum terupload.\nMohon upload sebelum:\n*{deadline}*\nJika ada kendala boleh langsung hubungi PIC:\n{pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 3",
    tipeReminder: "Reminder Video 3",
    isiPesan: "Halo kak {username} 👋\nReminder untuk deliver video affiliate produk *{produk}* ya 🙌\nVideo ke-{video_ke} masih belum terupload.\nMohon upload sebelum:\n*{deadline}*\nJika ada kendala boleh langsung hubungi PIC:\n{pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Terlambat",
    tipeReminder: "Reminder Terlambat",
    isiPesan: "Halo kak {username} 👋\nDeadline deliver video affiliate produk *{produk}* sudah terlewat *{hari_terlambat} hari* 😔\nMohon segera upload video ke-{video_ke} ya kak.\nHubungi PIC jika ada kendala:\n{pic}\nTerima kasih 🙏",
    aktif: true,
  },
  {
    nama: "Final Warning",
    tipeReminder: "Final Warning",
    isiPesan: "Halo kak {username} 🚨\nFinal reminder untuk produk *{produk}*.\nSudah *{hari_terlambat} hari* melewati deadline.\nMohon segera selesaikan kewajiban affiliate atau hubungi PIC kami:\n{pic}\nTerima kasih.",
    aktif: true,
  },
  {
    nama: "Sample Delivery + Form Link",
    tipeReminder: "Sample Delivery",
    isiPesan: "Halo kak {username} 👋\n\nSample untuk produk:\n*{produk}*\n\nsudah kami kirim ya ✨\n\nMohon submit setiap video yang sudah diupload melalui link berikut:\n\n{submission_form_link}\n\nYang wajib diisi:\n• Pilihan Video (1, 2, 3, dst)\n• Link video TikTok\n• Spark Code\n• Catatan tambahan (opsional)\n\nDeadline mengikuti timeline campaign ⏳\n\nTerima kasih 🙌\n\n{footer_branding}",
    aktif: true,
  },
];

export async function GET() {
  let templates = await prisma.reminderTemplate.findMany({ orderBy: { id: "asc" } });
  if (templates.length === 0) {
    await prisma.reminderTemplate.createMany({ data: DEFAULT_TEMPLATES });
    templates = await prisma.reminderTemplate.findMany({ orderBy: { id: "asc" } });
  }
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { nama, tipeReminder, isiPesan, aktif } = body as Record<string, unknown>;
  const namaStr = String(nama ?? "").trim();
  const tipeStr = String(tipeReminder ?? "").trim();
  const pesanStr = String(isiPesan ?? "").trim();
  if (!namaStr || !tipeStr || !pesanStr) {
    return NextResponse.json({ error: "Nama, tipe, dan isi pesan wajib diisi" }, { status: 400 });
  }
  const item = await prisma.reminderTemplate.create({
    data: { nama: namaStr, tipeReminder: tipeStr, isiPesan: pesanStr, aktif: aktif !== false },
  });
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, nama, tipeReminder, isiPesan, aktif } = body as Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  const item = await prisma.reminderTemplate.update({
    where: { id: Number(id) },
    data: {
      ...(nama !== undefined && { nama: String(nama).trim() }),
      ...(tipeReminder !== undefined && { tipeReminder: String(tipeReminder) }),
      ...(isiPesan !== undefined && { isiPesan: String(isiPesan).trim() }),
      ...(aktif !== undefined && { aktif: Boolean(aktif) }),
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { id } = body as { id: number };
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.reminderTemplate.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
