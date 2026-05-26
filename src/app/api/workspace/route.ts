import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/workspace — returns all workspaces the current user has access to
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where:   { userId: session.user.id, status: "active" },
    include: { workspace: true },
    orderBy: { workspace: { id: "asc" } },
  });

  const workspaces = memberships.map((m) => ({
    id:      m.workspace.id,
    name:    m.workspace.name,
    slug:    m.workspace.slug,
    logoUrl: m.workspace.logoUrl,
    role:    m.role,
  }));

  return NextResponse.json(workspaces);
}

// POST /api/workspace — create a new workspace (OWNER/ADMIN only)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.globalRole !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body    = await req.json() as { name?: string; slug?: string; logoUrl?: string };
  const name    = String(body.name ?? "").trim();
  const slugRaw = String(body.slug ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const slug    = slugRaw || name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Get or create the agency owned by this user
  let agency = await prisma.agency.findFirst({ where: { ownerId: session.user.id } });
  if (!agency) {
    agency = await prisma.agency.create({
      data: { name: "Praise Agency", ownerId: session.user.id },
    });
  }

  const workspace = await prisma.workspace.create({
    data: {
      agencyId: agency.id,
      name,
      slug,
      logoUrl: body.logoUrl ?? "",
      members: {
        create: { userId: session.user.id, role: "OWNER", status: "active" },
      },
    },
  });

  return NextResponse.json(workspace, { status: 201 });
}
