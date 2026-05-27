import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace-guard";
import {
  getUserPermissions,
  requirePermission,
  permError,
} from "@/lib/permission-guard";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  resolvePermissions,
  diffFromRoleDefaults,
  ALL_PERMISSIONS,
  type Permission,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/workspace/permissions?workspaceId=N
//
// Returns the effective permission set for the CURRENT user in workspace N.
// Also returns individual member permissions when ?memberId=M is supplied
// (requires EDIT_PERMISSION privilege).
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url  = new URL(req.url);
  const wsId = resolveWorkspaceId(req);
  if (!wsId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const targetMemberId = url.searchParams.get("memberId")
    ? parseInt(url.searchParams.get("memberId")!)
    : null;

  if (targetMemberId) {
    // ── Return another member's permissions (requires EDIT_PERMISSION) ────────
    const selfResult = await getUserPermissions(session.user.id, wsId);
    if (!selfResult) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!selfResult.permissions.has(PERMISSIONS.EDIT_PERMISSION)) {
      return NextResponse.json({ error: "Forbidden — edit_permission required" }, { status: 403 });
    }

    const member = await prisma.workspaceMember.findFirst({
      where:   { id: targetMemberId, workspaceId: wsId },
      include: { user: { select: { id: true, name: true, email: true } }, userPermissions: true },
    });
    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const effectivePerms = resolvePermissions(member.role, member.userPermissions);

    return NextResponse.json({
      memberId:    member.id,
      role:        member.role,
      user:        member.user,
      permissions: [...effectivePerms],
      overrides:   member.userPermissions,
      roleDefaults: ROLE_PERMISSIONS[member.role] ?? [],
    });

  } else {
    // ── Return CURRENT user's permissions ─────────────────────────────────────
    const result = await getUserPermissions(session.user.id, wsId);
    if (!result) {
      // Not a member — return empty (not 403, so client can handle gracefully)
      return NextResponse.json({ role: "", permissions: [], memberId: null });
    }

    return NextResponse.json({
      memberId:    result.memberId,
      role:        result.role,
      permissions: [...result.permissions],
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/workspace/permissions
//
// Update a member's permission overrides.
// Body: { memberId, workspaceId, overrides: Record<string, boolean> }
//
// overrides keys are permission strings; true = grant, false = deny.
// Sending null/undefined for a permission removes its override (revert to role default).
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const check = await requirePermission(req, PERMISSIONS.EDIT_PERMISSION);
  if ("error" in check) return permError(check);

  const body = await req.json() as {
    memberId?:    number;
    workspaceId?: number;
    overrides?:   Record<string, boolean | null>;
  };

  const memberId    = Number(body.memberId    ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0) || check.workspaceId;

  if (!memberId) {
    return NextResponse.json({ error: "memberId required" }, { status: 400 });
  }

  // Verify target member belongs to this workspace
  const member = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found in this workspace" }, { status: 404 });
  }

  // OWNER cannot have permissions stripped
  if (member.role === "OWNER") {
    return NextResponse.json({ error: "Cannot override permissions for workspace OWNER" }, { status: 400 });
  }

  // Prevent modifying your own permissions
  if (member.userId === check.userId) {
    return NextResponse.json({ error: "Cannot modify your own permissions" }, { status: 400 });
  }

  const overrides = body.overrides ?? {};

  // Validate permission keys
  const invalidKeys = Object.keys(overrides).filter(
    (k) => !(ALL_PERMISSIONS as string[]).includes(k),
  );
  if (invalidKeys.length) {
    return NextResponse.json({ error: `Unknown permissions: ${invalidKeys.join(", ")}` }, { status: 400 });
  }

  // Upsert / delete UserPermission rows
  const ops: Promise<unknown>[] = [];

  for (const [perm, value] of Object.entries(overrides)) {
    if (value === null || value === undefined) {
      // Remove override — revert to role default
      ops.push(
        prisma.userPermission.deleteMany({
          where: { workspaceMemberId: memberId, permission: perm },
        }),
      );
    } else {
      ops.push(
        prisma.userPermission.upsert({
          where:  { workspaceMemberId_permission: { workspaceMemberId: memberId, permission: perm } },
          create: { workspaceMemberId: memberId, permission: perm, granted: Boolean(value) },
          update: { granted: Boolean(value) },
        }),
      );
    }
  }

  await Promise.all(ops);

  // Return updated effective permissions
  const updated = await prisma.workspaceMember.findUnique({
    where:   { id: memberId },
    include: { userPermissions: true },
  });
  const effectivePerms = updated
    ? resolvePermissions(updated.role, updated.userPermissions)
    : new Set<Permission>();

  console.log("[PATCH /api/workspace/permissions] memberId=%d updated by %s", memberId, check.userId);

  return NextResponse.json({
    memberId,
    role:        member.role,
    permissions: [...effectivePerms],
    overrides:   updated?.userPermissions ?? [],
  });
}
