import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [products, specialists, categories] = await Promise.all([
      prisma.product.findMany({ orderBy: { no: "asc" } }),
      prisma.affiliateSpecialist.findMany({
        where:   { deletedAt: null },
        orderBy: { no: "asc" },
      }),
      prisma.kategoriAffiliate.findMany({ orderBy: { no: "asc" } }),
    ]);
    return NextResponse.json({ products, specialists, categories });
  } catch (err) {
    console.error("[GET /api/master]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg, products: [], specialists: [], categories: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { type, data } = body;

  if (type === "product") {
    const count = await prisma.product.count();
    const item = await prisma.product.create({
      data: { no: count + 1, nama: String(data.nama ?? ""), hpp: Number(data.hpp ?? 0) },
    });
    return NextResponse.json(item, { status: 201 });
  }
  if (type === "specialist") {
    const count = await prisma.affiliateSpecialist.count({ where: { deletedAt: null } });
    const item  = await prisma.affiliateSpecialist.create({
      data: { no: count + 1, nama: String(data.nama ?? "") },
    });
    return NextResponse.json(item, { status: 201 });
  }
  if (type === "category") {
    const count = await prisma.kategoriAffiliate.count();
    const item  = await prisma.kategoriAffiliate.create({
      data: { no: count + 1, nama: String(data.nama ?? ""), deskripsi: String(data.deskripsi ?? "") },
    });
    return NextResponse.json(item, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { type, id, data } = body as { type: string; id: number; data: Record<string, unknown> };

  if (type === "product") {
    const nama = String(data.nama ?? "").trim();
    if (!nama) return NextResponse.json({ error: "Nama produk wajib diisi" }, { status: 400 });
    const hpp = Number(data.hpp ?? 0);
    if (hpp < 0) return NextResponse.json({ error: "HPP tidak boleh negatif" }, { status: 400 });
    const dup = await prisma.product.findFirst({ where: { nama: { equals: nama }, id: { not: id } } });
    if (dup) return NextResponse.json({ error: "Nama produk sudah ada" }, { status: 409 });
    const item = await prisma.product.update({ where: { id }, data: { nama, hpp } });
    return NextResponse.json(item);
  }
  if (type === "specialist") {
    const nama = String(data.nama ?? "").trim();
    if (!nama) return NextResponse.json({ error: "Nama specialist wajib diisi" }, { status: 400 });
    const dup = await prisma.affiliateSpecialist.findFirst({
      where: { nama: { equals: nama }, id: { not: id }, deletedAt: null },
    });
    if (dup) return NextResponse.json({ error: "Nama specialist sudah ada" }, { status: 409 });
    const item = await prisma.affiliateSpecialist.update({ where: { id }, data: { nama } });
    return NextResponse.json(item);
  }
  if (type === "category") {
    const nama = String(data.nama ?? "").trim();
    if (!nama) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
    const dup = await prisma.kategoriAffiliate.findFirst({ where: { nama: { equals: nama }, id: { not: id } } });
    if (dup) return NextResponse.json({ error: "Nama kategori sudah ada" }, { status: 409 });
    const item = await prisma.kategoriAffiliate.update({
      where: { id },
      data:  { nama, deskripsi: String(data.deskripsi ?? "") },
    });
    return NextResponse.json(item);
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const body = await req.json();
  const { type, id } = body as { type: string; id: number };

  if (type === "product") {
    await prisma.product.delete({ where: { id } });
    // Re-number remaining products
    const all = await prisma.product.findMany({ orderBy: { no: "asc" } });
    await Promise.all(all.map((item, i) =>
      prisma.product.update({ where: { id: item.id }, data: { no: i + 1 } })
    ));
    return NextResponse.json({ ok: true });
  }

  if (type === "specialist") {
    // SOFT DELETE — keeps campaign PIC references intact
    await prisma.affiliateSpecialist.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
    // Re-number remaining active specialists
    const active = await prisma.affiliateSpecialist.findMany({
      where:   { deletedAt: null },
      orderBy: { no: "asc" },
    });
    await Promise.all(active.map((item, i) =>
      prisma.affiliateSpecialist.update({ where: { id: item.id }, data: { no: i + 1 } })
    ));
    return NextResponse.json({ ok: true });
  }

  if (type === "category") {
    await prisma.kategoriAffiliate.delete({ where: { id } });
    const all = await prisma.kategoriAffiliate.findMany({ orderBy: { no: "asc" } });
    await Promise.all(all.map((item, i) =>
      prisma.kategoriAffiliate.update({ where: { id: item.id }, data: { no: i + 1 } })
    ));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
