import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_TEMPLATES = [
  // ── Generic reminder templates (default / First Collaboration) ────────────
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
  // ── Initial delivery WA — category-specific ───────────────────────────────
  {
    nama: "Sample Delivery — First Collaboration",
    tipeReminder: "Sample Delivery",
    isiPesan: "Halo kak {username} 👋\n\nSample untuk produk:\n*{produk}*\n\nsudah kami kirim ya ✨\n\nMohon submit setiap video yang sudah diupload melalui link berikut:\n\n{submission_form_link}\n\nYang wajib diisi:\n• Pilihan Video (1, 2, 3, dst)\n• Link video TikTok\n• Spark Code\n• Catatan tambahan (opsional)\n\nDeadline mengikuti timeline campaign ⏳\n\nTerima kasih 🙌\n\n{footer_branding}",
    aktif: true,
  },
  {
    nama: "Sample Delivery — Campaign Support",
    tipeReminder: "Sample Delivery — Campaign Support",
    isiPesan: "Halo kak {username} 👋\n\nKamu terpilih untuk join campaign *{campaign_name}*! 🎉\n\nSample produk:\n*{produk}*\n\nsedang kami proses & akan segera dikirim ✨\n\nSetelah menerima produk, mohon submit setiap video yang sudah diupload melalui form campaign berikut:\n\n{submission_form_link}\n\nYang wajib diisi:\n• Pilihan Video (1, 2, 3, dst)\n• Link video TikTok\n• Spark Code\n• Catatan tambahan (opsional)\n\nDeadline sesuai timeline campaign ⏳\n\nTerima kasih sudah bergabung 🙌\n\n{footer_branding}",
    aktif: true,
  },
  {
    nama: "Sample Delivery — Repeat / Restock",
    tipeReminder: "Sample Delivery — Repeat / Restock",
    isiPesan: "Halo kak {username} 👋\n\nRepeat sample kamu sedang kami proses! 🔄\n\nProduk:\n*{produk}*\n\nsedang disiapkan dan akan segera dikirim ✨\n\nMohon submit video yang sudah diupload melalui:\n\n{submission_form_link}\n\nTerima kasih atas kolaborasi berkelanjutannya 🙌\n\n{footer_branding}",
    aktif: true,
  },
  {
    nama: "Sample Delivery — Paid Collaboration",
    tipeReminder: "Sample Delivery — Paid Collaboration",
    isiPesan: "Halo kak {username} 👋\n\nBerikut sample untuk *paid collaboration* bersama *{brand_name}*! 💰\n\nProduk:\n*{produk}*\n\nsedang kami proses dan akan segera dikirim ✨\n\nMohon submit brief dan video melalui:\n\n{submission_form_link}\n\nDetail terms & fee kolaborasi akan dikirim terpisah oleh PIC kami ya 🙏\n\nTerima kasih 🙌\n\n{footer_branding}",
    aktif: true,
  },
  {
    nama: "Sample Delivery — Custom Request",
    tipeReminder: "Sample Delivery — Custom Request",
    isiPesan: "Halo kak {username} 👋\n\nSample custom request kamu:\n*{produk}*\n\nsedang kami proses dan akan segera dikirim ✨\n\nKalau ada pertanyaan atau perubahan, langsung hubungi PIC kami ya 🙏\n\n{footer_branding}",
    aktif: true,
  },
  // ── Campaign Support — reminder overrides ─────────────────────────────────
  {
    nama: "Reminder Pengiriman — Campaign Support",
    tipeReminder: "Reminder Pengiriman — Campaign Support",
    isiPesan: "Halo kak {username} 👋\nProduk campaign *{campaign_name}* (*{produk}*) sudah kami kirimkan!\nMohon konfirmasi saat produk sudah diterima ya 🙏\nEstimasi tiba dalam 3-5 hari kerja.\nHubungi PIC jika ada kendala:\n{pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 1 — Campaign Support",
    tipeReminder: "Reminder Video 1 — Campaign Support",
    isiPesan: "Halo kak {username} 👋\nReminder submit video {video_ke} untuk campaign *{campaign_name}*!\nProduk: *{produk}*\nMohon upload & submit sebelum: *{deadline}*\nForm submit: {submission_link}\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 2 — Campaign Support",
    tipeReminder: "Reminder Video 2 — Campaign Support",
    isiPesan: "Halo kak {username} 👋\nReminder submit video {video_ke} untuk campaign *{campaign_name}*!\nProduk: *{produk}*\nMohon upload & submit sebelum: *{deadline}*\nForm submit: {submission_link}\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 3 — Campaign Support",
    tipeReminder: "Reminder Video 3 — Campaign Support",
    isiPesan: "Halo kak {username} 👋\nReminder submit video {video_ke} untuk campaign *{campaign_name}*!\nProduk: *{produk}*\nMohon upload & submit sebelum: *{deadline}*\nForm submit: {submission_link}\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
  // ── Repeat / Restock — reminder overrides ────────────────────────────────
  {
    nama: "Reminder Video 1 — Repeat / Restock",
    tipeReminder: "Reminder Video 1 — Repeat / Restock",
    isiPesan: "Halo kak {username} 👋\nReminder deliver video {video_ke} untuk produk *{produk}* ya 🙌\nMohon upload sebelum: *{deadline}*\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 2 — Repeat / Restock",
    tipeReminder: "Reminder Video 2 — Repeat / Restock",
    isiPesan: "Halo kak {username} 👋\nReminder deliver video {video_ke} untuk produk *{produk}* ya 🙌\nMohon upload sebelum: *{deadline}*\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
  {
    nama: "Reminder Video 3 — Repeat / Restock",
    tipeReminder: "Reminder Video 3 — Repeat / Restock",
    isiPesan: "Halo kak {username} 👋\nReminder deliver video {video_ke} untuk produk *{produk}* ya 🙌\nMohon upload sebelum: *{deadline}*\nHubungi PIC jika ada kendala: {pic}\nTerima kasih ✨",
    aktif: true,
  },
];

export async function GET() {
  let templates = await prisma.reminderTemplate.findMany({ orderBy: { id: "asc" } });

  if (templates.length === 0) {
    // First run: seed all defaults
    await prisma.reminderTemplate.createMany({ data: DEFAULT_TEMPLATES });
  } else {
    // Incremental: add any missing category-specific templates (tipeReminder not yet in DB)
    const existingTipes = new Set(templates.map((t) => t.tipeReminder));
    const missing = DEFAULT_TEMPLATES.filter(
      (t) => t.tipeReminder !== "Sample Delivery" && !existingTipes.has(t.tipeReminder)
    );
    if (missing.length > 0) {
      await prisma.reminderTemplate.createMany({ data: missing });
    }
  }

  templates = await prisma.reminderTemplate.findMany({ orderBy: { id: "asc" } });
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
