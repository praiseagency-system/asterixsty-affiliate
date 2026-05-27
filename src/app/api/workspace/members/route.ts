import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  permError,
  getUserPermissions,
} from "@/lib/permission-guard";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  diffFromRoleDefaults,
  resolvePermissions,
  ALL_ROLES,
  type Permission,
} from "@/lib/permissions";
import { sendInviteEmail } from "@/lib/email";
import { generateInviteToken, inviteExpiresAt } from "@/lib/invite-token";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidRole(r: string): r is typeof ALL_ROLES[number] {
  return (ALL_ROLES as readonly string[]).includes(r);
}

function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
  const selfPerms = await getUserPermissions(session.user.id, wsId);
  if (!selfPerms) return NextResponse.json([], { status: 403 });

  const members = await prisma.workspaceMember.findMany({
    where:   { workspaceId: wsId },
    include: {
      user:            { select: { id: true, name: true, email: true, image: true } },
      userPermissions: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/workspace/members  — invite member to one or more workspaces
//
// Body:
//   email:              string
//   role:               string
//   workspaceIds:       number[]
//   permissionOverrides?: Record<string, boolean>  (optional granular overrides)
//
// All workspace inserts run inside a single Prisma transaction.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const check = await requirePermission(req, PERMISSIONS.INVITE_MEMBER);
  if ("error" in check) return permError(check);

  // ── 1. Parse + validate body ───────────────────────────────────────────────
  let body: {
    workspaceId?:        number;
    workspaceIds?:       number[];
    email?:              string;
    role?:               string;
    permissionOverrides?: Record<string, boolean>;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const role  = String(body.role  ?? "VIEWER").toUpperCase();

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  if (!isValidRole(role)) {
    return NextResponse.json({ error: `Invalid role "${role}". Must be one of: ${ALL_ROLES.join(", ")}` }, { status: 400 });
  }
  if (role === "OWNER") {
    return NextResponse.json({ error: "Cannot assign OWNER via invitation. Use workspace settings." }, { status: 400 });
  }

  const rawIds: number[] = body.workspaceIds?.length
    ? body.workspaceIds.map(Number).filter((n) => !isNaN(n) && n > 0)
    : body.workspaceId ? [Number(body.workspaceId)] : [];

  if (!rawIds.length) {
    return NextResponse.json({ error: "At least one workspaceId is required" }, { status: 400 });
  }

  // Validate permission overrides
  const permOverrides = body.permissionOverrides ?? {};
  const invalidPerms  = Object.keys(permOverrides).filter(
    (k) => !(ALL_PERMISSIONS as string[]).includes(k),
  );
  if (invalidPerms.length) {
    return NextResponse.json({ error: `Unknown permissions: ${invalidPerms.join(", ")}` }, { status: 400 });
  }

  // Full desired permission set = role defaults + explicit overrides
  const finalDesiredSet = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  for (const [perm, granted] of Object.entries(permOverrides)) {
    if (granted) finalDesiredSet.add(perm as Permission);
    else         finalDesiredSet.delete(perm as Permission);
  }
  const overridesToStore = diffFromRoleDefaults(role, finalDesiredSet);

  console.log("[POST /api/workspace/members]", {
    invitedBy:   check.userId,
    email, role,
    workspaceIds: rawIds,
    overrides:    overridesToStore.length,
  });

  // ── 2. Transaction — all workspaces atomic ─────────────────────────────────
  try {
    const results = await prisma.$transaction(async (tx) => {
      const txResults: { workspaceId: number; action: string }[] = [];

      for (const workspaceId of rawIds) {
        // Verify workspace exists
        const workspace = await tx.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) {
          throw Object.assign(new Error(`Workspace ${workspaceId} not found`), { status: 404 });
        }

        // Requester must be OWNER or ADMIN and have INVITE_MEMBER permission in THIS workspace
        const selfMember = await tx.workspaceMember.findFirst({
          where:   { workspaceId, userId: check.userId, status: "active" },
          include: { userPermissions: true, user: { select: { name: true } } },
        });
        if (!selfMember) {
          throw Object.assign(
            new Error(`You are not a member of workspace "${workspace.name}"`),
            { status: 403 },
          );
        }
        const selfPerms = resolvePermissions(selfMember.role, selfMember.userPermissions);
        if (!selfPerms.has(PERMISSIONS.INVITE_MEMBER)) {
          throw Object.assign(
            new Error(`You do not have invite_member permission in workspace "${workspace.name}"`),
            { status: 403 },
          );
        }

        // ── Find or create the WorkspaceMember ────────────────────────────────
        let memberId: number;
        let action:   string;

        const existingUser = await tx.user.findUnique({ where: { email } });

        if (existingUser) {
          // User already has an account ───────────────────────────────────────
          const existingMember = await tx.workspaceMember.findFirst({
            where: { workspaceId, userId: existingUser.id },
          });
          if (existingMember) {
            await tx.workspaceMember.update({
              where: { id: existingMember.id },
              data:  { role, status: "active", inviteEmail: email },
            });
            memberId = existingMember.id;
            action   = existingMember.status === "active" ? "role_updated" : "reactivated";
          } else {
            const created = await tx.workspaceMember.create({
              data: { workspaceId, userId: existingUser.id, inviteEmail: email, role, status: "active" },
            });
            memberId = created.id;
            action   = "member_added";
          }
        } else {
          // User not registered yet — pending invite ──────────────────────────
          const existingInvite = await tx.workspaceMember.findFirst({
            where: { workspaceId, inviteEmail: email, status: "invited" },
          });
          if (existingInvite) {
            // Refresh token + expiry when re-inviting
            const newToken = generateInviteToken();
            await tx.workspaceMember.update({
              where: { id: existingInvite.id },
              data:  { role, inviteToken: newToken, inviteExpiresAt: inviteExpiresAt() },
            });
            memberId = existingInvite.id;
            action   = "invite_updated";
          } else {
            const token   = generateInviteToken();
            const created = await tx.workspaceMember.create({
              data: {
                workspaceId,
                userId:         null,
                inviteEmail:    email,
                invitedByName:  selfMember.user?.name ?? check.userId,
                role,
                status:         "invited",
                inviteToken:    token,
                inviteExpiresAt: inviteExpiresAt(),
              },
            });
            memberId = created.id;
            action   = "invite_created";
          }
        }

        // ── Sync permission overrides ─────────────────────────────────────────
        if (overridesToStore.length > 0) {
          // Remove all existing overrides first
          await tx.userPermission.deleteMany({ where: { workspaceMemberId: memberId } });
          // Insert new overrides
          await tx.userPermission.createMany({
            data: overridesToStore.map((o) => ({
              workspaceMemberId: memberId,
              permission:        o.permission,
              granted:           o.granted,
            })),
          });
        }

        txResults.push({ workspaceId, action });
        console.log("[invite] %s %s in ws=%d", action, email, workspaceId);
      }

      return txResults;
    });

    const summary = results.map((r) => ({
      workspaceId: r.workspaceId,
      ok:          true,
      message: {
        member_added:   "Added as active member",
        role_updated:   "Role updated",
        reactivated:    "Re-activated",
        invite_created: "Invitation sent",
        invite_updated: "Invitation role updated",
      }[r.action] ?? r.action,
    }));

    // ── Send invitation emails (non-blocking, fire-and-forget) ─────────────
    // Fetch workspace details for pending invites that were just created/updated
    const pendingResults = results.filter((r) =>
      r.action === "invite_created" || r.action === "invite_updated",
    );
    if (pendingResults.length > 0) {
      // Get all members with email tokens to send
      const members = await prisma.workspaceMember.findMany({
        where: {
          workspaceId: { in: pendingResults.map((r) => r.workspaceId) },
          inviteEmail: email,
          status:      "invited",
          inviteToken: { not: null },
        },
        include: { workspace: { select: { name: true, logoUrl: true } } },
      });

      // Fire emails without awaiting to not slow down the API response
      for (const m of members) {
        sendInviteEmail({
          to:            email,
          invitedByName: m.invitedByName || "Your team",
          workspaceName: m.workspace.name,
          workspaceLogo: m.workspace.logoUrl || undefined,
          role:          m.role,
          inviteToken:   m.inviteToken!,
          lang:          "en", // TODO: use workspace language setting
        }).catch((err) => console.error("[email] Failed to send invite:", err));
      }
    }

    return NextResponse.json({ ok: true, results: summary }, { status: 201 });

  } catch (err) {
    const message = errorMsg(err);
    const status  = (err as { status?: number }).status ?? 400;
    console.error("[POST /api/workspace/members] transaction rolled back:", {
      email, role, workspaceIds: rawIds,
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
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body        = await req.json() as { memberId?: number; workspaceId?: number; role?: string; status?: string };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0);
  if (!memberId || !workspaceId) {
    return NextResponse.json({ error: "memberId and workspaceId required" }, { status: 400 });
  }
  if (body.role && !isValidRole(body.role)) {
    return NextResponse.json({ error: `Invalid role "${body.role}"` }, { status: 400 });
  }

  // Caller must have remove_member or invite_member permission
  const selfPerms = await getUserPermissions(session.user.id, workspaceId);
  if (!selfPerms) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!selfPerms.permissions.has(PERMISSIONS.INVITE_MEMBER) &&
      !selfPerms.permissions.has(PERMISSIONS.REMOVE_MEMBER)) {
    return NextResponse.json({ error: "Forbidden — requires invite_member or remove_member" }, { status: 403 });
  }

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "OWNER" && body.role && body.role !== "OWNER") {
    return NextResponse.json({ error: "Cannot change the workspace OWNER's role" }, { status: 400 });
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
  const check = await requirePermission(req, PERMISSIONS.REMOVE_MEMBER);
  if ("error" in check) return permError(check);

  const body        = await req.json() as { memberId?: number; workspaceId?: number };
  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0) || check.workspaceId;
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove the workspace OWNER" }, { status: 400 });
  }
  if (target.userId === check.userId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });
  console.log("[DELETE /api/workspace/members] memberId=%d removed by %s", memberId, check.userId);

  return NextResponse.json({ ok: true });
}
