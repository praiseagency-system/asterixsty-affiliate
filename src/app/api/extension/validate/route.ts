/**
 * POST /api/extension/validate
 *
 * Chrome Extension license key validation.
 * Called by auth/license.js when the user enters their license key.
 * No session required — validated via licenseKey in request body.
 *
 * Request:
 *   Body: { licenseKey: string }
 *
 * Response 200:
 *   {
 *     success:       true,
 *     workspaceId:   number,
 *     workspaceName: string,
 *     permissions:   { sampleSync: true }
 *   }
 *
 * Response 401:
 *   { success: false, message: string }
 */

import { NextResponse } from "next/server";
import { prisma }       from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { licenseKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const licenseKey = String(body.licenseKey ?? "").trim();
  if (!licenseKey) {
    return NextResponse.json(
      { success: false, message: "licenseKey is required" },
      { status: 400 },
    );
  }

  // Look up workspace by license key
  const workspace = await prisma.workspace.findUnique({
    where:   { licenseKey },
    select:  {
      id:     true,
      name:   true,
      agency: { select: { name: true } },
    },
  });

  if (!workspace) {
    return NextResponse.json(
      { success: false, message: "License key not valid or workspace not found" },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success:       true,
    workspaceId:   workspace.id,
    workspaceName: workspace.agency?.name ?? workspace.name,
    permissions:   {
      sampleSync: true,
    },
  });
}
