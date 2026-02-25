// orchestrator/src/crypto.ts
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const hex = (process.env.AURA_MASTER_KEY || "").trim();
  if (!hex) throw new Error("Missing AURA_MASTER_KEY (required to decrypt credentials)");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("AURA_MASTER_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex"); // MUST match src/lib/crypto.ts
}

export function decryptJson(payload: any): any {
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
