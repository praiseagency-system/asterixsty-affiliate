"use client";

import Link from "next/link";

interface AccessDeniedProps {
  /** Custom message shown below the heading */
  message?: string;
  /** Custom back-link label */
  backLabel?: string;
  /** Custom back-link href */
  backHref?: string;
}

export default function AccessDenied({
  message = "You don't have permission to view this page. Contact your admin to request access.",
  backLabel = "Back to Dashboard",
  backHref  = "/",
}: AccessDeniedProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl p-8 text-center">
        {/* Lock icon */}
        <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-subtle flex items-center justify-center">
          <svg
            className="w-8 h-8 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold text-foreground mb-2">Access Denied</h2>

        {/* Message */}
        <p className="text-sm text-muted leading-relaxed mb-6">{message}</p>

        {/* Back button */}
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
