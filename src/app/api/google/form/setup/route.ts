import { NextResponse } from "next/server";
import { createGoogleForm, getOrCreateIntegration } from "@/lib/google-auth";

export const dynamic = "force-dynamic";

// POST /api/google/form/setup → auto-create Google Form via Forms API
export async function POST(req: Request) {
  try {
    const body = await req.json() as { brandId?: string; formTitle?: string };
    const brandId   = (body.brandId  || "default").trim();
    const formTitle = (body.formTitle || "Asterixsty Video Submission").trim();

    const g = await getOrCreateIntegration(brandId);
    if (g.status !== "connected") {
      return NextResponse.json(
        { ok: false, error: "Google account not connected. Please connect first." },
        { status: 400 },
      );
    }

    const { formId, publicId, entryIds, questionIds } = await createGoogleForm(brandId, formTitle);

    const previewLink = publicId
      ? `https://docs.google.com/forms/d/e/${publicId}/viewform`
      : "";

    return NextResponse.json({
      ok: true,
      formId,
      publicId,
      previewLink,
      entryIds,
      questionIds,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
