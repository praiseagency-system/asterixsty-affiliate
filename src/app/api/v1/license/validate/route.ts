/**
 * POST /api/v1/license/validate
 *
 * Canonical license key validation endpoint.
 * Used by Chrome Extension v2 (and any future clients).
 *
 * Request body: { licenseKey: string }
 *   — OR —
 * Authorization: Bearer <license_key>
 *
 * Response 200:
 *   { success, workspaceId, workspaceName, token, permissions: { sampleSync } }
 *
 * Response 400 / 401 / 500:
 *   { success: false, error: string }
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── CORS helper ────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-ID",
};

// ── OPTIONS — CORS preflight ───────────────────────────────────────────────────
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// ── POST — validate license key ────────────────────────────────────────────────
export async function POST(req: Request) {
  // ── 1. Extract license key from body { licenseKey } or Bearer header ─────────
  let licenseKey = "";

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    licenseKey = authHeader.slice(7).trim();
  }

  if (!licenseKey) {
    try {
      const body = await req.json() as Record<string, unknown>;
      // Accept both camelCase (extension v2) and snake_case (legacy)
      licenseKey = String(body.licenseKey ?? body.license_key ?? "").trim();
    } catch {
      // body not parseable — continue with empty licenseKey
    }
  }

  console.log(`[license/validate] incoming key: "${licenseKey}" (len=${licenseKey.length})`);

  if (!licenseKey) {
    console.warn("[license/validate] rejected: no key provided");
    return NextResponse.json(
      { success: false, error: "licenseKey is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // ── 2. Look up workspace ──────────────────────────────────────────────────────
  let workspace: { id: number; name: string; agency: { name: string } | null } | null = null;
  try {
    workspace = await prisma.workspace.findFirst({
      where:  { licenseKey },
      select: {
        id:     true,
        name:   true,
        agency: { select: { name: true } },
      },
    });
  } catch (err) {
    console.error("[license/validate] DB error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }

  if (!workspace) {
    console.warn(`[license/validate] rejected: no workspace found for key "${licenseKey}"`);
    return NextResponse.json(
      { success: false, error: "License key tidak valid atau workspace tidak ditemukan" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const workspaceName = workspace.agency?.name ?? workspace.name;

  console.log(`[license/validate] OK — workspace ${workspace.id} "${workspaceName}"`);

  return NextResponse.json(
    {
      success:       true,
      workspaceId:   workspace.id,
      workspaceName,
      token:         licenseKey,           // extension stores this as its Bearer token
      permissions:   { sampleSync: true },
    },
    { headers: CORS_HEADERS },
  );
}
