import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function esc(v: unknown): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const items = await prisma.listingAffiliate.findMany({ orderBy: { createdAt: "asc" } });

  const headers = [
    "usernameTiktok","linkTiktok","followers","mediaPromosiFocus","kategoriAffiliate",
    "gmvPer30Hari","qtyProdukTerjual","rataRataViews",
    "kejelasanGambar","visualisasiProduk","audioSuara","jenisVisualTake","qtyVideoPerProduk",
    "lanjutKirimSample","overallResult","worthIt","sampleDecision",
  ];

  const rows = items.map((r) => [
    r.usernameTiktok, r.linkTiktok, r.followers, r.mediaPromosiFocus, r.kategoriAffiliate,
    r.gmvPer30Hari, r.qtyProdukTerjual, r.rataRataViews,
    r.kejelasanGambar, r.visualisasiProduk, r.audioSuara, r.jenisVisualTake, r.qtyVideoPerProduk,
    r.lanjutKirimSample, r.overallResult.toFixed(1), r.worthIt, r.sampleDecision,
  ].map(esc).join(","));

  const csv = [headers.join(","), ...rows].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="listing-affiliate.csv"`,
    },
  });
}
