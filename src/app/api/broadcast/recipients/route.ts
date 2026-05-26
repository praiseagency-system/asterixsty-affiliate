import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/broadcast/recipients
// Params: type, groups, categories, visualTakes, manualIds, excludeIds, search, limit
export async function GET(req: Request) {
  const prisma = getPrisma();
  const url         = new URL(req.url);
  const type        = url.searchParams.get("type")        || "All";
  const groups      = url.searchParams.get("groups")      || "";
  const categories  = url.searchParams.get("categories")  || "";
  const visualTakes = url.searchParams.get("visualTakes") || "";
  const manualIds   = url.searchParams.get("manualIds")   || "";
  const excludeIds  = url.searchParams.get("excludeIds")  || "";
  const search      = url.searchParams.get("search")      || "";
  const limit       = Math.min(parseInt(url.searchParams.get("limit") || "300"), 500);

  try {
    const where: Record<string, unknown> = { deletedAt: null, status: "Aktif" };

    if (type === "Manual" && manualIds) {
      // Manual include mode: only these specific IDs
      const ids = manualIds.split(",").map(Number).filter(Boolean);
      if (ids.length > 0) where.id = { in: ids };
    } else {
      // Build AND-joined conditions
      const conditions: Record<string, unknown>[] = [];

      if (groups && type !== "Manual") {
        const gList = groups.split(",").map((g) => g.trim()).filter(Boolean);
        if (gList.length > 0) {
          conditions.push({ OR: gList.map((g) => ({ groups: { contains: g } })) });
        }
      }

      if (categories && type !== "Manual") {
        const cList = categories.split(",").map((c) => c.trim()).filter(Boolean);
        if (cList.length > 0) {
          conditions.push({ OR: cList.map((c) => ({ kategoriAffiliate: { contains: c } })) });
        }
      }

      if (visualTakes && type !== "Manual") {
        const vList = visualTakes.split(",").map((v) => v.trim()).filter(Boolean);
        if (vList.length > 0) {
          conditions.push({ OR: vList.map((v) => ({ visualTake: { contains: v } })) });
        }
      }

      // Free-text search — works for all type modes (used by picker UI)
      if (search.trim()) {
        const q = search.trim();
        conditions.push({
          OR: [
            { tiktokUsername:    { contains: q } },
            { namaAffiliator:   { contains: q } },
            { kategoriAffiliate:{ contains: q } },
            { visualTake:       { contains: q } },
            { noWhatsapp:       { contains: q } },
            { kota:             { contains: q } },
          ],
        });
      }

      if (conditions.length > 0) where.AND = conditions;
    }

    // Apply excludeIds — always subtract these from the result
    if (excludeIds) {
      const eIds = excludeIds.split(",").map(Number).filter(Boolean);
      if (eIds.length > 0) {
        const existing = where.id as { in?: number[]; notIn?: number[] } | undefined;
        where.id = existing ? { ...existing, notIn: eIds } : { notIn: eIds };
      }
    }

    const affiliates = await prisma.databaseAffiliate.findMany({
      where,
      select: {
        id:                true,
        tiktokUsername:    true,
        namaAffiliator:    true,
        noWhatsapp:        true,
        kategoriAffiliate: true,
        visualTake:        true,
        groups:            true,
        kota:              true,
        status:            true,
      },
      orderBy: { namaAffiliator: "asc" },
      take: limit,
    });

    const total   = affiliates.length;
    const withWA  = affiliates.filter((a) => a.noWhatsapp?.trim()).length;
    const preview = affiliates.slice(0, 10).map((a) => ({
      id:       a.id,
      username: a.tiktokUsername,
      nama:     a.namaAffiliator,
      wa:       a.noWhatsapp,
      kategori: a.kategoriAffiliate,
      vt:       a.visualTake,
      groups:   a.groups,
    }));

    // Always return affiliate list (for checkbox picker UI)
    const affiliateList = affiliates.map((a) => ({
      id:       a.id,
      username: a.tiktokUsername,
      nama:     a.namaAffiliator,
      wa:       a.noWhatsapp?.trim() || "",
      kategori: a.kategoriAffiliate,
      vt:       a.visualTake,
      groups:   a.groups,
      kota:     a.kota,
    }));

    return NextResponse.json({ total, withWA, preview, affiliates: affiliateList });
  } catch (err) {
    console.error("[GET broadcast/recipients]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
