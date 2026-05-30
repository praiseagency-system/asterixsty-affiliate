"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import ConfirmModal from "@/components/ConfirmModal";
import { PERMISSIONS } from "@/lib/permissions";
import PermissionGate from "@/components/PermissionGate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScrapedOrder {
  id:                 number;
  workspaceId:        number;
  // Creator
  tiktokUsername:     string;
  creatorName:        string;
  creatorPhone:       string;
  creatorAddress:     string;
  creatorId:          string;
  creatorProfileLink: string;
  // Order
  orderId:            string;
  orderStatus:        string;
  orderDate:          string;
  quantity:           number;
  // Product
  productName:        string;
  productSku:         string;
  skuName:            string;
  productImageUrl:    string;
  productLink:        string;
  // Shipping
  shippingProvider:   string;
  trackingNumber:     string;
  // Shipment tracking
  shipmentStatus:     string;
  shippedAt:          string;
  deliveredAt:        string;
  estimatedDelivery:  string;
  // Platform
  platform:           string;
  campaignId:         string;
  campaignName:       string;
  // PIC / review
  status:             string;
  picName:            string;
  catatan:            string;
  kategoriPengiriman: string;
  targetVideo:        number;
  // Enriched
  affiliate_status:   string | null;
  affiliate_phone:    string;
  affiliate_name:     string;
  // Meta
  createdAt:          string;
  updatedAt:          string;
}

interface ConfirmPayload {
  orderId:            number;
  kategoriPengiriman: string;
  picName:            string;
  targetVideo:        number;
  catatan:            string;
  createDelivery:     boolean;
}

const SAMPLE_CATEGORIES = [
  "First Collaboration",
  "Campaign Support",
  "Repeat / Restock",
  "Paid Collaboration",
  "Custom Request",
] as const;

// ─── Shipment status helpers ──────────────────────────────────────────────────

const SHIPMENT_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  WAITING_SHIPMENT: { label: "Menunggu Kirim", bg: "bg-amber-50",   text: "text-amber-700"   },
  SEDANG_DIKIRIM:   { label: "Sedang Dikirim", bg: "bg-blue-50",    text: "text-blue-700"    },
  DELIVERED:        { label: "Terkirim",        bg: "bg-emerald-50", text: "text-emerald-700" },
  OVERDUE:          { label: "Overdue",          bg: "bg-red-50",    text: "text-red-700"     },
};

