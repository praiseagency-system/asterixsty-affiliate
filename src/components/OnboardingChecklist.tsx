"use client";

import { useEffect, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Step {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────
function CheckCircle({ done }: { done: boolean }) {
  return done ? (
    <svg className="w-5 h-5 text-green-500 shrink-0" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ) : (
    <svg className="w-5 h-5 text-border shrink-0" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function StepIcon({ id }: { id: string }) {
  const icons: Record<string, string> = {
    wa:         "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    affiliate:  "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    campaign:   "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
    monitoring: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  };
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[id] ?? icons.monitoring} />
    </svg>
  );
}

// ─── OnboardingChecklist ──────────────────────────────────────────────────────
export function OnboardingChecklist() {
  const { current } = useWorkspace();
  const workspaceId = current?.id ?? 0;

  const dismissKey = `onboarding-dismissed-${workspaceId}`;

  const [dismissed, setDismissed] = useState(false);
  const [steps, setSteps]         = useState<Step[] | null>(null);
  const [loading, setLoading]     = useState(true);

  // Read localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    if (typeof window !== "undefined") {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    }
  }, [dismissKey]);

  // Fetch all four status checks in parallel
  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch("/api/wa/status").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/listing?limit=1").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/campaigns").then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/monitoring/mingguan?limit=1").then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([wa, listing, campaigns, monitoring]) => {
      if (cancelled) return;

      const waConnected       = wa?.status === "connected";
      const hasAffiliates     = typeof listing?.total === "number" ? listing.total > 0 : false;
      const hasCampaigns      = Array.isArray(campaigns) ? campaigns.length > 0 : false;
      const hasMonitoring     = Array.isArray(monitoring) ? monitoring.length > 0 : false;

      setSteps([
        {
          id: "wa",
          label: "Hubungkan WhatsApp",
          description: "Sambungkan nomor WA untuk mengirim broadcast ke afiliasi.",
          href: "/datasystem/wa-gateway",
          done: waConnected,
        },
        {
          id: "affiliate",
          label: "Tambah Afiliasi Pertama",
          description: "Daftarkan minimal satu afiliasi ke dalam sistem.",
          href: "/affiliate/database",
          done: hasAffiliates,
        },
        {
          id: "campaign",
          label: "Buat Campaign",
          description: "Buat campaign pertama untuk mulai memonitor performa.",
          href: "/program/campaign",
          done: hasCampaigns,
        },
        {
          id: "monitoring",
          label: "Cek Monitoring",
          description: "Lihat laporan mingguan pertama setelah data masuk.",
          href: "/monitoring/mingguan",
          done: hasMonitoring,
        },
      ]);

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [workspaceId]);

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(dismissKey, "1");
    }
    setDismissed(true);
  };

  // Don't render if dismissed
  if (dismissed) return null;
  // Don't render while loading
  if (loading || !steps) return null;
  // Don't render if all steps done
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null;

  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden mb-1">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Mulai di sini</p>
            <p className="text-xs text-muted">{doneCount}/{steps.length} langkah selesai</p>
          </div>
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="text-faint hover:text-muted transition-colors p-1 rounded-lg hover:bg-subtle"
          aria-label="Tutup panduan"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-subtle">
        <div
          className="h-1 bg-accent transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Steps */}
      <ul className="divide-y divide-border">
        {steps.map(step => (
          <li key={step.id}>
            <a
              href={step.done ? undefined : step.href}
              className={[
                "flex items-start gap-3 px-5 py-3.5 transition-colors",
                step.done
                  ? "cursor-default opacity-60"
                  : "hover:bg-subtle cursor-pointer",
              ].join(" ")}
              aria-disabled={step.done}
              onClick={step.done ? (e) => e.preventDefault() : undefined}
            >
              <CheckCircle done={step.done} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium leading-tight ${step.done ? "line-through text-faint" : "text-foreground"}`}>
                  {step.label}
                </p>
                <p className="text-xs text-muted mt-0.5 leading-snug">{step.description}</p>
              </div>
              {!step.done && (
                <div className="w-7 h-7 rounded-lg bg-subtle flex items-center justify-center shrink-0 text-muted">
                  <StepIcon id={step.id} />
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
