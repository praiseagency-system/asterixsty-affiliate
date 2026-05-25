/**
 * AES-256-GCM encryption/decryption helpers (server-only).
 * Master key comes from ENCRYPTION_KEY env var or auto-generated and stored in AppConfig.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { prisma } from "@/lib/prisma";

async function getOrCreateEncKey(): Promise<Buffer> {
  // 1. Try env var first
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) return scryptSync(envKey, "asterix-salt", 32);

  // 2. Try AppConfig
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { key: "google_enc_key" } });
    if (cfg?.value) return Buffer.from(cfg.value, "hex");
  } catch { /* ignore */ }

  // 3. Auto-generate and persist
  const newKey = randomBytes(32);
  try {
    await prisma.appConfig.upsert({
      where: { key: "google_enc_key" },
      update: { value: newKey.toString("hex") },
      create: { key: "google_enc_key", value: newKey.toString("hex") },
    });
  } catch { /* ignore */ }
  return newKey;
}

export async function encrypt(text: string): Promise<string> {
  if (!text) return "";
  const key = await getOrCreateEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export async function decrypt(encrypted: string): Promise<string> {
  if (!encrypted) return "";
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, tagHex, encHex] = parts;
    const key = await getOrCreateEncKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(encHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
