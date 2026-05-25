import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const AUTOMATION_KEYS = [
  "automationEnabled",
  "waAutomationEnabled",
  "overdueWarningEnabled",
  "autoReconnectEnabled",
] as const;

export async function GET() {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: [...AUTOMATION_KEYS] } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return NextResponse.json({
    automationEnabled:    map.automationEnabled !== "false",
    waAutomationEnabled:  map.waAutomationEnabled !== "false",
    overdueWarningEnabled: map.overdueWarningEnabled !== "false",
    autoReconnectEnabled: map.autoReconnectEnabled !== "false",
  });
}

export async function PUT(req: Request) {
  const body = await req.json() as Partial<Record<typeof AUTOMATION_KEYS[number], boolean>>;

  for (const key of AUTOMATION_KEYS) {
    if (key in body) {
      const value = String(body[key]);
      await prisma.appConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
