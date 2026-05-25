import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deriveEntryIds } from "@/lib/google-auth";

// POST /api/google/form/fix-entry-ids
// Recomputes formEntryIds from stored formQuestionIds (hex → decimal).
// Use this when a form was created before the hex→decimal derivation was implemented,
// resulting in empty formEntryIds and broken prefilled links.
export async function POST(req: Request) {
  try {
    const body    = await req.json().catch(() => ({})) as { brandId?: string };
    const brandId = (body?.brandId || "default").trim();

    const g = await prisma.googleIntegration.findUnique({ where: { brandId } });
    if (!g) {
      return NextResponse.json({ ok: false, error: "Integration not found" }, { status: 404 });
    }
    if (!g.googleFormPublicId) {
      return NextResponse.json({ ok: false, error: "Google Form not configured yet" }, { status: 400 });
    }

    // Parse stored questionIds
    let questionIds: Record<string, string> = {};
    try { questionIds = JSON.parse(g.formQuestionIds || "{}"); } catch { /* ignore */ }

    if (Object.keys(questionIds).length === 0) {
      return NextResponse.json({
        ok: false,
        error: "formQuestionIds kosong — buat ulang form terlebih dahulu via Auto-Create Google Form",
      }, { status: 400 });
    }

    // Derive entry IDs
    const entryIds = deriveEntryIds(questionIds);

    if (Object.keys(entryIds).length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Gagal derive entry IDs dari questionIds yang tersimpan",
      }, { status: 500 });
    }

    // Persist
    await prisma.googleIntegration.update({
      where: { brandId },
      data:  { formEntryIds: JSON.stringify(entryIds) },
    });

    return NextResponse.json({
      ok: true,
      entryIds,
      message: `Berhasil derive ${Object.keys(entryIds).length} entry IDs dari ${Object.keys(questionIds).length} question IDs`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
