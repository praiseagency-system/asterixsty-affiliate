import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") ?? 20)));
  const skip  = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.reminderLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.reminderLog.count(),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}

// DELETE all logs
export async function DELETE() {
  await prisma.reminderLog.deleteMany();
  return NextResponse.json({ ok: true });
}
