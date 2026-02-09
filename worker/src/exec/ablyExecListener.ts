// worker/src/exec/ablyExecListener.ts
import Ably from "ably";

type ManualOrderPayload = {
  contractId: string;
  side: "buy" | "sell";
  size: number;
  stopLossTicks: number;
  takeProfitTicks: number;
};

function isManualOrderPayload(x: any): x is ManualOrderPayload {
  return (
    x &&
    typeof x.contractId === "string" &&
    (x.side === "buy" || x.side === "sell") &&
    Number.isFinite(Number(x.size)) &&
    Number.isFinite(Number(x.stopLossTicks)) &&
    Number.isFinite(Number(x.takeProfitTicks))
  );
}

export async function startAblyExecListener(params: {
  ablyApiKey: string;

  // IMPORTANT: this must be the Clerk user id for this worker instance
  clerkUserId: string;

  placeManualBracket: (p: ManualOrderPayload) => Promise<void>;
  log: (msg: string, extra?: any) => void;
}) {
  const client = new Ably.Realtime({ key: params.ablyApiKey });

  const clerkUserId = (params.clerkUserId || "").trim();
  if (!clerkUserId) {
    throw new Error("[ABLY_EXEC] Missing clerkUserId");
  }

  // ✅ Listen on the per-user channel (this matches the rest of Aura)
  const channelName = `aura:exec:${clerkUserId}`;
  const ch = client.channels.get(channelName);

  const handler = async (msg: Ably.Types.Message) => {
    try {
      // ✅ Raw log (no guessing)
      const data: any = msg.data;

      params.log("[ABLY_EXEC] RAW", {
        channel: channelName,
        name: msg.name,
        hasData: Boolean(data),
        dataType: typeof data,
        keys: data && typeof data === "object" ? Object.keys(data) : null,
        manualTokenLen:
          data && typeof data === "object" && typeof data.manualToken === "string"
            ? data.manualToken.length
            : data && typeof data === "object" && typeof data.token === "string"
              ? data.token.length
              : 0,
      });

      // Accept multiple shapes (backwards compatible)
      // Shape A: { type:"manualOrder", payload:{...} }
      // Shape B: { payload:{...} }
      // Shape C: payload directly
      let p: any = null;

      if (data && data.type === "manualOrder" && data.payload) {
        p = data.payload;
      } else if (data && data.payload) {
        p = data.payload;
      } else {
        p = data;
      }

      if (!isManualOrderPayload(p)) {
        // Not a manual order we understand; ignore safely
        return;
      }

      params.log("[ABLY_EXEC] manualOrder received", p);

      await params.placeManualBracket(p);

      params.log("[ABLY_EXEC] manualOrder submitted");
    } catch (e) {
      params.log("[ABLY_EXEC] manualOrder error", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // ✅ Subscribe to both names we’ve used historically
  ch.subscribe("exec", handler);
  ch.subscribe("exec.manual_bracket", handler);

  params.log("[ABLY_EXEC] listening", { channelName });
}
