"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback — if omitted, default UI is shown */
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// ─── ErrorBoundary (must be a class component) ────────────────────────────────
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for future observability wiring
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

// ─── Default fallback UI ──────────────────────────────────────────────────────
function DefaultErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] px-6 py-10 text-center">
      {/* Icon */}
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <svg
          className="w-7 h-7 text-red-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </div>

      <h2 className="text-base font-semibold text-foreground mb-1">
        Terjadi kesalahan yang tidak terduga
      </h2>
      <p className="text-sm text-muted max-w-sm mb-1">
        Halaman ini mengalami error. Coba muat ulang atau kembali ke dashboard.
      </p>

      {/* Show error message in dev */}
      {process.env.NODE_ENV === "development" && error && (
        <pre className="mt-3 mb-4 w-full max-w-lg text-left text-xs bg-red-50 text-red-700 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all border border-red-100">
          {error.message}
        </pre>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm font-medium rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Coba Lagi
        </button>
        <a
          href="/"
          className="px-4 py-2 text-sm font-medium rounded-xl bg-subtle text-foreground hover:bg-subtle/80 border border-border transition-colors"
        >
          Kembali ke Dashboard
        </a>
      </div>
    </div>
  );
}

// ─── HOC helper ───────────────────────────────────────────────────────────────
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode,
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name})`;
  return Wrapped;
}
