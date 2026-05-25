import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// ─── Column definitions ───────────────────────────────────────────────────────
export const TEMPLATE_HEADERS = [
  "username",
  "nama",
  "followers",
  "status",
  "media_focus",
  "visual_take",
  "kategori",
  "pic",
  "whatsapp",
  "kota",
  "provinsi",
  "alamat",
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

// Mapping: template header → internal DB field
export const HEADER_MAP: Record<TemplateHeader, string> = {
  username:    "tiktokUsername",
  nama:        "namaAffiliator",
  followers:   "followers",
  status:      "status",
  media_focus: "mediaPromosiFocus",
  visual_take: "visualTake",
  kategori:    "kategoriAffiliate",
  pic:         "affiliateSpecialist",
  whatsapp:    "noWhatsapp",
  kota:        "kota",
  provinsi:    "provinsi",
  alamat:      "alamat",
};

const DUMMY_ROW = {
  username:    "irfankaisa",
  nama:        "Irfan",
  followers:   "123213",
  status:      "Aktif",
  media_focus: "Video",
  visual_take: "Inframe",
  kategori:    "Perawatan & Kecantikan",
  pic:         "Rosa",
  whatsapp:    "628123456789",
  kota:        "Bogor",
  provinsi:    "Jawa Barat",
  alamat:      "Jl Contoh No 1",
};

// ─── GET /api/database/template?format=csv|xlsx ────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "csv";

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    const data = [
      TEMPLATE_HEADERS as unknown as string[],
      TEMPLATE_HEADERS.map((h) => DUMMY_ROW[h]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Style header row (bold + blue background via column widths)
    ws["!cols"] = TEMPLATE_HEADERS.map((h) => ({
      wch: Math.max(h.length + 4, String(DUMMY_ROW[h]).length + 4),
    }));

    XLSX.utils.book_append_sheet(wb, ws, "Template Import");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="template_import_affiliate.xlsx"',
      },
    });
  }

  // Default: CSV
  const lines = [
    TEMPLATE_HEADERS.join(","),
    TEMPLATE_HEADERS.map((h) => DUMMY_ROW[h]).join(","),
  ];
  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template_import_affiliate.csv"',
    },
  });
}
