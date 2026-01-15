import { env } from "../env.js";
import { createBroker } from "./createBroker.js";

export type BrokerEventName =
  | "broker.connected"
  | "broker.authorized"
  | "broker.ready"
  | "broker.error";

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

    broker.startKeepAlive();

    console.log(`[${env.WORKER_NAME}] broker ready for market data`, {
      broker: broker.name,
    });

    await emitSafe({
      name: "broker.ready",
      ts: new Date().toISOString(),
      broker: broker.name,
    });
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
