import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ slug: string }> };

// GET — fetch campaign info for public join page
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { joinSlug: slug, deletedAt: null },
      select: {
        id: true, nama: true, deskripsi: true, bannerPath: true,
        status: true, visibility: true, objectives: true,
        affiliateCategories: true, visualTake: true,
        rewardConfig: true, rewardDeskripsi: true,
        maxParticipants: true, startDate: true, endDate: true,
        approvalMode: true,
        participants: { where: { status: { in: ["Active", "Completed", "Approved"] } }, select: { id: true } },
      },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign tidak ditemukan" }, { status: 404 });
    if (["Draft", "Ready"].includes(campaign.status)) {
      return NextResponse.json({ error: "Campaign belum tersedia untuk bergabung" }, { status: 403 });
    }
    if (campaign.status === "Ended") {
      return NextResponse.json({ error: "Campaign sudah berakhir" }, { status: 410 });
    }
    if (campaign.visibility === "Specialist Only") {
      return NextResponse.json({ error: "Campaign ini hanya untuk undangan" }, { status: 403 });
    }
    const participantCount = campaign.participants.length;
    const isFull = campaign.maxParticipants > 0 && participantCount >= campaign.maxParticipants;
    return NextResponse.json({ ...campaign, participants: undefined, participantCount, isFull });
  } catch (err) {
    console.error("[GET join]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST — submit join request
export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  try {
    const body = await req.json() as {
      tiktokUsername: string;
      namaAffiliate?: string;
      whatsapp?: string;
      category?: string;
      visualTake?: string;
    };

    const username = String(body.tiktokUsername || "").trim();
    if (!username) return NextResponse.json({ error: "TikTok username wajib diisi" }, { status: 400 });

    const campaign = await prisma.campaign.findFirst({
      where: { joinSlug: slug, deletedAt: null },
      select: { id: true, status: true, approvalMode: true, maxParticipants: true,
                participants: { where: { status: { in: ["Active","Completed","Approved","Pending"] } }, select: { id: true } } },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign tidak ditemukan" }, { status: 404 });
    if (campaign.status === "Ended") return NextResponse.json({ error: "Campaign sudah berakhir" }, { status: 410 });
    if (campaign.maxParticipants > 0 && campaign.participants.length >= campaign.maxParticipants) {
      return NextResponse.json({ error: "Slot peserta sudah penuh" }, { status: 409 });
    }

    const initialStatus = campaign.approvalMode === "Manual" ? "Pending" : "Active";
    try {
      const participant = await prisma.campaignParticipant.create({
        data: {
          campaignId:    campaign.id,
          tiktokUsername: username,
          namaAffiliate: String(body.namaAffiliate || "").trim(),
          whatsapp:      String(body.whatsapp      || "").trim(),
          category:      String(body.category      || "").trim(),
          visualTake:    String(body.visualTake    || "").trim(),
          status:        initialStatus,
        },
      });
      return NextResponse.json({ ok: true, status: participant.status }, { status: 201 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Unique constraint")) {
        return NextResponse.json({ error: "Kamu sudah terdaftar di campaign ini" }, { status: 409 });
      }
      throw err;
    }
  } catch (err) {
    console.error("[POST join]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
