/**
 * license.ts — Production-grade workspace license key generator
 *
 * Format:  PRS-XXXXXXXXXXXX   (12 cryptographically random hex chars)
 * Example: PRS-3A7F92B1C4E8D0
 *
 * Properties:
 *  - Unpredictable  : 6 bytes = 281 trillion possible keys
 *  - Non-sequential : no timestamp, no counter, no workspace ID exposed
 *  - Collision-safe  : DB uniqueness check + retry loop before saving
 */

import crypto from "crypto";

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal interface — works with any generated Prisma client */
interface WorkspaceFinder {
  workspace: {
    findUnique(args: {
      where: { licenseKey: string };
      select?: { id: true };
    }): Promise<{ id: number } | null>;
  };
}

// ── Core generator ─────────────────────────────────────────────────────────────

/**
 * Generate a single cryptographically random license key.
 * Does NOT check for DB collisions — use `createUniqueLicenseKey` instead.
 */
export function generateLicenseKey(): string {
  return "PRS-" + crypto.randomBytes(6).toString("hex").toUpperCase();
}

// ── Collision-safe creation ────────────────────────────────────────────────────

const MAX_ATTEMPTS = 10;

/**
 * Generate a unique license key that does not exist in the database.
 *
 * Algorithm:
 *   1. Generate random key
 *   2. Check DB — if collision, retry (up to MAX_ATTEMPTS)
 *   3. Return the first unused key
 *
 * Collision probability per attempt: ~1 in 281,474,976,710,656 (2^48).
 * Exceeding MAX_ATTEMPTS in production is astronomically unlikely.
 *
 * @param prisma  Any Prisma client with workspace.findUnique
 */
export async function createUniqueLicenseKey(
  prisma: WorkspaceFinder,
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const licenseKey = generateLicenseKey();

    const existing = await prisma.workspace.findUnique({
      where:  { licenseKey },
      select: { id: true },
    });

    if (!existing) return licenseKey;

    // Collision (extraordinarily rare) — retry
    console.warn(`[license] collision on attempt ${attempt}/${MAX_ATTEMPTS}, retrying…`);
  }

  throw new Error(
    `[license] Failed to generate unique key after ${MAX_ATTEMPTS} attempts — ` +
    "this should never happen in production.",
  );
}
