/**
 * Unified Multi-session WhatsApp manager.
 *
 * ALL sessions — including session 1 (primary) — are managed here via
 * global.__waMultiSessions (Map<id, SessionEntry>).
 *
 * Session 1 uses auth dir ".wa-session" for backward compat with existing
 * QR-scanned credentials. Sessions 2+ use ".wa-session-{id}".
 *
 * wa-client.ts is now a thin adapter that delegates to this module for
 * session 1, keeping all existing callers working.
 */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";
import { getPrisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WaMultiState {
  sessionId:   number;
  status:      "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "QR_READY" | "RECONNECTING" | "LIMITED" | "WARMUP" | "BANNED";
  qrDataUrl:   string | null;
  phone:       string | null;
  connectedAt: Date | null;
  error:       string | null;
}

interface SessionEntry {
  socket:         WASocket | null;
  state:          WaMultiState;
  reconnectTimer: NodeJS.Timeout | null;
}

// ── Global singleton (survives HMR) ──────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __waMultiSessions: Map<number, SessionEntry>;
}

function getSessionMap(): Map<number, SessionEntry> {
  if (!global.__waMultiSessions) {
    global.__waMultiSessions = new Map();
  }
  return global.__waMultiSessions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const logger = pino({ level: "silent" });

/** Session 1 uses the legacy auth dir for backward compat. */
function authDir(id: number): string {
  return path.join(process.cwd(), id === 1 ? ".wa-session" : `.wa-session-${id}`);
}

function getEntry(id: number): SessionEntry | undefined {
  return getSessionMap().get(id);
}

function setEntry(id: number, entry: SessionEntry): void {
  getSessionMap().set(id, entry);
}

function patchState(id: number, patch: Partial<WaMultiState>): void {
  const map = getSessionMap();
  const entry = map.get(id);
  if (entry) {
    entry.state = { ...entry.state, ...patch };
    map.set(id, entry);
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Connect ───────────────────────────────────────────────────────────────────

export async function connectMultiSession(id: number): Promise<WaMultiState> {
  const map = getSessionMap();
  const existing = map.get(id);

  if (
    existing &&
    (existing.state.status === "CONNECTED" ||
      existing.state.status === "CONNECTING" ||
      existing.state.status === "QR_READY")
  ) {
    return { ...existing.state };
  }

  const initialState: WaMultiState = {
    sessionId:   id,
    status:      "CONNECTING",
    qrDataUrl:   null,
    phone:       null,
    connectedAt: null,
    error:       null,
  };

  const entry: SessionEntry = {
    socket:         null,
    state:          initialState,
    reconnectTimer: existing?.reconnectTimer ?? null,
  };
  setEntry(id, entry);

  const dir = authDir(id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  // Session 1 uses "AsterixstyAffiliate" browser name for compat with old auth
  const browserName = id === 1 ? "AsterixstyAffiliate" : `AsterixstyAffiliate-${id}`;

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser:           [browserName, "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory:   false,
  });

  const currentEntry = getEntry(id)!;
  currentEntry.socket = sock;
  setEntry(id, currentEntry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: "M",
          margin: 2,
          width:  300,
        });
        patchState(id, { status: "QR_READY", qrDataUrl });
      } catch {
        patchState(id, { status: "QR_READY", qrDataUrl: null });
      }
    }

    if (connection === "open") {
      const phone = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      patchState(id, {
        status:      "CONNECTED",
        qrDataUrl:   null,
        phone,
        connectedAt: new Date(),
        error:       null,
      });
      // Update DB
      try {
        await getPrisma().whatsappSession.update({
          where: { id },
          data:  { status: "CONNECTED", phone: phone ?? "" },
        });
      } catch { /* session might not be in DB yet */ }

      const e = getEntry(id);
      if (e?.reconnectTimer) {
        clearTimeout(e.reconnectTimer);
        e.reconnectTimer = null;
        setEntry(id, e);
      }
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;

      if (loggedOut) {
        fs.rmSync(dir, { recursive: true, force: true });
        const e = getEntry(id);
        if (e) {
          e.socket = null;
          e.state  = {
            ...e.state,
            status:      "DISCONNECTED",
            qrDataUrl:   null,
            phone:       null,
            connectedAt: null,
            error:       "Sesi WhatsApp habis, silakan scan ulang QR code.",
          };
          setEntry(id, e);
        }
        try {
          await getPrisma().whatsappSession.update({
            where: { id },
            data:  { status: "DISCONNECTED" },
          });
        } catch { /* ignore */ }
      } else {
        patchState(id, { status: "RECONNECTING", qrDataUrl: null, error: null });

        const e = getEntry(id);
        if (e) {
          if (e.reconnectTimer) clearTimeout(e.reconnectTimer);
          e.reconnectTimer = setTimeout(async () => {
            const curr = getEntry(id);
            if (curr) {
              curr.reconnectTimer = null;
              curr.socket = null;
              setEntry(id, curr);
            }
            patchState(id, { status: "DISCONNECTED" });
            await connectMultiSession(id);
          }, 5_000);
          setEntry(id, e);
        }
      }
    }
  });

  return { ...getEntry(id)!.state };
}

