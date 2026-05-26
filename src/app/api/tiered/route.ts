import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const wsId = resolveWorkspaceId(req) ?? 1;
  const url = new URL(req.url);
  const tahun = parseInt(url.searchParams.get("tahun") || String(new Date().getFullYear()));

  const items = await prisma.tieredProgram.findMany({
    where: { workspaceId: wsId, tahun },
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
  const wsId = resolveWorkspaceId(req) ?? 1;
  const body = await req.json();
  const item = await prisma.tieredProgram.upsert({
    where: {
      id: body.id || 0,
    },
    create: { ...body, workspaceId: wsId },
    update: body,
  });
  return NextResponse.json(item);
}
