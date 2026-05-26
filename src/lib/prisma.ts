import { PrismaClient } from "../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function makePrisma() {
  // Append connection_limit to DATABASE_URL so the single pool stays within
  // Railway PostgreSQL's per-role connection quota (default: 25–100 depending on plan).
  const url = process.env.DATABASE_URL ?? "";
  const datasourceUrl = url.includes("connection_limit")
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}connection_limit=5&pool_timeout=10`;

  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url: datasourceUrl } },
  });
}

/**
 * Canonical list of models added after initial setup.
 * If the cached singleton is missing ANY of these, it's stale and gets busted.
 * Add new model names here whenever you run `prisma db push` / `prisma generate`.
 */
const REQUIRED_MODELS = [
  "recruitmentBroadcast",
  "waMessageQueue",
  "campaignProductFocus",
  "campaignForm",
  "campaignRegistration",
  "whatsappSession",
  "user",
  "workspace",
  "workspaceMember",
  "agency",
  "account",
  "session",
] as const;

/**
 * Always returns the current live Prisma client.
 * Singleton is always stored in globalThis (both dev and production)
 * to prevent connection pool exhaustion from multiple PrismaClient instances.
 * In dev, if the cached singleton is missing new models (because `prisma generate` was run
 * after the server started), it automatically creates a fresh client so you don't have to restart.
 */
export function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached) {
    // Bust the singleton if it pre-dates any required model.
    const isStale = REQUIRED_MODELS.some((m) => !(m in cached));
    if (isStale) {
      const fresh = makePrisma();
      globalForPrisma.prisma = fresh;
      return fresh;
    }
    return cached;
  }
  const fresh = makePrisma();
  // Always store singleton — in production this prevents creating a new PrismaClient
  // (and thus a new DB connection pool) on every module import / route invocation.
  globalForPrisma.prisma = fresh;
  return fresh;
}

/** Convenience export — same as getPrisma() but evaluated at module-load time. */
export const prisma = getPrisma();
