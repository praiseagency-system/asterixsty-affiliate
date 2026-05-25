import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function esc(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const items = await prisma.databaseAffiliate.findMany({ orderBy: { createdAt: "asc" } });

  const headers = [
    "tiktokUsername","namaAffiliator","status","followers",
    "mediaPromosiFocus","visualTake","kategoriAffiliate","affiliateSpecialist",
    "alamat","kota","provinsi","noWhatsapp",
    "samplePertama","sampleKedua","sampleKetiga","sampleKeempat","sampleKelima",
    "totalVideoDiDeliver","tahun","idAffiliate",
  ];

  const rows = items.map((r) => [
    r.tiktokUsername, r.namaAffiliator, r.status, r.followers,
    r.mediaPromosiFocus, r.visualTake, r.kategoriAffiliate, r.affiliateSpecialist,
    r.alamat, r.kota, r.provinsi, r.noWhatsapp,
    r.samplePertama, r.sampleKedua, r.sampleKetiga, r.sampleKeempat, r.sampleKelima,
    r.totalVideoDiDeliver, r.tahun, r.idAffiliate,
  ].map(esc).join(","));

  const csv = [headers.join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="database-affiliate.csv"`,
    },
  });
}
