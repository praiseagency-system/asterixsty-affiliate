"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useBranding } from "@/contexts/BrandingContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { usePermission } from "@/contexts/PermissionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PERMISSIONS } from "@/lib/permissions";
import { NotificationBell } from "@/components/NotificationBell";

// ─── SVG Icon primitive ───────────────────────────────────────────────────────
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
      aria-hidden="true"
    >
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

// ─── Icon paths (Heroicons outline, 24×24) ────────────────────────────────────
const ICONS = {
  // ── Group icons ──
  dashboard:    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  affiliate:    ["M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"] as const,
  monitoring:   ["M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"] as const,
  content:      ["M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"] as const,
  program:      "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  datasystem:   ["M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7", "M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4", "M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4", "M4 12c0 2.21 3.582 4 8 4s8-1.79 8-4"] as const,
  chevron:      "M19 9l-7 7-7-7",
  settings:     ["M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", "M15 12a3 3 0 11-6 0 3 3 0 016 0z"] as const,
  team:         ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75", "M9 11a4 4 0 100-8 4 4 0 000 8z"] as const,
  signOut:      "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",

  // ── Child nav icons ──
  search:       "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0",
  folder:       "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z",
  cube:         ["M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"] as const,
  speakerphone: ["M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"] as const,
  download:     "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  calendar:     "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  calCheck:     ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"] as const,
  film:         "M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  zap:          "M13 10V3L4 14h7v7l9-11h-7z",
  badge:        ["M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"] as const,
  collection:   ["M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"] as const,
  gift:         ["M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"] as const,
  trendingUp:   "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  adjustments:  "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  chip:         ["M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"] as const,
  colorSwatch:  ["M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"] as const,
  externalLink: "M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14",
  clipboard:    ["M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"] as const,
} as const;

// ─── Nav config ───────────────────────────────────────────────────────────────
interface SubChildLink {
  href:      string;
  label:     string;
  tabParam?: string;
}
interface ChildLink {
  href:         string;
  labelKey:     string;
  iconKey:      keyof typeof ICONS;
  permission?:  string;
  subChildren?: SubChildLink[];
}
interface GroupConfig {
  id:         string;
  labelKey:   string;
  iconKey:    keyof typeof ICONS;
  permission: string;
  children:   ChildLink[];
}

