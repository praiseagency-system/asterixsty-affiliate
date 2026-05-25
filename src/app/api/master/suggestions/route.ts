import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PROVINSI_ID, KOTA_ID } from "@/lib/indonesia";
import { VISUAL_TAKE } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/master/suggestions?type=kota|provinsi|kategori|specialist|produk&q=...
export async function GET(req: Request) {
  const url  = new URL(req.url);
  const type = url.searchParams.get("type") || "";
  const q    = (url.searchParams.get("q") || "").toLowerCase().trim();

  function filter(list: string[]) {
    if (!q) return list.slice(0, 20);
    return list.filter((s) => s.toLowerCase().includes(q)).slice(0, 20);
  }

  if (type === "provinsi") return NextResponse.json(filter(PROVINSI_ID));

  if (type === "kota") return NextResponse.json(filter(KOTA_ID));

  if (type === "kategori") {
    const rows = await prisma.kategoriAffiliate.findMany({ orderBy: { nama: "asc" } });
    return NextResponse.json(filter(rows.map((r) => r.nama)));
  }

  if (type === "specialist") {
    const rows = await prisma.affiliateSpecialist.findMany({ orderBy: { nama: "asc" } });
    return NextResponse.json(filter(rows.map((r) => r.nama)));
  }

  if (type === "produk") {
    const rows = await prisma.product.findMany({ orderBy: { nama: "asc" } });
    return NextResponse.json(filter(rows.map((r) => r.nama)));
  }

  if (type === "visualTake") return NextResponse.json(filter([...VISUAL_TAKE]));

  if (type === "tiktokUsername") {
    const rows = await prisma.databaseAffiliate.findMany({
      where: { deletedAt: null },
      select: { tiktokUsername: true },
      orderBy: { tiktokUsername: "asc" },
    });
    return NextResponse.json(filter(rows.map((r) => r.tiktokUsername)));
  }

  return NextResponse.json([]);
}
