/**
 * Multi-session WhatsApp manager.
 * Manages sessions 2+ using their own Baileys sockets stored in global.__waMultiSessions.
 * Session 1 is always delegated to wa-client.ts (legacy primary session).
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

function authDir(id: number): string {
  return path.join(process.cwd(), `.wa-session-${id}`);
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

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys:  makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser:           [`AsterixstyAffiliate-${id}`, "Chrome", "1.0.0"],
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
      // Update DB status
      try {
        await getPrisma().whatsappSession.update({
          where: { id },
          data:  { status: "CONNECTED", phone: phone ?? "" },
        });
      } catch { /* ignore if session not in DB yet */ }

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
          e.state = {
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
    try {
      await e.socket.logout();
    } catch { /* ignore */ }
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
}

// ── Send Message ──────────────────────────────────────────────────────────────

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

    // Update DB stats on success
    try {
      const prisma  = getPrisma();
      const session = await prisma.whatsappSession.findUnique({ where: { id } });
      if (session) {
        const today = todayIso();
        const newSentToday = (session.lastSentDate === today ? session.sentToday : 0) + 1;
        const newSuccess   = session.successCount + 1;
        const total        = newSuccess + session.failCount;
        const healthScore  = total > 0 ? Math.round((newSuccess / total) * 100) : 100;
        await prisma.whatsappSession.update({
          where: { id },
          data: {
            successCount: newSuccess,
            sentToday:    newSentToday,
            lastSentDate: today,
            lastUsedAt:   new Date(),
            healthScore,
          },
        });
      }
    } catch { /* ignore stats update failure */ }

    return { ok: true };
  } catch (err) {
    // Update DB stats on failure
    try {
      const prisma  = getPrisma();
      const session = await prisma.whatsappSession.findUnique({ where: { id } });
      if (session) {
        const newFail     = session.failCount + 1;
        const total       = session.successCount + newFail;
        const healthScore = total > 0 ? Math.round((session.successCount / total) * 100) : 0;
        await prisma.whatsappSession.update({
          where: { id },
          data: { failCount: newFail, healthScore },
        });
      }
    } catch { /* ignore */ }

    return { ok: false, error: String(err) };
  }
}

// ── State Accessors ───────────────────────────────────────────────────────────

export function getMultiSessionState(id: number): WaMultiState | null {
  const e = getEntry(id);
  return e ? { ...e.state } : null;
}

export function getAllMultiSessionStates(): WaMultiState[] {
  return Array.from(getSessionMap().values()).map((e) => ({ ...e.state }));
}

// ── Pick Best Session ─────────────────────────────────────────────────────────

export async function pickBestSession(sessionIds: number[]): Promise<number | null> {
  if (!sessionIds.length) return null;

  const prisma   = getPrisma();
  const today    = todayIso();
  const sessions = await prisma.whatsappSession.findMany({
    where: {
      id:       { in: sessionIds },
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

// ── Reset Daily Counts ────────────────────────────────────────────────────────

export async function resetDailyCounts(): Promise<void> {
  const today = todayIso();
  await getPrisma().whatsappSession.updateMany({
    where: { lastSentDate: { not: today } },
    data:  { sentToday: 0 },
  });
}
