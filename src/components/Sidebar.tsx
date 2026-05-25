"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useBranding } from "@/contexts/BrandingContext";

// ─── SVG Icon primitives ──────────────────────────────────────────────────────
function Icon({ d, className = "" }: { d: string | readonly string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      className={`w-4 h-4 shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

const ICONS = {
  dashboard:   "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  affiliate:   ["M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"],
  monitoring:  ["M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"],
  content:     ["M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"],
  program:     "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  datasystem:  ["M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7", "M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4", "M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4", "M4 12c0 2.21 3.582 4 8 4s8-1.79 8-4"],
  chevron:     "M19 9l-7 7-7-7",
} as const;

// ─── Nav config ───────────────────────────────────────────────────────────────
interface SubChildLink { href: string; label: string; tabParam?: string; }
interface ChildLink    { href: string; label: string; emoji: string; subChildren?: SubChildLink[]; }
interface GroupConfig  { id: string; label: string; iconKey: keyof typeof ICONS; children: ChildLink[]; }

const GROUPS: GroupConfig[] = [
  {
    id: "affiliate",
    label: "Affiliate Management",
    iconKey: "affiliate",
    children: [
      { href: "/listing",         label: "Affiliate Scouting",  emoji: "🔍" },
      { href: "/database",        label: "Database Affiliate",  emoji: "🗂️" },
      { href: "/sample-delivery", label: "Kirim Sample",        emoji: "📦" },
      { href: "/broadcast",       label: "Broadcast Engine",    emoji: "📢" },
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring",
    iconKey: "monitoring",
    children: [
      { href: "/import",                label: "Import Data",         emoji: "📥" },
      { href: "/monitoring/mingguan",   label: "Monitoring Mingguan", emoji: "📅" },
      { href: "/monitoring/bulanan",    label: "Monitoring Bulanan",  emoji: "📆" },
    ],
  },
  {
    id: "content",
    label: "Content Intelligence",
    iconKey: "content",
    children: [
      { href: "/video-referensi", label: "Referensi Video", emoji: "📹" },
      { href: "/hooks",           label: "Hook Formula",    emoji: "💡" },
    ],
  },
  {
    id: "program",
    label: "Program Center",
    iconKey: "program",
    children: [
      { href: "/tiered", label: "Tiered Program", emoji: "🏆" },
      {
        href: "/program/campaigns",
        label: "Campaigns",
        emoji: "🎯",
        subChildren: [
          { href: "/program/campaigns",           label: "Draft",     tabParam: "Draft"   },
          { href: "/program/campaigns",           label: "Active",    tabParam: "Ongoing" },
          { href: "/program/campaigns",           label: "Ended",     tabParam: "Ended"   },
          { href: "/program/campaigns/templates", label: "Templates"                      },
        ],
      },
      { href: "/program/leaderboards", label: "Leaderboards", emoji: "📊" },
      { href: "/program/rewards",      label: "Rewards",      emoji: "🎁" },
      { href: "/program/analytics",    label: "Analytics",    emoji: "📈" },
    ],
  },
  {
    id: "datasystem",
    label: "Data & System",
    iconKey: "datasystem",
    children: [
      { href: "/master",             label: "Data Master",        emoji: "⚙️" },
      { href: "/admin",              label: "Konfigurasi Sistem", emoji: "🔧" },
      { href: "/automation",         label: "Automation Center",  emoji: "🤖" },
      { href: "/branding",           label: "Branding Settings",  emoji: "🎨" },
      { href: "/google-integration", label: "Google Integration", emoji: "🔗" },
    ],
  },
];

// ─── Sub-child link ───────────────────────────────────────────────────────────
function SubChildItem({ sub, pathname }: { sub: SubChildLink; pathname: string }) {
  const isTemplates = sub.href === "/program/campaigns/templates";
  const active      = isTemplates
    ? pathname.startsWith("/program/campaigns/templates")
    : false; // tab-param items don't get individual active highlight

  const href = sub.tabParam ? `${sub.href}?tab=${sub.tabParam}` : sub.href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "text-indigo-600 bg-indigo-50"
          : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
      }`}
    >
      {isTemplates ? (
        <span className="text-[10px]">📋</span>
      ) : (
        <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
      )}
      {sub.label}
    </Link>
  );
}

