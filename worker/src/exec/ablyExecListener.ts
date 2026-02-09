// worker/src/exec/ablyExecListener.ts
import Ably from "ably";

type ManualOrderPayload = {
  contractId: string;
  side: "buy" | "sell";
  size: number;
  stopLossTicks: number;
  takeProfitTicks: number;
};

export async function startAblyExecListener(params: {
  ablyApiKey: string;
  placeManualBracket: (p: ManualOrderPayload) => Promise<void>;
  log: (msg: string, extra?: any) => void;
}) {
  const client = new Ably.Realtime({ key: params.ablyApiKey });
  const ch = client.channels.get("aura:exec");

  ch.subscribe("exec", async (msg) => {
    try {
      const data = msg.data as any;
      if (!data || data.type !== "manualOrder") return;

      const p = data.payload as ManualOrderPayload;

      params.log("[ABLY_EXEC] manualOrder received", p);

      await params.placeManualBracket(p);

      params.log("[ABLY_EXEC] manualOrder submitted");
    } catch (e) {
      params.log("[ABLY_EXEC] manualOrder error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  params.log("[ABLY_EXEC] listening on aura:exec");
}
