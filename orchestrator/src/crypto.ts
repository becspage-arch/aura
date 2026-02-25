// orchestrator/src/crypto.ts
import { createDecipheriv } from "crypto";

type EncryptedJson = {
  iv: string;   // base64
  tag: string;  // base64
  data: string; // base64 (ciphertext)
};

function getMasterKey(): Buffer {
  const hex = (process.env.AURA_MASTER_KEY || "").trim();
  if (!hex) throw new Error("Missing AURA_MASTER_KEY (required to decrypt credentials)");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("AURA_MASTER_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function decryptJson(payload: EncryptedJson): any {
  if (!payload?.iv || !payload?.tag || !payload?.data) {
    throw new Error("decryptJson: invalid payload (missing iv/tag/data)");
  }

  const key = getMasterKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const ciphertext = Buffer.from(payload.data, "base64");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  try {
    return JSON.parse(plaintext);
  } catch {
    throw new Error("decryptJson: decrypted plaintext was not valid JSON");
  }
}
