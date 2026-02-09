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

  const channelName = `aura:exec:${clerkUserId}`;
  const ch = client.channels.get(channelName);

  const handler = async (msg: Ably.Types.Message) => {
    try {
      const data: any = msg.data;

      params.log("[ABLY_EXEC] RAW", {
        channel: channelName,
        name: msg.name,
        hasData: Boolean(data),
        dataType: typeof data,
        keys: data && typeof data === "object" ? Object.keys(data) : null,
      });

      let p: any = null;

      if (data && data.type === "manualOrder" && data.payload) {
        p = data.payload;
      } else if (data && data.payload) {
        p = data.payload;
      } else {
        p = data;
      }

      if (!isManualOrderPayload(p)) {
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

  // ✅ Subscribe to ALL historical names we’ve used (dot + underscore)
  ch.subscribe("exec", handler);
  ch.subscribe("exec.manual.bracket", handler);
  ch.subscribe("exec.manual_bracket", handler);
  ch.subscribe("exec.manualBracket", handler);

  params.log("[ABLY_EXEC] listening", { channelName });
}
