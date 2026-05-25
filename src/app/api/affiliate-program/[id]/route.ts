import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Field tracking for history log ───────────────────────────────────────
type TrackedKey = {
  key: string;
  label: string;
  fmt?: (v: unknown) => string;
};

const TRACKED: TrackedKey[] = [
  { key: "namaProgram",      label: "Nama Program" },
  { key: "periodeTipe",      label: "Tipe Periode" },
  { key: "startDate",        label: "Tanggal Mulai",   fmt: (v) => new Date(v as string).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
  { key: "endDate",          label: "Tanggal Selesai", fmt: (v) => new Date(v as string).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
  { key: "targetGmv",        label: "Target GMV",      fmt: (v) => `Rp ${Number(v).toLocaleString("id-ID")}` },
  { key: "targetVideo",      label: "Target Video",    fmt: (v) => `${v} video` },
  { key: "targetLive",       label: "Target Live",     fmt: (v) => `${v} live` },
  { key: "targetOrders",     label: "Target Orders",   fmt: (v) => `${v} orders` },
  { key: "benefitKomisi",    label: "Komisi" },
  { key: "benefitCash",      label: "Cash Reward",     fmt: (v) => `Rp ${Number(v).toLocaleString("id-ID")}` },
  { key: "benefitBestSeller",label: "Best Seller Pack",fmt: (v) => (v ? "Aktif" : "Nonaktif") },
  { key: "benefitBonusProduk",label:"Bonus Produk" },
  { key: "benefitExclusive", label: "Exclusive",       fmt: (v) => (v ? "Aktif" : "Nonaktif") },
  { key: "pic",              label: "PIC" },
  { key: "manualStatus",     label: "Status Override",  fmt: (v) => (v as string) || "Auto" },
  { key: "catatan",          label: "Catatan" },
];

function fmt(key: string, val: unknown): string {
  const def = TRACKED.find((t) => t.key === key);
  if (def?.fmt) return def.fmt(val);
  return val === "" || val === null || val === undefined ? "—" : String(val);
}

// ─── PATCH /api/affiliate-program/[id] ────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId   = parseInt(id);
  const body    = await req.json();

  // Fetch current record for diff
  let old: Awaited<ReturnType<typeof prisma.affiliateProgram.findUnique>>;
  try {
    old = await prisma.affiliateProgram.findUnique({ where: { id: numId } });
    if (!old) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  }

  // Build change list
  const changes: { label: string; from: string; to: string }[] = [];
  for (const t of TRACKED) {
    const incoming = body[t.key];
    if (incoming === undefined) continue;
    const oldVal = (old as Record<string, unknown>)[t.key];
    const newVal = t.key === "startDate" || t.key === "endDate"
      ? new Date(incoming as string).toISOString()
      : incoming;
    const oldNorm = t.key === "startDate" || t.key === "endDate"
      ? (oldVal as Date).toISOString()
      : oldVal;
    // eslint-disable-next-line eqeqeq
    if (String(newVal) !== String(oldNorm)) {
      changes.push({ label: t.label, from: fmt(t.key, oldNorm), to: fmt(t.key, newVal) });
    }
  }

  // Append to updateLog
  let log: { date: string; changes: { label: string; from: string; to: string }[] }[] = [];
  try { log = JSON.parse(old.updateLog || "[]"); } catch { log = []; }
  if (changes.length > 0) {
    log.unshift({ date: new Date().toISOString(), changes });
  }

  // Build update data
  const data: Record<string, unknown> = { updateLog: JSON.stringify(log) };
  const fields = [
    "namaProgram","periodeTipe","benefitKomisi","benefitBonusProduk","pic","catatan","manualStatus",
    "tiktokUsername","namaAffiliator",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  const numericFields = ["targetGmv","benefitCash"];
  for (const f of numericFields) {
    if (body[f] !== undefined) data[f] = Number(body[f]);
  }
  const intFields = ["targetVideo","targetLive","targetOrders"];
  for (const f of intFields) {
    if (body[f] !== undefined) data[f] = parseInt(body[f]);
  }
  const boolFields = ["benefitBestSeller","benefitExclusive"];
  for (const f of boolFields) {
    if (body[f] !== undefined) data[f] = Boolean(body[f]);
  }
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate   !== undefined) data.endDate   = new Date(body.endDate);

  try {
    const updated = await prisma.affiliateProgram.update({ where: { id: numId }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Update gagal" }, { status: 500 });
  }
}

// ─── DELETE /api/affiliate-program/[id] ───────────────────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.affiliateProgram.update({
      where: { id: parseInt(id) },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  }
}
