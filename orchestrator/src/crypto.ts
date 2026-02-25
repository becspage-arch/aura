// orchestrator/src/crypto.ts
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = (process.env.AURA_MASTER_KEY || "").trim();
  if (!raw) throw new Error("Missing AURA_MASTER_KEY (required to decrypt credentials)");
  // MUST match src/lib/crypto.ts exactly
  return crypto.createHash("sha256").update(raw, "utf8").digest(); // 32 bytes
}

export function decryptJson(payload: any): any {
  // Accept either a JSON string or an object (Prisma Json can be either depending on history)
  const p = typeof payload === "string" ? JSON.parse(payload) : payload;

  if (!p?.iv || !p?.tag || !p?.data) {
    throw new Error("decryptJson: invalid payload (missing iv/tag/data)");
  }

  const key = getKey();
  const iv = Buffer.from(p.iv, "base64");
  const tag = Buffer.from(p.tag, "base64");
  const ciphertext = Buffer.from(p.data, "base64");

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext);
}
