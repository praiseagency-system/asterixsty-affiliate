import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalLogs, todaySent, todayFailed, totalPending] = await Promise.all([
    prisma.reminderLog.count(),
    prisma.reminderLog.count({ where: { status: "sent", createdAt: { gte: today, lt: tomorrow } } }),
    prisma.reminderLog.count({ where: { status: "failed", createdAt: { gte: today, lt: tomorrow } } }),
    // Deliveries that are overdue and not fully done
    prisma.sampleDelivery.count({
      where: {
        deletedAt: null,
        statusProgress: { not: "Selesai" },
      },
    }),
  ]);

  // Get automation config flags
  const configRows = await prisma.appConfig.findMany({
    where: {
      key: { in: ["automationEnabled", "waAutomationEnabled", "overdueWarningEnabled", "autoReconnectEnabled"] },
    },
  });
  const configMap: Record<string, string> = {};
  for (const r of configRows) configMap[r.key] = r.value;

  return NextResponse.json({
    totalLogs,
    todaySent,
    todayFailed,
    totalPending,
    config: {
      automationEnabled:    configMap.automationEnabled !== "false",
      waAutomationEnabled:  configMap.waAutomationEnabled !== "false",
      overdueWarningEnabled: configMap.overdueWarningEnabled !== "false",
      autoReconnectEnabled: configMap.autoReconnectEnabled !== "false",
    },
  });
}
