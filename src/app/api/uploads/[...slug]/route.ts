import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const MIME: Record<string, string> = {
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif:  "image/gif",
  svg:  "image/svg+xml",
  mp4:  "video/mp4",
  pdf:  "application/pdf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const filename = slug.join("/");

  // Block path traversal
  if (filename.includes("..") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filepath = path.join(process.cwd(), "public", "uploads", filename);

  try {
    const buf = await readFile(filepath);
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME[ext] ?? "application/octet-stream";

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
