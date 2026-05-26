import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspace/members?workspaceId=N — list members
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const url  = new URL(req.url);
  const wsId = parseInt(url.searchParams.get("workspaceId") ?? "0");
  if (!wsId) return NextResponse.json([], { status: 400 });

  // Requester must be a member
  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: wsId, userId: session.user.id, status: "active" },
  });
  if (!selfMember) return NextResponse.json([], { status: 403 });

  const members = await prisma.workspaceMember.findMany({
    where:   { workspaceId: wsId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

// POST /api/workspace/members — invite member to one or more workspaces
//
// Body: { email, role, workspaceIds: number[] }
//   OR  { email, role, workspaceId: number }  ← legacy single-workspace format
//
// Pending invites use userId = null so:
//   1. No FK violation (PostgreSQL skips FK check for NULL)
//   2. No @@unique([workspaceId, userId]) collision (NULL != NULL in SQL)
// auth.ts signIn clears it by matching inviteEmail + status = "invited".
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body  = await req.json() as {
    workspaceId?:  number;
    workspaceIds?: number[];
    email?:        string;
    role?:         string;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  const role  = String(body.role  ?? "VIEWER");

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  // Support both single workspaceId and array workspaceIds
  const rawIds: number[] = body.workspaceIds?.length
    ? body.workspaceIds.map(Number).filter((n) => !isNaN(n) && n > 0)
    : body.workspaceId ? [Number(body.workspaceId)] : [];

  if (!rawIds.length) {
    return NextResponse.json({ error: "at least one workspaceId required" }, { status: 400 });
  }

  console.log("[POST workspace/members] invite payload:", { email, role, workspaceIds: rawIds });

  // ── For each workspace: check permission, then upsert member ────────────────
  const results: { workspaceId: number; ok: boolean; error?: string }[] = [];

  for (const workspaceId of rawIds) {
    // Requester must be OWNER or ADMIN of this workspace
    const selfMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER", "ADMIN"] } },
    });
    if (!selfMember) {
      console.warn("[POST workspace/members] Forbidden: userId=%s not OWNER/ADMIN in ws=%d", session.user.id, workspaceId);
      results.push({ workspaceId, ok: false, error: "Forbidden" });
      continue;
    }

    try {
      // Check if a real user with this email already exists
      const existingUser = await prisma.user.findUnique({ where: { email } });

      if (existingUser) {
        // User already has an account — upsert membership directly as active
        await prisma.workspaceMember.upsert({
          where:  { workspaceId_userId: { workspaceId, userId: existingUser.id } },
          create: { workspaceId, userId: existingUser.id, inviteEmail: email, role, status: "active" },
          update: { role, status: "active" },
        });
        console.log("[POST workspace/members] upserted existing user %s in ws=%d", email, workspaceId);
      } else {
        // User not registered yet — check for an existing pending invite for this email
        const existingInvite = await prisma.workspaceMember.findFirst({
          where: { workspaceId, inviteEmail: email, status: "invited" },
        });

        if (existingInvite) {
          // Re-invite: just update the role
          await prisma.workspaceMember.update({
            where: { id: existingInvite.id },
            data:  { role },
          });
          console.log("[POST workspace/members] updated existing invite for %s in ws=%d", email, workspaceId);
        } else {
          // Fresh invite — userId = null avoids both the FK constraint and the
          // @@unique([workspaceId, userId]) collision (SQL treats NULL != NULL).
          await prisma.workspaceMember.create({
            data: {
              workspaceId,
              userId:      null,
              inviteEmail: email,
              role,
              status:      "invited",
            },
          });
          console.log("[POST workspace/members] created pending invite for %s in ws=%d", email, workspaceId);
        }
      }

      results.push({ workspaceId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[POST workspace/members] workspaceId=%d error:", workspaceId, err);
      results.push({ workspaceId, ok: false, error: message });
    }
  }

  const allFailed = results.every((r) => !r.ok);

  if (allFailed) {
    const firstError = results.find((r) => r.error)?.error ?? "Failed to invite";
    return NextResponse.json({ error: firstError, results }, { status: 400 });
  }

  return NextResponse.json({ ok: true, results }, { status: 201 });
}

// PATCH /api/workspace/members — update role or status
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body        = await req.json() as { memberId?: number; workspaceId?: number; role?: string; status?: string };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0);
  if (!memberId || !workspaceId) return NextResponse.json({ error: "memberId and workspaceId required" }, { status: 400 });

  // Requester must be OWNER or ADMIN
  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER", "ADMIN"] } },
  });
  if (!selfMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data:  {
      ...(body.role   !== undefined && { role:   String(body.role) }),
      ...(body.status !== undefined && { status: String(body.status) }),
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/workspace/members — remove member
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body        = await req.json() as { memberId?: number; workspaceId?: number };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0);

  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER", "ADMIN"] } },
  });
  if (!selfMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.workspaceMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
