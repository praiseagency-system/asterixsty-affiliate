import { PrismaClient } from "../generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function makePrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
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
] as const;

/**
 * Always returns the current live Prisma client.
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
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = fresh;
  return fresh;
}

/** Convenience export — same as getPrisma() but evaluated at module-load time. */
export const prisma = getPrisma();
