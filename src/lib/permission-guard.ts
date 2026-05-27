/**
 * permission-guard.ts
 *
 * Server-side helpers for enforcing granular permissions in API routes.
 *
 * Usage (simple):
 *   const check = await requirePermission(req, PERMISSIONS.CREATE_CAMPAIGN);
 *   if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });
 *   const { userId, workspaceId } = check;
 *
 * Usage (multi-permission, ANY of):
 *   const check = await requireAnyPermission(req, [PERMISSIONS.EDIT_CAMPAIGN, PERMISSIONS.ADMIN]);
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace-guard";
import { resolvePermissions, type Permission } from "@/lib/permissions";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PermCheckOk {
  userId:      string;
  workspaceId: number;
  role:        string;
  memberId:    number;
  permissions: Set<Permission>;
}

export interface PermCheckFail {
  error:  string;
  status: 400 | 401 | 403;
}

export type PermCheckResult = PermCheckOk | PermCheckFail;

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Load the effective permission set for a user in a workspace.
 * Returns an empty set if the user is not a member.
 */
export async function getUserPermissions(
  userId:      string,
  workspaceId: number,
): Promise<{ permissions: Set<Permission>; role: string; memberId: number } | null> {
  const member = await prisma.workspaceMember.findFirst({
    where:   { userId, workspaceId, status: "active" },
    include: { userPermissions: true },
  });
  if (!member) return null;

  const permissions = resolvePermissions(member.role, member.userPermissions);
  return { permissions, role: member.role, memberId: member.id };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Require the caller to have ALL listed permissions in the active workspace */
export async function requirePermission(
  req:         Request,
  ...required: Permission[]
): Promise<PermCheckResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  const wsId = resolveWorkspaceId(req);
  if (!wsId) {
    return { error: "X-Workspace-ID header or ?workspaceId= is required", status: 400 };
  }

  const result = await getUserPermissions(session.user.id, wsId);
  if (!result) {
    return { error: "Forbidden — not an active member of this workspace", status: 403 };
  }

  const missing = required.filter((p) => !result.permissions.has(p));
  if (missing.length > 0) {
    return {
      error:  `Forbidden — missing permission: ${missing.join(", ")}`,
      status: 403,
    };
  }

  return {
    userId:      session.user.id,
    workspaceId: wsId,
    role:        result.role,
    memberId:    result.memberId,
    permissions: result.permissions,
  };
}

/** Require the caller to have AT LEAST ONE of the listed permissions */
export async function requireAnyPermission(
  req:      Request,
  any:      Permission[],
): Promise<PermCheckResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  const wsId = resolveWorkspaceId(req);
  if (!wsId) {
    return { error: "X-Workspace-ID header or ?workspaceId= is required", status: 400 };
  }

  const result = await getUserPermissions(session.user.id, wsId);
  if (!result) {
    return { error: "Forbidden — not an active member of this workspace", status: 403 };
  }

  const hasAny = any.some((p) => result.permissions.has(p));
  if (!hasAny) {
    return {
      error:  `Forbidden — requires one of: ${any.join(", ")}`,
      status: 403,
    };
  }

  return {
    userId:      session.user.id,
    workspaceId: wsId,
    role:        result.role,
    memberId:    result.memberId,
    permissions: result.permissions,
  };
}

/** Helper to convert a PermCheckFail to a NextResponse */
export function permError(fail: PermCheckFail): NextResponse {
  return NextResponse.json({ error: fail.error }, { status: fail.status });
}
