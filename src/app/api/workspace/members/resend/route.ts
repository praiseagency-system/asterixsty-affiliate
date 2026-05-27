import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, permError } from "@/lib/permission-guard";
import { PERMISSIONS } from "@/lib/permissions";
import { sendInviteEmail } from "@/lib/email";
import { generateInviteToken, inviteExpiresAt } from "@/lib/invite-token";

export const dynamic = "force-dynamic";

// POST /api/workspace/members/resend
// Body: { memberId: number, workspaceId: number }
export async function POST(req: Request) {
  const check = await requirePermission(req, PERMISSIONS.INVITE_MEMBER);
  if ("error" in check) return permError(check);

  let body: { memberId?: number; workspaceId?: number };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const memberId    = Number(body.memberId   ?? 0);
  const workspaceId = Number(body.workspaceId ?? 0) || check.workspaceId;

  if (!memberId) {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

  // Find the pending invite
  const member = await prisma.workspaceMember.findUnique({
    where:   { id: memberId },
    include: { workspace: { select: { id: true, name: true, logoUrl: true } } },
  });

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (member.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (member.status !== "invited") {
    return NextResponse.json({ error: "Can only resend invite for pending invitations" }, { status: 400 });
  }
  if (!member.inviteEmail) {
    return NextResponse.json({ error: "No invite email on record" }, { status: 400 });
  }

  // Generate a new token and refresh expiry
  const newToken = generateInviteToken();
  await prisma.workspaceMember.update({
    where: { id: memberId },
    data:  { inviteToken: newToken, inviteExpiresAt: inviteExpiresAt() },
  });

  // Send the email (fire-and-forget on error)
  sendInviteEmail({
    to:            member.inviteEmail,
    invitedByName: member.invitedByName || "Your team",
    workspaceName: member.workspace.name,
    workspaceLogo: member.workspace.logoUrl || undefined,
    role:          member.role,
    inviteToken:   newToken,
    lang:          "en",
  }).catch((err) => console.error("[email] Failed to resend invite:", err));

  console.log("[resend] invite for %s in ws=%d by %s", member.inviteEmail, workspaceId, check.userId);

  return NextResponse.json({ ok: true });
}
