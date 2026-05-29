import { NextResponse }            from "next/server";
import { auth }                    from "@/auth";
import { prisma }                  from "@/lib/prisma";
import { resolveWorkspaceId }      from "@/lib/workspace-guard";

export const dynamic = "force-dynamic";

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns the 50 most-recent notifications for the current user + workspace,
// plus unread count.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsId = resolveWorkspaceId(req) ?? 1;
  const userId = session.user.id;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where:   { workspaceId: wsId, userId },
      orderBy: { createdAt: "desc" },
      take:    50,
    }),
    prisma.notification.count({
      where: { workspaceId: wsId, userId, read: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

// ── PATCH /api/notifications ──────────────────────────────────────────────────
// Body: { action: "read_all" } → mark all as read for this user+workspace
// Body: { action: "read_one", id: number } → mark one as read
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wsId   = resolveWorkspaceId(req) ?? 1;
  const userId = session.user.id;
  const body   = await req.json().catch(() => ({}));

  if (body.action === "read_all") {
    await prisma.notification.updateMany({
      where: { workspaceId: wsId, userId, read: false },
      data:  { read: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "read_one" && body.id) {
    await prisma.notification.updateMany({
      where: { id: body.id, userId, read: false },
      data:  { read: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
