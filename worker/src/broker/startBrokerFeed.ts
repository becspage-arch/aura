import { env } from "../env.js";

export async function startBrokerFeed(): Promise<void> {
  // For 8B.0 we default to "no broker" unless explicitly enabled.
  // This prevents accidental connections while we refactor.
  const broker = (process.env.BROKER || "none").toLowerCase();

  console.log(`[${env.WORKER_NAME}] broker selected`, { broker });

  if (broker === "none" || broker === "off" || broker === "disabled") {
    console.log(`[${env.WORKER_NAME}] broker feed disabled (BROKER=${broker})`);
    return;
  }

  if (broker === "cqg") {
    // Keep CQG working behind this switch for now (we'll wrap it into an adapter next).
    const { startCqgDemoFeed } = await import("../cqg/client.js");
    await startCqgDemoFeed();
    return;
  }

  if (broker === "rithmic") {
    throw new Error("BROKER=rithmic selected but not implemented yet");
  }

  if (broker === "mock") {
    console.log(`[${env.WORKER_NAME}] mock broker selected (no-op for now)`);
    return;
  }

  throw new Error(`Unknown BROKER value: ${broker}`);
}
