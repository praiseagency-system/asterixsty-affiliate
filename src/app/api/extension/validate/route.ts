/**
 * POST /api/extension/validate  ← LEGACY — kept for backward compatibility
 *
 * Forwards all requests to the canonical endpoint:
 *   POST /api/v1/license/validate
 *
 * Chrome Extension v2+ should call /api/v1/license/validate directly.
 */

import { NextResponse } from "next/server";

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
  // Forward body + headers to canonical endpoint
  const body = await req.text();
  const canonical = new URL("/api/v1/license/validate", req.url);

  const upstream = await fetch(canonical.toString(), {
    method:  "POST",
    headers: {
      "Content-Type": req.headers.get("content-type") ?? "application/json",
      ...(req.headers.get("authorization")
        ? { Authorization: req.headers.get("authorization")! }
        : {}),
    },
    body,
  });

  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status, headers: CORS_HEADERS });
}
