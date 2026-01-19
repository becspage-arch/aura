import "dotenv/config";
import { z } from "zod";

/**
 * Helper: parse env booleans safely.
 * Accepts: true/false, 1/0, yes/no, y/n
 */
function envBool(value: unknown, fallback = false): boolean {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

const EnvSchema = z.object({
  WORKER_ENV: z.string().default("local"),
  WORKER_NAME: z.string().default("cqg-worker"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  ABLY_API_KEY: z.string().min(1),

  SYMBOL_DEFAULT: z.string().default("MGC"),

  // IMPORTANT: keep these as STRINGS in schema
  DRY_RUN: z.string().default("true"),
  CQG_ENABLED: z.string().default("false"),

  // CQG WebAPI
  CQG_WS_URL: z.string().default("wss://demoapi.cqg.com:443"),
  CQG_USERNAME: z.string().optional(),
  CQG_PASSWORD: z.string().optional(),
  CQG_CLIENT_APP_ID: z.string().default("aura-worker"),
  CQG_CLIENT_VERSION: z.string().default("0.1.0"),
  CQG_PROTOCOL_VERSION_MAJOR: z.string().default("2"),
  CQG_PROTOCOL_VERSION_MINOR: z.string().default("270"),
  CQG_SYMBOLS: z.string().default("MGC,GCE"),

  // ProjectX (TopstepX)
  PROJECTX_API_KEY: z.string().optional(),
  PROJECTX_CONTRACT_ID: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);

/**
 * TEMP: print DB fingerprint so we know which DB the worker is using.
 * (host + db name only, no secrets)
 */
function dbFingerprint(url: string | undefined) {
  if (!url) return "(NOT SET)";
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(INVALID URL)";
  }
}

console.log(
  "[env] DATABASE_URL fingerprint",
  dbFingerprint(process.env.DATABASE_URL)
);

// ✅ REAL booleans from here on
export const DRY_RUN = envBool(env.DRY_RUN, true);
export const CQG_ENABLED = envBool(env.CQG_ENABLED, false);

// Optional but VERY helpful debug line
console.log("[env] flags", {
  DRY_RUN,
  CQG_ENABLED,
});

export const CQG = {
  wsUrl: env.CQG_WS_URL,
  username: env.CQG_USERNAME ?? "",
  password: env.CQG_PASSWORD ?? "",
  clientAppId: env.CQG_CLIENT_APP_ID,
  clientVersion: env.CQG_CLIENT_VERSION,
  protocolMajor: Number(env.CQG_PROTOCOL_VERSION_MAJOR),
  protocolMinor: Number(env.CQG_PROTOCOL_VERSION_MINOR),
  symbols: env.CQG_SYMBOLS.split(",").map((s) => s.trim()).filter(Boolean),
};

export const PROJECTX = {
  apiKey: env.PROJECTX_API_KEY ?? "",
  contractId: env.PROJECTX_CONTRACT_ID,
};
