import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { auth } from "@/auth";
import {
  getAllMultiSessionStates,
  connectMultiSession,
  type WaMultiState,
} from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

// ── GET /api/wa-sessions ──────────────────────────────────────────────────────
// Returns sessions for the current user (ownerUserId = user.id OR legacy empty).
// Also auto-seeds session 1 (Primary) if no sessions exist in DB.
export async function GET() {
  const prisma = getPrisma();
  try {
    const session = await auth();
    const userId  = session?.user?.id ?? "";

    // Show sessions owned by this user + legacy sessions (ownerUserId = "")
    let sessions = await prisma.whatsappSession.findMany({
      where: userId
        ? { OR: [{ ownerUserId: userId }, { ownerUserId: "" }] }
        : {},
      orderBy: { id: "asc" },
    });

    // Auto-seed session 1 (Primary) on first run
    if (sessions.length === 0) {
      const seed = await prisma.whatsappSession.create({
        data: {
          id:         1,
          name:       "WhatsApp Utama",
          isDefault:  true,
          isActive:   true,
          dailyLimit: 200,
          status:     "DISCONNECTED",
        },
      });
      sessions = [seed];
    }

    const multiStates = getAllMultiSessionStates();
    const stateMap    = new Map(multiStates.map((s) => [s.sessionId, s]));

    const result = sessions.map((s) => {
      const mem = stateMap.get(s.id);
      return {
        ...s,
        status:      (mem?.status ?? s.status) as WaMultiState["status"],
        qrDataUrl:   mem?.qrDataUrl   ?? null,
        phone:       mem?.phone       ?? s.phone,
        connectedAt: mem?.connectedAt ?? null,
        error:       mem?.error       ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[GET wa-sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/wa-sessions ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  const prisma = getPrisma();
  try {
    const body = await req.json() as Record<string, unknown>;

    const name       = String(body.name || "").trim();
    const dailyLimit = body.dailyLimit ? Number(body.dailyLimit) : 200;
    const isDefault  = Boolean(body.isDefault);

    if (isDefault) {
      await prisma.whatsappSession.updateMany({
        where: { isDefault: true },
        data:  { isDefault: false },
      });
    }

    const session = await auth();
    const userId  = session?.user?.id ?? "";

    const created = await prisma.whatsappSession.create({
      data: { name, dailyLimit, isDefault, status: "DISCONNECTED", ownerUserId: userId },
    });

    // Trigger connect (non-blocking) — will show QR
    connectMultiSession(created.id).catch((err) =>
      console.error(`[wa-sessions] Background connect session ${created.id} failed:`, err)
    );

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST wa-sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