const GROUPS: GroupConfig[] = [
  {
    id:         "affiliate",
    labelKey:   "nav.affiliateManagement",
    iconKey:    "affiliate",
    permission: PERMISSIONS.VIEW_AFFILIATE,
    children: [
      { href: "/listing",         labelKey: "nav.affiliateScouting", iconKey: "search",       permission: PERMISSIONS.VIEW_AFFILIATE  },
      { href: "/database",        labelKey: "nav.databaseAffiliate", iconKey: "folder",       permission: PERMISSIONS.VIEW_AFFILIATE  },
      { href: "/sample-delivery", labelKey: "nav.sendSample",        iconKey: "cube",         permission: PERMISSIONS.VIEW_SAMPLE     },
      { href: "/broadcast",       labelKey: "nav.broadcastEngine",   iconKey: "speakerphone", permission: PERMISSIONS.VIEW_BROADCAST  },
    ],
  },
  {
    id:         "monitoring",
    labelKey:   "nav.monitoring",
    iconKey:    "monitoring",
    permission: PERMISSIONS.VIEW_MONITORING,
    children: [
      { href: "/import",              labelKey: "nav.importData",        iconKey: "download",  permission: PERMISSIONS.VIEW_MONITORING },
      { href: "/monitoring/mingguan", labelKey: "nav.weeklyMonitoring",  iconKey: "calendar",  permission: PERMISSIONS.VIEW_MONITORING },
      { href: "/monitoring/bulanan",  labelKey: "nav.monthlyMonitoring", iconKey: "calCheck",  permission: PERMISSIONS.VIEW_MONITORING },
    ],
  },
  {
    id:         "content",
    labelKey:   "nav.contentIntelligence",
    iconKey:    "content",
    permission: PERMISSIONS.VIEW_CONTENT,
    children: [
      { href: "/video-referensi", labelKey: "nav.videoReference", iconKey: "film", permission: PERMISSIONS.VIEW_CONTENT },
      { href: "/hooks",           labelKey: "nav.hookFormula",    iconKey: "zap",  permission: PERMISSIONS.VIEW_CONTENT },
    ],
  },
  {
    id:         "program",
    labelKey:   "nav.programCenter",
    iconKey:    "program",
    permission: PERMISSIONS.VIEW_CAMPAIGN,
    children: [
      { href: "/tiered",            labelKey: "nav.tieredProgram", iconKey: "badge",      permission: PERMISSIONS.VIEW_CAMPAIGN },
      {
        href:       "/program/campaigns",
        labelKey:   "nav.campaigns",
        iconKey:    "collection",
        permission: PERMISSIONS.VIEW_CAMPAIGN,
        subChildren: [
          { href: "/program/campaigns",           label: "Draft",     tabParam: "Draft"   },
          { href: "/program/campaigns",           label: "Active",    tabParam: "Ongoing" },
          { href: "/program/campaigns",           label: "Ended",     tabParam: "Ended"   },
          { href: "/program/campaigns/templates", label: "Templates"                      },
        ],
      },
      { href: "/program/leaderboards", labelKey: "nav.leaderboards", iconKey: "monitoring",  permission: PERMISSIONS.VIEW_CAMPAIGN },
      { href: "/program/rewards",      labelKey: "nav.rewards",      iconKey: "gift",        permission: PERMISSIONS.VIEW_CAMPAIGN },
      { href: "/program/analytics",    labelKey: "nav.analytics",    iconKey: "trendingUp",  permission: PERMISSIONS.VIEW_CAMPAIGN },
    ],
  },
  {
    id:         "datasystem",
    labelKey:   "nav.dataSystem",
    iconKey:    "datasystem",
    permission: PERMISSIONS.EDIT_WORKSPACE,
    children: [
      { href: "/master",             labelKey: "nav.dataMaster",        iconKey: "adjustments",  permission: PERMISSIONS.EDIT_WORKSPACE    },
      { href: "/admin",              labelKey: "nav.systemConfig",      iconKey: "settings",     permission: PERMISSIONS.EDIT_WORKSPACE    },
      { href: "/automation",         labelKey: "nav.automationCenter",  iconKey: "chip",         permission: PERMISSIONS.MANAGE_WHATSAPP   },
      { href: "/branding",           labelKey: "nav.brandingSettings",  iconKey: "colorSwatch",  permission: PERMISSIONS.BRANDING_SETTINGS  },
      { href: "/google-integration", labelKey: "nav.googleIntegration", iconKey: "externalLink", permission: PERMISSIONS.GOOGLE_INTEGRATION },
    ],
  },
];

