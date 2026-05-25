import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getWAState } from "@/lib/wa-client";
import { getMultiSessionState, disconnectMultiSession, type WaMultiState } from "@/lib/wa-multi-client";

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

// GET /api/wa-sessions/[id]
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id     = Number(idStr);
  const prisma = getPrisma();

  try {
    const session = await prisma.whatsappSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (id === 1) {
      const waState = getWAState();
      return NextResponse.json({
        ...session,
        status:      legacyStatusToMulti(waState.status),
        qrDataUrl:   waState.qrDataUrl,
        phone:       waState.phone ?? session.phone,
        connectedAt: waState.connectedAt,
        error:       waState.error,
      });
    }

    const mem = getMultiSessionState(id);
    return NextResponse.json({
      ...session,
      status:      mem?.status      ?? session.status as WaMultiState["status"],
      qrDataUrl:   mem?.qrDataUrl   ?? null,
      phone:       mem?.phone       ?? session.phone,
      connectedAt: mem?.connectedAt ?? null,
      error:       mem?.error       ?? null,
    });
  } catch (err) {
    console.error(`[GET wa-sessions/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/wa-sessions/[id] — update session properties (e.g. set as default)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id     = Number(idStr);
  const prisma = getPrisma();

  try {
    const body = await req.json() as Record<string, unknown>;

    // If setting isDefault=true, clear all other sessions first
    if (body.isDefault === true) {
      await prisma.whatsappSession.updateMany({ data: { isDefault: false } });
    }

    const updated = await prisma.whatsappSession.update({
      where: { id },
      data: {
        ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
        ...(body.dailyLimit !== undefined ? { dailyLimit: Number(body.dailyLimit) } : {}),
        ...(body.name       !== undefined ? { name: String(body.name) }            : {}),
        ...(body.isActive   !== undefined ? { isActive: Boolean(body.isActive) }   : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(`[PATCH wa-sessions/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/wa-sessions/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id     = Number(idStr);
  const prisma = getPrisma();

  if (id === 1) {
    return NextResponse.json(
      { error: "Session 1 (primary) cannot be deleted." },
      { status: 400 }
    );
  }

  try {
    await disconnectMultiSession(id);
    await prisma.whatsappSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[DELETE wa-sessions/${id}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
