import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const [campaign, participants] = await Promise.all([
      prisma.campaign.findUnique({ where: { id: Number(id) } }),
      prisma.campaignParticipant.findMany({ where: { campaignId: Number(id) } }),
    ]);

    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const active    = participants.filter((p) => p.status === "Active" || p.status === "Completed");
    const completed = participants.filter((p) => p.status === "Completed");
    const uploaders = active.filter((p) => p.videoCount > 0);

    const totalVideos = active.reduce((s, p) => s + p.videoCount, 0);
    const totalViews  = active.reduce((s, p) => s + p.views, 0);
    const totalGmv    = active.reduce((s, p) => s + p.gmvContributed, 0);

    // Rankings
    const byVideos = [...active].sort((a, b) => b.videoCount - a.videoCount).slice(0, 5);
    const byViews  = [...active].sort((a, b) => b.views - a.views).slice(0, 5);
    const byGmv    = [...active].sort((a, b) => b.gmvContributed - a.gmvContributed).slice(0, 5);

    // Category breakdown
    const categoryMap: Record<string, { videoCount: number; gmv: number; count: number }> = {};
    for (const p of active) {
      const cat = p.category || "Unknown";
      if (!categoryMap[cat]) categoryMap[cat] = { videoCount: 0, gmv: 0, count: 0 };
      categoryMap[cat].videoCount += p.videoCount;
      categoryMap[cat].gmv        += p.gmvContributed;
      categoryMap[cat].count      += 1;
    }

    // Visual take breakdown
    const vtMap: Record<string, { videoCount: number; count: number }> = {};
    for (const p of active) {
      const vt = p.visualTake || "Unknown";
      if (!vtMap[vt]) vtMap[vt] = { videoCount: 0, count: 0 };
      vtMap[vt].videoCount += p.videoCount;
      vtMap[vt].count      += 1;
    }

    // Join trend — by day (last 30 days)
    const joinTrend: Record<string, number> = {};
    for (const p of participants) {
      const day = p.joinedAt.toISOString().slice(0, 10);
      joinTrend[day] = (joinTrend[day] ?? 0) + 1;
    }

    const completionRate = active.length > 0
      ? Math.round((completed.length / active.length) * 100)
      : 0;

    return NextResponse.json({
      summary: {
        totalParticipants: participants.length,
        activeParticipants: active.length,
        completedParticipants: completed.length,
        completionRate,
        totalVideos,
        totalViews,
        totalGmv,
        activeUploaders: uploaders.length,
        avgVideosPerCreator: uploaders.length > 0 ? +(totalVideos / uploaders.length).toFixed(1) : 0,
      },
      topByVideos: byVideos.map((p) => ({ username: p.tiktokUsername, nama: p.namaAffiliate, value: p.videoCount })),
      topByViews:  byViews.map((p) => ({ username: p.tiktokUsername, nama: p.namaAffiliate, value: p.views })),
      topByGmv:    byGmv.map((p) => ({ username: p.tiktokUsername, nama: p.namaAffiliate, value: p.gmvContributed })),
      categoryBreakdown: Object.entries(categoryMap).map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.gmv - a.gmv),
      vtBreakdown: Object.entries(vtMap).map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.videoCount - a.videoCount),
      joinTrend: Object.entries(joinTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    });
  } catch (err) {
    console.error("[GET analytics]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
