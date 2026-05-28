"use client";

import { type ReactNode } from "react";
import { usePermission } from "@/contexts/PermissionContext";
import AccessDenied from "@/components/AccessDenied";

interface PermissionGateProps {
  /** A single permission key or an array of keys (ALL must be held) */
  permission: string | string[];
  /**
   * When true, the user only needs to hold ANY one of the given permissions
   * (OR logic). Default is false = AND logic (ALL required).
   */
  requireAny?: boolean;
  /** Custom fallback rendered when access is denied. Defaults to <AccessDenied /> */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Client-side permission gate.
 *
 * Usage:
 *   <PermissionGate permission={PERMISSIONS.VIEW_CAMPAIGN}>
 *     <CampaignPage />
 *   </PermissionGate>
 *
 *   // OR logic:
 *   <PermissionGate permission={[PERMISSIONS.EDIT_CAMPAIGN, PERMISSIONS.DELETE_CAMPAIGN]} requireAny>
 *     <ActionPanel />
 *   </PermissionGate>
 */
export default function PermissionGate({
  permission,
  requireAny = false,
  fallback,
  children,
}: PermissionGateProps) {
  const { can, canAny, loading } = usePermission();

  // While loading, render nothing to avoid flash of unauthorized content
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="w-8 h-8 rounded-full border-2 border-border border-t-indigo-500 animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = requireAny ? canAny(...perms) : can(...perms);

  if (!allowed) {
    return <>{fallback ?? <AccessDenied />}</>;
  }

  return <>{children}</>;
}
