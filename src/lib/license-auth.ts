/**
 * license-auth.ts
 * Validates the Bearer license key sent by the Chrome extension.
 *
 * Usage in route handlers:
 *   const ws = await requireLicense(req);
 *   if (!ws.ok) return NextResponse.json({ error: ws.error }, { status: ws.status });
 *   ws.id  // ← TypeScript now narrows correctly
 */

import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

export type LicenseResult =
  | { ok: true;  id: number; name: string; licenseKey: string }
  | { ok: false; error: string; status: 400 | 401 | 500 };

export async function requireLicense(
  req: Request | NextRequest,
): Promise<LicenseResult> {
  try {
    const authHeader =
      (req as NextRequest).headers?.get?.("authorization") ??
      (req as Request).headers?.get?.("authorization") ?? "";

    const licenseKey = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!licenseKey) {
      return { ok: false, error: "Missing Authorization header", status: 400 };
    }

    const workspace = await prisma.workspace.findFirst({
      where:  { licenseKey },
      select: { id: true, name: true, licenseKey: true },
    });

    if (!workspace) {
      return { ok: false, error: "Invalid or expired license key", status: 401 };
    }

    // licenseKey from the bearer token — already validated as non-empty string above
    return { ok: true, id: workspace.id, name: workspace.name, licenseKey };
  } catch (err) {
    console.error("[license-auth]", err);
    return { ok: false, error: "Auth check failed", status: 500 };
  }
}
