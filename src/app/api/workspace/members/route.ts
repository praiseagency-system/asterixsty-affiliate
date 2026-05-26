import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_ROLES = ["OWNER", "ADMIN", "OPERATIONS", "SPECIALIST", "VIEWER"] as const;
type Role = typeof VALID_ROLES[number];

function isValidRole(r: string): r is Role {
  return (VALID_ROLES as readonly string[]).includes(r);
}

/** Normalise a raw error into a human-readable message */
function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workspace/members?workspaceId=N  — list members
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const url  = new URL(req.url);
  const wsId = parseInt(url.searchParams.get("workspaceId") ?? "0");
  if (!wsId) return NextResponse.json([], { status: 400 });

  // Requester must be an active member of the workspace
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/workspace/members  — invite member to one or more workspaces
//
// Body: { email: string, role: string, workspaceIds: number[] }
//
// Design notes
// ────────────
// • Pending invites use userId = null so:
//     1. No FK violation  (PostgreSQL skips FK checks for NULL)
//     2. No @@unique([workspaceId, userId]) collision  (NULL ≠ NULL in SQL)
//   auth.ts signIn event clears them by matching inviteEmail + status = "invited".
//
// • ALL workspace inserts run inside a single Prisma interactive transaction.
//   If any workspace fails (Forbidden, DB error, duplicate) the whole operation
//   rolls back so no partial state is written.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: { workspaceId?: number; workspaceIds?: number[]; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const role  = String(body.role  ?? "VIEWER").toUpperCase();

  // ── 2. Validate inputs ─────────────────────────────────────────────────────
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json(
      { error: `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  if (role === "OWNER") {
    return NextResponse.json(
      { error: "Cannot assign OWNER role via invitation. Use workspace settings." },
      { status: 400 },
    );
  }

  // Support both legacy single workspaceId and new workspaceIds array
  const rawIds: number[] = body.workspaceIds?.length
    ? body.workspaceIds.map(Number).filter((n) => !isNaN(n) && n > 0)
    : body.workspaceId ? [Number(body.workspaceId)] : [];

  if (!rawIds.length) {
    return NextResponse.json({ error: "At least one workspaceId is required" }, { status: 400 });
  }

  console.log("[POST /api/workspace/members] invite request:", {
    invitedBy: session.user.id,
    email,
    role,
    workspaceIds: rawIds,
  });

  // ── 3. Run everything in a single transaction (all-or-nothing) ─────────────
  try {
    const results = await prisma.$transaction(async (tx) => {
      const txResults: { workspaceId: number; action: string }[] = [];

      for (const workspaceId of rawIds) {
        // ── a. Verify workspace exists ────────────────────────────────────────
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) {
          throw Object.assign(
            new Error(`Workspace ${workspaceId} not found`),
            { status: 404, workspaceId },
          );
        }

        // ── b. Requester must be OWNER or ADMIN of this workspace ─────────────
        const selfMember = await tx.workspaceMember.findFirst({
          where: {
            workspaceId,
            userId: session.user.id,
            status: "active",
            role:   { in: ["OWNER", "ADMIN"] },
          },
        });
        if (!selfMember) {
          throw Object.assign(
            new Error(`You do not have permission to invite members to workspace "${workspace.name}"`),
            { status: 403, workspaceId },
          );
        }

        // ── c. Check if a real user with this email exists ────────────────────
        const existingUser = await tx.user.findUnique({ where: { email } });

        if (existingUser) {
          // User already has an account ───────────────────────────────────────
          // Check if they're already an active member
          const existingMember = await tx.workspaceMember.findFirst({
            where: { workspaceId, userId: existingUser.id, status: "active" },
          });
          if (existingMember) {
            // Update role if different
            if (existingMember.role !== role) {
              await tx.workspaceMember.update({
                where: { id: existingMember.id },
                data:  { role },
              });
              txResults.push({ workspaceId, action: "role_updated" });
              console.log("[invite] updated role for existing member %s in ws=%d → %s", email, workspaceId, role);
            } else {
              txResults.push({ workspaceId, action: "already_member" });
              console.log("[invite] %s is already member of ws=%d with role %s", email, workspaceId, role);
            }
          } else {
            // Upsert membership (might have disabled/invited row)
            await tx.workspaceMember.upsert({
              where:  { workspaceId_userId: { workspaceId, userId: existingUser.id } },
              create: { workspaceId, userId: existingUser.id, inviteEmail: email, role, status: "active" },
              update: { role, status: "active" },
            });
            txResults.push({ workspaceId, action: "member_added" });
            console.log("[invite] upserted existing user %s as active member of ws=%d", email, workspaceId);
          }
        } else {
          // User not registered yet ────────────────────────────────────────────
          const existingInvite = await tx.workspaceMember.findFirst({
            where: { workspaceId, inviteEmail: email, status: "invited" },
          });

          if (existingInvite) {
            // Re-invite: just update the role
            await tx.workspaceMember.update({
              where: { id: existingInvite.id },
              data:  { role },
            });
            txResults.push({ workspaceId, action: "invite_updated" });
            console.log("[invite] updated existing pending invite for %s in ws=%d → %s", email, workspaceId, role);
          } else {
            // Fresh invite — userId = null bypasses FK + unique constraints
            await tx.workspaceMember.create({
              data: {
                workspaceId,
                userId:      null,
                inviteEmail: email,
                role,
                status:      "invited",
              },
            });
            txResults.push({ workspaceId, action: "invite_created" });
            console.log("[invite] created pending invite for %s in ws=%d with role %s", email, workspaceId, role);
          }
        }
      }

      return txResults;
    });

    // ── 4. Success response ───────────────────────────────────────────────────
    const summary = results.map((r) => {
      const label = {
        member_added:    "Added as active member",
        role_updated:    "Role updated",
        already_member:  "Already a member (no change)",
        invite_created:  "Invitation sent",
        invite_updated:  "Invitation updated",
      }[r.action] ?? r.action;
      return { workspaceId: r.workspaceId, ok: true, message: label };
    });

    console.log("[POST /api/workspace/members] success:", summary);
    return NextResponse.json({ ok: true, results: summary }, { status: 201 });

  } catch (err) {
    // ── 5. Transaction rolled back — return detailed error ────────────────────
    const message = errorMsg(err);
    const status  = (err as { status?: number }).status ?? 400;

    console.error("[POST /api/workspace/members] transaction rolled back:", {
      invitedBy: session.user.id,
      email,
      role,
      workspaceIds: rawIds,
      error: message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    return NextResponse.json({ error: message }, { status });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/workspace/members  — update role or status
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body        = await req.json() as { memberId?: number; workspaceId?: number; role?: string; status?: string };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0);
  if (!memberId || !workspaceId) {
    return NextResponse.json({ error: "memberId and workspaceId are required" }, { status: 400 });
  }

  if (body.role && !isValidRole(body.role)) {
    return NextResponse.json({ error: `Invalid role "${body.role}"` }, { status: 400 });
  }

  // Requester must be OWNER or ADMIN
  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER", "ADMIN"] } },
  });
  if (!selfMember) {
    return NextResponse.json({ error: "Forbidden: you must be OWNER or ADMIN to update members" }, { status: 403 });
  }

  // Prevent removing OWNER role
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "OWNER" && body.role && body.role !== "OWNER") {
    return NextResponse.json({ error: "Cannot change the OWNER's role" }, { status: 400 });
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data:  {
      ...(body.role   !== undefined && { role:   String(body.role).toUpperCase() }),
      ...(body.status !== undefined && { status: String(body.status) }),
    },
  });

  return NextResponse.json(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/workspace/members  — remove member or cancel pending invite
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body        = await req.json() as { memberId?: number; workspaceId?: number };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0);
  if (!memberId || !workspaceId) {
    return NextResponse.json({ error: "memberId and workspaceId are required" }, { status: 400 });
  }

  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER", "ADMIN"] } },
  });
  if (!selfMember) {
    return NextResponse.json({ error: "Forbidden: you must be OWNER or ADMIN to remove members" }, { status: 403 });
  }

  // Prevent removing the workspace OWNER
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove the workspace OWNER" }, { status: 400 });
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });
  console.log("[DELETE /api/workspace/members] removed memberId=%d from ws=%d", memberId, workspaceId);

  return NextResponse.json({ ok: true });
}
