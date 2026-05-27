import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export const INVITE_EXPIRY_DAYS = 7;

/** Generate a URL-safe secure token */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/** Expiry date = now + INVITE_EXPIRY_DAYS */
export function inviteExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_EXPIRY_DAYS);
  return d;
}

export interface TokenValidation {
  ok:       boolean;
  error?:   "not_found" | "expired" | "revoked" | "already_accepted";
  member?:  {
    id:            number;
    workspaceId:   number;
    inviteEmail:   string;
    role:          string;
    status:        string;
    inviteExpiresAt: Date | null;
    workspace: {
      id:      number;
      name:    string;
      logoUrl: string;
    };
  };
}

/** Validate a token and return the associated invite info */
export async function validateInviteToken(token: string): Promise<TokenValidation> {
  if (!token) return { ok: false, error: "not_found" };

  const member = await prisma.workspaceMember.findUnique({
    where:   { inviteToken: token },
    include: { workspace: { select: { id: true, name: true, logoUrl: true } } },
  });

  if (!member) return { ok: false, error: "not_found" };
  if (member.status === "active") return { ok: false, error: "already_accepted" };
  if (member.status === "revoked") return { ok: false, error: "revoked" };

  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    // Auto-mark as expired
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data:  { status: "expired" },
    });
    return { ok: false, error: "expired" };
  }

  return {
    ok:     true,
    member: {
      id:             member.id,
      workspaceId:    member.workspaceId,
      inviteEmail:    member.inviteEmail,
      role:           member.role,
      status:         member.status,
      inviteExpiresAt: member.inviteExpiresAt,
      workspace:      member.workspace,
    },
  };
}
