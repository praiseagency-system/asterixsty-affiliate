"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatRupiah, formatNumber, formatCtr } from "@/lib/format";
import PermissionGate from "@/components/PermissionGate";
import { PERMISSIONS } from "@/lib/permissions";

interface MonitorRow {
  no: number;
  username: string;
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
  saranProgram: string;
  periode: string;
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

const PROGRAM_BADGE: Record<string, string> = {
  Elite: "bg-yellow-100 text-yellow-700",
  Growth: "bg-blue-100 text-blue-700",
  Entry: "bg-gray-100 text-gray-600",
};

function weekNum(d: Date) {
  const day = d.getDate();
  if (day < 8) return 1;
  if (day < 15) return 2;
  if (day < 22) return 3;
  return 4;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

function downloadCSV(items: MonitorRow[], filename: string) {
  const headers = ["No","Username","GMV Total","Delta GMV","Delta %","GMV Live","Delta Live","GMV Video","Delta Video","Orders","Delta Orders","Items","Live","Videos","CTR","Avg Order","Program"];
  const rows = items.map((r) => {
    const pct = (delta: number | null, val: number) => {
      if (delta === null) return "";
      const prev = val - delta;
      return prev !== 0 ? (delta / Math.abs(prev) * 100).toFixed(1) + "%" : "";
    };
    return [
      r.no, r.username, r.gmvTotal, r.deltaGmv ?? "", pct(r.deltaGmv, r.gmvTotal),
      r.gmvLive, r.deltaLive ?? "", r.gmvVideo, r.deltaVideo ?? "",
      r.orders, r.deltaOrders ?? "", r.itemsSold, r.liveStreams, r.videos,
      formatCtr(r.ctr), r.avgOrder, r.saranProgram,
    ];
  });
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function MonitoringMingguan() {
  const [items, setItems] = useState<MonitorRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prevSummary, setPrevSummary] = useState<Summary | null>(null);
  const [allPeriodes, setAllPeriodes] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [prevPeriode, setPrevPeriode] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [loading, setLoading] = useState(true);

  const byMonth = useMemo(() => {
    const map: Record<string, { iso: string; week: number }[]> = {};
    for (const iso of allPeriodes) {
      const d = new Date(iso);
      const mk = monthKey(d);
      if (!map[mk]) map[mk] = [];
      map[mk].push({ iso, week: weekNum(d) });
    }
    for (const mk of Object.keys(map)) map[mk].sort((a, b) => a.week - b.week);
    return map;
  }, [allPeriodes]);

  const sortedMonths = useMemo(() => Object.keys(byMonth).sort().reverse(), [byMonth]);
  const selectedMonth = selected ? monthKey(new Date(selected)) : (sortedMonths[0] ?? "");
  const weeksInMonth = byMonth[selectedMonth] ?? [];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "500" });
    if (selected) params.set("periode", selected);
    if (search) params.set("search", search);
    if (filterProgram) params.set("program", filterProgram);
    const res = await fetch(`/api/monitoring/mingguan?${params}`);
    const json = await res.json();
    setItems(json.items || []);
    setSummary(json.summary || null);
    setPrevSummary(json.prevSummary || null);
    setTotal(json.total || 0);
    setPrevPeriode(json.prevPeriode ?? null);
    const periodes: string[] = json.periodes || [];
    setAllPeriodes(periodes);
    if (!selected && json.currentPeriode) setSelected(json.currentPeriode);
    setLoading(false);
  }, [selected, search, filterProgram]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleMonthChange(mk: string) {
    const weeks = byMonth[mk] ?? [];
    if (weeks.length > 0) setSelected(weeks[0].iso);
  }

  const selectedWeekNum = selected ? weekNum(new Date(selected)) : null;
  const prevLabel = prevPeriode
    ? `Minggu ${weekNum(new Date(prevPeriode))} ${new Date(prevPeriode).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}`
    : null;
  const exportLabel = selected
    ? `Minggu ${selectedWeekNum} — ${new Date(selected).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}`
    : "";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monitoring Mingguan</h1>
          <p className="text-sm text-gray-500 mt-0.5">Performa affiliate per minggu</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={() => downloadCSV(items, `monitoring-mingguan-${exportLabel}.csv`)}
            disabled={items.length === 0}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            ⬇️ Export CSV
          </button>
          <select value={filterProgram} onChange={(e) => setFilterProgram(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white">
            <option value="">Semua Program</option>
            <option value="Elite">Elite</option>
            <option value="Growth">Growth</option>
            <option value="Entry">Entry</option>
          </select>
          <input type="text" placeholder="Cari username..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white w-40" />
          {sortedMonths.length > 0 && (
            <select value={selectedMonth} onChange={(e) => handleMonthChange(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              {sortedMonths.map((mk) => {
                const d = new Date(mk + "-01");
                return <option key={mk} value={mk}>{d.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</option>;
              })}
            </select>
          )}
          {weeksInMonth.length > 0 && (
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {weeksInMonth.map(({ iso, week }) => (
                <button key={iso} onClick={() => setSelected(iso)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    selected === iso ? "bg-white shadow-sm text-indigo-700 font-semibold" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  Minggu {week}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Period label */}
      {selected && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">
            Minggu {selectedWeekNum} — {new Date(selected).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${prevLabel ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"}`}>
            {prevLabel ? `▲▼ vs ${prevLabel}` : "Tidak ada data minggu sebelumnya"}
          </span>
        </div>
      )}

      {/* Summary cards */}
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
                  { h: "GMV Total", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "GMV Live", sub: "" },
                  { h: "GMV Video", sub: "" },
                  { h: "Orders", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Items", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Live", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "Videos", sub: prevLabel ? `vs ${prevLabel}` : "" },
                  { h: "CTR", sub: "" },
                  { h: "Avg Order", sub: "" },
                  { h: "Program", sub: "" },
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
                <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">Memuat...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-gray-400">
                  Belum ada data. Import data mingguan di menu <strong>Import Data</strong>.
                </td></tr>
              ) : items.map((row) => (
                <tr key={`${row.username}-${row.no}`} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-2.5 py-1.5 text-gray-400 text-xs">{row.no}</td>
                  <td className="px-2.5 py-1.5 font-semibold text-indigo-700 whitespace-nowrap">@{row.username}</td>
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
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PROGRAM_BADGE[row.saranProgram] || "bg-gray-100 text-gray-600"}`}>
                      {row.saranProgram}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">{total} creator</div>
      </div>
    </div>
  );
}

export default function MonitoringMingguanGate() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_MONITORING}>
      <MonitoringMingguan />
    </PermissionGate>
  );
}
