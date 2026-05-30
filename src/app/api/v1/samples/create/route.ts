/**
 * POST /api/v1/samples/create
 *
 * Receives scraped order data from the Chrome extension.
 * Supports two record formats:
 *
 *   v1 (flat, snake_case):
 *     { order_id, order_status, order_date, creator_username, creator_name, ... }
 *
 *   v2 (nested, camelCase — Extension v2.1):
 *     { sampleOrderId, orderStatus, createdAt, quantity,
 *       creator: { username, name, phone, address, creatorId, profileLink },
 *       product: { skuId, skuName, productName, productImage, productLink },
 *       shipping: { trackingNumber, shippingProvider },
 *       campaign: { campaignId, campaignName },
 *       platform }
 *
 * For each record:
 *   1. Skip duplicate orders (orderId already in DB)
 *   2. Auto-create DatabaseAffiliate (status = "Pending") if username is new
 *   3. Save ScrapedOrder with status = "pending_confirmation"
 *   4. Write ScrapeLog entry
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   X-Workspace-ID: <workspaceId>   (optional — used by extension v2 for routing)
 *   Body: { records: [...], scraped_at?: string, scrapedAt?: string }
 *
 * Response 200:
 *   { success, total, records_created, duplicates_skipped, affiliates_new, affiliates_pending, errors }
 */

import { NextResponse }       from "next/server";
import { requireLicense }     from "@/lib/license-auth";
import { prisma }             from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

// ── CORS preflight (chrome-extension:// origin) ───────────────────────────────
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-ID",
    },
  });
}

// ── Normalised flat record (internal representation) ─────────────────────────
interface FlatRecord {
  order_id?:           string;
  order_status?:       string;
  order_date?:         string;
  quantity?:           number;
  // Creator
  creator_username?:   string;
  creator_name?:       string;
  creator_phone?:      string;
  creator_address?:    string;
  creator_id?:         string;
  creator_profile_link?: string;
  // Product
  product_name?:       string;
  product_sku?:        string;
  sku_name?:           string;
  product_image_url?:  string;
  product_link?:       string;
  // Shipping
  shipping_provider?:  string;
  tracking_number?:    string;
  // Campaign / platform
  platform?:           string;
  campaign_id?:        string;
  campaign_name?:      string;
}

// ── Extension v2 nested record shape ─────────────────────────────────────────
interface NestedRecord {
  sampleOrderId?: string;
  orderStatus?:   string;
  createdAt?:     string;
  updatedAt?:     string;
  quantity?:      number;
  platform?:      string;
  creator?: {
    username?:    string;
    name?:        string;
    phone?:       string;
    address?:     string;
    creatorId?:   string;
    profileLink?: string;
  };
  product?: {
    skuId?:        string;
    skuName?:      string;
    productName?:  string;
    productImage?: string;
    productLink?:  string;
  };
  shipping?: {
    trackingNumber?:   string;
    shippingProvider?: string;
  };
  campaign?: {
    campaignId?:   string;
    campaignName?: string;
  };
}

/** Normalise either v1 flat or v2 nested record into a FlatRecord */
function normaliseRecord(raw: Record<string, unknown>): FlatRecord {
  // Detect v2 by presence of camelCase / nested fields
  if ("sampleOrderId" in raw || "creator" in raw) {
    const r = raw as NestedRecord;
    return {
      order_id:            r.sampleOrderId,
      order_status:        r.orderStatus,
      order_date:          r.createdAt,
      quantity:            r.quantity,
      creator_username:    r.creator?.username,
      creator_name:        r.creator?.name,
      creator_phone:       r.creator?.phone,
      creator_address:     r.creator?.address,
      creator_id:          r.creator?.creatorId,
      creator_profile_link: r.creator?.profileLink,
      product_name:        r.product?.productName,
      product_sku:         r.product?.skuId,
      sku_name:            r.product?.skuName,
      product_image_url:   r.product?.productImage,
      product_link:        r.product?.productLink,
      shipping_provider:   r.shipping?.shippingProvider,
      tracking_number:     r.shipping?.trackingNumber,
      platform:            r.platform ?? "tokopedia",
      campaign_id:         r.campaign?.campaignId,
      campaign_name:       r.campaign?.campaignName,
    };
  }
  // v1 flat — pass through
  return raw as FlatRecord;
}

export async function POST(req: Request) {
  const ws = await requireLicense(req);
  if (!ws.ok) {
    return NextResponse.json({ error: ws.error }, { status: ws.status });
  }

  let body: { records?: Record<string, unknown>[]; scraped_at?: string; scrapedAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawRecords = body.records;
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return NextResponse.json({ error: "records array is required" }, { status: 400 });
  }

  // Normalise v1 / v2 records into a uniform flat shape
  const records: FlatRecord[] = rawRecords.map(normaliseRecord);

  const version = rawRecords[0] && "sampleOrderId" in rawRecords[0] ? "2" : "1";
  console.log(`[Samples] Processing ${records.length} records — workspace: ${ws.name} (id:${ws.id}) v${version}`);
  console.log(`[Samples] Dedup scope: workspaceId=${ws.id} (backend is source of truth)`);

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
      // ── 1. Duplicate check — scoped to this workspace ──────────────────────
      // Backend is the SOLE source of truth for dedup.
      // The extension sends ALL records; we decide here what's new vs duplicate.
      const existing = await prisma.scrapedOrder.findFirst({
        where:  { workspaceId: ws.id, orderId: record.order_id },
        select: { id: true },
      });
      if (existing) {
        results.duplicates_skipped++;
        console.log(`  [Samples] DUPLICATE: ${record.order_id}`);
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
              status:         "Pending",
              tahun:          String(new Date().getFullYear()),
            },
          });
          isNewAffiliate = true;
          results.affiliates_new++;
          console.log(`[Samples] New affiliate (Pending): @${username}`);
        } else if (existingAffiliate.status === "Pending") {
          results.affiliates_pending++;
        }

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
          workspaceId:        ws.id,
          // Creator
          tiktokUsername:     username,
          creatorName:        record.creator_name         ?? "",
          creatorPhone:       record.creator_phone        ?? "",
          creatorAddress:     record.creator_address      ?? "",
          creatorId:          record.creator_id           ?? "",
          creatorProfileLink: record.creator_profile_link ?? "",
          // Order
          orderId:            record.order_id,
          orderStatus:        record.order_status         ?? "",
          orderDate:          record.order_date           ?? "",
          quantity:           record.quantity             ?? 1,
          // Product
          productName:        record.product_name         ?? "",
          productSku:         record.product_sku          ?? "",
          skuName:            record.sku_name             ?? "",
          productImageUrl:    record.product_image_url    ?? "",
          productLink:        record.product_link         ?? "",
          // Shipping
          shippingProvider:   record.shipping_provider    ?? "",
          trackingNumber:     record.tracking_number      ?? "",
          // Campaign / platform
          platform:           record.platform             ?? "tokopedia",
          campaignId:         record.campaign_id          ?? "",
          campaignName:       record.campaign_name        ?? "",
          status:             "pending_confirmation",
        },
      });

      results.records_created++;
      console.log(`  [Samples] CREATED: ${record.order_id}  @${username || '-'}  platform:${record.platform ?? '?'}`);

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