// ─── Sub-child link ───────────────────────────────────────────────────────────
function SubChildItem({ sub, pathname, onNavigate }: { sub: SubChildLink; pathname: string; onNavigate: () => void }) {
  const isTemplates = sub.href === "/program/campaigns/templates";
  const active      = isTemplates ? pathname.startsWith("/program/campaigns/templates") : false;
  const href        = sub.tabParam ? `${sub.href}?tab=${sub.tabParam}` : sub.href;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/20"
          : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-faint dark:hover:text-muted dark:hover:bg-subtle"
      }`}
    >
      {isTemplates ? (
        <Icon d={ICONS.clipboard} className="w-3 h-3 opacity-60" />
      ) : (
        <span className="w-1 h-1 rounded-full bg-current opacity-50 shrink-0" />
      )}
      {sub.label}
    </Link>
  );
}

// ─── Collapsible group ────────────────────────────────────────────────────────
function CollapsibleGroup({
  group, pathname, visibleChildren, t, onNavigate,
}: {
  group:           GroupConfig;
  pathname:        string;
  visibleChildren: ChildLink[];
  t:               (key: string) => string;
  onNavigate:      () => void;
}) {
  const isChildActive = visibleChildren.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/")
  );
  const [open, setOpen] = useState(isChildActive);
  useEffect(() => { if (isChildActive) setOpen(true); }, [isChildActive]);

  const estimatedH = visibleChildren.reduce((sum, c) => {
    return sum + 36 + (c.subChildren && pathname.startsWith(c.href) ? c.subChildren.length * 28 + 4 : 0);
  }, 8);

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-150 group mb-0.5 ${
          isChildActive
            ? "text-indigo-600 bg-indigo-50/60 dark:text-indigo-400 dark:bg-indigo-900/20"
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-faint dark:hover:text-muted dark:hover:bg-subtle"
        }`}
      >
        <Icon
          d={ICONS[group.iconKey]}
          className={isChildActive
            ? "text-indigo-500 dark:text-indigo-400"
            : "text-gray-400 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400"}
        />
        <span className="flex-1 text-left">{t(group.labelKey)}</span>
        {isChildActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0 mr-0.5" />
        )}
        <Icon
          d={ICONS.chevron}
          className={`w-3 h-3 transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          } ${isChildActive
            ? "text-indigo-400 dark:text-indigo-500"
            : "text-gray-300 group-hover:text-gray-400 dark:text-gray-600 dark:group-hover:text-gray-500"}`}
        />
      </button>

      <div
        style={{
          maxHeight:  open ? `${estimatedH}px` : "0",
          overflow:   "hidden",
          transition: "max-height 240ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="relative ml-5 pl-3 pb-1 border-l border-gray-100 dark:border-border">
          {visibleChildren.map((child) => {
            const active =
              pathname === child.href || pathname.startsWith(child.href + "/");
            const showSubChildren =
              child.subChildren &&
              (pathname.startsWith(child.href + "/") ||
                pathname === child.href ||
                pathname.startsWith("/program/campaigns"));

            return (
              <div key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-subtle dark:hover:text-gray-200"
                  }`}
                >
                  {active && (
                    <span className="absolute left-[-1px] w-0.5 h-5 bg-indigo-400 dark:bg-indigo-500 rounded-full" />
                  )}
                  <Icon
                    d={ICONS[child.iconKey]}
                    className={active
                      ? "text-indigo-500 dark:text-indigo-400 shrink-0"
                      : "text-gray-400 dark:text-gray-500 shrink-0"}
                  />
                  <span className="truncate">{t(child.labelKey)}</span>
                </Link>

                {child.subChildren && showSubChildren && (
                  <div className="ml-4 mb-1 pl-2 border-l border-gray-100 dark:border-border space-y-0.5">
                    {child.subChildren.map((sub) => (
                      <SubChildItem
                        key={sub.href + (sub.tabParam || "")}
                        sub={sub}
                        pathname={pathname}
                        onNavigate={onNavigate}
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
interface SidebarProps {
  mobileOpen: boolean;
  onClose:    () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname    = usePathname();
  const isDashboard = pathname === "/";
  const { brand }   = useBranding();
  const { data: session } = useSession();
  const { can, canAny, loading: permLoading } = usePermission();
  const { t } = useLanguage();

  const brandName   = brand.brandName   || "ASTERIXSTY";
  const brandSystem = brand.brandSystem || "Affiliate Manager";
  const logoPath    = brand.logoPath    || "";

  const userName  = session?.user?.name  || "User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image || "";

  // Close mobile sidebar on route change
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    onCloseRef.current();
  }, [pathname]);

  const asideClasses = [
    // base
    "bg-surface border-r border-border flex flex-col h-full",
    // mobile: fixed drawer
    "fixed inset-y-0 left-0 z-50 w-72",
    "transition-transform duration-300 ease-in-out",
    mobileOpen ? "translate-x-0" : "-translate-x-full",
    // desktop: static, reset transforms
    "lg:relative lg:w-60 lg:translate-x-0 lg:transition-none lg:z-auto",
  ].join(" ");

  return (
    <aside className={asideClasses}>

      {/* ── Brand header ── */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {logoPath ? (
            <div className="w-9 h-9 rounded-xl border border-border overflow-hidden shrink-0 bg-subtle flex items-center justify-center">
              <Image src={logoPath} alt={brandName} width={32} height={32} className="object-contain w-full h-full p-0.5" unoptimized />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{brandName.slice(0, 2)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-faint uppercase tracking-[0.15em] truncate">{brandName}</p>
            <h1 className="text-[13px] font-bold text-foreground leading-tight tracking-tight truncate">
              {brandSystem}
            </h1>
          </div>
        </div>

        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-subtle transition-colors shrink-0"
          aria-label="Tutup menu"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Workspace switcher ── */}
      <div className="border-b border-border">
        <WorkspaceSwitcher />
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">

        {/* Dashboard */}
        {can(PERMISSIONS.VIEW_DASHBOARD) && (
          <Link
            href="/"
            onClick={onClose}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 mb-2 ${
              isDashboard
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-subtle dark:hover:text-white"
            }`}
          >
            <Icon d={ICONS.dashboard} className={isDashboard ? "text-indigo-100" : "text-gray-400 dark:text-gray-500"} />
            <span>{t("nav.dashboard")}</span>
          </Link>
        )}

        {can(PERMISSIONS.VIEW_DASHBOARD) && (
          <div className="h-px bg-border mx-1 mb-2" />
        )}

        {/* Permission-gated groups */}
        {!permLoading && GROUPS.map((group) => {
          const visibleChildren = group.children.filter((c) =>
            !c.permission || canAny(c.permission),
          );
          if (visibleChildren.length === 0) return null;

          return (
            <CollapsibleGroup
              key={group.id}
              group={group}
              pathname={pathname}
              visibleChildren={visibleChildren}
              t={t}
              onNavigate={onClose}
            />
          );
        })}

        {/* Team Management */}
        {canAny(PERMISSIONS.VIEW_TEAM, PERMISSIONS.INVITE_MEMBER) && (
          <>
            <div className="h-px bg-border mx-1 my-2" />
            <Link
              href="/team"
              onClick={onClose}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                pathname.startsWith("/team")
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-subtle dark:hover:text-gray-200"
              }`}
            >
              <Icon
                d={ICONS.team}
                className={pathname.startsWith("/team")
                  ? "text-indigo-500 dark:text-indigo-400"
                  : "text-gray-400 dark:text-gray-500"}
              />
              <span>{t("nav.teamManagement")}</span>
            </Link>
          </>
        )}

        {/* Settings */}
        <Link
          href="/settings/appearance"
          onClick={onClose}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
            pathname === "/settings/appearance"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-subtle dark:hover:text-gray-200"
          }`}
        >
          <Icon
            d={ICONS.settings}
            className={pathname === "/settings/appearance"
              ? "text-indigo-500 dark:text-indigo-400"
              : "text-gray-400 dark:text-gray-500"}
          />
          <span>{t("nav.settings")}</span>
        </Link>

        {/* Permissions loading shimmer */}
        {permLoading && (
          <div className="space-y-2 px-1 py-2">
            {[80, 65, 72, 58].map((w, i) => (
              <div key={i} className="h-8 rounded-xl bg-subtle animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
      </nav>

      {/* ── User footer ── */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-2 py-2">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt={userName} className="w-8 h-8 rounded-full border border-border shrink-0 object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{userName.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-foreground truncate leading-tight">{userName}</p>
            <p className="text-[10px] text-faint truncate leading-tight">{userEmail}</p>
          </div>
          {/* Notification bell (desktop sidebar) */}
          <NotificationBell />

          {session && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={t("common.signOut")}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-subtle transition-colors shrink-0"
            >
              <Icon d={ICONS.signOut} />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-2 mt-1">
          <p className="text-[10px] text-faint">by Praise · v2.0</p>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 dark:bg-green-500" title="System online" />
        </div>
      </div>
    </aside>
  );
}
