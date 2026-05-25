import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const hooks = await prisma.hookFormula.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(hooks);
}
