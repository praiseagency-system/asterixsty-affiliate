import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getWAState } from "@/lib/wa-client";
import { getAllMultiSessionStates, connectMultiSession, type WaMultiState } from "@/lib/wa-multi-client";

export const dynamic = "force-dynamic";

function legacyStatusToMulti(status: string): WaMultiState["status"] {
  switch (status) {
    case "connected":    return "CONNECTED";
    case "connecting":   return "CONNECTING";
    case "qr_ready":     return "QR_READY";
    case "reconnecting": return "RECONNECTING";
    default:             return "DISCONNECTED";
  }
}

// GET /api/wa-sessions
export async function GET() {
  const prisma = getPrisma();
  try {
    const sessions = await prisma.whatsappSession.findMany({
      orderBy: { id: "asc" },
    });

    const multiStates = getAllMultiSessionStates();
    const stateMap = new Map(multiStates.map((s) => [s.sessionId, s]));

    const waState = getWAState();

    const result = sessions.map((s) => {
      if (s.id === 1) {
        return {
          ...s,
          status:      legacyStatusToMulti(waState.status),
          qrDataUrl:   waState.qrDataUrl,
          phone:       waState.phone ?? s.phone,
          connectedAt: waState.connectedAt,
          error:       waState.error,
        };
      }

      const mem = stateMap.get(s.id);
      return {
        ...s,
        status:      mem?.status      ?? s.status as WaMultiState["status"],
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

// POST /api/wa-sessions
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

    const created = await prisma.whatsappSession.create({
      data: {
        name,
        dailyLimit,
        isDefault,
        status: "DISCONNECTED",
      },
    });

    // Connect in background (don't await)
    if (created.id > 1) {
      connectMultiSession(created.id).catch((err) =>
        console.error(`[wa-sessions] Background connect session ${created.id} failed:`, err)
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST wa-sessions]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
