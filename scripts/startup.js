/**
 * startup.js — Railway start script
 *
 * Runs in order:
 *  1. Pre-migration  : fix licenseKey '' → NULL before prisma db push
 *  2. prisma db push : apply schema changes
 *  3. prisma db seed : seed license keys & initial data
 *  4. next start     : launch the app
 */

const { execSync }     = require('child_process')
// Prisma client is generated to src/generated/prisma (not @prisma/client)
const { PrismaClient } = require('../src/generated/prisma')

const run = (cmd) => {
  console.log(`\n[startup] > ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

async function preMigrate() {
  const prisma = new PrismaClient()
  try {
    // One-time fix: existing rows have licenseKey = '' which violates
    // UNIQUE when the column is changed to nullable (String?).
    // Steps: drop old constraint → remove NOT NULL/DEFAULT → set '' to NULL.
    // IF the column is already nullable this block is a safe no-op.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_licenseKey_key"`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Workspace" ALTER COLUMN "licenseKey" DROP NOT NULL`
    )
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Workspace" ALTER COLUMN "licenseKey" DROP DEFAULT`
    )
    await prisma.$executeRawUnsafe(
      `UPDATE "Workspace" SET "licenseKey" = NULL WHERE "licenseKey" = ''`
    )
    console.log('[startup] pre-migration: licenseKey fix applied')
  } catch (err) {
    // Column may already be nullable / constraint already dropped — safe to continue
    console.log('[startup] pre-migration skipped:', err.message)
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  await preMigrate()
  run('npx prisma db push --accept-data-loss')
  run('npx prisma db seed')
  run('next start')
}

main().catch((err) => {
  console.error('[startup] fatal:', err)
  process.exit(1)
})
