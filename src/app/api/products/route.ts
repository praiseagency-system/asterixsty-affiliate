import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/products — list all products from Data Master
export async function GET() {
  const prisma = getPrisma();
  try {
    const products = await prisma.product.findMany({ orderBy: { nama: "asc" } });
    return NextResponse.json(products);
  } catch (err) {
    console.error("[GET /api/products]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
