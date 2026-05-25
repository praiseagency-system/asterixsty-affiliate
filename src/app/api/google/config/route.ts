import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/google/config → update form/spreadsheet config
export async function PATCH(req: Request) {
  try {
    const body    = await req.json() as Record<string, string>;
    const brandId = (body.brandId || "default").trim();

    // Allowlisted fields
    const allowed = [
      "googleFormId", "googleFormPublicId", "googleFormTitle",
      "googleSheetId", "googleSheetName",
      "formEntryIds", "formQuestionIds",
    ] as const;

    const data: Record<string, string> = {};
    for (const key of allowed) {
      if (key in body) data[key] = String(body[key]).trim();
    }

    const g = await prisma.googleIntegration.upsert({
      where:  { brandId },
      update: data,
      create: { brandId, ...data },
    });

    return NextResponse.json({ ok: true, brandId: g.brandId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
