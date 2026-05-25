import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tahun = parseInt(url.searchParams.get("tahun") || String(new Date().getFullYear()));

  const items = await prisma.tieredProgram.findMany({
    where: { tahun },
    orderBy: [{ tiktokUsername: "asc" }, { bulan: "asc" }],
  });

  const usernames = [...new Set(items.map((i) => i.tiktokUsername))];
  const bulanList = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

  const grid = usernames.map((username) => {
    const userItems = items.filter((i) => i.tiktokUsername === username);
    const program = userItems[0]?.program || "";
    const months = bulanList.map((bulan) => {
      const found = userItems.find((i) => i.bulan === bulan);
      return found || { bulan, target: 0, gmvAktual: 0, status: "—", linkSurat: "", pic: "" };
    });
    return { username, program, months };
  });

  return NextResponse.json({ grid, tahunList: [2025, 2026, 2027] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const item = await prisma.tieredProgram.upsert({
    where: {
      id: body.id || 0,
    },
    create: body,
    update: body,
  });
  return NextResponse.json(item);
}
