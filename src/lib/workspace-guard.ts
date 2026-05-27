/**
 * workspace-guard.ts
 *
 * Server-side helper for API routes that need to validate:
 *   1. The request is authenticated (valid session).
 *   2. The current user is an active member of the requested workspace.
 *   3. Optionally, the user has the required role in that workspace.
 *
 * Usage:
 *   const guard = await requireWorkspaceMember(req);
 *   if (guard.error) return NextResponse.json({ error: guard.error }, { status: guard.status });
 *   const { workspaceId, role, userId } = guard;
 */

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const ROLE_RANK: Record<string, number> = {
  OWNER:      7,
  ADMIN:      6,
  OPERATIONS: 5,
  SPECIALIST: 4,
  ANALYST:    3,
  VIEWER:     2,
  CLIENT:     1,
};

export interface WorkspaceGuardOk {
  error: null;
  workspaceId: number;
  userId: string;
  role: string;
}

export interface WorkspaceGuardFail {
  error: string;
  status: 400 | 401 | 403;
}

export type WorkspaceGuardResult = WorkspaceGuardOk | WorkspaceGuardFail;

/**
 * Resolve workspaceId from:
 *  1. X-Workspace-ID request header
 *  2. ?workspaceId= query param
 *  3. JSON body (parsed only when bodyWorkspaceId is provided by caller)
 */
export function resolveWorkspaceId(
  req: Request | NextRequest,
  bodyWorkspaceId?: number | null,
): number | null {
  // Header takes priority
  const header = (req as NextRequest).headers?.get?.("x-workspace-id");
  if (header) {
    const n = parseInt(header);
    if (!isNaN(n) && n > 0) return n;
  }

  // Query param
  const url = new URL(req.url);
  const param = url.searchParams.get("workspaceId");
  if (param) {
    const n = parseInt(param);
    if (!isNaN(n) && n > 0) return n;
  }

  // Body (caller must parse body first and pass in)
  if (bodyWorkspaceId != null && !isNaN(bodyWorkspaceId) && bodyWorkspaceId > 0) {
    return bodyWorkspaceId;
  }

  return null;
}

/**
 * Verify the session user is an active member of the given workspace.
 * Optionally enforce a minimum role (e.g. "ADMIN" means ADMIN or OWNER).
 */
export async function requireWorkspaceMember(
  req: Request | NextRequest,
  options: {
    bodyWorkspaceId?: number | null;
    minRole?: string; // e.g. "ADMIN" → only ADMIN + OWNER pass
  } = {},
): Promise<WorkspaceGuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  const wsId = resolveWorkspaceId(req, options.bodyWorkspaceId);
  if (!wsId) {
    return { error: "workspaceId required", status: 400 };
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: wsId, userId: session.user.id, status: "active" },
  });

  if (!member) {
    return { error: "Forbidden — not a member of this workspace", status: 403 };
  }

  if (options.minRole) {
    const required = ROLE_RANK[options.minRole] ?? 0;
    const actual   = ROLE_RANK[member.role]    ?? 0;
    if (actual < required) {
      return { error: `Forbidden — requires ${options.minRole} or higher`, status: 403 };
    }
  }

  return {
    error:       null,
    workspaceId: wsId,
    userId:      session.user.id,
    role:        member.role,
  };
}
