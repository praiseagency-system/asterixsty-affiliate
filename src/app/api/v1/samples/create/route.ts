/**
 * POST /api/v1/samples/create
 *
 * Receives scraped order data from the Chrome extension.
 * Supports two record formats:
 *
 *   v1 (flat, snake_case):
 *     { order_id, order_status, order_date, creator_username, creator_name, ... }
 *
 *   v2 (nested, camelCase — Extension v2.1+):
 *     { sampleOrderId, orderStatus, createdAt, quantity,
 *       creator: { username, name, phone, address, creatorId, profileLink },
 *       product: { skuId, skuName, productName, productImage, productLink },
 *       shipping: { trackingNumber, shippingProvider },
 *       shipment: { status, shippedAt, deliveredAt, estimatedDelivery },
 *       campaign: { campaignId, campaignName },
 *       platform }
 *
 * UPSERT behaviour per record:
 *   NEW  (orderId not in DB) → CREATE ScrapedOrder + auto-create affiliate if new
 *   DUP  (orderId exists)    → UPDATE tracking fields only (trackingNumber,
 *                              shipmentStatus, orderStatus, shippedAt, deliveredAt,
 *                              estimatedDelivery) when they carry new data
 *   Both paths write a ScrapeLog entry.
 *
 * Request:
 *   Authorization: Bearer <license_key>
 *   X-Workspace-ID: <workspaceId>
 *   Body: { records: [...], scraped_at?: string, scrapedAt?: string }
 *
 * Response 200:
 *   { success, total, records_created, records_updated, duplicates_skipped,
 *     affiliates_new, affiliates_pending, errors }
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
  order_id?:             string;
  order_status?:         string;
  order_date?:           string;
  quantity?:             number;
  // Creator
  creator_username?:     string;
  creator_name?:         string;
  creator_phone?:        string;
  creator_address?:      string;
  creator_id?:           string;
  creator_profile_link?: string;
  // Product
  product_name?:         string;
  product_sku?:          string;
  sku_name?:             string;
  product_image_url?:    string;
  product_link?:         string;
  // Shipping
  shipping_provider?:    string;
  tracking_number?:      string;
  // Shipment tracking (from detail endpoint or update)
  shipment_status?:      string;   // raw platform status string
  shipped_at?:           string;
  delivered_at?:         string;
  estimated_delivery?:   string;
  // Campaign / platform
  platform?:             string;
  campaign_id?:          string;
  campaign_name?:        string;
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
  shipment?: {
    status?:            string;   // raw TikTok shipment status
    shippedAt?:         string;
    deliveredAt?:       string;
    estimatedDelivery?: string;
  };
  campaign?: {
    campaignId?:   string;
    campaignName?: string;
  };
}

/** Map raw TikTok / Tokopedia shipment status → internal canonical value */
function mapShipmentStatus(raw?: string): string {
  if (!raw) return "";
  const s = raw.toUpperCase().replace(/[\s_-]+/g, "_");

  // TikTok Shop status strings (as observed from API)
  if (/WAIT.*SHIP|WAITING_SHIPMENT|PENDING_SHIP|UNPACKED|AWAITING/.test(s)) return "WAITING_SHIPMENT";
  if (/SHIP|IN_TRANSIT|TRANSIT|ON_THE_WAY|DIKIRIM|SEDANG|DELIVERY_IN_PROGRESS/.test(s)) return "SEDANG_DIKIRIM";
  if (/DELIVERED|SELESAI|COMPLETED|RECEIVED|SUCCESS/.test(s)) return "DELIVERED";
  if (/OVERDUE|LATE|TERLAMBAT|EXPIRED|CANCEL/.test(s)) return "OVERDUE";

  // Tokopedia
  if (/DIKIRIM|PENGIRIMAN/.test(s)) return "SEDANG_DIKIRIM";
  if (/SELESAI|PESANAN_SELESAI/.test(s)) return "DELIVERED";
  if (/PESANAN_BARU|MENUNGGU|SIAP_DIKIRIM/.test(s)) return "WAITING_SHIPMENT";

  return ""; // unknown — store empty, don't guess
}

