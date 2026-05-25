import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/broadcast/recipients?groups=VIP,Worth+It&categories=Skincare&visualTakes=Inframe&manualIds=1,2,3&type=All
export async function GET(req: Request) {
  const prisma = getPrisma();
  const url         = new URL(req.url);
  const type        = url.searchParams.get("type")        || "All";
  const groups      = url.searchParams.get("groups")      || "";
  const categories  = url.searchParams.get("categories")  || "";
  const visualTakes = url.searchParams.get("visualTakes") || "";
  const manualIds   = url.searchParams.get("manualIds")   || "";
  const previewOnly = url.searchParams.get("preview") !== "false";

  try {
    const where: Record<string, unknown> = { deletedAt: null, status: "Aktif" };

    if (type === "Manual" && manualIds) {
      const ids = manualIds.split(",").map(Number).filter(Boolean);
      where.id = { in: ids };
    } else {
      // AND logic: all selected filters must match
      const conditions: Record<string, unknown>[] = [];

      if (groups) {
        const gList = groups.split(",").map((g) => g.trim()).filter(Boolean);
        if (gList.length > 0) {
          // Each affiliate must have at least one of the selected groups
          conditions.push({
            OR: gList.map((g) => ({ groups: { contains: g } })),
          });
        }
      }

      if (categories) {
        const cList = categories.split(",").map((c) => c.trim()).filter(Boolean);
        if (cList.length > 0) {
          conditions.push({
            OR: cList.map((c) => ({ kategoriAffiliate: { contains: c } })),
          });
        }
      }

      if (visualTakes) {
        const vList = visualTakes.split(",").map((v) => v.trim()).filter(Boolean);
        if (vList.length > 0) {
          conditions.push({
            OR: vList.map((v) => ({ visualTake: { contains: v } })),
          });
        }
      }

      if (conditions.length > 0) {
        where.AND = conditions;
      }
    }

    const affiliates = await prisma.databaseAffiliate.findMany({
      where,
      select: {
        id: true,
        tiktokUsername: true,
        namaAffiliator: true,
        noWhatsapp: true,
        kategoriAffiliate: true,
        visualTake: true,
        groups: true,
        status: true,
      },
      orderBy: { namaAffiliator: "asc" },
      ...(previewOnly ? { take: 500 } : {}),
    });

    const total      = affiliates.length;
    const withWA     = affiliates.filter((a) => a.noWhatsapp?.trim()).length;
    const preview    = affiliates.slice(0, 10).map((a) => ({
      id: a.id,
      username: a.tiktokUsername,
      nama: a.namaAffiliator,
      wa: a.noWhatsapp,
      kategori: a.kategoriAffiliate,
      vt: a.visualTake,
      groups: a.groups,
    }));

    return NextResponse.json({ total, withWA, preview, affiliates: previewOnly ? [] : affiliates });
  } catch (err) {
    console.error("[GET broadcast/recipients]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
