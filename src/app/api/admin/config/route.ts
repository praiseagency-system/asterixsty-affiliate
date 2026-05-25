import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/tier";

export const dynamic = "force-dynamic";

export interface DeadlineConfig {
  durasiPengiriman: number;   // default 5
  durasiVideo1: number;       // default 3
  durasiVideo2: number;       // default 3
  durasiVideo3: number;       // default 4
  finalWarningDelay: number;  // default 5
  reminderOverdue: boolean;   // default true
}

const DEADLINE_DEFAULTS: DeadlineConfig = {
  durasiPengiriman: 5,
  durasiVideo1: 3,
  durasiVideo2: 3,
  durasiVideo3: 4,
  finalWarningDelay: 5,
  reminderOverdue: true,
};

async function getDeadlineConfig(): Promise<DeadlineConfig> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: Object.keys(DEADLINE_DEFAULTS) } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    durasiPengiriman:  Number(map.durasiPengiriman  ?? DEADLINE_DEFAULTS.durasiPengiriman),
    durasiVideo1:      Number(map.durasiVideo1      ?? DEADLINE_DEFAULTS.durasiVideo1),
    durasiVideo2:      Number(map.durasiVideo2      ?? DEADLINE_DEFAULTS.durasiVideo2),
    durasiVideo3:      Number(map.durasiVideo3      ?? DEADLINE_DEFAULTS.durasiVideo3),
    finalWarningDelay: Number(map.finalWarningDelay ?? DEADLINE_DEFAULTS.finalWarningDelay),
    reminderOverdue:   map.reminderOverdue !== undefined ? map.reminderOverdue === "true" : DEADLINE_DEFAULTS.reminderOverdue,
  };
}

async function saveDeadlineConfig(cfg: Partial<DeadlineConfig>) {
  const entries: { key: string; value: string }[] = [];
  if (cfg.durasiPengiriman  !== undefined) entries.push({ key: "durasiPengiriman",  value: String(cfg.durasiPengiriman) });
  if (cfg.durasiVideo1      !== undefined) entries.push({ key: "durasiVideo1",      value: String(cfg.durasiVideo1) });
  if (cfg.durasiVideo2      !== undefined) entries.push({ key: "durasiVideo2",      value: String(cfg.durasiVideo2) });
  if (cfg.durasiVideo3      !== undefined) entries.push({ key: "durasiVideo3",      value: String(cfg.durasiVideo3) });
  if (cfg.finalWarningDelay !== undefined) entries.push({ key: "finalWarningDelay", value: String(cfg.finalWarningDelay) });
  if (cfg.reminderOverdue   !== undefined) entries.push({ key: "reminderOverdue",   value: String(cfg.reminderOverdue) });

  for (const { key, value } of entries) {
    await prisma.appConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

// ─── GET /api/admin/config ─────────────────────────────────────────────────
export async function GET() {
  const [tierConfig, scoreRows, deadlineConfig] = await Promise.all([
    prisma.tierConfig.findMany({ orderBy: { minGmv: "desc" } }),
    prisma.scoreConfig.findMany({ where: { level: { gt: 0 } }, orderBy: [{ komponen: "asc" }, { minValue: "asc" }] }),
    getDeadlineConfig(),
  ]);

  const gmvCriteria = scoreRows
    .filter((r) => r.komponen === "gmv")
    .sort((a, b) => a.minValue - b.minValue)
    .map((r, i) => ({ id: r.id, minValue: r.minValue, point: i + 1 }));

  const qtyCriteria = scoreRows
    .filter((r) => r.komponen === "qty")
    .sort((a, b) => a.minValue - b.minValue)
    .map((r, i) => ({ id: r.id, minValue: r.minValue, point: i + 1 }));

  return NextResponse.json({ tierConfig, gmvCriteria, qtyCriteria, deadlineConfig });
}

// ─── PUT /api/admin/config ─────────────────────────────────────────────────
export async function PUT(req: Request) {
  const body = await req.json();
  const { tierConfig, gmvCriteria, qtyCriteria, deadlineConfig } = body as {
    tierConfig: { id: number; tier: string; label: string; minGmv: number; color: string }[];
    gmvCriteria: { minValue: number }[];
    qtyCriteria: { minValue: number }[];
    deadlineConfig?: Partial<DeadlineConfig>;
  };

  function isAscending(rows: { minValue: number }[]) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].minValue <= rows[i - 1].minValue) return false;
    }
    return true;
  }
  if (gmvCriteria?.length > 1 && !isAscending(gmvCriteria)) {
    return NextResponse.json({ error: "GMV Kriteria harus urut ascending" }, { status: 400 });
  }
  if (qtyCriteria?.length > 1 && !isAscending(qtyCriteria)) {
    return NextResponse.json({ error: "Qty Kriteria harus urut ascending" }, { status: 400 });
  }

  if (tierConfig?.length) {
    await Promise.all(
      tierConfig.map((c) =>
        prisma.tierConfig.update({ where: { id: c.id }, data: { tier: c.tier, label: c.label, minGmv: c.minGmv, color: c.color } })
      )
    );
  }

  if (gmvCriteria !== undefined) {
    await prisma.scoreConfig.deleteMany({ where: { komponen: "gmv" } });
    if (gmvCriteria.length > 0) {
      await prisma.scoreConfig.createMany({
        data: gmvCriteria
          .sort((a, b) => a.minValue - b.minValue)
          .map((row, i) => ({
            komponen: "gmv",
            minValue: row.minValue,
            level:    i + 1,
            label:    `≥ ${row.minValue.toLocaleString("id-ID")}`,
          })),
      });
    }
  }

  if (qtyCriteria !== undefined) {
    await prisma.scoreConfig.deleteMany({ where: { komponen: "qty" } });
    if (qtyCriteria.length > 0) {
      await prisma.scoreConfig.createMany({
        data: qtyCriteria
          .sort((a, b) => a.minValue - b.minValue)
          .map((row, i) => ({
            komponen: "qty",
            minValue: row.minValue,
            level:    i + 1,
            label:    `≥ ${row.minValue} pcs`,
          })),
      });
    }
  }

  if (deadlineConfig) {
    await saveDeadlineConfig(deadlineConfig);
  }

  invalidateCache();
  return NextResponse.json({ ok: true });
}
