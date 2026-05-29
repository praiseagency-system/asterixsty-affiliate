"use client";

import type React from "react";

// ─── Base shimmer primitive ───────────────────────────────────────────────────
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg bg-subtle animate-pulse ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// ─── KPI card skeleton (dashboard) ───────────────────────────────────────────
export function SkeletonKPI() {
  return (
    <div className="bg-surface border border-border rounded-2xl px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <Skeleton className="w-14 h-5 rounded-full" />
      </div>
      <Skeleton className="w-20 h-3 rounded mb-2" />
      <Skeleton className="w-36 h-7 rounded mb-2" />
      <Skeleton className="w-24 h-3 rounded" />
    </div>
  );
}

// ─── Chart skeleton ───────────────────────────────────────────────────────────
export function SkeletonChart({ height = "h-64", className = "" }: { height?: string; className?: string }) {
  return (
    <div className={`bg-surface border border-border rounded-2xl p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-2">
          <Skeleton className="w-40 h-5 rounded" />
          <Skeleton className="w-24 h-3 rounded" />
        </div>
        <Skeleton className="w-28 h-8 rounded-lg" />
      </div>
      <Skeleton className={`w-full ${height} rounded-xl`} />
    </div>
  );
}

// ─── Table skeleton ───────────────────────────────────────────────────────────
function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  const widths = ["w-8", "w-32", "w-24", "w-20", "w-16", "w-12"];
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className={`h-4 rounded ${widths[i % widths.length]}`} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({
  rows = 5,
  cols = 5,
  title = true,
  className = "",
}: {
  rows?: number;
  cols?: number;
  title?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-2xl overflow-hidden ${className}`}>
      {title && (
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="w-36 h-4 rounded" />
          <Skeleton className="ml-auto w-20 h-7 rounded-lg" />
        </div>
      )}
      <table className="w-full">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className="h-3 rounded w-16" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page header skeleton ─────────────────────────────────────────────────────
export function SkeletonPageHeader({ className = "" }: { className?: string }) {
  return (
    <div className={`mb-6 ${className}`}>
      <Skeleton className="w-48 h-8 rounded-xl mb-2" />
      <Skeleton className="w-72 h-4 rounded" />
    </div>
  );
}

// ─── Summary card skeleton (monitoring) ──────────────────────────────────────
export function SkeletonSummaryCard() {
  return (
    <div className="bg-surface border border-border rounded-xl px-4 py-3">
      <Skeleton className="w-24 h-3 rounded mb-2" />
      <Skeleton className="w-32 h-6 rounded mb-1.5" />
      <Skeleton className="w-16 h-3 rounded" />
    </div>
  );
}

// ─── Full dashboard skeleton ──────────────────────────────────────────────────
export function SkeletonDashboard() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="w-36 h-8 rounded-xl mb-2" />
          <Skeleton className="w-56 h-4 rounded" />
        </div>
        <Skeleton className="w-44 h-9 rounded-xl" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonKPI key={i} />)}
      </div>

      {/* Financial row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonSummaryCard key={i} />)}
      </div>

      {/* Trend chart */}
      <SkeletonChart height="h-72" />

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonTable rows={5} cols={3} />
        <SkeletonTable rows={5} cols={3} />
      </div>
    </div>
  );
}

// ─── Full monitoring skeleton ─────────────────────────────────────────────────
export function SkeletonMonitoring() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <SkeletonPageHeader />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonSummaryCard key={i} />)}
      </div>

      {/* Table */}
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
}

// ─── Generic list page skeleton (database, listing) ──────────────────────────
export function SkeletonListPage() {
  return (
    <div className="space-y-5">
      <SkeletonPageHeader />
      <div className="flex gap-3 mb-2">
        <Skeleton className="flex-1 h-10 rounded-xl" />
        <Skeleton className="w-28 h-10 rounded-xl" />
        <Skeleton className="w-28 h-10 rounded-xl" />
      </div>
      <SkeletonTable rows={10} cols={6} title={false} />
    </div>
  );
}
