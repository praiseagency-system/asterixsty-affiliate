import { NextResponse } from "next/server";
import {

export const dynamic = "force-dynamic";
  approveCampaignRegistration,
  rejectCampaignRegistration,
} from "@/lib/google-forms-campaign";

type Params = { params: Promise<{ id: string; regId: string }> };

// POST /api/campaigns/[id]/registrations/[regId]
// Body: { action: "approve" | "reject"; reason?: string }
export async function POST(req: Request, { params }: Params) {
  const { regId } = await params;
  const regIdNum  = Number(regId);

  try {
    const body   = await req.json() as { action?: string; reason?: string };
    const action = body.action;

    if (action === "approve") {
      const result = await approveCampaignRegistration(regIdNum);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (action === "reject") {
      const result = await rejectCampaignRegistration(regIdNum, body.reason);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action tidak valid (approve|reject)" }, { status: 400 });
  } catch (err) {
    console.error("[POST /api/campaigns/:id/registrations/:regId]", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