// ─── Collapsible group ────────────────────────────────────────────────────────
function CollapsibleGroup({ group, pathname }: { group: GroupConfig; pathname: string }) {
  const isChildActive = group.children.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/")
  );
  const [open, setOpen] = useState(isChildActive);

  useEffect(() => { if (isChildActive) setOpen(true); }, [isChildActive]);

  // Estimate height: each child ~36px + sub-children ~28px each + 8px padding
  const estimatedH = group.children.reduce((sum, c) => {
    return sum + 36 + (c.subChildren && (pathname.startsWith(c.href)) ? c.subChildren.length * 28 + 4 : 0);
  }, 8);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-150 group mb-0.5 ${
          isChildActive
            ? "text-indigo-600 bg-indigo-50/60"
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
        }`}
      >
        <Icon
          d={ICONS[group.iconKey]}
          className={isChildActive ? "text-indigo-500" : "text-gray-400 group-hover:text-gray-500"}
        />
        <span className="flex-1 text-left">{group.label}</span>
        {isChildActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mr-0.5" />
        )}
        <Icon
          d={ICONS.chevron}
          className={`w-3 h-3 transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          } ${isChildActive ? "text-indigo-400" : "text-gray-300 group-hover:text-gray-400"}`}
        />
      </button>

      <div
        style={{
          maxHeight: open ? `${estimatedH}px` : "0",
          overflow: "hidden",
          transition: "max-height 240ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="relative ml-5 pl-3 pb-1 border-l border-gray-100">
          {group.children.map((child) => {
            const active =
              pathname === child.href || pathname.startsWith(child.href + "/");
            const showSubChildren =
              child.subChildren && (pathname.startsWith(child.href + "/") || pathname === child.href || pathname.startsWith("/program/campaigns"));

            return (
              <div key={child.href}>
                <Link
                  href={child.href}
                  className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                  }`}
                >
                  {active && (
                    <span className="absolute left-[-1px] w-0.5 h-5 bg-indigo-400 rounded-full" />
                  )}
                  <span className="text-sm leading-none">{child.emoji}</span>
                  <span className="truncate">{child.label}</span>
                </Link>

                {/* Sub-children (e.g. Campaigns → Draft / Active / Ended / Templates) */}
                {child.subChildren && showSubChildren && (
                  <div className="ml-4 mb-1 pl-2 border-l border-gray-100 space-y-0.5">
                    {child.subChildren.map((sub) => (
                      <SubChildItem
                        key={sub.href + (sub.tabParam || "")}
                        sub={sub}
                        pathname={pathname}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const pathname = usePathname();
  const isDashboard = pathname === "/";
  const { brand } = useBranding();

  const brandName   = brand.brandName   || "ASTERIXSTY";
  const brandSystem = brand.brandSystem || "Affiliate Manager";
  const logoPath    = brand.logoPath    || "";

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0 h-full">

      {/* ── Brand header ── */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {logoPath ? (
            <div className="w-9 h-9 rounded-xl border border-gray-100 overflow-hidden shrink-0 bg-white flex items-center justify-center">
              <Image src={logoPath} alt={brandName} width={32} height={32} className="object-contain w-full h-full p-0.5" unoptimized />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{brandName.slice(0, 2)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-[0.15em] truncate">{brandName}</p>
            <h1 className="text-[13px] font-bold text-gray-800 leading-tight tracking-tight truncate">
              {brandSystem}
            </h1>
          </div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        <Link
          href="/"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 mb-2 ${
            isDashboard
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <Icon d={ICONS.dashboard} className={isDashboard ? "text-indigo-100" : "text-gray-400"} />
          <span>Dashboard</span>
        </Link>

        <div className="h-px bg-gray-100 mx-1 mb-2" />

        {GROUPS.map((group) => (
          <CollapsibleGroup key={group.id} group={group} pathname={pathname} />
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">by Praise · v2.0</p>
        <div className="w-2 h-2 rounded-full bg-green-400" title="System online" />
      </div>
    </aside>
  );
}
