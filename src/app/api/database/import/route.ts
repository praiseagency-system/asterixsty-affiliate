import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_HEADERS, HEADER_MAP } from "../template/route";

export const dynamic = "force-dynamic";

type ImportRow = Record<string, string>;

export interface ImportResult {
  created:  number;
  updated:  number;
  failed:   number;
  errors:   { row: number; message: string }[];
}

/** Normalize a raw CSV/XLSX row to internal DB field names.
 *  Accepts both friendly headers (username, nama, …) AND legacy internal names. */
function normalizeRow(r: ImportRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    const trimKey = k.trim().toLowerCase();
    // Check if this is a friendly template header
    const friendly = TEMPLATE_HEADERS.find((h) => h === trimKey) as typeof TEMPLATE_HEADERS[number] | undefined;
    if (friendly) {
      out[HEADER_MAP[friendly]] = String(v ?? "").trim();
    } else {
      // Legacy / direct DB field name passthrough
      out[k.trim()] = String(v ?? "").trim();
    }
  }
  return out;
}

/** Check if row has at least one recognized header */
function hasRecognizedHeaders(sample: ImportRow): boolean {
  const keys = Object.keys(sample).map((k) => k.trim().toLowerCase());
  // Accept template headers
  const hasTemplate = TEMPLATE_HEADERS.some((h) => keys.includes(h));
  // Accept legacy internal headers
  const legacyKeys = ["tiktokusername", "tiktomusername", "username"];
  const hasLegacy = legacyKeys.some((k) => keys.includes(k));
  return hasTemplate || hasLegacy;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => String(v ?? "").trim();

export async function POST(req: Request) {
  try {
    const { rows, mode = "upsert" } = await req.json() as {
      rows: ImportRow[];
      mode?: "add" | "upsert";
    };

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: "Tidak ada data" }, { status: 400 });

    // Validate template format on first row
    if (!hasRecognizedHeaders(rows[0])) {
      return NextResponse.json(
        { error: "Format template tidak sesuai. Gunakan template yang disediakan (Download Template CSV / XLSX)." },
        { status: 400 }
      );
    }

    const result: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-based + header row
      try {
        const normalized = normalizeRow(rows[i]);

        // username is required (internal field: tiktokUsername)
        const username = str(normalized.tiktokUsername || normalized.username);
        if (!username) {
          result.failed++;
          result.errors.push({ row: rowNum, message: "username kosong" });
          continue;
        }

        const data = {
          tiktokUsername:      username,
          namaAffiliator:      str(normalized.namaAffiliator),
          status:              str(normalized.status) || "Aktif",
          followers:           num(normalized.followers),
          mediaPromosiFocus:   str(normalized.mediaPromosiFocus),
          visualTake:          str(normalized.visualTake),
          kategoriAffiliate:   str(normalized.kategoriAffiliate),
          affiliateSpecialist: str(normalized.affiliateSpecialist),
          alamat:              str(normalized.alamat),
          kota:                str(normalized.kota),
          provinsi:            str(normalized.provinsi),
          noWhatsapp:          str(normalized.noWhatsapp),
          // Legacy fields (passthrough if provided)
          ...(normalized.samplePertama    ? { samplePertama:        str(normalized.samplePertama)    } : {}),
          ...(normalized.sampleKedua      ? { sampleKedua:          str(normalized.sampleKedua)      } : {}),
          ...(normalized.sampleKetiga     ? { sampleKetiga:         str(normalized.sampleKetiga)     } : {}),
          ...(normalized.sampleKeempat    ? { sampleKeempat:        str(normalized.sampleKeempat)    } : {}),
          ...(normalized.sampleKelima     ? { sampleKelima:         str(normalized.sampleKelima)     } : {}),
          ...(normalized.totalVideoDiDeliver ? { totalVideoDiDeliver: num(normalized.totalVideoDiDeliver) } : {}),
          ...(normalized.tahun            ? { tahun:                str(normalized.tahun)            } : {}),
          ...(normalized.idAffiliate      ? { idAffiliate:          str(normalized.idAffiliate)      } : {}),
        };

        if (mode === "upsert") {
          const existing = await prisma.databaseAffiliate.findFirst({
            where: { tiktokUsername: username, deletedAt: null },
          });
          if (existing) {
            await prisma.databaseAffiliate.update({ where: { id: existing.id }, data });
            result.updated++;
          } else {
            await prisma.databaseAffiliate.create({ data });
            result.created++;
          }
        } else {
          await prisma.databaseAffiliate.create({ data });
          result.created++;
        }
      } catch (rowErr) {
        result.failed++;
        result.errors.push({ row: rowNum, message: String(rowErr).replace(/Error: /g, "") });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Database import error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
