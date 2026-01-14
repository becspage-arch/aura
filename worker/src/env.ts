import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  WORKER_ENV: z.string().default("local"),
  WORKER_NAME: z.string().default("cqg-worker"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  ABLY_API_KEY: z.string().min(1),

  SYMBOL_DEFAULT: z.string().default("MGC"),
  DRY_RUN: z.string().default("true"),
});

export const env = EnvSchema.parse(process.env);

export const DRY_RUN = env.DRY_RUN.toLowerCase() === "true";
