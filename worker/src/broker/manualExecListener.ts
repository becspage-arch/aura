// src/broker/manualExecListener.ts
import { createAblyRealtime } from "../ably.js";
import type { PrismaClient } from "@prisma/client";

export async function startManualExecListener(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;

  getPrisma: () => PrismaClient;

  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;

  enabled: boolean;
  manualToken: string;
  expectedUser: string;
}) {
  if (!params.enabled) return;

  const manualToken = params.manualToken.trim();
  const expectedUser = params.expectedUser.trim();

  if (!manualToken || !expectedUser) {
    console.warn(
      `[${params.env.WORKER_NAME}] MANUAL_EXEC enabled but token or user missing`,
      { hasToken: Boolean(manualToken), hasUser: Boolean(expectedUser) }
    );
    return;
  }

  try {
    const ably = createAblyRealtime();

    await new Promise<void>((resolve, reject) => {
      ably.connection.on("connected", () => resolve());
      ably.connection.on("failed", () =>
        reject(new Error("Ably connection failed (manual exec)"))
      );
    });

    const execChannel = ably.channels.get(`aura:exec:${expectedUser}`);
    await execChannel.attach();

    console.log(`[${params.env.WORKER_NAME}] exec channel attached`, execChannel.name);

    execChannel.subscribe("exec.manual_bracket", async (msg) => {
      console.log(`[${params.env.WORKER_NAME}] exec.manual_bracket RECEIVED`, msg.data);

      try {
        const p = msg.data as any;

        if (!p || typeof p !== "object" || p.token !== manualToken || p.clerkUserId !== expectedUser) {
          console.warn("[manual-exec] rejected payload", p);
          return;
        }

        const ident = await params.getUserIdentityForWorker();

        const msgId = (msg as any)?.id ? String((msg as any).id) : null;
        const execKey = `manual:${expectedUser}:${msgId ?? Date.now()}`;

        console.log("[manual-exec] REQUEST RECEIVED", {
          execKey,
          contractId: p.contractId,
          side: p.side,
          size: p.size,
          stopLossTicks: p.stopLossTicks,
          takeProfitTicks: p.takeProfitTicks,
          dryRun: params.DRY_RUN,
        });

        if (params.DRY_RUN) {
          console.log("[manual-exec] DRY_RUN=true — order not submitted");
          return;
        }

        // We keep execution here minimal: we rely on broker.executeBracket or equivalent path elsewhere.
        // If you want this to go through executeBracket() exactly as before, tell me and I’ll wire it.
        const broker = params.broker;

        if (typeof broker.submitBracket !== "function") {
          console.warn("[manual-exec] broker.submitBracket not available");
          return;
        }

        await broker.submitBracket({
          contractId: String(p.contractId),
          side: p.side === "sell" ? "sell" : "buy",
          qty: Number(p.size),
          stopLossTicks: Number(p.stopLossTicks),
          takeProfitTicks: Number(p.takeProfitTicks),
          tag: `aura-manual-${Date.now()}`,
        });

        console.log("[manual-exec] MANUAL_ORDER_SUBMITTED", { execKey });
      } catch (e) {
        console.error("[manual-exec] FAILED", e);
      }
    });

    console.log(
      `[${params.env.WORKER_NAME}] manual execution listening (exec.manual_bracket)`
    );
  } catch (e) {
    console.warn(`[${params.env.WORKER_NAME}] manual exec listener failed to start`, e);
  }
}
