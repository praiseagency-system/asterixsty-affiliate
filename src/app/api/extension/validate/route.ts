/**
 * POST /api/extension/validate
 * OPTIONS /api/extension/validate  ← CORS preflight
 *
 * Chrome Extension v2 license key validation.
 * No session required — auth is the licenseKey itself.
 * CORS: open to any origin (chrome-extension://, localhost, etc.)
 *
 * POST body:  { licenseKey: string }
 * POST 200:   { success, workspaceId, workspaceName, token, permissions }
 * POST 4xx:   { success: false, error: string }
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── CORS helper ───────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-ID",
};

// ── OPTIONS — CORS preflight (required for non-simple requests) ───────────────
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── POST — validate license key ───────────────────────────────────────────────
export async function POST(req: Request) {
  let body: { licenseKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const licenseKey = String(body.licenseKey ?? "").trim();
  if (!licenseKey) {
    return NextResponse.json(
      { success: false, error: "licenseKey is required" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // Look up workspace by license key (unique index → fast)
  const workspace = await prisma.workspace.findUnique({
    where:  { licenseKey },
    select: {
      id:     true,
      name:   true,
      agency: { select: { name: true } },
    },
  });

  if (!workspace) {
    return NextResponse.json(
      { success: false, error: "License key tidak valid atau workspace tidak ditemukan" },
      { status: 401, headers: CORS_HEADERS },
    );
  }

  const workspaceName = workspace.agency?.name ?? workspace.name;

  return NextResponse.json(
    {
      success:       true,
      workspaceId:   workspace.id,
      workspaceName,
      token:         licenseKey,          // Extension uses licenseKey as the Bearer token
      permissions:   { sampleSync: true },
    },
    { headers: CORS_HEADERS },
  );
}
