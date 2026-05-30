/**
 * POST /api/extension/validate  ← legacy alias kept for backward compatibility
 *
 * Identical behaviour to POST /api/v1/license/validate.
 * Chrome Extension v2+ should call /api/v1/license/validate directly.
 *
 * This route does its own DB lookup (no internal fetch / proxy) to avoid
 * Railway loopback issues.
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-ID",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  // Accept licenseKey from body (camelCase) or Bearer header
  let licenseKey = "";

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    licenseKey = authHeader.slice(7).trim();
  }

  if (!licenseKey) {
    try {
      const body = await req.json() as Record<string, unknown>;
      licenseKey = String(body.licenseKey ?? body.license_key ?? "").trim();
    } catch {
      // not parseable
    }
  }

  console.log(`[extension/validate] key: "${licenseKey}" (len=${licenseKey.length})`);

  if (!licenseKey) {
    return NextResponse.json(
      { success: false, error: "licenseKey is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  let workspace: { id: number; name: string; agency: { name: string } | null } | null = null;
  try {
    workspace = await prisma.workspace.findFirst({
      where:  { licenseKey },
      select: { id: true, name: true, agency: { select: { name: true } } },
    });
  } catch (err) {
    console.error("[extension/validate] DB error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!workspace) {
    console.warn(`[extension/validate] not found: "${licenseKey}"`);
    return NextResponse.json(
      { success: false, error: "License key tidak valid atau workspace tidak ditemukan" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const workspaceName = workspace.agency?.name ?? workspace.name;
  console.log(`[extension/validate] OK — workspace ${workspace.id} "${workspaceName}"`);

  return NextResponse.json(
    {
      success:       true,
      workspaceId:   workspace.id,
      workspaceName,
      token:         licenseKey,
      permissions:   { sampleSync: true },
    },
    { headers: CORS_HEADERS },
  );
}