// ── Disconnect ────────────────────────────────────────────────────────────────

export async function disconnectMultiSession(id: number): Promise<void> {
  const e = getEntry(id);
  if (!e) return;

  if (e.reconnectTimer) {
    clearTimeout(e.reconnectTimer);
    e.reconnectTimer = null;
  }

  if (e.socket) {
    try { await e.socket.logout(); } catch { /* ignore */ }
    e.socket = null;
  }

  fs.rmSync(authDir(id), { recursive: true, force: true });

  e.state = {
    ...e.state,
    status:      "DISCONNECTED",
    qrDataUrl:   null,
    phone:       null,
    connectedAt: null,
    error:       null,
  };
  setEntry(id, e);

  try {
    await getPrisma().whatsappSession.update({
      where: { id },
      data:  { status: "DISCONNECTED" },
    });
  } catch { /* ignore */ }
}

// ── Send via specific session ──────────────────────────────────────────────────

export async function sendViaMultiSession(
  id:      number,
  phone:   string,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  const e = getEntry(id);
  if (!e || !e.socket || e.state.status !== "CONNECTED") {
    return { ok: false, error: `Session ${id} tidak terhubung` };
  }

  let normalized = phone.replace(/\D/g, "");
  if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
  if (!normalized.startsWith("62")) normalized = "62" + normalized;
  const jid = normalized + "@s.whatsapp.net";

  try {
    await e.socket.sendMessage(jid, { text: message });

    // Update DB stats on success (non-blocking)
    updateSessionStats(id, true).catch(() => {});

    return { ok: true };
  } catch (err) {
    updateSessionStats(id, false).catch(() => {});
    return { ok: false, error: String(err) };
  }
}

async function updateSessionStats(id: number, success: boolean): Promise<void> {
  const prisma  = getPrisma();
  const session = await prisma.whatsappSession.findUnique({ where: { id } });
  if (!session) return;

  const today = todayIso();
  if (success) {
    const newSentToday = (session.lastSentDate === today ? session.sentToday : 0) + 1;
    const newSuccess   = session.successCount + 1;
    const total        = newSuccess + session.failCount;
    await prisma.whatsappSession.update({
      where: { id },
      data: {
        successCount: newSuccess,
        sentToday:    newSentToday,
        lastSentDate: today,
        lastUsedAt:   new Date(),
        healthScore:  total > 0 ? Math.round((newSuccess / total) * 100) : 100,
      },
    });
  } else {
    const newFail = session.failCount + 1;
    const total   = session.successCount + newFail;
    await prisma.whatsappSession.update({
      where: { id },
      data: {
        failCount:   newFail,
        healthScore: total > 0 ? Math.round((session.successCount / total) * 100) : 0,
      },
    });
  }
}

// ── Unified send (for reminder engine, sample delivery, etc.) ─────────────────
/**
 * Send a WA message using the best available session.
 * Priority: preferredSessionId → default session → session 1 → any healthy session.
 */
export async function sendUnified(
  phone:              string,
  message:            string,
  preferredSessionId?: number,
): Promise<{ ok: boolean; error?: string; usedSessionId?: number }> {
  // Build ordered candidate list
  const tried = new Set<number>();
  const prisma = getPrisma();

  const trySession = async (id: number): Promise<boolean> => {
    if (tried.has(id)) return false;
    tried.add(id);
    const e = getEntry(id);
    if (!e || e.state.status !== "CONNECTED" || !e.socket) return false;
    const r = await sendViaMultiSession(id, phone, message);
    return r.ok;
  };

  // 1. Preferred session
  if (preferredSessionId) {
    if (await trySession(preferredSessionId)) return { ok: true, usedSessionId: preferredSessionId };
  }

  // 2. Default session from DB
  try {
    const def = await prisma.whatsappSession.findFirst({ where: { isDefault: true, isActive: true } });
    if (def && await trySession(def.id)) return { ok: true, usedSessionId: def.id };
  } catch { /* ignore */ }

  // 3. Session 1 (primary)
  if (await trySession(1)) return { ok: true, usedSessionId: 1 };

  // 4. Any connected healthy session
  const allSessions = await prisma.whatsappSession.findMany({
    where: { isActive: true },
    orderBy: [{ healthScore: "desc" }, { sentToday: "asc" }],
  }).catch(() => []);

  for (const sess of allSessions) {
    if (await trySession(sess.id)) return { ok: true, usedSessionId: sess.id };
  }

  return { ok: false, error: "Tidak ada WhatsApp yang terhubung. Hubungkan minimal satu akun di Automation Center." };
}

