import { z } from "zod";

const EnvSchema = z.object({
  // DB (use DIRECT_URL like the worker does)
  DIRECT_URL: z.string().min(1),

  // ECS
  AWS_REGION: z.string().default("eu-west-2"),
  ECS_CLUSTER: z.string().min(1), // e.g. "aura"

  // Network config for RunTask (from your aura-worker service)
  ECS_SUBNETS: z.string().min(1), // comma-separated
  ECS_SECURITY_GROUPS: z.string().min(1), // comma-separated
  ECS_ASSIGN_PUBLIC_IP: z.enum(["ENABLED", "DISABLED"]).default("ENABLED"),

  // Worker template task definition + container name
  WORKER_TASK_DEFINITION: z.string().min(1), // e.g. "aura-worker:37"
  WORKER_CONTAINER_NAME: z.string().min(1).default("aura-worker"),

  // Orchestrator loop
  POLL_MS: z.string().default("20000"),
});

export const env = EnvSchema.parse(process.env);

export const POLL_MS = Math.max(5_000, Number(env.POLL_MS) || 20_000);

export const SUBNETS = env.ECS_SUBNETS.split(",").map((s) => s.trim()).filter(Boolean);
export const SECURITY_GROUPS = env.ECS_SECURITY_GROUPS.split(",").map((s) => s.trim()).filter(Boolean);
