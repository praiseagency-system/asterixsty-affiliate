"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

// ─── Type → icon mapping ──────────────────────────────────────────────────────
const TYPE_ICON: Record<string, { d: string; color: string }> = {
  affiliate_new:   { color: "text-green-500  bg-green-50",  d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
  campaign_status: { color: "text-indigo-500 bg-indigo-50", d: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" },
  invite_accepted: { color: "text-blue-500   bg-blue-50",   d: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
  sample_update:   { color: "text-amber-500  bg-amber-50",  d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  broadcast_done:  { color: "text-purple-500 bg-purple-50", d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" },
};

function typeIcon(type: string) {
  return TYPE_ICON[type] ?? { color: "text-gray-500 bg-gray-50", d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" };
}

// ─── Relative time helper ─────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return "Baru saja";
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} jam lalu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7)    return `${diffD} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

// ─── NotificationBell ─────────────────────────────────────────────────────────
export function NotificationBell() {
  const { current } = useWorkspace();
  const wsId = current?.id ?? 1;

  const [open,         setOpen]         = useState(false);
  const [items,        setItems]        = useState<Notification[]>([]);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?workspaceId=${wsId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silent
    }
  }, [wsId]);

  // Initial load
  useEffect(() => { void fetchNotifications(); }, [fetchNotifications]);

  // Polling every 30 s
  useEffect(() => {
    const timer = setInterval(() => { void fetchNotifications(); }, 30_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Mark all read ─────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setLoading(true);
    try {
      await fetch(`/api/notifications?workspaceId=${wsId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "read_all" }),
      });
      setItems(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  // ── Mark one read + navigate ──────────────────────────────────────────────
  const handleClick = async (n: Notification) => {
    if (!n.read) {
      await fetch(`/api/notifications?workspaceId=${wsId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "read_one", id: n.id }),
      });
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    if (n.href) window.location.href = n.href;
  };

  const unread = items.filter(n => !n.read);
  const read   = items.filter(n =>  n.read);

  return (
    <div ref={dropRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-foreground hover:bg-subtle transition-colors"
        aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ""}`}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden animate-picker-enter">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">Notifikasi</p>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-accent text-white text-[10px] font-bold rounded-full leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-50"
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <div className="w-10 h-10 rounded-xl bg-subtle flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-faint" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-foreground">Belum ada notifikasi</p>
                <p className="text-xs text-faint mt-0.5">Aktivitas akan muncul di sini</p>
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[10px] font-semibold text-faint uppercase tracking-wider bg-subtle">
                      Belum dibaca
                    </p>
                    {unread.map(n => (
                      <NotifItem key={n.id} n={n} onClick={handleClick} />
                    ))}
                  </div>
                )}
                {read.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[10px] font-semibold text-faint uppercase tracking-wider bg-subtle">
                      Sebelumnya
                    </p>
                    {read.slice(0, 10).map(n => (
                      <NotifItem key={n.id} n={n} onClick={handleClick} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single notification item ──────────────────────────────────────────────────
function NotifItem({ n, onClick }: { n: Notification; onClick: (n: Notification) => void }) {
  const { color, d } = typeIcon(n.type);
  return (
    <button
      onClick={() => onClick(n)}
      className={[
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle",
        n.read ? "opacity-70" : "",
      ].join(" ")}
    >
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color.split(" ")[1]} mt-0.5`}>
        <svg className={`w-4 h-4 ${color.split(" ")[0]}`} viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={d} />
        </svg>
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-tight ${n.read ? "text-muted font-normal" : "text-foreground font-medium"}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-faint mt-0.5 leading-snug line-clamp-2">{n.body}</p>
        )}
        <p className="text-[10px] text-faint mt-1">{relativeTime(n.createdAt)}</p>
      </div>

      {/* Unread dot */}
      {!n.read && (
        <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-2" aria-hidden="true" />
      )}
    </button>
  );
}
