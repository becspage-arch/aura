// tools/makeEncryptedCreds.mjs
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = (process.env.AURA_MASTER_KEY || "").trim();
  if (!raw) throw new Error("AURA_MASTER_KEY missing in this shell");
  return crypto.createHash("sha256").update(raw).digest();
}

function encryptJson(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const plaintext = Buffer.from(JSON.stringify(obj), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

// ---- CHANGE THESE TWO VALUES ----
const username = "PASTE_PROJECTX_USERNAME";
const password = "PASTE_PROJECTX_PASSWORD";

const out = encryptJson({ username, password });
console.log(JSON.stringify(out, null, 2));
