import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getWAState } from "@/lib/wa-client";

// GET /api/broadcast?status=&limit=50
export async function GET(req: Request) {
  const prisma = getPrisma();   // always get live client (handles stale singleton in dev)
  const url    = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  try {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const broadcasts = await prisma.recruitmentBroadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        _count: { select: { queueItems: true } },
      },
    });
    return NextResponse.json(broadcasts);
  } catch (err) {
    console.error("[GET broadcast]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/broadcast — create broadcast + populate WA queue
export async function POST(req: Request) {
  const prisma = getPrisma();   // always get live client (handles stale singleton in dev)
  try {
    const body = await req.json() as Record<string, unknown>;

    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });

    // Validate WA connection
    const waState = getWAState();
    if (waState.status !== "connected") {
      return NextResponse.json(
        { error: "WhatsApp belum terhubung. Hubungkan WA terlebih dahulu di Automation Center." },
        { status: 422 }
      );
    }

    const targetJson   = typeof body.targetJson === "string" ? body.targetJson : JSON.stringify(body.targetJson ?? {});
    const variations   = Array.isArray(body.variations) ? (body.variations as string[]) : [];
    const delayMode    = String(body.delayMode    || "Normal");
    // Auto-use connected phone if sender not supplied
    const senderNumber = String(body.senderNumber || waState.phone || "").trim();
    const scheduledAt  = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    const campaignId   = body.campaignId ? Number(body.campaignId) : null;
    const campaignName = String(body.campaignName || "").trim();

    // Parse target config to resolve recipients
    const target = (() => {
      try { return JSON.parse(targetJson) as {
        type?: string; groups?: string[]; categories?: string[];
        visualTakes?: string[]; manualSearch?: string;
      }; } catch { return { type: "All" }; }
    })();

    // Build Prisma where for recipients
    const where: Record<string, unknown> = { deletedAt: null, status: "Aktif" };
    if (target.type === "Manual" && target.manualSearch) {
      where.OR = [
        { tiktokUsername: { contains: target.manualSearch } },
        { namaAffiliator: { contains: target.manualSearch } },
      ];
    } else {
      const conditions: Record<string, unknown>[] = [];
      if (target.groups?.length) {
        conditions.push({ OR: target.groups.map((g: string) => ({ groups: { contains: g } })) });
      }
      if (target.categories?.length) {
        conditions.push({ OR: target.categories.map((c: string) => ({ kategoriAffiliate: { contains: c } })) });
      }
      if (target.visualTakes?.length) {
        conditions.push({ OR: target.visualTakes.map((v: string) => ({ visualTake: { contains: v } })) });
      }
      if (conditions.length > 0) where.AND = conditions;
    }

    const affiliates = await prisma.databaseAffiliate.findMany({
      where,
      select: { tiktokUsername: true, namaAffiliator: true, noWhatsapp: true },
    });

    const allMessages = [message, ...variations.filter((v) => v.trim())];
    const validRecipients = affiliates.filter((a) => a.noWhatsapp?.trim());

    // Create broadcast record
    const broadcast = await prisma.recruitmentBroadcast.create({
      data: {
        name:         String(body.name || "").trim(),
        message,
        variations:   JSON.stringify(variations),
        targetJson,
        delayMode,
        senderNumber,
        totalQueued:  validRecipients.length,
        totalSent:    0,
        totalFailed:  0,
        status:       validRecipients.length > 0 ? "queued" : "draft",
        scheduledAt,
      },
    });

    // Create queue entries for each recipient with WA number
    if (validRecipients.length > 0) {
      // Build campaign-specific message variables if campaign_id present
      let campaignMsgVars: Record<string, string> = {};
      if (campaignId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { nama: true, endDate: true, rewardConfig: true, joinSlug: true },
        });
        if (campaign) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
          campaignMsgVars = {
            campaign_name: campaign.nama,
            deadline:      campaign.endDate
              ? new Date(campaign.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
              : "TBD",
            join_link: campaign.joinSlug ? `${baseUrl}/join/${campaign.joinSlug}` : baseUrl,
            reward:    extractRewardSummary(campaign.rewardConfig),
          };
        }
      }

      const queueEntries = validRecipients.map((aff, idx) => {
        // Spin: pick a random message variant per recipient
        const baseMsg = allMessages[idx % allMessages.length];
        const resolved = resolveMessage(baseMsg, {
          username: aff.tiktokUsername,
          nama:     aff.namaAffiliator || aff.tiktokUsername,
          ...campaignMsgVars,
        });

        return {
          broadcastId:   broadcast.id,
          phone:         aff.noWhatsapp,
          message:       resolved,
          recipientName: aff.namaAffiliator || aff.tiktokUsername,
          tiktokUsername: aff.tiktokUsername,
          campaignId,
          campaignName:  campaignName || campaignMsgVars.campaign_name || "",
          delayMode,
          status:        "pending" as const,
          scheduledAt,
        };
      });

      // Batch insert (SQLite: chunked to avoid query size limits)
      const CHUNK = 100;
      for (let i = 0; i < queueEntries.length; i += CHUNK) {
        await prisma.waMessageQueue.createMany({ data: queueEntries.slice(i, i + CHUNK) });
      }
    }

    return NextResponse.json({
      ...broadcast,
      queueCreated: validRecipients.length,
      skippedNoWA:  affiliates.length - validRecipients.length,
    }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[POST broadcast]", msg, err);
    // Return real error in dev so it's visible in the UI toast
    const displayErr = process.env.NODE_ENV === "development"
      ? `Server error: ${msg}`
      : "Internal server error — cek console server untuk detail";
    return NextResponse.json({ error: displayErr }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function resolveMessage(msg: string, vars: Record<string, string>): string {
  return msg.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function extractRewardSummary(rewardConfigJson: string): string {
  try {
    const cfg = JSON.parse(rewardConfigJson) as {
      fixed?:      { rewardPerVideo?: number };
      leaderboard?: { rank?: number; reward?: number }[];
      consistency?: { rewardAmount?: number };
    };
    const parts: string[] = [];
    if (cfg.leaderboard?.length) {
      const top = cfg.leaderboard.find((r) => r.rank === 1);
      if (top?.reward) parts.push(`Rank 1: Rp${(top.reward / 1000).toFixed(0)}rb`);
    }
    if (cfg.fixed?.rewardPerVideo) parts.push(`Rp${cfg.fixed.rewardPerVideo.toLocaleString("id-ID")}/video`);
    if (cfg.consistency?.rewardAmount) parts.push(`Consistency: Rp${(cfg.consistency.rewardAmount / 1000).toFixed(0)}rb`);
    return parts.join(" · ") || "Lihat detail campaign";
  } catch { return "Lihat detail campaign"; }
}