// ── State Accessors ───────────────────────────────────────────────────────────

export function getMultiSessionState(id: number): WaMultiState | null {
  const e = getEntry(id);
  return e ? { ...e.state } : null;
}

export function getAllMultiSessionStates(): WaMultiState[] {
  return Array.from(getSessionMap().values()).map((e) => ({ ...e.state }));
}

/** Returns true if at least one session has an active socket and is CONNECTED. */
export function isAnySessionConnected(): boolean {
  const map = getSessionMap();
  for (const entry of map.values()) {
    if (entry.state.status === "CONNECTED" && entry.socket) return true;
  }
  return false;
}

/** Returns the phone number of the primary (session 1) or first connected session. */
export function getPrimaryPhone(): string | null {
  const s1 = getEntry(1);
  if (s1?.state.status === "CONNECTED") return s1.state.phone;
  const map = getSessionMap();
  for (const entry of map.values()) {
    if (entry.state.status === "CONNECTED") return entry.state.phone;
  }
  return null;
}

// ── Pick Best Session ─────────────────────────────────────────────────────────
/**
 * Pick the healthiest available session from the given list.
 * If sessionIds is empty, picks from ALL active sessions.
 */
export async function pickBestSession(sessionIds: number[] = []): Promise<number | null> {
  const prisma = getPrisma();
  const today  = todayIso();

  const sessions = await prisma.whatsappSession.findMany({
    where: {
      ...(sessionIds.length > 0 ? { id: { in: sessionIds } } : {}),
      isActive: true,
      status:   { notIn: ["BANNED", "DISCONNECTED"] },
    },
  });

  const candidates = sessions
    .map((s) => {
      const effectiveSentToday = s.lastSentDate === today ? s.sentToday : 0;
      return { id: s.id, healthScore: s.healthScore, effectiveSentToday, dailyLimit: s.dailyLimit };
    })
    .filter((c) => c.effectiveSentToday < c.dailyLimit)
    .filter((c) => {
      const memState = getMultiSessionState(c.id);
      return memState?.status === "CONNECTED";
    })
    .sort((a, b) => {
      if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
      return a.effectiveSentToday - b.effectiveSentToday;
    });

  return candidates[0]?.id ?? null;
}

// ── Auto-reconnect all sessions on server startup ─────────────────────────────
/**
 * Called by instrumentation.ts on server start.
 * Reconnects all active sessions that have auth files on disk.
 * Sessions without auth files are marked DISCONNECTED in DB.
 */
export async function autoReconnectAllSessions(): Promise<void> {
  let dbSessions: { id: number; name: string; status: string; isActive: boolean }[] = [];
  try {
    dbSessions = await getPrisma().whatsappSession.findMany({
      where:   { isActive: true },
      orderBy: { id: "asc" },
      select:  { id: true, name: true, status: true, isActive: true },
    });
  } catch (err) {
    console.warn("[WA-Multi] Could not load sessions from DB:", err);
    return;
  }

  for (const sess of dbSessions) {
    const dir = authDir(sess.id);
    if (fs.existsSync(dir)) {
      // Auth files present → try to auto-reconnect (non-blocking)
      connectMultiSession(sess.id).catch((err) => {
        console.warn(`[WA-Multi] Auto-reconnect session ${sess.id} (${sess.name}) failed:`, err);
      });
    } else {
      // No auth files → ensure DB reflects DISCONNECTED
      if (sess.status !== "DISCONNECTED") {
        await getPrisma().whatsappSession.update({
          where: { id: sess.id },
          data:  { status: "DISCONNECTED" },
        }).catch(() => {});
      }
    }
  }
}

// ── Reset Daily Counts ────────────────────────────────────────────────────────

export async function resetDailyCounts(): Promise<void> {
  const today = todayIso();
  await getPrisma().whatsappSession.updateMany({
    where: { lastSentDate: { not: today } },
    data:  { sentToday: 0 },
  });
}
