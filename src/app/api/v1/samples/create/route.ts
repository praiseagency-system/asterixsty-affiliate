/**
 * POST /api/v1/samples/create
 *
 * Receives scraped order data from the Chrome extension.
 * For each record:
 *   1. Skip duplicate orders (order_id already in DB)
 *   2. Auto-create DatabaseAffiliate (status = "Pending") if username is new
 *   3. Save ScrapedOrder with status = "pending_confirmation"
 *   4. Write ScrapeLog entry
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   Body: {
 *     scraped_at: string,
 *     records: [{
 *       order_id, order_status, order_date,
 *       creator_username, creator_name, creator_phone, creator_address,
 *       product_name, product_sku, product_image_url,
 *       shipping_provider, tracking_number, platform
 *     }]
 *   }
 *
 * Response 200:
 *   { success, total, records_created, duplicates_skipped, affiliates_new, affiliates_pending, errors }
 */

import { NextResponse }    from "next/server";
import { requireLicense }  from "@/lib/license-auth";
import { prisma }          from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

interface ScrapeRecord {
  order_id?:          string;
  order_status?:      string;
  order_date?:        string;
  creator_username?:  string;
  creator_name?:      string;
  creator_phone?:     string;
  creator_address?:   string;
  product_name?:      string;
  product_sku?:       string;
  product_image_url?: string;
  shipping_provider?: string;
  tracking_number?:   string;
  platform?:          string;
}

export async function POST(req: Request) {
  const ws = await requireLicense(req);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  let body: { records?: ScrapeRecord[]; scraped_at?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { records } = body;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: "records array is required" }, { status: 400 });
  }

  console.log(`[Samples] Processing ${records.length} records for workspace ${ws.name}`);

  const results = {
    total:               records.length,
    records_created:     0,
    duplicates_skipped:  0,
    affiliates_new:      0,
    affiliates_pending:  0,
    errors:              [] as { order_id: string; error: string }[],
  };

  for (const record of records) {
    if (!record.order_id) {
      results.errors.push({ order_id: "(missing)", error: "order_id is required" });
      continue;
    }

    try {
      // ── 1. Duplicate check ──────────────────────────────────────────────────
      const existing = await prisma.scrapedOrder.findUnique({
        where:  { orderId: record.order_id },
        select: { id: true },
      });
      if (existing) {
        results.duplicates_skipped++;
        continue;
      }

      // ── 2. Find or auto-create DatabaseAffiliate ────────────────────────────
      const username = (record.creator_username ?? "").replace("@", "").trim();
      let isNewAffiliate = false;

      if (username) {
        const existingAffiliate = await prisma.databaseAffiliate.findFirst({
          where: { workspaceId: ws.id, tiktokUsername: username, deletedAt: null },
        });

        if (!existingAffiliate) {
          await prisma.databaseAffiliate.create({
            data: {
              workspaceId:    ws.id,
              tiktokUsername: username,
              namaAffiliator: record.creator_name    ?? "",
              noWhatsapp:     record.creator_phone   ?? "",
              alamat:         record.creator_address ?? "",
              status:         "Pending",  // awaiting PIC confirmation
              tahun:          String(new Date().getFullYear()),
            },
          });
          isNewAffiliate = true;
          results.affiliates_new++;
          console.log(`[Samples] New affiliate (Pending): @${username}`);
        } else if (existingAffiliate.status === "Pending") {
          results.affiliates_pending++;
        }

        // Notify ADMIN+ about new affiliate from scraper
        if (isNewAffiliate) {
          void createNotification({
            workspaceId: ws.id,
            type:  "affiliate_new",
            title: "Afiliasi baru dari scraper",
            body:  `@${username} terdeteksi dari order ${record.platform ?? "tokopedia"} — menunggu konfirmasi PIC.`,
            href:  `/database`,
          });
        }
      }

      // ── 3. Create ScrapedOrder ──────────────────────────────────────────────
      await prisma.scrapedOrder.create({
        data: {
          workspaceId:      ws.id,
          tiktokUsername:   username,
          creatorName:      record.creator_name      ?? "",
          creatorPhone:     record.creator_phone     ?? "",
          creatorAddress:   record.creator_address   ?? "",
          orderId:          record.order_id,
          orderStatus:      record.order_status      ?? "",
          orderDate:        record.order_date        ?? "",
          productName:      record.product_name      ?? "",
          productSku:       record.product_sku       ?? "",
          productImageUrl:  record.product_image_url ?? "",
          shippingProvider: record.shipping_provider ?? "",
          trackingNumber:   record.tracking_number   ?? "",
          platform:         record.platform          ?? "tokopedia",
          status:           "pending_confirmation",
        },
      });

      results.records_created++;

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Samples] Error on order ${record.order_id}:`, msg);
      results.errors.push({ order_id: record.order_id, error: msg });
    }
  }

  // ── 4. ScrapeLog ─────────────────────────────────────────────────────────────
  await prisma.scrapeLog.create({
    data: {
      workspaceId:  ws.id,
      platform:     records[0]?.platform ?? "tokopedia",
      totalRecords: results.total,
      newRecords:   results.records_created,
      duplicates:   results.duplicates_skipped,
      status:       "success",
    },
  }).catch((err) => console.error("[Samples] ScrapeLog error:", err));

  console.log("[Samples] Done:", results);

  return NextResponse.json({
    success:             true,
    total:               results.total,
    records_created:     results.records_created,
    duplicates_skipped:  results.duplicates_skipped,
    affiliates_new:      results.affiliates_new,
    affiliates_pending:  results.affiliates_pending,
    errors:              results.errors,
  });
}
