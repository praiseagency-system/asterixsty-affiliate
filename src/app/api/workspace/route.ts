import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createUniqueLicenseKey } from "@/lib/license";

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

  const workspaces = memberships.map((m) => {
    let accentColor = "";
    try {
      const theme = JSON.parse(m.workspace.theme || "{}") as Record<string, string>;
      accentColor = theme.accentColor || "";
    } catch { /* ignore invalid JSON */ }

    return {
      id:          m.workspace.id,
      name:        m.workspace.name,
      slug:        m.workspace.slug,
      logoUrl:     m.workspace.logoUrl,
      role:        m.role,
      accentColor,
    };
  });

  return NextResponse.json(workspaces);
}

// POST /api/workspace — create a new workspace (OWNER/ADMIN only)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.globalRole !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body    = await req.json() as { name?: string; slug?: string; logoUrl?: string; theme?: string };
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

  // Generate collision-safe license key before creating workspace
  const licenseKey = await createUniqueLicenseKey(prisma);

  const workspace = await prisma.workspace.create({
    data: {
      agencyId: agency.id,
      name,
      slug,
      licenseKey,
      logoUrl: body.logoUrl ?? "",
      theme:   body.theme   ?? "{}",
      members: {
        create: { userId: session.user.id, role: "OWNER", status: "active" },
      },
    },
  });

  return NextResponse.json(workspace, { status: 201 });
}

// PATCH /api/workspace — update workspace settings (OWNER/ADMIN only)
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { accentColor?: string; workspaceId?: number };
  const workspaceId = Number(body.workspaceId ?? 0);
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  // Verify caller is OWNER or ADMIN
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: session.user.id, status: "active" },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "Forbidden — OWNER or ADMIN required" }, { status: 403 });
  }

  // Load existing theme, merge changes
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let existingTheme: Record<string, string> = {};
  try { existingTheme = JSON.parse(ws.theme || "{}") as Record<string, string>; } catch { /* ignore */ }

  if (body.accentColor !== undefined) {
    existingTheme.accentColor = body.accentColor;
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data:  { theme: JSON.stringify(existingTheme) },
  });

  return NextResponse.json({ ok: true, theme: updated.theme });
}
