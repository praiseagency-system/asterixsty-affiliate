import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspace/members?workspaceId=N — list members
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([], { status: 401 });

  const url    = new URL(req.url);
  const wsId   = parseInt(url.searchParams.get("workspaceId") ?? "0");
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

// POST /api/workspace/members — invite or add member
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body        = await req.json() as { workspaceId?: number; email?: string; role?: string };
  const workspaceId = Number(body.workspaceId ?? 0);
  const email       = String(body.email ?? "").trim().toLowerCase();
  const role        = String(body.role  ?? "VIEWER");

  if (!workspaceId || !email) return NextResponse.json({ error: "workspaceId and email required" }, { status: 400 });

  // Requester must be OWNER or ADMIN of this workspace
  const selfMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER","ADMIN"] } },
  });
  if (!selfMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    // User exists — add directly (upsert to avoid duplicate)
    const member = await prisma.workspaceMember.upsert({
      where:  { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      create: { workspaceId, userId: existingUser.id, inviteEmail: email, role, status: "active" },
      update: { role, status: "active" },
    });
    return NextResponse.json(member, { status: 201 });
  } else {
    // User not registered yet — create pending invite
    const member = await prisma.workspaceMember.create({
      data: { workspaceId, userId: "", inviteEmail: email, role, status: "invited" },
    });
    return NextResponse.json(member, { status: 201 });
  }
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
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER","ADMIN"] } },
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
    where: { workspaceId, userId: session.user.id, status: "active", role: { in: ["OWNER","ADMIN"] } },
  });
  if (!selfMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.workspaceMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
