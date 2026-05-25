import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcScore } from "@/lib/format";

export async function POST(req: Request) {
  try {
    const { rows } = await req.json() as { rows: Record<string, string>[] };

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "Tidak ada data" }, { status: 400 });

    const num = (v: unknown) => Number(v ?? 0) || 0;
    const str = (v: unknown) => String(v ?? "").trim();

    const data = rows
      .filter((r) => str(r.usernameTiktok))
      .map((r) => {
        const gmvPer30Hari = num(r.gmvPer30Hari);
        const qtyProdukTerjual = num(r.qtyProdukTerjual);
        const rataRataViews = num(r.rataRataViews);
        const kejelasanGambar = str(r.kejelasanGambar);
        const visualisasiProduk = str(r.visualisasiProduk);
        const audioSuara = str(r.audioSuara);

        const { skorGmv, skorQty, skorViews, skorKualitas, overall } = calcScore({
          gmvPer30Hari, qtyProdukTerjual, rataRataViews,
          kejelasanGambar, visualisasiProduk, audioSuara,
        });

        const worthIt = overall >= 8 ? "Worth It" : overall >= 5 ? "Pertimbangkan" : "Tidak Worth It";

        return {
          usernameTiktok: str(r.usernameTiktok),
          linkTiktok: str(r.linkTiktok),
          followers: num(r.followers),
          mediaPromosiFocus: str(r.mediaPromosiFocus),
          kategoriAffiliate: str(r.kategoriAffiliate),
          gmvPer30Hari, qtyProdukTerjual, rataRataViews,
          kejelasanGambar, visualisasiProduk, audioSuara,
          jenisVisualTake: str(r.jenisVisualTake),
          qtyVideoPerProduk: num(r.qtyVideoPerProduk),
          lanjutKirimSample: str(r.lanjutKirimSample) || "YES",
          sampleDecision: str(r.sampleDecision),
          skorGmv, skorQtyTerjual: skorQty, skorViews, skorKualitas,
          overallResult: overall,
          worthIt,
          tanggalListing: new Date(),
        };
      });

    const CHUNK = 50;
    let created = 0;
    for (let i = 0; i < data.length; i += CHUNK) {
      const result = await prisma.listingAffiliate.createMany({ data: data.slice(i, i + CHUNK) });
      created += result.count;
    }

    return NextResponse.json({ created });
  } catch (err) {
    console.error("Listing import error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
