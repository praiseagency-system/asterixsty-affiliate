"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRupiah, formatNumber } from "@/lib/format";
import { SkeletonDashboard } from "@/components/Skeleton";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPI {
  totalGmv: number; gmvLive: number; gmvVideo: number;
  totalOrders: number; totalCommission: number;
  creatorAktif: number; avgGmvPerCreator: number;
}
interface Top10Item { creatorUsername: string; affiliateGmv: number; visualTake: string; }
interface TrendItem {
  periode: string;
  _sum: { affiliateGmv: number | null; affiliateLiveGmv: number | null; affiliateVideoGmv: number | null };
  _count: { creatorUsername: number };
}
interface HofItem { username: string; gmv: number; visualTake: string; }
interface Financial {
  totalCommission: number; totalHppSample: number;
  totalBiayaMarketing: number; acos: number; roi: number;
}
interface DashData {
  kpi: KPI; prevKpi: KPI;
  comparisonLabel: string;
  top10: Top10Item[]; trend: TrendItem[]; hallOfFame: HofItem[];
  financial: Financial | null; prevFinancial: Financial | null;
  isWeeklyMode: boolean; isYearlyMode: boolean;
  selectedYear: number; selectedMonth: number | null; selectedWeek: number | null;
  availableYears: number[]; availableMonths: number[]; availableWeeks: number[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MO_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const MO_FULL  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

const SERIES = [
  { key: "GMV Total", color: "#6366f1", grad: "gTotal", fill: "rgba(99,102,241,0.12)"  },
  { key: "GMV Video", color: "#3b82f6", grad: "gVideo", fill: "rgba(59,130,246,0.08)"  },
  { key: "GMV Live",  color: "#8b5cf6", grad: "gLive",  fill: "rgba(139,92,246,0.08)" },
] as const;
type SeriesKey = typeof SERIES[number]["key"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rankMedal(i: number) {
  if (i === 0) return { bg: "bg-yellow-400", text: "text-white", icon: "🥇" };
  if (i === 1) return { bg: "bg-gray-300",   text: "text-gray-700", icon: "🥈" };
  if (i === 2) return { bg: "bg-amber-600",  text: "text-white", icon: "🥉" };
  return { bg: "bg-subtle", text: "text-muted", icon: null };
}

// ─── Custom tooltip for trend chart ──────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl shadow-lg px-4 py-3 text-xs min-w-[160px]">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.name}</span>
          </div>
          <span className="font-semibold text-foreground tabular-nums">
            {formatRupiah(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Interactive chart legend ─────────────────────────────────────────────────
function ChartLegend({
  visible, onToggle,
}: { visible: Record<SeriesKey, boolean>; onToggle: (k: SeriesKey) => void }) {
  return (
    <div className="flex gap-4 flex-wrap">
      {SERIES.map((s) => (
        <button
          key={s.key}
          onClick={() => onToggle(s.key)}
          className={`flex items-center gap-2 text-xs font-medium transition-all ${
            visible[s.key] ? "opacity-100" : "opacity-35"
          }`}
        >
          <div
            className="w-3 h-3 rounded-full border-2 transition-all"
            style={{
              borderColor: s.color,
              background: visible[s.key] ? s.color : "transparent",
            }}
          />
          <span className={visible[s.key] ? "text-foreground" : "text-faint line-through"}>
            {s.key}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Analytics Period Picker ──────────────────────────────────────────────────
type PickerMode = "monthly" | "weekly" | "yearly";

function PeriodPicker({
  selectedYear, selectedMonth, selectedWeek,
  availableYears, availableMonths, availableWeeks,
  onYearChange, onMonthChange, onWeekChange, onModeChange,
  isWeeklyMode, isYearlyMode,
}: {
  selectedYear: number; selectedMonth: number | null; selectedWeek: number | null;
  availableYears: number[]; availableMonths: number[]; availableWeeks: number[];
  onYearChange: (y: number) => void;
  onMonthChange: (m: number | null) => void;
  onWeekChange:  (w: number | null) => void;
  onModeChange:  (mode: PickerMode) => void;
  isWeeklyMode: boolean; isYearlyMode: boolean;
}) {
  const [open, setOpen]         = useState(false);
  const [mode, setMode]         = useState<PickerMode>(isYearlyMode ? "yearly" : isWeeklyMode ? "weekly" : "monthly");
  const [navYear, setNavYear]   = useState(selectedYear);
  const [weekStep, setWeekStep] = useState<"month" | "week">(
    isWeeklyMode && selectedWeek != null ? "week" : "month"
  );
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Sync navYear on external change
  useEffect(() => { if (selectedYear) setNavYear(selectedYear); }, [selectedYear]);

  // Sync mode with isYearlyMode/isWeeklyMode when data changes externally
  useEffect(() => {
    if (isYearlyMode && mode !== "yearly") setMode("yearly");
    else if (isWeeklyMode && !isYearlyMode && mode !== "weekly") setMode("weekly");
  }, [isYearlyMode, isWeeklyMode]); // eslint-disable-line

  // ── Trigger label ──────────────────────────────────────────────────────────
  const triggerLabel = useMemo(() => {
    if (mode === "yearly")   return String(selectedYear || "—");
    if (mode === "weekly" && isWeeklyMode && selectedWeek && selectedMonth)
      return `Week ${selectedWeek} — ${MO_FULL[selectedMonth - 1]} ${selectedYear}`;
    if (selectedMonth && selectedYear)
      return `${MO_FULL[selectedMonth - 1]} ${selectedYear}`;
    return selectedYear ? String(selectedYear) : "Pilih Periode";
  }, [mode, selectedYear, selectedMonth, selectedWeek, isWeeklyMode]);

  const modeLabel = mode === "weekly" ? "Mingguan" : mode === "yearly" ? "Tahunan" : "Bulanan";

  // ── Handlers ───────────────────────────────────────────────────────────────
  function switchMode(m: PickerMode) {
    setMode(m);
    setWeekStep("month");
  }

  function handleMonthlySelect(mNum: number) {
    onYearChange(navYear); onMonthChange(mNum); onWeekChange(null);
    onModeChange("monthly");
    setOpen(false);
  }

  function handleWeeklyMonthSelect(mNum: number) {
    // commit year+month so the parent re-fetches availableWeeks
    onYearChange(navYear); onMonthChange(mNum); onWeekChange(null);
    setWeekStep("week");
  }

  function handleWeeklyWeekSelect(w: number) {
    onWeekChange(w);
    onModeChange("weekly");
    setOpen(false);
  }

  function handleYearSelect(y: number) {
    onYearChange(y); onMonthChange(null); onWeekChange(null);
    onModeChange("yearly");
    setNavYear(y); setOpen(false);
  }

  // ── Sidebar items ──────────────────────────────────────────────────────────
  const MODES: { id: PickerMode; label: string }[] = [
    { id: "weekly",  label: "Per Minggu"        },
    { id: "monthly", label: "Per Bulan"          },
    { id: "yearly",  label: "Berdasarkan Tahun"  },
  ];

  // ── Derived ────────────────────────────────────────────────────────────────
  const todayYear  = new Date().getFullYear();
  const todayMonth = new Date().getMonth() + 1;

  return (
    <div className="relative" ref={wrapRef}>

      {/* ── Trigger button ─────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2.5 px-4 py-2.5 bg-surface rounded-xl border transition-all duration-150 ${
          open
            ? "border-indigo-400 dark:border-indigo-500 shadow-md shadow-indigo-100/40"
            : "border-border shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600"
        }`}
      >
        {/* Calendar SVG */}
        <svg className={`w-4 h-4 shrink-0 transition-colors ${open ? "text-indigo-500" : "text-faint"}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>

        <div className="text-left">
          <span className={`block text-[10px] font-semibold leading-none mb-0.5 uppercase tracking-wider transition-colors ${
            open ? "text-indigo-400" : "text-faint"
          }`}>{modeLabel}</span>
          <span className="block text-sm font-bold text-foreground leading-tight whitespace-nowrap">{triggerLabel}</span>
        </div>

        {/* Chevron */}
        <svg className={`w-3.5 h-3.5 text-faint shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Picker panel ───────────────────────────────────── */}
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 bg-surface rounded-2xl overflow-hidden animate-picker-enter"
          style={{
            width: 456,
            boxShadow: "0 20px 60px -10px rgba(0,0,0,0.28), 0 4px 20px -4px rgba(99,102,241,0.12)",
          }}
        >
          {/* ── Panel header: year navigator ───────────────── */}
          {mode !== "yearly" && (
            <div className="flex items-center px-4 py-2.5 bg-subtle border-b border-border">
              {mode === "weekly" && weekStep === "week" ? (
                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setWeekStep("month")}
                    className="flex items-center gap-1 text-xs text-muted hover:text-indigo-600 font-semibold transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Ganti Bulan
                  </button>
                  <span className="text-sm font-bold text-foreground ml-auto">
                    {selectedMonth ? `${MO_FULL[selectedMonth - 1]} ${navYear}` : String(navYear)}
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setNavYear((y) => y - 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all font-bold text-base leading-none"
                  >‹</button>
                  <span className="flex-1 text-center text-sm font-bold text-foreground">{navYear}</span>
                  <button
                    onClick={() => setNavYear((y) => y + 1)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all font-bold text-base leading-none"
                  >›</button>
                </>
              )}
            </div>
          )}

          {mode === "yearly" && (
            <div className="px-5 py-2.5 bg-subtle border-b border-border">
              <p className="text-[10px] font-bold text-faint uppercase tracking-widest">Pilih Tahun</p>
            </div>
          )}

          {/* ── Body: sidebar + content ──────────────────────── */}
          <div className="flex">

            {/* Left sidebar */}
            <div className="w-[168px] shrink-0 border-r border-border py-1.5">
              {MODES.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => switchMode(id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-all duration-150 border-r-2 ${
                    mode === id
                      ? "text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50/70 dark:bg-indigo-900/20 border-indigo-500"
                      : "text-muted font-medium hover:bg-subtle hover:text-foreground border-transparent"
                  }`}
                >
                  <span>{label}</span>
                  {id !== "yearly" && (
                    <svg className={`w-3 h-3 transition-colors ${mode === id ? "text-indigo-400" : "text-gray-300"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </button>
              ))}
            </div>

            {/* Right content */}
            <div className="flex-1 p-4">

              {/* ── MONTHLY MODE ─── */}
              {mode === "monthly" && (
                <div className="grid grid-cols-3 gap-2 animate-slide-left">
                  {MO_SHORT.map((mo, i) => {
                    const mNum = i + 1;
                    const isAvail = navYear !== selectedYear || availableMonths.includes(mNum);
                    const isSel   = navYear === selectedYear && mNum === selectedMonth && !isWeeklyMode;
                    const isNow   = navYear === todayYear && mNum === todayMonth;
                    return (
                      <button
                        key={mo}
                        disabled={!isAvail}
                        onClick={() => isAvail && handleMonthlySelect(mNum)}
                        className={`py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                          isSel
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 font-semibold"
                            : isAvail
                            ? isNow
                              ? "text-indigo-600 bg-indigo-50 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
                              : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                            : "text-faint cursor-not-allowed"
                        }`}
                      >
                        {mo}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── WEEKLY MODE — step 1: pick month ─── */}
              {mode === "weekly" && weekStep === "month" && (
                <div className="animate-slide-left">
                  <p className="text-[11px] text-faint font-medium mb-3 uppercase tracking-wide">
                    Pilih Bulan
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {MO_SHORT.map((mo, i) => {
                      const mNum    = i + 1;
                      const isAvail = navYear !== selectedYear || availableMonths.includes(mNum);
                      const isActive = isWeeklyMode && navYear === selectedYear && mNum === selectedMonth;
                      return (
                        <button
                          key={mo}
                          disabled={!isAvail}
                          onClick={() => isAvail && handleWeeklyMonthSelect(mNum)}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                            isActive
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 font-semibold"
                              : isAvail
                              ? "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                              : "text-faint cursor-not-allowed"
                          }`}
                        >
                          {mo}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── WEEKLY MODE — step 2: pick week ─── */}
              {mode === "weekly" && weekStep === "week" && (
                <div className="animate-slide-left">
                  <p className="text-[11px] text-faint font-medium mb-3 uppercase tracking-wide">
                    {availableWeeks.length > 0
                      ? `${availableWeeks.length} Minggu Tersedia`
                      : "Pilih Minggu"}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(availableWeeks.length > 0 ? availableWeeks : [1, 2, 3, 4]).map((w) => {
                      const isSel = isWeeklyMode && w === selectedWeek && selectedMonth != null;
                      return (
                        <button
                          key={w}
                          onClick={() => handleWeeklyWeekSelect(w)}
                          className={`py-4 rounded-xl text-sm font-bold transition-all duration-150 flex flex-col items-center gap-1 ${
                            isSel
                              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                              : "bg-gray-50 text-gray-700 border border-gray-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100"
                          }`}
                        >
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${isSel ? "text-indigo-300" : "text-gray-400"}`}>
                            Week
                          </span>
                          <span className="text-2xl font-bold leading-none">{w}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── YEARLY MODE ─── */}
              {mode === "yearly" && (
                <div className="space-y-1.5 animate-slide-left">
                  {availableYears.length > 0 ? availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => handleYearSelect(y)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                        y === selectedYear
                          ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                          : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                      }`}
                    >
                      <span>{y}</span>
                      {y === selectedYear && (
                        <svg className="w-4 h-4 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  )) : (
                    <p className="text-sm text-faint text-center py-6">Belum ada data tahun</p>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, accent, sub, current, prev, higherIsBetter = true, fmtDelta }: {
  label: string; value: string; icon: string; accent: string; sub?: string;
  current?: number; prev?: number; higherIsBetter?: boolean;
  fmtDelta?: (n: number) => string;
}) {
  const delta    = current != null && prev != null ? current - prev : null;
  const pct      = delta != null && prev != null && prev !== 0 ? Math.abs(delta / prev) * 100 : null;
  const up       = delta != null && delta > 0;
  const same     = delta === 0;
  const positive = up === higherIsBetter;
  const fmt      = fmtDelta ?? formatRupiah;

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-4 flex gap-3 items-start hover-lift">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted font-medium leading-tight">{label}</p>
        <p className="text-lg font-bold text-foreground mt-0.5 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-xs text-faint mt-0.5">{sub}</p>}
        {delta != null && !same && (
          <p className={`text-[11px] font-semibold mt-1 tabular-nums leading-tight ${positive ? "text-green-600" : "text-red-500"}`}>
            {up ? "▲" : "▼"} {fmt(Math.abs(delta))}{pct != null ? ` (${pct.toFixed(1)}%)` : ""}
          </p>
        )}
        {same && current != null && (
          <p className="text-[11px] font-medium mt-1 text-faint leading-tight">— Sama</p>
        )}
      </div>
    </div>
  );
}

// ─── Financial card ───────────────────────────────────────────────────────────
function FinCard({ label, value, sub, highlight, valueColor, curNum, prevNum, higherIsBetter = true, fmtFn }: {
  label: string; value: string; sub: string; highlight?: boolean; valueColor?: string;
  curNum?: number; prevNum?: number; higherIsBetter?: boolean;
  fmtFn?: (n: number) => string;
}) {
  const delta    = curNum != null && prevNum != null ? curNum - prevNum : null;
  const pct      = delta != null && prevNum != null && prevNum !== 0 ? Math.abs(delta / prevNum) * 100 : null;
  const up       = delta != null && delta > 0;
  const same     = delta === 0;
  const positive = up === higherIsBetter;
  const fmt      = fmtFn ?? formatRupiah;

  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40" : "bg-subtle border border-border"}`}>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${valueColor ?? (highlight ? "text-indigo-700 dark:text-indigo-300" : "text-foreground")}`}>{value}</p>
      <p className="text-xs text-faint mt-0.5">{sub}</p>
      {delta != null && !same && (
        <p className={`text-[11px] font-semibold mt-1 tabular-nums leading-tight ${positive ? "text-green-600" : "text-red-500"}`}>
          {up ? "▲" : "▼"} {fmt(Math.abs(delta))}{pct != null ? ` (${pct.toFixed(1)}%)` : ""}
        </p>
      )}
      {same && curNum != null && (
        <p className="text-[11px] font-medium mt-1 text-gray-400 leading-tight">— Sama</p>
      )}
    </div>
  );
}

// ─── Creator row (shared by Top 10 + Hall of Fame) ───────────────────────────
function CreatorRow({ rank, username, visualTake, gmv, maxGmv, barColor }: {
  rank: number; username: string; visualTake: string;
  gmv: number; maxGmv: number; barColor: string;
}) {
  const { bg, text, icon } = rankMedal(rank);
  const pct = maxGmv > 0 ? (gmv / maxGmv) * 100 : 0;

  return (
    <div className="flex items-center gap-3 group">
      {/* Rank badge */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${bg} ${text}`}>
        {icon ?? (rank + 1)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <p className="text-sm leading-tight min-w-0 truncate">
            <span className="font-bold text-foreground">@{username}</span>
            {visualTake && (
              <span className="text-faint font-normal ml-1">· {visualTake}</span>
            )}
          </p>
          <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: barColor }}>
            {formatRupiah(gmv)}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-border rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]     = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filter state (null = use API default)
  const [filterYear,  setFilterYear]  = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterWeek,  setFilterWeek]  = useState<number | null>(null);
  const [filterMode,  setFilterMode]  = useState<PickerMode | null>(null);

  // Chart series visibility
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    "GMV Total": true,
    "GMV Video": true,
    "GMV Live":  true,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterYear)              params.set("year",   String(filterYear));
    if (filterMonth)             params.set("month",  String(filterMonth));
    if (filterWeek)              params.set("week",   String(filterWeek));
    if (filterMode === "yearly") params.set("yearly", "true");

    const res  = await fetch(`/api/dashboard?${params}`);
    const json = await res.json() as DashData;
    setData(json);

    // Sync filter state from API defaults on first load
    if (!filterYear) {
      setFilterYear(json.selectedYear);
      setFilterMonth(json.selectedMonth);
      setFilterMode(json.isYearlyMode ? "yearly" : json.isWeeklyMode ? "weekly" : "monthly");
    }
    setLoading(false);
  }, [filterYear, filterMonth, filterWeek, filterMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Trend chart data
  const trendFormatted = useMemo(() => {
    if (!data) return [];
    return data.trend.map((t) => ({
      name:        MO_SHORT[new Date(t.periode).getMonth()],
      monthNum:    new Date(t.periode).getMonth() + 1,
      "GMV Total": t._sum.affiliateGmv      ?? 0,
      "GMV Video": t._sum.affiliateVideoGmv ?? 0,
      "GMV Live":  t._sum.affiliateLiveGmv  ?? 0,
      "Creator Aktif": t._count.creatorUsername,
    }));
  }, [data]);

  function toggleSeries(key: SeriesKey) {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }

  // Period label for subtitle
  const periodLabel = useMemo(() => {
    if (!data) return "";
    if (data.isYearlyMode) return String(data.selectedYear);
    if (!data.selectedMonth) return String(data.selectedYear);
    const mo = MO_FULL[data.selectedMonth - 1];
    const yr = data.selectedYear;
    if (data.isWeeklyMode && data.selectedWeek) {
      return `Minggu ${data.selectedWeek} · ${mo} ${yr}`;
    }
    return `${mo} ${yr}`;
  }, [data]);

  if (loading && !data) return <SkeletonDashboard />;

  const isEmpty = !data?.kpi || data.kpi.totalGmv === 0;
  const kpi     = data?.kpi;

  return (
    <div className="space-y-5">

      {/* ── Header + Period Picker ─────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-faint mt-0.5">Affiliate Analytics · Asterixsty Perfumery</p>
        </div>

        {data && (
          <div className="flex flex-col items-end gap-1.5">
            <PeriodPicker
              selectedYear={data.selectedYear}
              selectedMonth={data.selectedMonth}
              selectedWeek={data.selectedWeek}
              availableYears={data.availableYears}
              availableMonths={data.availableMonths}
              availableWeeks={data.availableWeeks}
              isWeeklyMode={data.isWeeklyMode}
              isYearlyMode={data.isYearlyMode}
              onYearChange={(y) => { setFilterYear(y); setFilterMonth(null); setFilterWeek(null); }}
              onMonthChange={(m) => { setFilterMonth(m); setFilterWeek(null); }}
              onWeekChange={setFilterWeek}
              onModeChange={(m) => setFilterMode(m)}
            />
            {data.comparisonLabel && (
              <span className="text-[11px] text-faint font-medium px-1">
                Perbandingan {data.comparisonLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="bg-surface rounded-2xl border border-dashed border-border p-20 text-center">
          <div className="text-5xl mb-3">📭</div>
          <h3 className="font-semibold text-foreground mb-1">Belum ada data</h3>
          <p className="text-sm text-faint">
            Import data dari menu <strong>Import Data</strong> untuk mulai monitoring
          </p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <KpiCard label="Total GMV"       value={formatRupiah(kpi!.totalGmv)}         icon="💰" accent="bg-indigo-50 text-indigo-600"
              current={kpi!.totalGmv}         prev={data?.prevKpi?.totalGmv} />
            <KpiCard label="GMV Video"       value={formatRupiah(kpi!.gmvVideo)}          icon="🎬" accent="bg-blue-50 text-blue-600"
              current={kpi!.gmvVideo}         prev={data?.prevKpi?.gmvVideo} />
            <KpiCard label="GMV Live"        value={formatRupiah(kpi!.gmvLive)}           icon="📡" accent="bg-purple-50 text-purple-600"
              current={kpi!.gmvLive}          prev={data?.prevKpi?.gmvLive} />
            <KpiCard label="Creator Aktif"   value={formatNumber(kpi!.creatorAktif)}      icon="👥" accent="bg-green-50 text-green-600"  sub="GMV > Rp 50rb"
              current={kpi!.creatorAktif}     prev={data?.prevKpi?.creatorAktif}     fmtDelta={formatNumber} />
            <KpiCard label="Total Orders"    value={formatNumber(kpi!.totalOrders)}       icon="📦" accent="bg-orange-50 text-orange-600"
              current={kpi!.totalOrders}      prev={data?.prevKpi?.totalOrders}      fmtDelta={formatNumber} />
            <KpiCard label="Est. Komisi"     value={formatRupiah(kpi!.totalCommission)}   icon="💸" accent="bg-pink-50 text-pink-600"
              current={kpi!.totalCommission}  prev={data?.prevKpi?.totalCommission} />
            <KpiCard label="Avg GMV/Creator" value={formatRupiah(kpi!.avgGmvPerCreator)} icon="📈" accent="bg-teal-50 text-teal-600"
              current={kpi!.avgGmvPerCreator} prev={data?.prevKpi?.avgGmvPerCreator} />
          </div>

          {/* ── Onboarding checklist (auto-hides when all done / dismissed) ── */}
          <OnboardingChecklist />

          {/* ── Financial Overview ─────────────────────────────────────── */}
          {data?.financial && (
            <div className="bg-surface rounded-xl border border-border shadow-sm px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-foreground">💼 Financial Overview</h2>
                <span className="text-xs text-faint bg-subtle px-2 py-0.5 rounded-full border border-border">
                  {periodLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <FinCard label="Est. Komisi"  value={formatRupiah(data.financial.totalCommission)}     sub="dari TikTok"
                  curNum={data.financial.totalCommission}     prevNum={data.prevFinancial?.totalCommission} />
                <FinCard label="HPP Sample"   value={formatRupiah(data.financial.totalHppSample)}      sub="biaya produk sample"
                  curNum={data.financial.totalHppSample}      prevNum={data.prevFinancial?.totalHppSample}    higherIsBetter={false} />
                <FinCard label="Total Biaya"  value={formatRupiah(data.financial.totalBiayaMarketing)} sub="komisi + HPP" highlight
                  curNum={data.financial.totalBiayaMarketing} prevNum={data.prevFinancial?.totalBiayaMarketing} higherIsBetter={false} />
                <FinCard
                  label="ACOS" sub="biaya / GMV"
                  value={`${data.financial.acos.toFixed(1)}%`}
                  valueColor={data.financial.acos > 30 ? "text-red-600" : data.financial.acos > 15 ? "text-yellow-600" : "text-green-600"}
                  curNum={data.financial.acos} prevNum={data.prevFinancial?.acos}
                  higherIsBetter={false} fmtFn={(n) => `${n.toFixed(1)}%`}
                />
                <FinCard
                  label="ROI" sub="GMV / biaya"
                  value={`${data.financial.roi.toFixed(0)}%`}
                  valueColor={data.financial.roi >= 300 ? "text-green-600" : data.financial.roi >= 200 ? "text-yellow-600" : "text-red-600"}
                  curNum={data.financial.roi} prevNum={data.prevFinancial?.roi}
                  fmtFn={(n) => `${n.toFixed(0)}%`}
                />
              </div>
            </div>
          )}

          {/* ── Trend Chart + Top 10 ───────────────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Trend Chart — takes 3/5 */}
            <div className="xl:col-span-3 bg-surface rounded-xl border border-border shadow-sm px-5 py-4">
              <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">📈 Trend GMV {data?.selectedYear}</h2>
                  <p className="text-xs text-faint mt-0.5">Data bulanan sepanjang tahun</p>
                </div>
                <ChartLegend visible={visible} onToggle={toggleSeries} />
              </div>

              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendFormatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.grad} id={s.grad} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={s.color} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}Jt`}
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false} tickLine={false} width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />

                  {/* Highlight current month */}
                  {data?.selectedMonth && !data.isWeeklyMode && (
                    <ReferenceLine
                      x={MO_SHORT[(data.selectedMonth) - 1]}
                      stroke="#6366f1"
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                  )}

                  {SERIES.map((s) =>
                    visible[s.key] ? (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        stroke={s.color}
                        fill={`url(#${s.grad})`}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    ) : null
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Top 10 — takes 2/5 */}
            <div className="xl:col-span-2 bg-surface rounded-xl border border-border shadow-sm px-5 py-4">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-foreground">🏆 Top 10 Affiliate</h2>
                <p className="text-xs text-faint mt-0.5">{periodLabel}</p>
              </div>
              <div className="space-y-3">
                {(data?.top10 ?? []).map((a, i) => (
                  <CreatorRow
                    key={a.creatorUsername}
                    rank={i}
                    username={a.creatorUsername}
                    visualTake={a.visualTake}
                    gmv={a.affiliateGmv}
                    maxGmv={data?.top10[0]?.affiliateGmv ?? 1}
                    barColor="#6366f1"
                  />
                ))}
                {(data?.top10 ?? []).length === 0 && (
                  <p className="text-xs text-faint text-center py-4">Tidak ada data</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Hall of Fame + Creator Trend ───────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

            {/* Hall of Fame — 3/5 */}
            {(data?.hallOfFame ?? []).length > 0 && (
              <div className="xl:col-span-3 bg-surface rounded-xl border border-border shadow-sm px-5 py-4">
                <div className="mb-4">
                  <h2 className="text-sm font-bold text-foreground">🏅 Hall of Fame</h2>
                  <p className="text-xs text-faint mt-0.5">Kumulatif lifetime GMV semua periode</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(data?.hallOfFame ?? []).map((a, i) => (
                    <CreatorRow
                      key={a.username}
                      rank={i}
                      username={a.username}
                      visualTake={a.visualTake}
                      gmv={a.gmv}
                      maxGmv={data?.hallOfFame[0]?.gmv ?? 1}
                      barColor="#f59e0b"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Creator Aktif Trend — 2/5 */}
            <div className={`${(data?.hallOfFame ?? []).length > 0 ? "xl:col-span-2" : "xl:col-span-5"} bg-surface rounded-xl border border-border shadow-sm px-5 py-4`}>
              <div className="mb-4">
                <h2 className="text-sm font-bold text-foreground">👥 Creator Aktif</h2>
                <p className="text-xs text-faint mt-0.5">Trend per bulan · {data?.selectedYear}</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendFormatted} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip
                    formatter={(v) => [`${v} creator`, "Creator Aktif"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid #f3f4f6", fontSize: 12 }}
                  />
                  {data?.selectedMonth && !data.isWeeklyMode && (
                    <ReferenceLine
                      x={MO_SHORT[(data.selectedMonth) - 1]}
                      stroke="#6366f1"
                      strokeDasharray="3 3"
                      strokeOpacity={0.4}
                    />
                  )}
                  <Bar dataKey="Creator Aktif" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
