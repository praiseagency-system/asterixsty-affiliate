import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace-guard";
import { requirePermission, permError } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url    = new URL(req.url);
  const page   = parseInt(url.searchParams.get("page") || "1");
  const limit  = parseInt(url.searchParams.get("limit") || "50");
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";

  const visualTake = url.searchParams.get("visualTake") || "";
  const group      = url.searchParams.get("group")      || "";
  const category   = url.searchParams.get("category")   || "";

  const wsId = resolveWorkspaceId(req) ?? 1;
  const where: Record<string, unknown> = { deletedAt: null, workspaceId: wsId };
  if (search) {
    where.OR = [
      { tiktokUsername: { contains: search } },
      { namaAffiliator: { contains: search } },
      { kota: { contains: search } },
      { noWhatsapp: { contains: search } },
    ];
  }
  if (status)     where.status             = status;
  if (visualTake) where.visualTake         = visualTake;
  if (category)   where.kategoriAffiliate  = { contains: category };
  if (group)      where.groups             = { contains: group };

  const [total, affiliates] = await Promise.all([
    prisma.databaseAffiliate.count({ where }),
    prisma.databaseAffiliate.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Attach sample delivery summary per affiliate
  const usernames = affiliates.map((a) => a.tiktokUsername);
  const deliveries = await prisma.sampleDelivery.findMany({
    where: { workspaceId: wsId, affiliateUsername: { in: usernames } },
    select: { affiliateUsername: true, totalVideoTarget: true, totalVideoDone: true },
  });

  const deliveryMap: Record<string, { totalSample: number; totalDone: number; totalTarget: number }> = {};
  for (const d of deliveries) {
    if (!deliveryMap[d.affiliateUsername]) {
      deliveryMap[d.affiliateUsername] = { totalSample: 0, totalDone: 0, totalTarget: 0 };
    }
    deliveryMap[d.affiliateUsername].totalSample += 1;
    deliveryMap[d.affiliateUsername].totalDone   += d.totalVideoDone;
    deliveryMap[d.affiliateUsername].totalTarget += d.totalVideoTarget;
  }

  const items = affiliates.map((a) => {
    const s = deliveryMap[a.tiktokUsername] ?? { totalSample: 0, totalDone: 0, totalTarget: 0 };
    return {
      ...a,
      totalSampleDikirim:   s.totalSample,
      totalVideoDelivered:  s.totalDone,
      totalVideoPending:    Math.max(0, s.totalTarget - s.totalDone),
    };
  });

  return NextResponse.json({ total, items, page, limit });
}

export async function POST(req: Request) {
  const check = await requirePermission(req, PERMISSIONS.CREATE_AFFILIATE);
  if ("error" in check) return permError(check);

  const wsId = resolveWorkspaceId(req) ?? 1;
  const body = await req.json();
  const item = await prisma.databaseAffiliate.create({
    data: {
      workspaceId:         wsId,
      tiktokUsername:      body.tiktokUsername || "",
      namaAffiliator:      body.namaAffiliator || "",
      status:              body.status || "Aktif",
      followers:           Number(body.followers) || 0,
      mediaPromosiFocus:   body.mediaPromosiFocus || "",
      visualTake:          body.visualTake || "",
      kategoriAffiliate:   body.kategoriAffiliate || "",
      affiliateSpecialist: body.affiliateSpecialist || "",
      alamat:              body.alamat || "",
      kota:                body.kota || "",
      provinsi:            body.provinsi || "",
      noWhatsapp:          body.noWhatsapp || "",
      tahun:               body.tahun || String(new Date().getFullYear()),
      groups:              Array.isArray(body.groups) ? JSON.stringify(body.groups) : (body.groups || "[]"),
    },
  });
  // Fire-and-forget notification
  void createNotification({
    workspaceId: wsId,
    type:  "affiliate_new",
    title: "Afiliasi baru ditambahkan",
    body:  `@${item.tiktokUsername}${item.namaAffiliator ? ` (${item.namaAffiliator})` : ""} berhasil masuk database.`,
    href:  `/affiliate/database`,
    excludeUserId: check.userId,
  });

  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (data.tiktokUsername     !== undefined) updateData.tiktokUsername     = data.tiktokUsername;
  if (data.namaAffiliator     !== undefined) updateData.namaAffiliator     = data.namaAffiliator;
  if (data.status             !== undefined) updateData.status             = data.status;
  if (data.followers          !== undefined) updateData.followers          = Number(data.followers);
  if (data.mediaPromosiFocus  !== undefined) updateData.mediaPromosiFocus  = data.mediaPromosiFocus;
  if (data.visualTake         !== undefined) updateData.visualTake         = data.visualTake;
  if (data.kategoriAffiliate  !== undefined) updateData.kategoriAffiliate  = data.kategoriAffiliate;
  if (data.affiliateSpecialist !== undefined) updateData.affiliateSpecialist = data.affiliateSpecialist;
  if (data.alamat             !== undefined) updateData.alamat             = data.alamat;
  if (data.kota               !== undefined) updateData.kota               = data.kota;
  if (data.provinsi           !== undefined) updateData.provinsi           = data.provinsi;
  if (data.noWhatsapp         !== undefined) updateData.noWhatsapp         = data.noWhatsapp;
  if (data.groups             !== undefined) {
    updateData.groups = Array.isArray(data.groups) ? JSON.stringify(data.groups) : data.groups;
  }

  const item = await prisma.databaseAffiliate.update({
    where: { id: Number(id) },
    data: updateData,
  });
  return NextResponse.json(item);
}
