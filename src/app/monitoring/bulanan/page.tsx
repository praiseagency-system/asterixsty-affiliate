"use client";

import { useEffect, useState, useCallback } from "react";
import { formatRupiah, formatNumber, formatCtr } from "@/lib/format";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

interface MonitorRow {
  no: number;
  username: string;
  followers: number;
  gmvTotal: number;
  deltaGmv: number | null;
  deltaLive: number | null;
  deltaVideo: number | null;
  deltaOrders: number | null;
  deltaItems: number | null;
  deltaLiveStreams: number | null;
  deltaVideos: number | null;
  gmvLive: number;
  gmvVideo: number;
  orders: number;
  itemsSold: number;
  liveStreams: number;
  videos: number;
  ctr: number;
  avgOrder: number;
  tier: string;
  tierColor: string;
  program: string;
  score: number;
  status: string;
  statusColor: string;
  pic: string;
  inDatabase: boolean;
  sampleTerkirim: boolean;
  produkSample: string;
  sampleProducts: string[];
}

interface Summary { totalGmv: number; gmvLive: number; gmvVideo: number; creatorAktif: number; totalOrders: number; }

function SummaryCard({
  label,
  value,
  prevValue,
  currency = true,
}: {
  label: string;
  value: number;
  prevValue: number | null;
  currency?: boolean;
}) {
  const fmt = (n: number) => currency ? formatRupiah(n) : formatNumber(n);
  const delta = prevValue !== null ? value - prevValue : null;
  const pct = (delta !== null && prevValue !== null && prevValue !== 0)
    ? Math.abs(delta / prevValue) * 100 : null;
  const positive = delta !== null && delta > 0;
  const neutral = delta !== null && delta === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-gray-900 text-base mt-0.5">{fmt(value)}</p>
      {delta === null ? null : neutral ? (
        <p className="text-xs text-gray-400 mt-0.5">→ Sama</p>
      ) : (
        <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${positive ? "text-green-600" : "text-red-500"}`}>
          <span>{positive ? "▲" : "▼"} {fmt(Math.abs(delta))}</span>
          {pct !== null && <span className="opacity-60">({pct.toFixed(1)}%)</span>}
        </p>
      )}
    </div>
  );
}

const TIER_BADGE: Record<string, string> = {
  A: "bg-yellow-100 text-yellow-700 border-yellow-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Inline delta cell — nilai besar + selisih + % di bawahnya */
function ValueDelta({
  value,
  delta,
  currency = true,
}: {
  value: number;
  delta: number | null;
  currency?: boolean;
}) {
  const fmt = (n: number) => currency ? formatRupiah(n) : formatNumber(n);
  const prev = delta !== null ? value - delta : null;
  const pct = (delta !== null && prev !== null && prev !== 0)
    ? Math.abs(delta / prev) * 100
    : null;
  const positive = delta !== null && delta > 0;
  const neutral = delta !== null && delta === 0;

  return (
    <div className="py-0.5">
      <div className="font-semibold text-gray-900 whitespace-nowrap">{fmt(value)}</div>
      {delta === null ? (
        <div className="text-xs text-gray-300 whitespace-nowrap">—</div>
      ) : neutral ? (
        <div className="text-xs text-gray-400 whitespace-nowrap">→ Sama</div>
      ) : (
        <div className={`text-xs whitespace-nowrap flex items-center gap-0.5 ${positive ? "text-green-600" : "text-red-500"}`}>
          <span>{positive ? "▲" : "▼"} {fmt(Math.abs(delta))}</span>
          {pct !== null && (
            <span className="opacity-60">({pct.toFixed(1)}%)</span>
          )}
        </div>
      )}
    </div>
  );
}

function SampleCell({ products }: { products: string[] }) {
  if (!products || products.length === 0) return <span className="text-gray-300 text-xs">—</span>;
  const MAX = 3;
  const shown = products.slice(0, MAX);
  const extra = products.length - MAX;
  return (
    <div className="space-y-0.5 py-0.5">
      {shown.map((p) => (
        <div key={p} className="text-xs text-gray-700 whitespace-nowrap bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5 leading-tight">
          {p}
        </div>
      ))}
      {extra > 0 && (
        <div className="text-xs text-gray-400 pl-0.5">+{extra} lainnya</div>
      )}
    </div>
  );
}

function downloadCSV(items: MonitorRow[], filename: string) {
  const headers = ["No","Username","Followers","GMV Total","Delta GMV","Delta %","GMV Live","Delta Live","GMV Video","Delta Video","Orders","Delta Orders","Items","Live","Videos","CTR","Avg Order","Tier","Program","Score","Status","Sample","Dalam DB","PIC"];
  const rows = items.map((r) => {
    const pct = (delta: number | null, val: number) => {
      if (delta === null) return "";
      const prev = val - delta;
      return prev !== 0 ? (delta / Math.abs(prev) * 100).toFixed(1) + "%" : "";
    };
    return [
      r.no, r.username, r.followers,
      r.gmvTotal, r.deltaGmv ?? "", pct(r.deltaGmv, r.gmvTotal),
      r.gmvLive, r.deltaLive ?? "",
      r.gmvVideo, r.deltaVideo ?? "",
      r.orders, r.deltaOrders ?? "",
      r.itemsSold, r.liveStreams, r.videos,
      formatCtr(r.ctr), r.avgOrder,
      r.tier, r.program, r.score, r.status.replace(/[^\w\s]/g, ""),
      r.sampleTerkirim ? "Sudah" : "Belum",
      r.inDatabase ? "Ya" : "Tidak", r.pic,
    ];
  });
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function MonitoringBulanan() {
  const [items, setItems] = useState<MonitorRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null);
  const [periodes, setPeriodes] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [gmvMin, setGmvMin] = useState("");
  const [gmvMax, setGmvMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allRows, setAllRows] = useState<MonitorRow[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "500" });
    if (selected) params.set("periode", selected);
    if (search) params.set("search", search);
    if (filterTier) params.set("tier", filterTier);
    if (filterProgram) params.set("program", filterProgram);
    if (filterStatus) params.set("status", filterStatus);
    if (gmvMin) params.set("gmvMin", gmvMin);
    if (gmvMax) params.set("gmvMax", gmvMax);
    const res = await fetch(`/api/monitoring/bulanan?${params}`);
    const json = await res.json();
    setItems(json.items || []);
    setAllRows(json.items || []);
    setSummary(json.summary || null);
    setPrevSummary(json.prevSummary || null);
    setTotal(json.total || 0);
    if (json.periodes?.length && !selected) {
      setPeriodes(json.periodes);
      setSelected(json.periodes[0]);
    } else setPeriodes(json.periodes || []);
    setLoading(false);
  }, [selected, page, search, filterTier, filterProgram, filterStatus, gmvMin, gmvMax]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasFilters = filterTier || filterProgram || filterStatus || gmvMin || gmvMax;

  function clearFilters() {
    setFilterTier(""); setFilterProgram(""); setFilterStatus(""); setGmvMin(""); setGmvMax("");
  }

  const periodeLabel = selected
    ? new Date(selected).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
    : "";

  // Previous month label (computed client-side, since bulanan is always month-based)
  const prevLabel = selected
    ? (() => {
        const d = new Date(selected);
        const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
        return prev.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      })()
    : null;

  const pageSize = 100;
  const paginated = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitoring Bulanan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performa affiliate per bulan</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={() => downloadCSV(allRows, `monitoring-bulanan-${periodeLabel}.csv`)}
            disabled={allRows.length === 0}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-1.5"
          >
            ⬇️ Export CSV
          </button>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-1.5 transition-colors ${hasFilters ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            🔽 Filter {hasFilters && <span className="bg-indigo-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">!</span>}
          </button>
          <input
            type="text" placeholder="Cari username..."
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-48"
          />
          {periodes.length > 0 && (
            <select
              value={selected} onChange={(e) => { setSelected(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {periodes.map((p) => (
                <option key={p} value={p}>
                  {new Date(p).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Filter Lanjutan</h3>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:underline">Reset Filter</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tier</label>
              <select value={filterTier} onChange={(e) => { setFilterTier(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
                <option value="">Semua Tier</option>
                <option value="A">A (Elite)</option>
                <option value="B">B (Growth)</option>
                <option value="C">C (Entry)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Program</label>
              <select value={filterProgram} onChange={(e) => { setFilterProgram(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
                <option value="">Semua Program</option>
                <option value="Elite">Elite</option>
                <option value="Growth">Growth</option>
                <option value="Entry">Entry</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm">
                <option value="">Semua Status</option>
                <option value="SCALE">⭐ SCALE</option>
                <option value="PUSH">📈 PUSH</option>
                <option value="MONITOR">👀 MONITOR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Min GMV (juta)</label>
              <input type="number" placeholder="0" value={gmvMin}
                onChange={(e) => { setGmvMin(e.target.value ? String(parseFloat(e.target.value) * 1_000_000) : ""); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max GMV (juta)</label>
              <input type="number" placeholder="∞" value={gmvMax}
                onChange={(e) => { setGmvMax(e.target.value ? String(parseFloat(e.target.value) * 1_000_000) : ""); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Period label */}
      {selected && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">{periodeLabel}</span>
          <span className={`text-xs px-2 py-1 rounded ${prevLabel ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
            {prevLabel ? `▲▼ vs ${prevLabel}` : "Tidak ada data bulan sebelumnya"}
          </span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label="Total GMV" value={summary.totalGmv} prevValue={prevSummary?.totalGmv ?? null} />
          <SummaryCard label="GMV Video" value={summary.gmvVideo} prevValue={prevSummary?.gmvVideo ?? null} />
          <SummaryCard label="GMV Live" value={summary.gmvLive} prevValue={prevSummary?.gmvLive ?? null} />
          <SummaryCard label="Creator Aktif" value={summary.creatorAktif} prevValue={prevSummary?.creatorAktif ?? null} currency={false} />
          <SummaryCard label="Total Orders" value={summary.totalOrders} prevValue={prevSummary?.totalOrders ?? null} currency={false} />
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {[
                  { h: "No", sub: "" },
                  { h: "Username", sub: "" },
                  { h: "Followers", sub: "" },
                  { h: "GMV Total", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "GMV Live", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "GMV Video", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Orders", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Items", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Live", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Videos", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "CTR", sub: "" },
                  { h: "Avg Order", sub: "" },
                  { h: "Tier", sub: "" },
                  { h: "Score", sub: "" },
                  { h: "Status", sub: "" },
                  { h: "Sample", sub: "" },
                  { h: "DB", sub: "" },
                  { h: "PIC", sub: "" },
                ].map(({ h, sub }) => (
                  <th key={h} className="px-2.5 py-2.5 text-left whitespace-nowrap">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</div>
                    {sub && <div className="text-xs font-normal text-gray-400 normal-case tracking-normal">{sub}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={18} className="px-4 py-10 text-center text-gray-400">Memuat...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={18} className="px-4 py-10 text-center text-gray-400">
                  {hasFilters ? "Tidak ada data dengan filter ini." : "Belum ada data. Import data bulanan di menu Import Data."}
                </td></tr>
              ) : paginated.map((row) => (
                <tr key={row.username} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-2.5 py-1.5 text-gray-400 text-xs">{row.no}</td>
                  <td className="px-2.5 py-1.5 font-semibold text-indigo-700 whitespace-nowrap">@{row.username}</td>
                  <td className="px-2.5 py-1.5 text-gray-500 text-xs">{formatNumber(row.followers)}</td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.gmvTotal} delta={row.deltaGmv} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.gmvLive} delta={row.deltaLive} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.gmvVideo} delta={row.deltaVideo} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.orders} delta={row.deltaOrders} currency={false} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.itemsSold} delta={row.deltaItems} currency={false} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.liveStreams} delta={row.deltaLiveStreams} currency={false} />
                  </td>
                  <td className="px-2.5 py-1.5">
                    <ValueDelta value={row.videos} delta={row.deltaVideos} currency={false} />
                  </td>
                  <td className="px-2.5 py-1.5 text-center text-gray-500">{formatCtr(row.ctr)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-gray-600">{formatRupiah(row.avgOrder)}</td>
                  <td className="px-2.5 py-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs border font-bold ${TIER_BADGE[row.tier] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                        {row.tier}
                      </span>
                      <span className="text-xs text-gray-400">{row.program}</span>
                    </div>
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    <span className={`text-sm font-bold ${row.score >= 8 ? "text-yellow-600" : row.score >= 5 ? "text-blue-600" : "text-gray-500"}`}>
                      {row.score}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${row.statusColor}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <SampleCell products={row.sampleProducts} />
                  </td>
                  <td className="px-2.5 py-1.5 text-center">
                    {row.inDatabase
                      ? <span className="text-blue-500 text-xs">✅</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                    {row.pic || <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <span>{total} creator{hasFilters ? " (difilter)" : ""}</span>
          {total > pageSize && (
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 rounded border text-xs disabled:opacity-40">← Prev</button>
              <span className="px-2 py-1 text-xs">{page} / {Math.ceil(total / pageSize)}</span>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / pageSize)}
                className="px-3 py-1 rounded border text-xs disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MonitoringBulananGate() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_MONITORING}>
      <MonitoringBulanan />
    </PermissionGate>
  );
}
