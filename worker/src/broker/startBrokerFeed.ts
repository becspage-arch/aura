import { env } from "../env.js";
import { createBroker } from "./createBroker.js";
import { ProjectXMarketHub } from "./projectxMarketHub.js";

export type BrokerEventName =
  | "broker.connected"
  | "broker.authorized"
  | "broker.ready"
  | "broker.error"
  | "broker.market.quote";

export type BrokerEvent = {
  name: BrokerEventName;
  ts: string;
  broker: string;
  data?: Record<string, unknown>;
};

type EmitFn = (event: BrokerEvent) => Promise<void> | void;

export async function startBrokerFeed(emit?: EmitFn): Promise<void> {
  const broker = createBroker();

  const emitSafe = async (event: BrokerEvent) => {
    try {
      await emit?.(event);
    } catch (e) {
      console.error(`[${env.WORKER_NAME}] broker event emit failed`, {
        event,
        err: e,
      });
    }
  };

  console.log(`[${env.WORKER_NAME}] broker starting`, {
    broker: broker.name,
  });

  try {
    await broker.connect();
    await emitSafe({
      name: "broker.connected",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    await broker.authorize();
    await emitSafe({
      name: "broker.authorized",
      ts: new Date().toISOString(),
      broker: broker.name,
    });

    // Optional warmup so "ready" includes real broker status (e.g. ProjectX accountId)
    if (typeof (broker as any).warmup === "function") {
      await (broker as any).warmup();
    }

    broker.startKeepAlive();

    console.log(`[${env.WORKER_NAME}] broker ready for market data`, {
      broker: broker.name,
    });

    await emitSafe({
      name: "broker.ready",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: broker.getStatus?.(),
    });

    // Start ProjectX market hub (read-only) AFTER broker is authorized + warm
    // IMPORTANT: market hub failures must NOT crash the worker.
    if (broker.name === "projectx") {
      const token =
        typeof (broker as any).getAuthToken === "function"
          ? (broker as any).getAuthToken()
          : null;

      const status =
        typeof (broker as any).getStatus === "function"
          ? (broker as any).getStatus()
          : null;

      const contractId = process.env.PROJECTX_CONTRACT_ID?.trim() || null;

      if (!token) {
        console.warn("[projectx-market] no token available, market hub not started");
      } else if (!contractId) {
        console.warn(
          "[projectx-market] PROJECTX_CONTRACT_ID not set, market hub not started",
          { hint: "Set PROJECTX_CONTRACT_ID to something like CON.F.US.MGC..." }
        );
      } else {
        try {
          const marketHub = new ProjectXMarketHub({
            token,
            contractId,
            onQuote: async (q) => {
              // Emit merged quote into Aura event stream
              await emitSafe({
                name: "broker.market.quote",
                ts: new Date().toISOString(),
                broker: "projectx",
                data: {
                  contractId: q.contractId,
                  bid: q.bid,
                  ask: q.ask,
                  last: q.last ?? null,
                  ts: q.ts ?? null,
                },
              });
            },
          });

          await marketHub.start();

          console.log("[projectx-market] started", {
            accountId: status?.accountId ?? null,
            contractId,
          });
        } catch (e) {
          console.error("[projectx-market] failed to start (non-fatal)", e);
        }
      }
    }
  } catch (e) {
    await emitSafe({
      name: "broker.error",
      ts: new Date().toISOString(),
      broker: broker.name,
      data: { message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
