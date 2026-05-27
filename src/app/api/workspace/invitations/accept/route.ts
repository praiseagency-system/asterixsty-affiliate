/**
 * POST /api/workspace/invitations/accept
 *
 * Called when a LOGGED-IN user clicks "Accept Invitation" on /invite?token=xxx.
 * Their email must match the invite email.
 *
 * Body: { token: string }
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateInviteToken } from "@/lib/invite-token";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Please sign in first" }, { status: 401 });
  }

  const { token } = await req.json().catch(() => ({})) as { token?: string };
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const validation = await validateInviteToken(token);
  if (!validation.ok) {
    const msgs: Record<string, string> = {
      not_found:        "Invitation not found or already used",
      expired:          "This invitation has expired. Please ask to be re-invited.",
      revoked:          "This invitation has been cancelled.",
      already_accepted: "You are already a member of this workspace.",
    };
    return NextResponse.json(
      { error: msgs[validation.error ?? "not_found"] ?? "Invalid invitation" },
      { status: 400 },
    );
  }

  const { member } = validation;

  // Email must match
  if (session.user.email.toLowerCase() !== member!.inviteEmail.toLowerCase()) {
    return NextResponse.json(
      { error: `This invitation is for ${member!.inviteEmail}, but you are signed in as ${session.user.email}.` },
      { status: 403 },
    );
  }

  // Accept the invitation
  await prisma.workspaceMember.update({
    where: { id: member!.id },
    data:  {
      userId:      session.user.id,
      status:      "active",
      inviteToken: null,         // consume token
    },
  });

  console.log("[invitations/accept] user %s accepted invite to workspace %d", session.user.id, member!.workspaceId);
  return NextResponse.json({ ok: true, workspaceId: member!.workspaceId });
}
