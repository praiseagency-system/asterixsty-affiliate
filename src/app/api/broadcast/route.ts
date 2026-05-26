import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { isAnySessionConnected, getPrimaryPhone } from "@/lib/wa-multi-client";
import { resolveWorkspaceId } from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

// GET /api/broadcast?status=&limit=50
export async function GET(req: Request) {
  const prisma = getPrisma();   // always get live client (handles stale singleton in dev)
  const url    = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const limit  = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  try {
    const wsId = resolveWorkspaceId(req) ?? 1;
    const where: Record<string, unknown> = { workspaceId: wsId };
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
    const wsId = resolveWorkspaceId(req) ?? 1;
    const body = await req.json() as Record<string, unknown>;

    const message = String(body.message || "").trim();
    if (!message) return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });

    // Validate WA connection — any session must be connected
    if (!isAnySessionConnected()) {
      return NextResponse.json(
        { error: "WhatsApp belum terhubung. Hubungkan minimal satu akun di Automation Center." },
        { status: 422 }
      );
    }

    const targetJson        = typeof body.targetJson === "string" ? body.targetJson : JSON.stringify(body.targetJson ?? {});
    const variations        = Array.isArray(body.variations) ? (body.variations as string[]) : [];
    const delayMode         = String(body.delayMode         || "Normal");
    const rewardDisplayMode = String(body.rewardDisplayMode || "Auto Summary");
    const customRewardText  = String(body.customRewardText  || "");
    const durationFormat    = String(body.durationFormat    || "Date Range");
    const senderMode        = String(body.senderMode || "Single");
    const senderSessionIds: number[] = Array.isArray(body.senderSessionIds)
      ? (body.senderSessionIds as number[]).filter((n) => !isNaN(Number(n))).map(Number)
      : [];
    // Auto-use connected phone if sender not supplied
    const senderNumber = String(body.senderNumber || getPrimaryPhone() || "").trim();
    const scheduledAt  = body.scheduledAt ? new Date(String(body.scheduledAt)) : null;
    const campaignId   = body.campaignId ? Number(body.campaignId) : null;
    const campaignName = String(body.campaignName || "").trim();

    // Parse target config to resolve recipients
    const target = (() => {
      try { return JSON.parse(targetJson) as {
        type?: string; groups?: string[]; categories?: string[];
        visualTakes?: string[]; manualSearch?: string;
        manualIds?: number[]; excludeIds?: number[];
      }; } catch { return { type: "All" }; }
    })();

    // Build Prisma where for recipients (scoped to this workspace)
    const where: Record<string, unknown> = { deletedAt: null, status: "Aktif", workspaceId: wsId };
    if (target.type === "Manual") {
      if (target.manualIds?.length) {
        // Explicit ID list takes priority over text search
        where.id = { in: target.manualIds };
      } else if (target.manualSearch) {
        where.OR = [
          { tiktokUsername: { contains: target.manualSearch } },
          { namaAffiliator: { contains: target.manualSearch } },
        ];
      }
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

    // Apply excludeIds — remove specific creators from any target type
    if (target.excludeIds?.length) {
      const existing = where.id as { in?: number[]; notIn?: number[] } | undefined;
      where.id = existing
        ? { ...existing, notIn: target.excludeIds }
        : { notIn: target.excludeIds };
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
        workspaceId:     wsId,
        name:            String(body.name || "").trim(),
        message,
        variations:      JSON.stringify(variations),
        targetJson,
        delayMode,
        senderNumber,
        senderMode,
        senderSessionIds: JSON.stringify(senderSessionIds),
        totalQueued:     validRecipients.length,
        totalSent:       0,
        totalFailed:     0,
        status:          validRecipients.length > 0 ? "queued" : "draft",
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
          select: {
            nama:            true,
            startDate:       true,
            endDate:         true,
            rewardConfig:    true,
            rewardDeskripsi: true,
            joinSlug:        true,
            picSpecialist:   { select: { nama: true } },
            // Google Form URLs live in the related CampaignForm record
            campaignForm: { select: { regFormPublicId: true, subFormPublicId: true } },
          },
        });
        if (campaign) {
          const GFORM           = "https://docs.google.com/forms/d/e";
          const regPublicId     = campaign.campaignForm?.regFormPublicId?.trim();
          const subPublicId     = campaign.campaignForm?.subFormPublicId?.trim();
          const baseUrl         = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

          // Prefer the campaign's Google Registration Form; fallback to internal join slug
          const joinLink        = regPublicId
            ? `${GFORM}/${regPublicId}/viewform`
            : campaign.joinSlug ? `${baseUrl}/join/${campaign.joinSlug}` : baseUrl;

          // Submission form URL (Google Form only — no internal fallback for submissions)
          const submissionLink  = subPublicId ? `${GFORM}/${subPublicId}/viewform` : "";

          const rewardSection    = buildRewardSection(rewardDisplayMode, campaign.rewardConfig, campaign.rewardDeskripsi ?? "", customRewardText);
          const campaignDuration = buildCampaignDuration(durationFormat, campaign.startDate, campaign.endDate);
          const picName          = campaign.picSpecialist?.nama ?? "";

          campaignMsgVars = {
            campaign_name:      campaign.nama,
            reward_section:     rewardSection,
            campaign_duration:  campaignDuration,
            join_link:          joinLink,
            submission_link:    submissionLink,
            pic_name:           picName,
            // backward-compat aliases
            reward:             rewardSection,
            deadline:           campaignDuration,
            link:               joinLink,
          };
        }
      }

      const totalRecipients = validRecipients.length;
      const queueEntries = validRecipients.map((aff, idx) => {
        // Spin: pick a random message variant per recipient
        const baseMsg = allMessages[idx % allMessages.length];
        const resolved = resolveMessage(baseMsg, {
          username: aff.tiktokUsername,
          nama:     aff.namaAffiliator || aff.tiktokUsername,
          ...campaignMsgVars,
        });

        const assignedSessionId = assignSenderSession(idx, senderMode, senderSessionIds, totalRecipients);

        return {
          broadcastId:    broadcast.id,
          workspaceId:    wsId,
          phone:          aff.noWhatsapp,
          message:        resolved,
          recipientName:  aff.namaAffiliator || aff.tiktokUsername,
          tiktokUsername: aff.tiktokUsername,
          campaignId,
          campaignName:   campaignName || campaignMsgVars.campaign_name || "",
          delayMode,
          status:         "pending" as const,
          scheduledAt,
          ...(assignedSessionId !== null ? { senderSessionId: assignedSessionId } : {}),
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
function assignSenderSession(
  idx:        number,
  mode:       string,
  sessionIds: number[],
  total:      number,
): number | null {
  if (!sessionIds.length) return null;
  if (mode === "Single")   return sessionIds[0];
  if (mode === "Rotation") return sessionIds[idx % sessionIds.length];
  if (mode === "Batch") {
    const batchSize = Math.ceil(total / sessionIds.length);
    return sessionIds[Math.min(Math.floor(idx / batchSize), sessionIds.length - 1)];
  }
  return null;
}

function resolveMessage(msg: string, vars: Record<string, string>): string {
  return msg.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

interface RewardCfg {
  leaderboard?: { rank?: number; reward?: number; label?: string }[];
  fixed?:       { rewardPerVideo?: number };
  consistency?: { rewardAmount?: number };
  total?:       number;
}

function fmtRupiah(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} juta`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}rb`;
  return n.toLocaleString("id-ID");
}

function buildRewardSection(
  mode:             string,
  rewardConfigJson: string,
  rewardDeskripsi:  string,
  customText:       string,
): string {
  if (mode === "Hide Reward") return "";
  if (mode === "Custom Text") return customText ? `🎁 Reward:\n${customText}` : "";

  let cfg: RewardCfg = {};
  try { cfg = JSON.parse(rewardConfigJson) as RewardCfg; } catch { /* empty */ }

  if (mode === "Auto Summary") {
    const parts: string[] = [];
    if (cfg.leaderboard?.length) {
      const top = Math.max(...cfg.leaderboard.map((r) => r.reward ?? 0));
      if (top > 0) parts.push(`hingga Rp${fmtRupiah(top)}`);
    }
    if (cfg.fixed?.rewardPerVideo)   parts.push(`Rp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`);
    if (cfg.consistency?.rewardAmount) parts.push(`bonus konsistensi`);
    if (parts.length) return `🎁 Reward ${parts.join(" + ")}`;
    return rewardDeskripsi ? `🎁 Reward:\n${rewardDeskripsi}` : "🎁 Reward menarik menanti!";
  }

  if (mode === "Prize Pool") {
    let total = cfg.total ?? 0;
    if (!total && cfg.leaderboard?.length)
      total = cfg.leaderboard.reduce((s, r) => s + (r.reward ?? 0), 0);
    if (!total && cfg.consistency?.rewardAmount) total += cfg.consistency.rewardAmount;
    if (!total && cfg.fixed?.rewardPerVideo)
      return `🎁 Reward:\nRp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`;
    return total > 0 ? `🎁 Total Prize Pool:\nRp${total.toLocaleString("id-ID")}` : "🎁 Reward menarik!";
  }

  if (mode === "Detail Reward") {
    const lines = ["🏆 Reward:"];
    if (cfg.leaderboard?.length) {
      cfg.leaderboard.forEach((r) => {
        lines.push(`${r.label || `Juara ${r.rank ?? "?"}`} — Rp${(r.reward ?? 0).toLocaleString("id-ID")}`);
      });
    }
    if (cfg.fixed?.rewardPerVideo)     lines.push(`Rp${fmtRupiah(cfg.fixed.rewardPerVideo)}/video`);
    if (cfg.consistency?.rewardAmount) lines.push(`+ Bonus konsistensi: Rp${fmtRupiah(cfg.consistency.rewardAmount)}`);
    if (lines.length === 1) return rewardDeskripsi ? `🏆 Reward:\n${rewardDeskripsi}` : "🏆 Reward menarik!";
    return lines.join("\n");
  }

  return rewardDeskripsi ? `🎁 Reward:\n${rewardDeskripsi}` : "🎁 Reward menarik!";
}

function buildCampaignDuration(
  format:    string,
  startDate: Date | null,
  endDate:   Date | null,
): string {
  if (!startDate && !endDate) return "";
  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  if (format === "Total Days" && startDate && endDate) {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} Hari`;
  }

  // Date Range (default)
  if (startDate && endDate) return `${fmt(startDate)} - ${fmt(endDate)}`;
  if (endDate)              return `s/d ${fmt(endDate)}`;
  return fmt(startDate!);
}
