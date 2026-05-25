/**
 * WhatsApp client singleton using Baileys.
 * Uses global.__waClient to survive Next.js hot-reloads in dev mode.
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
import path from "path";
import fs from "fs";
import pino from "pino";

// ── Types ─────────────────────────────────────────────────────────────────────
export type WAStatus =
  | "disconnected"
  | "connecting"
  | "qr_ready"
  | "connected"
  | "reconnecting";

export interface WAState {
  status: WAStatus;
  qrDataUrl: string | null;
  phone: string | null;
  connectedAt: Date | null;
  error: string | null;
}

// ── Global singleton (survives HMR) ──────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var __waClient: WASocket | null;
  // eslint-disable-next-line no-var
  var __waState: WAState;
  // eslint-disable-next-line no-var
  var __waReconnectTimer: ReturnType<typeof setTimeout> | null;
}

const AUTH_DIR = path.join(process.cwd(), ".wa-session");

function initGlobal() {
  if (!global.__waState) {
    global.__waState = {
      status: "disconnected",
      qrDataUrl: null,
      phone: null,
      connectedAt: null,
      error: null,
    };
  }
  if (global.__waClient === undefined) global.__waClient = null;
  if (global.__waReconnectTimer === undefined) global.__waReconnectTimer = null;
}
initGlobal();

export function getWAState(): WAState {
  return { ...global.__waState };
}

function setState(patch: Partial<WAState>) {
  global.__waState = { ...global.__waState, ...patch };
}

const logger = pino({ level: "silent" });

// ── Connect ───────────────────────────────────────────────────────────────────
export async function connectWA(): Promise<void> {
  if (
    global.__waState.status === "connected" ||
    global.__waState.status === "connecting" ||
    global.__waState.status === "qr_ready"
  )
    return;

  setState({ status: "connecting", error: null, qrDataUrl: null });

  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ["AsterixstyAffiliate", "Chrome", "1.0.0"],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  global.__waClient = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 300,
        });
        setState({ status: "qr_ready", qrDataUrl });
      } catch {
        setState({ status: "qr_ready", qrDataUrl: null });
      }
    }

    if (connection === "open") {
      const phone =
        sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
      setState({
        status: "connected",
        qrDataUrl: null,
        phone,
        connectedAt: new Date(),
        error: null,
      });
      if (global.__waReconnectTimer) {
        clearTimeout(global.__waReconnectTimer);
        global.__waReconnectTimer = null;
      }
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;

      if (loggedOut) {
        // Clear auth session
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        global.__waClient = null;
        setState({
          status: "disconnected",
          qrDataUrl: null,
          phone: null,
          connectedAt: null,
          error: "Sesi WhatsApp habis, silakan scan ulang QR code.",
        });
      } else {
        setState({
          status: "reconnecting",
          qrDataUrl: null,
          error: null,
        });
        // Auto-reconnect after 5 seconds
        if (global.__waReconnectTimer) clearTimeout(global.__waReconnectTimer);
        global.__waReconnectTimer = setTimeout(async () => {
          global.__waReconnectTimer = null;
          global.__waClient = null;
          setState({ status: "disconnected" });
          await connectWA();
        }, 5_000);
      }
    }
  });
}

// ── Disconnect ────────────────────────────────────────────────────────────────
export async function disconnectWA(): Promise<void> {
  if (global.__waReconnectTimer) {
    clearTimeout(global.__waReconnectTimer);
    global.__waReconnectTimer = null;
  }
  if (global.__waClient) {
    try {
      await global.__waClient.logout();
    } catch {
      // ignore
    }
    global.__waClient = null;
  }
  // Clear session files
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  setState({
    status: "disconnected",
    qrDataUrl: null,
    phone: null,
    connectedAt: null,
    error: null,
  });
}

// ── Send Message ──────────────────────────────────────────────────────────────
export async function sendWAMessage(
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  if (!global.__waClient || global.__waState.status !== "connected") {
    return { ok: false, error: "WhatsApp tidak terhubung" };
  }

  // Normalize phone: strip leading 0, ensure starts with 62
  let normalized = phone.replace(/\D/g, "");
  if (normalized.startsWith("0")) normalized = "62" + normalized.slice(1);
  if (!normalized.startsWith("62")) normalized = "62" + normalized;
  const jid = normalized + "@s.whatsapp.net";

  try {
    await global.__waClient.sendMessage(jid, { text: message });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
