"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useBranding } from "@/contexts/BrandingContext";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { usePermission } from "@/contexts/PermissionContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PERMISSIONS } from "@/lib/permissions";

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
  dashboard:  "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  affiliate:  ["M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"],
  monitoring: ["M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"],
  content:    ["M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"],
  program:    "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  datasystem: ["M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7", "M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4", "M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4", "M4 12c0 2.21 3.582 4 8 4s8-1.79 8-4"],
  chevron:    "M19 9l-7 7-7-7",
  settings:   ["M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z", "M15 12a3 3 0 11-6 0 3 3 0 016 0z"],
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
  emoji:        string;
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
      { href: "/listing",         labelKey: "nav.affiliateScouting", emoji: "🔍", permission: PERMISSIONS.VIEW_AFFILIATE  },
      { href: "/database",        labelKey: "nav.databaseAffiliate", emoji: "🗂️", permission: PERMISSIONS.VIEW_AFFILIATE  },
      { href: "/sample-delivery", labelKey: "nav.sendSample",        emoji: "📦", permission: PERMISSIONS.VIEW_SAMPLE     },
      { href: "/broadcast",       labelKey: "nav.broadcastEngine",   emoji: "📢", permission: PERMISSIONS.VIEW_BROADCAST  },
    ],
  },
  {
    id:         "monitoring",
    labelKey:   "nav.monitoring",
    iconKey:    "monitoring",
    permission: PERMISSIONS.VIEW_MONITORING,
    children: [
      { href: "/import",              labelKey: "nav.importData",        emoji: "📥", permission: PERMISSIONS.VIEW_MONITORING },
      { href: "/monitoring/mingguan", labelKey: "nav.weeklyMonitoring",  emoji: "📅", permission: PERMISSIONS.VIEW_MONITORING },
      { href: "/monitoring/bulanan",  labelKey: "nav.monthlyMonitoring", emoji: "📆", permission: PERMISSIONS.VIEW_MONITORING },
    ],
  },
  {
    id:         "content",
    labelKey:   "nav.contentIntelligence",
    iconKey:    "content",
    permission: PERMISSIONS.VIEW_CONTENT,
    children: [
      { href: "/video-referensi", labelKey: "nav.videoReference", emoji: "📹", permission: PERMISSIONS.VIEW_CONTENT },
      { href: "/hooks",           labelKey: "nav.hookFormula",    emoji: "💡", permission: PERMISSIONS.VIEW_CONTENT },
    ],
  },
  {
    id:         "program",
    labelKey:   "nav.programCenter",
    iconKey:    "program",
    permission: PERMISSIONS.VIEW_CAMPAIGN,
    children: [
      { href: "/tiered",            labelKey: "nav.tieredProgram", emoji: "🏆", permission: PERMISSIONS.VIEW_CAMPAIGN },
      {
        href:       "/program/campaigns",
        labelKey:   "nav.campaigns",
        emoji:      "🎯",
        permission: PERMISSIONS.VIEW_CAMPAIGN,
        subChildren: [
          { href: "/program/campaigns",           label: "Draft",     tabParam: "Draft"   },
          { href: "/program/campaigns",           label: "Active",    tabParam: "Ongoing" },
          { href: "/program/campaigns",           label: "Ended",     tabParam: "Ended"   },
          { href: "/program/campaigns/templates", label: "Templates"                      },
        ],
      },
      { href: "/program/leaderboards", labelKey: "nav.leaderboards", emoji: "📊", permission: PERMISSIONS.VIEW_CAMPAIGN },
      { href: "/program/rewards",      labelKey: "nav.rewards",      emoji: "🎁", permission: PERMISSIONS.VIEW_CAMPAIGN },
      { href: "/program/analytics",    labelKey: "nav.analytics",    emoji: "📈", permission: PERMISSIONS.VIEW_CAMPAIGN },
    ],
  },
  {
    id:         "datasystem",
    labelKey:   "nav.dataSystem",
    iconKey:    "datasystem",
    permission: PERMISSIONS.EDIT_WORKSPACE,
    children: [
      { href: "/master",             labelKey: "nav.dataMaster",         emoji: "⚙️", permission: PERMISSIONS.EDIT_WORKSPACE    },
      { href: "/admin",              labelKey: "nav.systemConfig",       emoji: "🔧", permission: PERMISSIONS.EDIT_WORKSPACE    },
      { href: "/automation",         labelKey: "nav.automationCenter",   emoji: "🤖", permission: PERMISSIONS.MANAGE_WHATSAPP   },
      { href: "/branding",           labelKey: "nav.brandingSettings",   emoji: "🎨", permission: PERMISSIONS.BRANDING_SETTINGS  },
      { href: "/google-integration", labelKey: "nav.googleIntegration",  emoji: "🔗", permission: PERMISSIONS.GOOGLE_INTEGRATION },
    ],
  },
];