/** Normalise either v1 flat or v2 nested record into a FlatRecord */
function normaliseRecord(raw: Record<string, unknown>): FlatRecord {
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
      shipment_status:     r.shipment?.status,
      shipped_at:          r.shipment?.shippedAt,
      delivered_at:        r.shipment?.deliveredAt,
      estimated_delivery:  r.shipment?.estimatedDelivery,
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

  const records: FlatRecord[] = rawRecords.map(normaliseRecord);

  const version = rawRecords[0] && "sampleOrderId" in rawRecords[0] ? "2" : "1";
  console.log(`[Samples] Processing ${records.length} records — workspace: ${ws.name} (id:${ws.id}) v${version}`);

  const results = {
    total:               records.length,
    records_created:     0,
    records_updated:     0,
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
      // ── 1. Workspace-scoped duplicate check ────────────────────────────────
      const existing = await prisma.scrapedOrder.findFirst({
        where:  { workspaceId: ws.id, orderId: record.order_id },
        select: { id: true, trackingNumber: true, shipmentStatus: true },
      });

      if (existing) {
        // ── UPSERT: update tracking / shipment fields when we have new data ──
        const incomingTracking  = record.tracking_number?.trim()    ?? "";
        const incomingProvider  = record.shipping_provider?.trim()  ?? "";
        const incomingStatus    = mapShipmentStatus(record.shipment_status);
        const incomingShippedAt = record.shipped_at          ?? "";
        const incomingDelivered = record.delivered_at        ?? "";
        const incomingEstimate  = record.estimated_delivery  ?? "";
        const incomingOrderStatus = record.order_status      ?? "";

        // Only write if we're bringing new information
        const hasNewTracking = incomingTracking  && !existing.trackingNumber;
        const hasNewStatus   = incomingStatus    && incomingStatus !== existing.shipmentStatus;
        const hasAnyUpdate   = hasNewTracking || hasNewStatus || incomingShippedAt || incomingDelivered || incomingEstimate;

        if (hasAnyUpdate) {
          await prisma.scrapedOrder.update({
            where: { id: existing.id },
            data: {
              ...(incomingTracking   && { trackingNumber:    incomingTracking }),
              ...(incomingProvider   && { shippingProvider:  incomingProvider }),
              ...(incomingStatus     && { shipmentStatus:    incomingStatus }),
              ...(incomingShippedAt  && { shippedAt:         incomingShippedAt }),
              ...(incomingDelivered  && { deliveredAt:       incomingDelivered }),
              ...(incomingEstimate   && { estimatedDelivery: incomingEstimate }),
              ...(incomingOrderStatus && { orderStatus:      incomingOrderStatus }),
            },
          });
          results.records_updated++;
          console.log(`  [Samples] UPDATED: ${record.order_id}  status:${incomingStatus || '-'}  tracking:${incomingTracking || '-'}`);
        } else {
          results.duplicates_skipped++;
          console.log(`  [Samples] DUPLICATE: ${record.order_id}`);
        }
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
      const internalShipmentStatus = mapShipmentStatus(record.shipment_status);

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
          // Shipment tracking
          shipmentStatus:     internalShipmentStatus,
          shippedAt:          record.shipped_at           ?? "",
          deliveredAt:        record.delivered_at         ?? "",
          estimatedDelivery:  record.estimated_delivery   ?? "",
          // Campaign / platform
          platform:           record.platform             ?? "tokopedia",
          campaignId:         record.campaign_id          ?? "",
          campaignName:       record.campaign_name        ?? "",
          status:             "pending_confirmation",
        },
      });

      results.records_created++;
      console.log(`  [Samples] CREATED: ${record.order_id}  @${username || '-'}  platform:${record.platform ?? '?'}${internalShipmentStatus ? `  shipment:${internalShipmentStatus}` : ''}`);

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
      duplicates:   results.duplicates_skipped + results.records_updated,
      status:       "success",
    },
  }).catch((err) => console.error("[Samples] ScrapeLog error:", err));

  console.log("[Samples] Done:", {
    created:    results.records_created,
    updated:    results.records_updated,
    duplicates: results.duplicates_skipped,
    errors:     results.errors.length,
  });

  return NextResponse.json({
    success:             true,
    total:               results.total,
    records_created:     results.records_created,
    records_updated:     results.records_updated,
    duplicates_skipped:  results.duplicates_skipped,
    affiliates_new:      results.affiliates_new,
    affiliates_pending:  results.affiliates_pending,
    errors:              results.errors,
  });
}
