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
  mediaFocus:         string;
  visualTake:         string;
  kategoriAffiliate:  string;
  // Meta
  resolveAttempts:    number;
  resolveError:       string;
  createdAt:          string;
  updatedAt:          string;
  // Enriched from DatabaseAffiliate
  affiliate_status:            string | null;
  affiliate_phone:             string;
  affiliate_name:              string;
  affiliate_mediaFocus:        string;
  affiliate_visualTake:        string;
  affiliate_kategoriAffiliate: string;
}

interface ConfirmPayload {
  orderId:            number;
  kategoriPengiriman: string;
  picName:            string;
  targetVideo:        number;
  catatan:            string;
  mediaFocus:         string;
  visualTake:         string;
  kategoriAffiliate:  string;
  createDelivery:     boolean;
}

const SAMPLE_CATEGORIES = [
  "First Collaboration",
  "Campaign Support",
  "Repeat / Restock",
  "Paid Collaboration",
  "Custom Request",
] as const;

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusKey =
  | "SCRAPED" | "RESOLVING" | "READY_CONFIRM"
  | "CONFIRMED" | "SYNCED" | "FAILED"
  | "pending_confirmation" | "active" | "cancelled";

const STATUS_META: Record<string, {
  label: string; bg: string; text: string; dot: string; spinning?: boolean;
}> = {
  SCRAPED:              { label: "Baru Masuk",       bg: "bg-gray-100",    text: "text-gray-600",    dot: "bg-gray-400"   },
  RESOLVING:            { label: "Sedang Proses",    bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-400", spinning: true },
  READY_CONFIRM:        { label: "Siap Konfirmasi",  bg: "bg-green-50",    text: "text-green-700",   dot: "bg-green-500"  },
  CONFIRMED:            { label: "Dikonfirmasi",     bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500"   },
  SYNCED:               { label: "Tersinkron",       bg: "bg-violet-50",   text: "text-violet-700",  dot: "bg-violet-500" },
  FAILED:               { label: "Gagal Resolve",    bg: "bg-red-50",      text: "text-red-700",     dot: "bg-red-500"    },
  // legacy
  pending_confirmation: { label: "Siap Konfirmasi",  bg: "bg-green-50",    text: "text-green-700",   dot: "bg-green-500"  },
  active:               { label: "Dikonfirmasi",     bg: "bg-blue-50",     text: "text-blue-700",    dot: "bg-blue-500"   },
  cancelled:            { label: "Dibatalkan",        bg: "bg-gray-100",    text: "text-gray-500",    dot: "bg-gray-300"   },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-300" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.text}`}>
      {m.spinning ? (
        <span className="inline-block w-2 h-2 rounded-full border border-current border-t-transparent animate-spin" />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      )}
      {m.label}
    </span>
  );
}

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

// ─── Confirmation modal ───────────────────────────────────────────────────────

interface OrderModalProps {
  order:    ScrapedOrder;
  onClose:  () => void;
  onSubmit: (payload: ConfirmPayload) => Promise<void>;
}

function OrderModal({ order, onClose, onSubmit }: OrderModalProps) {
  const [form, setForm] = useState<ConfirmPayload>({
    orderId:            order.id,
    kategoriPengiriman: order.kategoriPengiriman || "First Collaboration",
    picName:            order.picName            || "",
    targetVideo:        order.targetVideo        || 3,
    catatan:            order.catatan            || "",
    // Pre-fill from order (if already resolved) or from affiliate profile
    mediaFocus:         order.mediaFocus         || order.affiliate_mediaFocus        || "",
    visualTake:         order.visualTake         || order.affiliate_visualTake        || "",
    kategoriAffiliate:  order.kategoriAffiliate  || order.affiliate_kategoriAffiliate || "",
    createDelivery:     true,
  });
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof ConfirmPayload>(k: K, v: ConfirmPayload[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Konfirmasi Order</h2>
            <p className="text-sm text-gray-500 mt-0.5">@{order.tiktokUsername} · {order.platform}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none mt-0.5">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* ── Section 1: TikTok Data (readonly) ──────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-pink-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Data TikTok (Readonly)
              </span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 space-y-2.5 text-sm">

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">TikTok Order ID</div>
                  <div className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                    {order.orderId || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Status Pengiriman</div>
                  <ShipmentBadge status={order.shipmentStatus} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Kreator</div>
                  <div className="text-gray-800 dark:text-gray-200 font-medium">
                    @{order.tiktokUsername || "—"}
                  </div>
                  {order.creatorName && order.creatorName !== order.tiktokUsername && (
                    <div className="text-xs text-gray-500">{order.creatorName}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Platform</div>
                  <PlatformBadge platform={order.platform} />
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-400 mb-0.5">Produk</div>
                <div className="text-gray-800 dark:text-gray-200 font-medium line-clamp-2">
                  {order.productName || "—"}
                </div>
                {order.skuName && (
                  <div className="text-xs text-gray-500 mt-0.5">{order.skuName}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">SKU ID</div>
                  <div className="font-mono text-xs text-gray-700 dark:text-gray-300">
                    {order.productSku || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-0.5">Qty</div>
                  <div className="text-gray-700 dark:text-gray-300">{order.quantity}</div>
                </div>
              </div>

              {(order.trackingNumber || order.shippingProvider) && (
                <div className="grid grid-cols-2 gap-x-4">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">No. Resi</div>
                    <div className="font-mono text-xs text-gray-700 dark:text-gray-300 break-all">
                      {order.trackingNumber || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Kurir</div>
                    <div className="text-gray-700 dark:text-gray-300 text-xs">
                      {order.shippingProvider || "—"}
                    </div>
                  </div>
                </div>
              )}

              {!order.trackingNumber && !order.shipmentStatus && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  Detail pengiriman belum tersedia — extension perlu re-run untuk resolve
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Internal Management ─────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Manajemen Internal
              </span>
            </div>
            <div className="space-y-3">

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kategori Pengiriman
                </label>
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
                    type="number" min={0} max={20}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={form.targetVideo}
                    onChange={(e) => set("targetVideo", Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Media Focus</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Video"
                    value={form.mediaFocus}
                    onChange={(e) => set("mediaFocus", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Visual Take</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. GRWM"
                    value={form.visualTake}
                    onChange={(e) => set("visualTake", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori Affiliate</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. Mid Tier"
                    value={form.kategoriAffiliate}
                    onChange={(e) => set("kategoriAffiliate", e.target.value)}
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

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600"
                  checked={form.createDelivery}
                  onChange={(e) => set("createDelivery", e.target.checked)}
                />
                Buat entri Send Sample secara otomatis
              </label>
            </div>
          </div>
        </div>

        {/* ── Section 3: Actions ──────────────────────────────────────── */}
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
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
            className="flex-[2] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                Konfirmasi &amp; Kirim ke Send Sample
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type GroupTab = "pending" | "confirmed" | "all";

export default function ScrapedOrdersPage() {
  const { wsFetch } = useWorkspace();

  const [orders,     setOrders]     = useState<ScrapedOrder[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<GroupTab>("pending");
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
        group: activeTab,
        page:  String(page),
        limit: String(LIMIT),
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
  useEffect(() => { setPage(1); }, [activeTab, platform]);

  const handleConfirm = async (payload: ConfirmPayload) => {
    try {
      const res = await wsFetch(`/api/scraped-orders/${payload.orderId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status:               "CONFIRMED",
          kategoriPengiriman:   payload.kategoriPengiriman,
          targetVideo:          payload.targetVideo,
          picName:              payload.picName,
          catatan:              payload.catatan,
          mediaFocus:           payload.mediaFocus,
          visualTake:           payload.visualTake,
          kategoriAffiliate:    payload.kategoriAffiliate,
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

  const handleReResolve = async (id: number) => {
    try {
      const res = await wsFetch(`/api/scraped-orders/${id}/re-resolve`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        showToast("Order direset ke SCRAPED — jalankan extension untuk re-resolve");
        fetchOrders();
      } else {
        showToast(json.error || "Gagal reset", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const TAB_LABELS: Record<GroupTab, string> = {
    pending:   "Menunggu",
    confirmed: "Dikonfirmasi",
    all:       "Semua",
  };

  return (
    <PermissionGate permission={PERMISSIONS.VIEW_SAMPLE}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scraped Orders Inbox</h1>
            <p className="text-sm text-gray-500 mt-1">
              Staging area · Validation queue · Detail resolver
            </p>
          </div>
          <button
            onClick={fetchOrders}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* Status pipeline legend */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400 select-none">
          {(["SCRAPED","RESOLVING","READY_CONFIRM","CONFIRMED","SYNCED","FAILED"] as const).map((s, i, arr) => (
            <span key={s} className="flex items-center gap-1.5">
              <StatusBadge status={s} />
              {i < arr.length - 1 && <span className="text-gray-300">→</span>}
            </span>
          ))}
        </div>

        {/* Tabs + Platform filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm font-medium">
            {(["pending", "confirmed", "all"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 transition ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {TAB_LABELS[tab]}
                {tab === "pending" && activeTab === "pending" && total > 0 && (
                  <span className="ml-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 text-xs px-1.5 py-0.5 rounded-full">
                    {total}
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>
              </svg>
              <p className="text-sm font-medium text-gray-500">Tidak ada order</p>
              <p className="text-xs text-gray-400 mt-1">
                {activeTab === "pending"
                  ? "Belum ada order menunggu konfirmasi"
                  : "Tidak ada data untuk filter ini"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Kreator</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Produk / SKU</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Order ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Pengiriman</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Waktu</th>
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
                      onReResolve={() => handleReResolve(order.id)}
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
            <span className="text-gray-500">Halaman {page} dari {totalPages}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >←</button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >→</button>
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
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium z-50 ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}>
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
  onReResolve,
}: {
  order:       ScrapedOrder;
  onConfirm:   () => void;
  onCancel:    () => void;
  onReResolve: () => void;
}) {
  const canConfirm = order.status === "READY_CONFIRM" || order.status === "pending_confirmation";
  const isFailed   = order.status === "FAILED";
  const isResolved = order.status === "CONFIRMED" || order.status === "SYNCED" || order.status === "active";

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

      {/* Produk / SKU */}
      <td className="px-4 py-3">
        <div className="max-w-[200px]">
          {order.productName ? (
            <div className="font-medium text-gray-800 dark:text-gray-200 text-xs truncate">
              {order.productName}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">Produk belum diketahui</div>
          )}
          {order.skuName && <div className="text-xs text-gray-400 truncate">{order.skuName}</div>}
          {order.productSku && (
            <div className="font-mono text-xs text-gray-400 truncate">SKU: {order.productSku}</div>
          )}
          <div className="text-xs text-gray-400">Qty: {order.quantity}</div>
        </div>
      </td>

      {/* Order ID */}
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={order.orderId}>
          {order.orderId}
        </div>
        <PlatformBadge platform={order.platform} />
        {order.campaignName && (
          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[130px]">{order.campaignName}</div>
        )}
      </td>

      {/* Pengiriman */}
      <td className="px-4 py-3">
        <div className="space-y-1 min-w-[160px]">
          <ShipmentBadge status={order.shipmentStatus} />
          {order.trackingNumber ? (
            <div className="text-xs font-mono text-gray-500 truncate max-w-[150px]" title={order.trackingNumber}>
              {order.shippingProvider && `${order.shippingProvider} · `}{order.trackingNumber}
            </div>
          ) : (
            <div className="text-xs text-gray-400">Resi belum ada</div>
          )}
          {order.shippedAt && (
            <div className="text-xs text-gray-400">
              Kirim: {new Date(order.shippedAt).toLocaleDateString("id-ID", { day:"numeric", month:"short" })}
            </div>
          )}
          {order.estimatedDelivery && (
            <div className="text-xs text-gray-400">
              Est: {new Date(order.estimatedDelivery).toLocaleDateString("id-ID", { day:"numeric", month:"short" })}
            </div>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={order.status} />
        {isFailed && order.resolveError && (
          <div className="text-xs text-red-500 mt-1 max-w-[120px] truncate" title={order.resolveError}>
            {order.resolveError}
          </div>
        )}
      </td>

      {/* Waktu */}
      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
        {new Date(order.createdAt).toLocaleDateString("id-ID", { day:"numeric", month:"short", year:"numeric" })}
        <div className="text-gray-400">
          {new Date(order.createdAt).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })}
        </div>
      </td>

      {/* Aksi */}
      <td className="px-4 py-3 text-right">
        {canConfirm ? (
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
        ) : isFailed ? (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onReResolve}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition"
            >
              Re-resolve
            </button>
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Skip
            </button>
          </div>
        ) : isResolved ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            {order.status === "SYNCED" ? "Tersinkron" : "Dikonfirmasi"}
          </span>
        ) : (
          // SCRAPED or RESOLVING — show waiting indicator
          <span className="text-xs text-gray-400 flex items-center justify-end gap-1.5">
            {order.status === "RESOLVING" && (
              <span className="w-3 h-3 rounded-full border border-amber-400 border-t-transparent animate-spin" />
            )}
            {STATUS_META[order.status]?.label ?? order.status}
          </span>
        )}
      </td>
    </tr>
  );
}
