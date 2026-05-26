/**
 * Thin adapter — delegates ALL operations to wa-multi-client.ts session 1.
 *
 * This file keeps all existing callers (reminder-engine, send-sample-delivery-wa,
 * legacy API routes, etc.) working without modification.
 *
 * Session 1 is now fully managed by wa-multi-client.ts, using auth dir
 * ".wa-session" for backward compat with previously-scanned QR credentials.
 */
import {
  connectMultiSession,
  disconnectMultiSession,
  sendViaMultiSession,
  getMultiSessionState,
  type WaMultiState,
} from "@/lib/wa-multi-client";

// ── Types (re-exported for backward compat) ───────────────────────────────────

export type WAStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "connected"
  | "reconnecting";

export interface WAState {
  status:      WAStatus;
  qrDataUrl:   string | null;
  phone:       string | null;
  connectedAt: Date | null;
  error:       string | null;
}

function mapStatus(s: WaMultiState["status"]): WAStatus {
  switch (s) {
    case "CONNECTED":    return "connected";
    case "CONNECTING":   return "connecting";
    case "QR_READY":     return "qr_ready";
    case "RECONNECTING": return "reconnecting";
    default:             return "disconnected";
  }
}

// ── Public API (delegates to session 1 in wa-multi-client) ───────────────────

export function getWAState(): WAState {
  const s = getMultiSessionState(1);
  if (!s) {
    return { status: "disconnected", qrDataUrl: null, phone: null, connectedAt: null, error: null };
  }
  return {
    status:      mapStatus(s.status),
    qrDataUrl:   s.qrDataUrl,
    phone:       s.phone,
    connectedAt: s.connectedAt,
    error:       s.error,
  };
}

export async function connectWA(): Promise<void> {
  await connectMultiSession(1);
}

export async function disconnectWA(): Promise<void> {
  await disconnectMultiSession(1);
}

export async function sendWAMessage(
  phone:   string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  return sendViaMultiSession(1, phone, message);
}
