/**
 * POST /api/v1/license/validate
 *
 * Chrome extension calls this on startup to verify its license key
 * and receive workspace metadata.
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   — or —
 *   Body: { license_key: string }
 *
 * Response 200:
 *   { success, workspace_id, brand_name, expiry_date, permissions }
 */

import { NextResponse }      from "next/server";
import { requireLicense }    from "@/lib/license-auth";
import { prisma }            from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Support both Bearer header and body.license_key
  let authReq = req;
  const body  = await req.json().catch(() => ({})) as Record<string, string>;

  if (!req.headers.get("authorization") && body.license_key) {
    // Inject a synthetic Authorization header so requireLicense can parse it
    const synth = new Request(req.url, {
      method:  req.method,
      headers: { ...Object.fromEntries(req.headers), authorization: `Bearer ${body.license_key}` },
    });
    authReq = synth;
  }

  const ws = await requireLicense(authReq);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  // Pull workspace + agency brand name
  const workspace = await prisma.workspace.findUnique({
    where:   { id: ws.id },
    include: { agency: { select: { name: true } } },
  });

  return NextResponse.json({
    success:      true,
    workspace_id: ws.name,           // slug-style identifier
    brand_name:   workspace?.agency?.name ?? ws.name,
    expiry_date:  "2027-12-31",
    permissions:  ["scrape", "sync"],
  });
}
