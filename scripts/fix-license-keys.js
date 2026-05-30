/**
 * scripts/fix-license-keys.js
 *
 * Runs as Railway preDeployCommand — BEFORE prisma db push.
 *
 * Problem:
 *   Multiple workspaces have licenseKey = "" or NULL, causing prisma db push
 *   to fail with P2002 when it tries to create the UNIQUE index.
 *
 * Solution:
 *   Scan all workspaces. Any workspace with a missing or duplicate key
 *   gets a fresh cryptographically-random PRS-XXXXXXXXXXXX key.
 *   After this script completes, all rows have unique non-null values,
 *   so prisma db push can create the unique index without conflict.
 *
 * Safe to re-run:
 *   - Workspaces that already have a valid unique key are untouched.
 *   - Only empty / null / duplicate keys are regenerated.
 */

'use strict'

const crypto = require('crypto')

// Prisma client is generated to src/generated/prisma (custom output path)
const { PrismaClient } = require('../src/generated/prisma')

const prisma = new PrismaClient()

function generateKey() {
  return 'PRS-' + crypto.randomBytes(6).toString('hex').toUpperCase()
}

async function main() {
  console.log('[fix-license-keys] Scanning workspaces...')

  const workspaces = await prisma.workspace.findMany({
    select: { id: true, slug: true, licenseKey: true },
    orderBy: { id: 'asc' },
  })

  console.log(`[fix-license-keys] ${workspaces.length} workspace(s) found`)

  /** Track every key that's in use so we never generate a collision */
  const used = new Set()
  let fixed = 0

  for (const ws of workspaces) {
    const existing = ws.licenseKey   // string | null | ""

    if (existing && !used.has(existing)) {
      // Key is present and not a duplicate — keep it
      used.add(existing)
      console.log(`[fix-license-keys] ✓  ws#${ws.id} (${ws.slug}): ${existing}`)
      continue
    }

    // Key is missing (null / "") or duplicated — generate a new unique one
    let newKey
    do {
      newKey = generateKey()
    } while (used.has(newKey))

    await prisma.workspace.update({
      where: { id: ws.id },
      data:  { licenseKey: newKey },
    })

    used.add(newKey)
    fixed++

    const reason = !existing ? 'empty' : 'duplicate'
    console.log(`[fix-license-keys] ✅ ws#${ws.id} (${ws.slug}): ${reason} → ${newKey}`)
  }

  console.log(
    fixed > 0
      ? `[fix-license-keys] Done — fixed ${fixed}/${workspaces.length} key(s). Ready for prisma db push.`
      : `[fix-license-keys] Done — all ${workspaces.length} key(s) already unique. No changes needed.`,
  )
}

main()
  .catch((err) => {
    console.error('[fix-license-keys] Fatal error:', err.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