function ShipmentBadge({ status }: { status: string }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  const s = SHIPMENT_LABELS[status];
  if (!s) return <span className="text-xs text-gray-500">{status}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: string }) {
  const isTikTok = platform === "tiktok";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
      isTikTok ? "bg-pink-50 text-pink-700" : "bg-green-50 text-green-700"
    }`}>
      {isTikTok ? "TikTok" : "Tokopedia"}
    </span>
  );
}

// ─── Confirm / Reject modal ───────────────────────────────────────────────────

interface OrderModalProps {
  order:    ScrapedOrder;
  onClose:  () => void;
  onSubmit: (payload: ConfirmPayload) => Promise<void>;
}

function OrderModal({ order, onClose, onSubmit }: OrderModalProps) {
  const [form, setForm] = useState<ConfirmPayload>({
    orderId:            order.id,
    kategoriPengiriman: order.kategoriPengiriman || "First Collaboration",
    picName:            order.picName || "",
    targetVideo:        order.targetVideo || 3,
    catatan:            order.catatan || "",
    createDelivery:     true,
  });
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof ConfirmPayload>(k: K, v: ConfirmPayload[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Konfirmasi Order</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              @{order.tiktokUsername} · {order.orderId}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
        </div>

        {/* Product summary */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
          <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{order.productName || "—"}</div>
          {order.skuName && <div className="text-gray-500">{order.skuName}</div>}
          <div className="flex gap-3 text-gray-500">
            <span>Qty: {order.quantity}</span>
            {order.platform && <PlatformBadge platform={order.platform} />}
            {order.shipmentStatus && <ShipmentBadge status={order.shipmentStatus} />}
          </div>
          {order.trackingNumber && (
            <div className="text-gray-500">Resi: <span className="font-mono">{order.trackingNumber}</span> · {order.shippingProvider}</div>
          )}
        </div>

        {/* Form fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori Pengiriman</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.kategoriPengiriman}
              onChange={(e) => set("kategoriPengiriman", e.target.value)}
            >
              {SAMPLE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIC</label>
              <input
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Nama PIC"
                value={form.picName}
                onChange={(e) => set("picName", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Video</label>
              <input
                type="number"
                min={0}
                max={20}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.targetVideo}
                onChange={(e) => set("targetVideo", Math.max(0, Number(e.target.value)))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Opsional..."
              value={form.catatan}
              onChange={(e) => set("catatan", e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-indigo-600"
              checked={form.createDelivery}
              onChange={(e) => set("createDelivery", e.target.checked)}
            />
            Buat entri Send Sample secara otomatis
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Batal
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              await onSubmit(form);
              setLoading(false);
            }}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {loading ? "Menyimpan..." : "Konfirmasi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScrapedOrdersPage() {
  const { wsFetch } = useWorkspace();

  const [orders,     setOrders]     = useState<ScrapedOrder[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<"pending_confirmation" | "active" | "all">("pending_confirmation");
  const [platform,   setPlatform]   = useState("");
  const [confirming, setConfirming] = useState<ScrapedOrder | null>(null);
  const [cancelId,   setCancelId]   = useState<number | null>(null);
  const [toast,      setToast]      = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const LIMIT = 20;

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status:  activeTab,
        page:    String(page),
        limit:   String(LIMIT),
        ...(platform ? { platform } : {}),
      });
      const res  = await wsFetch(`/api/scraped-orders?${params}`);
      const json = await res.json();
      if (json.success) {
        setOrders(json.data);
        setTotal(json.total);
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, platform, wsFetch]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Reset page on tab/filter change
  useEffect(() => { setPage(1); }, [activeTab, platform]);

  const handleConfirm = async (payload: ConfirmPayload) => {
    try {
      const res = await wsFetch(`/api/scraped-orders/${payload.orderId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:               "active",
          kategoriPengiriman:   payload.kategoriPengiriman,
          targetVideo:          payload.targetVideo,
          picName:              payload.picName,
          catatan:              payload.catatan,
          createSampleDelivery: payload.createDelivery,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(
          payload.createDelivery
            ? "Order dikonfirmasi & entri Send Sample dibuat ✓"
            : "Order dikonfirmasi ✓"
        );
        setConfirming(null);
        fetchOrders();
      } else {
        showToast(json.error || "Gagal menyimpan", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  };

  const handleCancel = async (id: number) => {
    try {
      const res = await wsFetch(`/api/scraped-orders/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const json = await res.json();
      if (json.success) {
        showToast("Order dibatalkan");
        fetchOrders();
      } else {
        showToast(json.error || "Gagal membatalkan", "error");
      }
    } finally {
      setCancelId(null);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  // ── Tab counts ──
  const pendingCount = activeTab === "pending_confirmation" ? total : undefined;

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_SAMPLE}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scraped Orders Inbox</h1>
            <p className="text-sm text-gray-500 mt-1">
              Order yang di-scrape dari TikTok Shop / Tokopedia menunggu konfirmasi PIC
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Tabs + Platform filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm font-medium">
            {(["pending_confirmation", "active", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 transition ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {tab === "pending_confirmation" ? "Pending" : tab === "active" ? "Aktif" : "Semua"}
                {tab === "pending_confirmation" && pendingCount !== undefined && pendingCount > 0 && (
                  <span className="ml-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-xs px-1.5 py-0.5 rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Platform</option>
            <option value="tiktok">TikTok Shop</option>
            <option value="tokopedia">Tokopedia</option>
          </select>

          <span className="text-sm text-gray-400 ml-auto">{total} order</span>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400 text-sm">Memuat...</div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="text-sm font-medium text-gray-500">Tidak ada order</p>
              <p className="text-xs text-gray-400 mt-1">
                {activeTab === "pending_confirmation"
                  ? "Belum ada order baru dari scraper"
                  : "Tidak ada data untuk filter ini"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Kreator</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Produk</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Order ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Pengiriman</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Platform</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Waktu Scrape</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {orders.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      onConfirm={() => setConfirming(order)}
                      onCancel={() => setCancelId(order.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                ←
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                →
              </button>
            </div>
          </div>
        )}

        {/* Confirm modal */}
        {confirming && (
          <OrderModal
            order={confirming}
            onClose={() => setConfirming(null)}
            onSubmit={handleConfirm}
          />
        )}

        {/* Cancel confirmation */}
        {cancelId !== null && (
          <ConfirmModal
            title="Batalkan Order?"
            message="Order ini akan ditandai sebagai cancelled dan tidak muncul lagi di inbox."
            confirmLabel="Batalkan Order"
            danger
            onConfirm={() => handleCancel(cancelId!)}
            onCancel={() => setCancelId(null)}
          />
        )}

        {/* Toast */}
        {toast && (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium transition z-50 ${
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </PermissionGate>
  );
}

// ─── Order row component ──────────────────────────────────────────────────────

function OrderRow({
  order,
  onConfirm,
  onCancel,
}: {
  order:     ScrapedOrder;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  const isPending = order.status === "pending_confirmation";
  const isActive  = order.status === "active";

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">

      {/* Kreator */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-[140px]">
          <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-semibold text-xs shrink-0">
            {(order.tiktokUsername || "?")[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[120px]">
              @{order.tiktokUsername || "—"}
            </div>
            {order.affiliate_name && order.affiliate_name !== order.tiktokUsername && (
              <div className="text-xs text-gray-400 truncate max-w-[120px]">{order.affiliate_name}</div>
            )}
            {order.affiliate_status && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                order.affiliate_status === "Aktif"
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              }`}>
                {order.affiliate_status}
              </span>
            )}
          </div>
        </div>
      </td>

      {/* Produk */}
      <td className="px-4 py-3">
        <div className="max-w-[200px]">
          <div className="font-medium text-gray-800 dark:text-gray-200 truncate text-xs">
            {order.productName || "—"}
          </div>
          {order.skuName && (
            <div className="text-xs text-gray-400 truncate">{order.skuName}</div>
          )}
          <div className="text-xs text-gray-400">Qty: {order.quantity}</div>
        </div>
      </td>

      {/* Order ID */}
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={order.orderId}>
          {order.orderId}
        </div>
        {order.orderStatus && (
          <div className="text-xs text-gray-400 mt-0.5">{order.orderStatus}</div>
        )}
      </td>

      {/* Pengiriman */}
      <td className="px-4 py-3">
        <div className="space-y-1 min-w-[160px]">
          <ShipmentBadge status={order.shipmentStatus} />
          {order.trackingNumber && (
            <div className="text-xs font-mono text-gray-500 truncate max-w-[150px]" title={order.trackingNumber}>
              {order.shippingProvider && `${order.shippingProvider} · `}{order.trackingNumber}
            </div>
          )}
          {!order.trackingNumber && !order.shipmentStatus && (
            <div className="text-xs text-gray-400">Belum ada data</div>
          )}
        </div>
      </td>

      {/* Platform */}
      <td className="px-4 py-3">
        <PlatformBadge platform={order.platform} />
        {order.campaignName && (
          <div className="text-xs text-gray-400 mt-1 truncate max-w-[100px]">{order.campaignName}</div>
        )}
      </td>

      {/* Waktu Scrape */}
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {new Date(order.createdAt).toLocaleDateString("id-ID", {
          day:   "numeric",
          month: "short",
          year:  "numeric",
        })}
        <div className="text-gray-400">
          {new Date(order.createdAt).toLocaleTimeString("id-ID", {
            hour:   "2-digit",
            minute: "2-digit",
          })}
        </div>
      </td>

      {/* Aksi */}
      <td className="px-4 py-3 text-right">
        {isPending ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onConfirm}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition"
            >
              Konfirmasi
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Skip
            </button>
          </div>
        ) : isActive ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Dikonfirmasi
          </span>
        ) : (
          <span className="text-xs text-gray-400">{order.status}</span>
        )}
      </td>
    </tr>
  );
}
