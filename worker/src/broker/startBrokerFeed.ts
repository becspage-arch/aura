import { env } from "../env.js";
import { createBroker } from "./createBroker.js";

export async function startBrokerFeed(): Promise<void> {
  const broker = createBroker();

  console.log(`[${env.WORKER_NAME}] broker starting`, {
    broker: broker.name,
  });

  await broker.connect();
  await broker.authorize();
  broker.startKeepAlive();
}