// ─── Sub-child link ───────────────────────────────────────────────────────────
function SubChildItem({ sub, pathname }: { sub: SubChildLink; pathname: string }) {
  const isTemplates = sub.href === "/program/campaigns/templates";
  const active      = isTemplates ? pathname.startsWith("/program/campaigns/templates") : false;
  const href        = sub.tabParam ? `${sub.href}?tab=${sub.tabParam}` : sub.href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active
          ? "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-900/20"
          : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-[#1d212c]"
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
function CollapsibleGroup({
  group,
  pathname,
  visibleChildren,
  t,
}: {
  group:           GroupConfig;
  pathname:        string;
  visibleChildren: ChildLink[];
  t:               (key: string) => string;
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
            : "text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-[#1d212c]"
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
        <div className="relative ml-5 pl-3 pb-1 border-l border-gray-100 dark:border-[#1e2333]">
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
                  className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-sm font-medium transition-colors mb-0.5 ${
                    active
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#1d212c] dark:hover:text-gray-200"
                  }`}
                >
                  {active && (
                    <span className="absolute left-[-1px] w-0.5 h-5 bg-indigo-400 dark:bg-indigo-500 rounded-full" />
                  )}
                  <span className="text-sm leading-none">{child.emoji}</span>
                  <span className="truncate">{t(child.labelKey)}</span>
                </Link>

                {child.subChildren && showSubChildren && (
                  <div className="ml-4 mb-1 pl-2 border-l border-gray-100 dark:border-[#1e2333] space-y-0.5">
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

  return (
    <aside className="w-60 bg-white dark:bg-[#0f1115] border-r border-gray-200 dark:border-[#1e2333] flex flex-col shrink-0 h-full">

      {/* ── Brand header ── */}
      <div className="px-4 py-4 border-b border-gray-100 dark:border-[#1e2333]">
        <div className="flex items-center gap-2.5">
          {logoPath ? (
            <div className="w-9 h-9 rounded-xl border border-gray-100 dark:border-[#2a2f3d] overflow-hidden shrink-0 bg-white dark:bg-[#1d212c] flex items-center justify-center">
              <Image src={logoPath} alt={brandName} width={32} height={32} className="object-contain w-full h-full p-0.5" unoptimized />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-bold">{brandName.slice(0, 2)}</span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-[0.15em] truncate">{brandName}</p>
            <h1 className="text-[13px] font-bold text-gray-800 dark:text-gray-100 leading-tight tracking-tight truncate">
              {brandSystem}
            </h1>
          </div>
        </div>
      </div>

      {/* ── Workspace switcher ── */}
      <div className="border-b border-gray-100 dark:border-[#1e2333]">
        <WorkspaceSwitcher />
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">

        {/* Dashboard — visible to all authenticated members */}
        {can(PERMISSIONS.VIEW_DASHBOARD) && (
          <Link
            href="/"
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 mb-2 ${
              isDashboard
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-[#1d212c] dark:hover:text-white"
            }`}
          >
            <Icon d={ICONS.dashboard} className={isDashboard ? "text-indigo-100" : "text-gray-400 dark:text-gray-500"} />
            <span>{t("nav.dashboard")}</span>
          </Link>
        )}

        {can(PERMISSIONS.VIEW_DASHBOARD) && (
          <div className="h-px bg-gray-100 dark:bg-[#1e2333] mx-1 mb-2" />
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
            />
          );
        })}

        {/* Team Management */}
        {canAny(PERMISSIONS.VIEW_TEAM, PERMISSIONS.INVITE_MEMBER) && (
          <>
            <div className="h-px bg-gray-100 dark:bg-[#1e2333] mx-1 my-2" />
            <Link
              href="/team"
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                pathname.startsWith("/team")
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#1d212c] dark:hover:text-gray-200"
              }`}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span>{t("nav.teamManagement")}</span>
            </Link>
          </>
        )}

        {/* Settings */}
        <Link
          href="/settings/appearance"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
            pathname.startsWith("/settings")
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
              : "text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-[#1d212c] dark:hover:text-gray-200"
          }`}
        >
          <Icon
            d={ICONS.settings}
            className={pathname.startsWith("/settings")
              ? "text-indigo-500 dark:text-indigo-400"
              : "text-gray-400 dark:text-gray-500"}
          />
          <span>{t("nav.settings")}</span>
        </Link>

        {/* Permissions still loading — skeleton shimmer */}
        {permLoading && (
          <div className="space-y-2 px-1 py-2">
            {[80, 65, 72, 58].map((w, i) => (
              <div key={i} className="h-8 rounded-xl bg-gray-100 dark:bg-[#1d212c] animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
      </nav>

      {/* ── User footer ── */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-[#1e2333]">
        <div className="flex items-center gap-2.5 px-2 py-2">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt={userName} className="w-8 h-8 rounded-full border border-gray-100 dark:border-[#2a2f3d] shrink-0 object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-semibold">{userName.slice(0, 1).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">{userName}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate leading-tight">{userEmail}</p>
          </div>
          {session && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={t("common.signOut")}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-[#1d212c] transition-colors shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-2 mt-1">
          <p className="text-[10px] text-gray-300 dark:text-gray-600">by Praise · v2.0</p>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 dark:bg-green-500" title="System online" />
        </div>
      </div>
    </aside>
  );
}
