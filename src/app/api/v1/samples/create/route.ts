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
  // Resolution engine signal — set by extension when detail enrichment exhausted retries
  _resolve_failed?:      boolean;
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
      _resolve_failed:     (raw as Record<string,unknown>)._resolveFailed === true,
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
      // ── 0. Resolution-failed signal from extension ──────────────────────────
      // When the extension exhausted retries for detail enrichment, it emits the
      // record with _resolveFailed=true.  Just mark the DB order as FAILED.
      if (record._resolve_failed) {
        const failedOrder = await prisma.scrapedOrder.findFirst({
          where:  { workspaceId: ws.id, orderId: record.order_id },
          select: { id: true, status: true, resolveAttempts: true },
        });
        if (failedOrder) {
          const PRE_CONFIRM = ["SCRAPED", "RESOLVING", "FAILED"];
          if (PRE_CONFIRM.includes(failedOrder.status)) {
            await prisma.scrapedOrder.update({
              where: { id: failedOrder.id },
              data:  { status: "FAILED", resolveAttempts: (failedOrder.resolveAttempts || 0) + 1, resolveError: "Max retries exceeded" },
            });
            console.log(`  [Samples] FAILED: ${record.order_id} (resolution engine gave up)`);
          }
        }
        results.duplicates_skipped++;
        continue;
      }

      // ── 1. Workspace-scoped duplicate check ────────────────────────────────
      const existing = await prisma.scrapedOrder.findFirst({
        where:  { workspaceId: ws.id, orderId: record.order_id },
        select: {
          id: true, status: true,
          trackingNumber: true, shipmentStatus: true, orderStatus: true,
          tiktokUsername: true, creatorName: true, creatorId: true, creatorProfileLink: true,
          productSku: true, productName: true, skuName: true, productImageUrl: true,
          shippingProvider: true,
        },
      });

      if (existing) {
        // ── UPSERT: update any field where incoming data fills a gap ──────────
        const incomingUsername   = (record.creator_username ?? "").replace("@", "").trim();
        const incomingTracking   = record.tracking_number?.trim()   ?? "";
        const incomingProvider   = record.shipping_provider?.trim() ?? "";
        const incomingStatus     = mapShipmentStatus(record.shipment_status);
        const incomingShippedAt  = record.shipped_at         ?? "";
        const incomingDelivered  = record.delivered_at       ?? "";
        const incomingEstimate   = record.estimated_delivery ?? "";
        const incomingOrderSt    = record.order_status       ?? "";
        const incomingCreatorName = record.creator_name      ?? "";
        const incomingCreatorId   = record.creator_id        ?? "";
        const incomingProfileLink = record.creator_profile_link ?? "";
        const incomingProductSku  = record.product_sku       ?? "";
        const incomingProductName = record.product_name      ?? "";
        const incomingSkuName     = record.sku_name          ?? "";
        const incomingImgUrl      = record.product_image_url ?? "";

        const patch: Record<string, unknown> = {};
        if (incomingUsername  && !existing.tiktokUsername)   patch.tiktokUsername     = incomingUsername;
        if (incomingCreatorName && !existing.creatorName)    patch.creatorName        = incomingCreatorName;
        if (incomingCreatorId   && !existing.creatorId)      patch.creatorId          = incomingCreatorId;
        if (incomingProfileLink && !existing.creatorProfileLink) patch.creatorProfileLink = incomingProfileLink;
        if (incomingProductSku  && !existing.productSku)     patch.productSku         = incomingProductSku;
        if (incomingProductName && !existing.productName)    patch.productName        = incomingProductName;
        if (incomingSkuName     && !existing.skuName)        patch.skuName            = incomingSkuName;
        if (incomingImgUrl      && !existing.productImageUrl) patch.productImageUrl   = incomingImgUrl;
        if (incomingTracking    && !existing.trackingNumber) patch.trackingNumber     = incomingTracking;
        if (incomingProvider    && !existing.shippingProvider) patch.shippingProvider = incomingProvider;
        if (incomingStatus      && incomingStatus !== existing.shipmentStatus) patch.shipmentStatus = incomingStatus;
        if (incomingShippedAt)  patch.shippedAt         = incomingShippedAt;
        if (incomingDelivered)  patch.deliveredAt        = incomingDelivered;
        if (incomingEstimate)   patch.estimatedDelivery  = incomingEstimate;
        if (incomingOrderSt && !existing.orderStatus)    patch.orderStatus    = incomingOrderSt;

        // Status upgrade: if record gains creator + product + shipping → READY_CONFIRM
        const mergedUsername  = (patch.tiktokUsername  as string) || existing.tiktokUsername;
        const mergedSku       = (patch.productSku      as string) || existing.productSku;
        const mergedProduct   = (patch.productName     as string) || existing.productName;
        const mergedTracking  = (patch.trackingNumber  as string) || existing.trackingNumber;
        const mergedSStatus   = (patch.shipmentStatus  as string) || existing.shipmentStatus;
        const mergedOrderSt   = (patch.orderStatus     as string) || existing.orderStatus;
        const isNowRich = !!mergedUsername && !!(mergedSku || mergedProduct) &&
                          !!(mergedTracking || mergedSStatus || mergedOrderSt);
        const PRE_CONFIRM_STATUSES = ["SCRAPED", "RESOLVING", "FAILED", "pending_confirmation"];
        if (isNowRich && PRE_CONFIRM_STATUSES.includes(existing.status)) {
          patch.status = "READY_CONFIRM";
        }

        if (Object.keys(patch).length > 0) {
          await prisma.scrapedOrder.update({ where: { id: existing.id }, data: patch });
          results.records_updated++;
          console.log(
            `  [Samples] UPDATED: ${record.order_id}` +
            `  fields:${Object.keys(patch).join(",")}` +
            (patch.status ? `  →status:${patch.status}` : "")
          );
        } else {
          results.duplicates_skipped++;
          console.log(`  [Samples] DUPLICATE (no new data): ${record.order_id}`);
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
      const newSku      = record.product_sku     ?? "";
      const newProduct  = record.product_name    ?? "";
      const newTracking = record.tracking_number ?? "";

      // Determine initial status:
      //   READY_CONFIRM when creator + product + any shipping data all present
      //   SCRAPED       otherwise (detail enrichment will upgrade it)
      const initialIsRich =
        !!username &&
        !!(newSku || newProduct) &&
        !!(newTracking || internalShipmentStatus || record.order_status);
      const initialStatus = initialIsRich ? "READY_CONFIRM" : "SCRAPED";

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
          productName:        newProduct,
          productSku:         newSku,
          skuName:            record.sku_name             ?? "",
          productImageUrl:    record.product_image_url    ?? "",
          productLink:        record.product_link         ?? "",
          // Shipping
          shippingProvider:   record.shipping_provider    ?? "",
          trackingNumber:     newTracking,
          // Shipment tracking
          shipmentStatus:     internalShipmentStatus,
          shippedAt:          record.shipped_at           ?? "",
          deliveredAt:        record.delivered_at         ?? "",
          estimatedDelivery:  record.estimated_delivery   ?? "",
          // Campaign / platform
          platform:           record.platform             ?? "tokopedia",
          campaignId:         record.campaign_id          ?? "",
          campaignName:       record.campaign_name        ?? "",
          // Status pipeline: SCRAPED → READY_CONFIRM → CONFIRMED → SYNCED
          status:             initialStatus,
        },
      });

      results.records_created++;
      console.log(
        `  [Samples] CREATED: ${record.order_id}  @${username || '-'}` +
        `  status:${initialStatus}  platform:${record.platform ?? '?'}` +
        (internalShipmentStatus ? `  shipment:${internalShipmentStatus}` : "")
      );

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
