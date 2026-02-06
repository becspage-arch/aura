// worker/src/broker/projectxOrder.ts

type PlaceOrderResponse = {
  orderId?: number;
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

export type ProjectXBracketRequest = {
  token: string;

  accountId: number;
  contractId: string;

  // "buy" or "sell"
  side: "buy" | "sell";

  qty: number;

  // Prices in instrument price units (e.g. 4601.2)
  entryPrice: number; // used only to compute ticks for brackets
  stopPrice: number;
  takeProfitPrice: number;

  // Contract spec
  tickSize: number;

  // Optional: if you want to tag orders for idempotency/debugging
  customTag?: string | null;
};

function toInt(n: number): number {
  return Math.round(n);
}

function clampInt(n: number, min: number, max: number): number {
  const x = toInt(n);
  return Math.max(min, Math.min(max, x));
}

function computeTicks(a: number, b: number, tickSize: number): number {
  const ticks = Math.abs(a - b) / tickSize;
  // Brackets must be positive whole ticks
  return clampInt(ticks, 1, 1_000_000);
}

/**
 * Places a MARKET entry with attached SL/TP brackets (in ticks).
 * Endpoint and fields based on TopstepX docs:
 * POST https://api.topstepx.com/api/Order/place
 */
export async function placeProjectXBracketOrder(
  req: ProjectXBracketRequest
): Promise<{ orderId: number }> {
  const slTicks = computeTicks(req.entryPrice, req.stopPrice, req.tickSize);
  const tpTicks = computeTicks(req.entryPrice, req.takeProfitPrice, req.tickSize);

  // ProjectX side mapping:
  // 0 = Bid (buy)
  // 1 = Ask (sell)
  const side = req.side === "buy" ? 0 : 1;

  // Order types:
  // 2 = Market
  // Bracket types use same enum:
  // SL: 4 = Stop
  // TP: 1 = Limit
  const body = {
    accountId: req.accountId,
    contractId: req.contractId,
    type: 2, // Market entry
    side,
    size: req.qty,

    // For market entries, these stay null
    limitPrice: null,
    stopPrice: null,
    trailPrice: null,

    customTag: req.customTag ?? null,

    stopLossBracket: {
      ticks: slTicks,
      type: 4, // Stop
    },
    takeProfitBracket: {
      ticks: tpTicks,
      type: 1, // Limit
    },
  };

  const res = await fetch("https://api.topstepx.com/api/Order/place", {
    method: "POST",
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  let json: PlaceOrderResponse | null = null;
  try {
    json = text ? (JSON.parse(text) as PlaceOrderResponse) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.success || !json.orderId) {
    const msg =
      json?.errorMessage ||
      `ProjectX Order/place failed (HTTP ${res.status})` +
        (text ? ` body=${text.slice(0, 200)}` : "");
    throw new Error(msg);
  }

  return { orderId: json.orderId };
}
