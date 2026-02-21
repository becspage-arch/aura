// worker/src/broker/projectx/ProjectXBrokerAdapter.ts

import type { IBrokerAdapter } from "../IBrokerAdapter.js";
import { logTag } from "../../lib/logTags";
import type { BrokerCapabilities } from "../BrokerCapabilities.js";

import type {
  PlaceBracketOrderPlan,
  PlaceBracketOrderResult,
} from "../IBrokerAdapter.js";

const caps: BrokerCapabilities = {
  supportsBracketInSingleCall: false,
  supportsAttachBracketsAfterEntry: true,
  requiresSignedBracketTicks: true,
};

type ValidateResponse = {
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
  token?: string;
};

type Account = {
  id: number;
  name: string;
  balance: number;
  canTrade: boolean;
  isVisible: boolean;
  simulated: boolean;
};

type AccountSearchResponse = {
  accounts?: Account[];
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type PlaceOrderResponse = {
  orderId?: number;
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type OrderSearchResponse = {
  orders?: any[];
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type Position = {
  id: number;
  accountId: number;
  contractId: string;
  creationTimestamp?: string;
  type?: number; // 1=long, 2=short (per gateway conventions)
  size: number;
  averagePrice?: number;
};

type PositionSearchResponse = {
  positions?: Position[];
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type CancelOrderResponse = {
  success?: boolean;
  errorCode?: number;
  errorMessage?: string | null;
};

type PlaceOrderInput = {
  contractId: string;
  side: "buy" | "sell";
  size: number;
  type: "market" | "limit" | "stop";
  limitPrice?: number | null;
  stopPrice?: number | null;
  customTag?: string | null;
};

type PlaceOrderWithBracketsInput = {
  contractId: string;
  side: "buy" | "sell";
  size: number;
  type: "market" | "limit" | "stop";
  limitPrice?: number | null;
  stopPrice?: number | null;
  stopLossTicks?: number | null;
  takeProfitTicks?: number | null;
  customTag?: string | null;
};

function parseJsonOrNull(text: string): any | null {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function truncate(text: string, max = 4000): string {
  if (!text) return text;
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…(truncated ${text.length - max} chars)`;
}

export class ProjectXBrokerAdapter implements IBrokerAdapter {
  readonly name = "projectx" as const;
  readonly capabilities = caps;

  private token: string | null = null;

  private accountId: number | null = null;
  private accountName: string | null = null;
  private accountSimulated: boolean | null = null;

  private keepAliveTimer: NodeJS.Timeout | null = null;

  // Contract spec (needed for sizing/risk)
  private contractTickSize: number | null = null;
  private contractTickValue: number | null = null;

  // validate no more than every 10 minutes (well within 200/60s rate limit)
  private lastValidateAtMs = 0;

  getStatus() {
    return {
      tokenOk: Boolean(this.token),
      accountId: this.accountId,
      accountName: this.accountName,
      simulated: this.accountSimulated,
      tickSize: this.contractTickSize,
      tickValue: this.contractTickValue,
    };
  }

  getAuthToken(): string | null {
    return this.token;
  }

  async connect(): Promise<void> {
    const hasKey = Boolean(
      process.env.PROJECTX_API_KEY && process.env.PROJECTX_API_KEY !== "PASTE-HERE"
    );
    console.log("[projectx-adapter] connect", { hasKey });
  }

  async authorize(): Promise<void> {
    const userName = process.env.PROJECTX_USERNAME;
    const apiKey = process.env.PROJECTX_API_KEY;

    if (!userName) throw new Error("PROJECTX_USERNAME missing");
    if (!apiKey) throw new Error("PROJECTX_API_KEY missing");

    const res = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userName, apiKey }),
    });

    const text = await res.text();

    const json = JSON.parse(text) as {
      token?: string;
      success?: boolean;
      errorCode?: number;
      errorMessage?: string | null;
    };

    this.token = json.token ?? null;

    console.log("[projectx-adapter] authorize loginKey", {
      status: res.status,
      ok: res.ok,
      success: json.success,
      errorCode: json.errorCode,
      hasToken: Boolean(this.token),
      tokenPreview: this.token ? `${this.token.slice(0, 12)}...${this.token.slice(-12)}` : null,
    });

    if (!this.token) {
      throw new Error("ProjectX authorization failed - no token returned");
    }
  }

    private async safeCancel(orderId: number | null, reason: string) {
      if (!orderId) return;
      try {
        await this.cancelOrder(String(orderId), reason);
      } catch (e) {
        console.warn("[projectx-adapter] safeCancel failed", {
          orderId,
          reason,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

  private async validateToken(): Promise<void> {
    if (!this.token) return;

    const res = await fetch("https://api.topstepx.com/api/Auth/validate", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: "{}",
    });

    const text = await res.text();

    let json: ValidateResponse | null = null;
    try {
      json = text ? (JSON.parse(text) as ValidateResponse) : null;
    } catch {
      json = null;
    }

    if (json?.token && typeof json.token === "string") {
      this.token = json.token;
    }

    console.log("[projectx-adapter] validate token", {
      status: res.status,
      ok: res.ok,
      success: json?.success,
      errorCode: json?.errorCode,
      errorMessage: json?.errorMessage ?? null,
      tokenPreview: this.token ? `${this.token.slice(0, 12)}...${this.token.slice(-12)}` : null,
    });

    if (!res.ok) {
      throw new Error(
        `ProjectX token validate failed (HTTP ${res.status})${
          json?.errorMessage ? `: ${json.errorMessage}` : ""
        }`
      );
    }
  }

  private async fetchActiveAccounts(): Promise<void> {
    if (!this.token) throw new Error("Cannot fetch accounts without token");

    const res = await fetch("https://api.topstepx.com/api/Account/search", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ onlyActiveAccounts: true }),
    });

    const text = await res.text();

    let json: AccountSearchResponse | null = null;
    try {
      json = text ? (JSON.parse(text) as AccountSearchResponse) : null;
    } catch {
      json = null;
    }

    const accounts = json?.accounts ?? [];

    const preferredName = process.env.PROJECTX_ACCOUNT_NAME?.trim() || null;
    const preferredIdRaw = process.env.PROJECTX_ACCOUNT_ID?.trim() || null;
    const preferredId = preferredIdRaw ? Number(preferredIdRaw) : null;

    console.log("[projectx-adapter] account search accounts", {
      count: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        canTrade: a.canTrade,
        isVisible: a.isVisible,
        simulated: a.simulated,
        balance: a.balance,
      })),
    });

    const preferredById =
      typeof preferredId === "number" && Number.isFinite(preferredId)
        ? accounts.find((a) => a.id === preferredId) ?? null
        : null;

    const preferredByName = preferredName
      ? accounts.find((a) => a.name === preferredName) ?? null
      : null;

    if (preferredIdRaw && !preferredById) {
      throw new Error(
        `ProjectX account selection failed: PROJECTX_ACCOUNT_ID=${preferredIdRaw} not found in active accounts`
      );
    }
    if (preferredName && !preferredByName) {
      throw new Error(
        `ProjectX account selection failed: PROJECTX_ACCOUNT_NAME="${preferredName}" not found in active accounts`
      );
    }

    const selected =
      preferredById ??
      preferredByName ??
      accounts.find((a) => a.canTrade && a.isVisible) ??
      accounts[0] ??
      null;

    this.accountId = selected?.id ?? null;
    this.accountName = selected?.name ?? null;
    this.accountSimulated = selected?.simulated ?? null;

    console.log("[projectx-adapter] account selected", {
      selectedAccountId: this.accountId,
      selectedAccountName: this.accountName,
      selectedAccountSimulated: this.accountSimulated,
      preferredAccountName: preferredName,
      preferredAccountId: preferredIdRaw,
    });

    if (!res.ok) {
      throw new Error(
        `ProjectX account search failed (HTTP ${res.status})${
          json?.errorMessage ? `: ${json.errorMessage}` : ""
        }`
      );
    }

    if (!this.accountId) {
      throw new Error("ProjectX account search returned no accounts");
    }
  }

  private async testHistoryBars(): Promise<void> {
    if (!this.token) return;

    const contractId = process.env.PROJECTX_CONTRACT_ID?.trim();
    if (!contractId) {
      console.log("[projectx-adapter] history test skipped (no PROJECTX_CONTRACT_ID)");
      return;
    }

    const end = new Date();
    const start = new Date(end.getTime() - 10 * 60 * 1000);

    const run = async (live: boolean) => {
      const body = {
        contractId,
        live,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        unit: 1,
        unitNumber: 15,
        limit: 20,
        includePartialBar: true,
      };

      const res = await fetch("https://api.topstepx.com/api/History/retrieveBars", {
        method: "POST",
        headers: {
          accept: "text/plain",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(body),
      });

      const text = await res.text();

      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      const bars = Array.isArray(json?.bars) ? json.bars : [];
      const firstT = bars[0]?.t ?? null;
      const lastT = bars[bars.length - 1]?.t ?? null;

      console.log("[projectx-adapter] history test", {
        live,
        status: res.status,
        ok: res.ok,
        success: json?.success,
        errorCode: json?.errorCode,
        errorMessage: json?.errorMessage ?? null,
        barsCount: bars.length,
        firstT,
        lastT,
      });
    };

    await run(false);
    await run(true);
  }

  private async testContractAccess(): Promise<void> {
    if (!this.token) return;

    const contractId = process.env.PROJECTX_CONTRACT_ID?.trim();
    if (!contractId) {
      console.log("[projectx-adapter] contract test skipped (no PROJECTX_CONTRACT_ID)");
      return;
    }

    const res = await fetch("https://api.topstepx.com/api/Contract/searchById", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ contractId }),
    });

    const text = await res.text();

    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    const c = json?.contract ?? null;

    this.contractTickSize =
      typeof c?.tickSize === "number" ? c.tickSize : Number(c?.tickSize ?? NaN);
    if (!Number.isFinite(this.contractTickSize as number)) this.contractTickSize = null;

    this.contractTickValue =
      typeof c?.tickValue === "number" ? c.tickValue : Number(c?.tickValue ?? NaN);
    if (!Number.isFinite(this.contractTickValue as number)) this.contractTickValue = null;

    console.log("[projectx-adapter] contract searchById", {
      status: res.status,
      ok: res.ok,
      success: json?.success,
      errorCode: json?.errorCode,
      errorMessage: json?.errorMessage ?? null,
      contractFound: Boolean(c),
      id: c?.id ?? null,
      name: c?.name ?? null,
      description: c?.description ?? null,
      symbolId: c?.symbolId ?? null,
      activeContract: c?.activeContract ?? null,
      tickSize: c?.tickSize ?? null,
      tickValue: c?.tickValue ?? null,
      storedTickSize: this.contractTickSize,
      storedTickValue: this.contractTickValue,
    });
  }

  async fetchOrderById(orderId: string): Promise<any | null> {
    if (!this.token) throw new Error("fetchOrderById: no token");
    if (!this.accountId) throw new Error("fetchOrderById: no accountId");

    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000); // last 60 mins

    const res = await fetch("https://api.topstepx.com/api/Order/search", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        accountId: this.accountId,
        startTimestamp: start.toISOString(),
        endTimestamp: end.toISOString(),
      }),
    });

    const text = await res.text();
    const json = parseJsonOrNull(text) as OrderSearchResponse | null;
    const orders = Array.isArray(json?.orders) ? json!.orders : [];

    const idNum = Number(orderId);
    const found = orders.find((o: any) => Number(o?.id) === idNum) ?? null;

    return found;
  }

  async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
    if (!this.token) throw new Error("cancelOrder: no token");
    if (!this.accountId) throw new Error("cancelOrder: no accountId");

    const body = { accountId: this.accountId, orderId: Number(orderId) };

    const res = await fetch("https://api.topstepx.com/api/Order/cancel", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const json = parseJsonOrNull(text) as CancelOrderResponse | null;

    console.log("[projectx-adapter] cancelOrder", {
      orderId,
      reason: reason ?? null,
      status: res.status,
      ok: res.ok,
      success: json?.success,
      errorCode: json?.errorCode,
      errorMessage: json?.errorMessage ?? null,
    });

    return Boolean(res.ok && json?.success);
  }

  /**
   * Returns net open position size for a contract (signed).
   * Uses: POST https://api.topstepx.com/api/Position/searchOpen
   */
  async getPosition(params: {
    contractId?: string | null;
    symbol?: string | null;
  }): Promise<{ size: number; positions: Position[] }> {
    if (!this.token) throw new Error("getPosition: no token");
    if (!this.accountId) throw new Error("getPosition: no accountId");

    const res = await fetch("https://api.topstepx.com/api/Position/searchOpen", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ accountId: this.accountId }),
    });

    const text = await res.text();
    const json = parseJsonOrNull(text) as PositionSearchResponse | null;

    if (!res.ok) {
      throw new Error(
        `ProjectX Position/searchOpen failed (HTTP ${res.status})${
          json?.errorMessage ? `: ${json.errorMessage}` : ""
        }`
      );
    }

    const all = Array.isArray(json?.positions) ? json!.positions : [];
    const contractId = params.contractId ? String(params.contractId).trim() : null;

    const positions = contractId ? all.filter((p) => p.contractId === contractId) : all;

    // Signed net size: type 1 => long (+), type 2 => short (-)
    const net = positions.reduce((acc, p) => {
      const sz = Number(p.size ?? 0) || 0;
      const t = Number(p.type ?? 0);
      if (t === 2) return acc - Math.abs(sz);
      return acc + Math.abs(sz);
    }, 0);

    return { size: net, positions };
  }

  async warmup(): Promise<void> {
    await this.validateToken();
    await this.fetchActiveAccounts();
    await this.testHistoryBars();
    await this.testContractAccess();
  }

  /**
   * ENTRY ONLY: Places MARKET/LIMIT/STOP without ANY brackets fields.
   * Uses: POST https://api.topstepx.com/api/Order/place
   */
  async placeOrder(input: PlaceOrderInput): Promise<{ orderId: number; raw: PlaceOrderResponse }> {
    if (!this.token) throw new Error("Cannot place order without ProjectX token");
    if (!this.accountId) throw new Error("Cannot place order without selected ProjectX account");

    const contractId = String(input.contractId || "").trim();
    if (!contractId) throw new Error("placeOrder: contractId missing");

    const size = Number(input.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`placeOrder: invalid size ${String(input.size)}`);
    }

    // OrderType enum: 1=Limit, 2=Market, 4=Stop
    const orderType = input.type === "limit" ? 1 : input.type === "stop" ? 4 : 2;

    // OrderSide enum: 0=Bid(buy), 1=Ask(sell)
    const side = input.side === "sell" ? 1 : 0;

    const body: any = {
      accountId: this.accountId,
      contractId,
      type: orderType,
      side,
      size,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      trailPrice: null,
      customTag: input.customTag ?? null,
      // IMPORTANT: NO bracket fields here, ever.
    };

    const requestSummary = {
      accountId: this.accountId,
      contractId,
      type: body.type,
      side: body.side,
      size: body.size,
      limitPrice: body.limitPrice ?? null,
      stopPrice: body.stopPrice ?? null,
      customTag: body.customTag ?? null,
      hasSL: false,
      hasTP: false,
    };

    console.log("[projectx-adapter] order.place ENTRY request", requestSummary);

    const res = await fetch("https://api.topstepx.com/api/Order/place", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = parseJsonOrNull(text) as PlaceOrderResponse | null;

    console.log("[projectx-adapter] order.place ENTRY response", {
      status: res.status,
      ok: res.ok,
      success: parsed?.success,
      errorCode: parsed?.errorCode,
      errorMessage: parsed?.errorMessage ?? null,
      orderId: parsed?.orderId ?? null,
    });

    const failed = !res.ok || !parsed?.success || !parsed?.orderId;

    if (failed) {
      console.error("[projectx-adapter] order.place ENTRY rejected (full payload)", {
        request: requestSummary,
        response: {
          status: res.status,
          ok: res.ok,
          raw: truncate(text, 8000),
          json: parsed,
        },
      });

      throw new Error(
        `ProjectX Order/place failed (HTTP ${res.status})${
          parsed?.errorCode != null ? ` code=${parsed.errorCode}` : ""
        }${parsed?.errorMessage ? ` msg=${parsed.errorMessage}` : ""}`
      );
    }

    return { orderId: parsed.orderId, raw: parsed };
  }

  /**
   * Places a MARKET/LIMIT/STOP order with optional stop-loss and take-profit brackets (ticks).
   * Uses: POST https://api.topstepx.com/api/Order/place
   *
   * NOTE: Keep this for future brokers, but ProjectX currently uses placeOrder() + placeBracketsAfterEntry()
   * in Aura’s execution flow.
   */
  async placeOrderWithBrackets(input: PlaceOrderWithBracketsInput): Promise<{
    orderId: number;
    raw: PlaceOrderResponse;
  }> {
    if (!this.token) throw new Error("Cannot place order without ProjectX token");
    if (!this.accountId) throw new Error("Cannot place order without selected ProjectX account");

    const contractId = String(input.contractId || "").trim();
    if (!contractId) throw new Error("placeOrderWithBrackets: contractId missing");

    const size = Number(input.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`placeOrderWithBrackets: invalid size ${String(input.size)}`);
    }

    const orderType = input.type === "limit" ? 1 : input.type === "stop" ? 4 : 2;
    const side = input.side === "sell" ? 1 : 0;

    const stopLossTicks = input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const takeProfitTicks = input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

    const body: any = {
      accountId: this.accountId,
      contractId,
      type: orderType,
      side,
      size,
      limitPrice: input.limitPrice ?? null,
      stopPrice: input.stopPrice ?? null,
      trailPrice: null,
      customTag: input.customTag ?? null,
    };

    const slAbs =
      stopLossTicks != null && Number.isFinite(stopLossTicks)
        ? Math.floor(Math.abs(stopLossTicks))
        : null;

    const tpAbs =
      takeProfitTicks != null && Number.isFinite(takeProfitTicks)
        ? Math.floor(Math.abs(takeProfitTicks))
        : null;

    if (slAbs != null && slAbs > 0) {
      body.stopLossBracket = { ticks: slAbs, type: 4 };
    }

    if (tpAbs != null && tpAbs > 0) {
      body.takeProfitBracket = { ticks: tpAbs, type: 1 };
    }

    const requestSummary = {
      accountId: this.accountId,
      contractId,
      type: body.type,
      side: body.side,
      size: body.size,
      limitPrice: body.limitPrice ?? null,
      stopPrice: body.stopPrice ?? null,
      hasSL: Boolean(body.stopLossBracket),
      hasTP: Boolean(body.takeProfitBracket),
      slTicks: body.stopLossBracket?.ticks ?? null,
      tpTicks: body.takeProfitBracket?.ticks ?? null,
      customTag: body.customTag ?? null,
    };

    console.log("[projectx-adapter] order.place request", requestSummary);

    const res = await fetch("https://api.topstepx.com/api/Order/place", {
      method: "POST",
      headers: {
        accept: "text/plain",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    const parsed = parseJsonOrNull(text) as PlaceOrderResponse | null;

    console.log("[projectx-adapter] order.place response", {
      status: res.status,
      ok: res.ok,
      success: parsed?.success,
      errorCode: parsed?.errorCode,
      errorMessage: parsed?.errorMessage ?? null,
      orderId: parsed?.orderId ?? null,
    });

    const failed = !res.ok || !parsed?.success || !parsed?.orderId;

    if (failed) {
      console.error("[projectx-adapter] order.place rejected (full payload)", {
        request: requestSummary,
        response: {
          status: res.status,
          ok: res.ok,
          raw: truncate(text, 8000),
          json: parsed,
        },
      });

      throw new Error(
        `ProjectX Order/place failed (HTTP ${res.status})${
          parsed?.errorCode != null ? ` code=${parsed.errorCode}` : ""
        }${parsed?.errorMessage ? ` msg=${parsed.errorMessage}` : ""}`
      );
    }

    return { orderId: parsed.orderId, raw: parsed };
  }

  /**
   * ProjectX "2-call" brackets:
   * 1) ENTRY is already placed via placeOrder()
   * 2) We then place TWO separate exit orders:
   *    - Stop order (SL)
   *    - Limit order (TP)
   *
   * We compute absolute prices from the actual filledPrice where possible.
   */
  async placeBracketsAfterEntry(input: {
    entryOrderId: string | null;
    contractId: string;
    side: "buy" | "sell";
    size: number;

    // ticks (fallback)
    stopLossTicks?: number | null;
    takeProfitTicks?: number | null;

    // NEW: absolute prices (preferred)
    stopPrice?: number | null;
    takeProfitPrice?: number | null;

    customTag?: string | null;
  }): Promise<{
    ok: boolean;
    refPrice: number;
    tickSize: number;
    stopOrderId?: number | null;
    takeProfitOrderId?: number | null;
  }> {
    if (!this.token) throw new Error("Cannot place brackets without ProjectX token");
    if (!this.accountId) throw new Error("Cannot place brackets without selected ProjectX account");

    const contractId = String(input.contractId || "").trim();
    if (!contractId) throw new Error("placeBracketsAfterEntry: contractId missing");

    const size = Number(input.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`placeBracketsAfterEntry: invalid size ${String(input.size)}`);
    }

    const sl = input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const tp = input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

    const slAbs = sl != null && Number.isFinite(sl) ? Math.floor(Math.abs(sl)) : null;
    const tpAbs = tp != null && Number.isFinite(tp) ? Math.floor(Math.abs(tp)) : null;

    const wantsSL = slAbs != null && slAbs > 0;
    const wantsTP = tpAbs != null && tpAbs > 0;

    if (!wantsSL && !wantsTP) {
      console.log("[projectx-adapter] brackets skipped (no sl/tp requested)", {
        contractId,
        entryOrderId: input.entryOrderId ?? null,
      });
      return {
        ok: true,
        refPrice: NaN,
        tickSize: this.contractTickSize ?? NaN,
        stopOrderId: null,
        takeProfitOrderId: null,
      };
    }

    // --- Ensure we have tickSize for this contract ---
    let tickSize = this.contractTickSize;

    if (!tickSize || !Number.isFinite(tickSize)) {
      const res = await fetch("https://api.topstepx.com/api/Contract/searchById", {
        method: "POST",
        headers: {
          accept: "text/plain",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({ contractId }),
      });

      const text = await res.text();
      const json = parseJsonOrNull(text);
      const c = json?.contract ?? null;

      const ts = typeof c?.tickSize === "number" ? c.tickSize : Number(c?.tickSize ?? NaN);

      if (!Number.isFinite(ts)) {
        throw new Error(
          `placeBracketsAfterEntry: could not resolve tickSize for contractId=${contractId}`
        );
      }

      tickSize = ts;
      this.contractTickSize = ts;

      console.log("[projectx-adapter] tickSize resolved", { contractId, tickSize });
    }

    const tickDecimals = (() => {
      const s = String(tickSize);
      const dot = s.indexOf(".");
      return dot >= 0 ? s.length - dot - 1 : 0;
    })();

    const roundToTick = (price: number) => {
      const p = Math.round(price / tickSize!) * tickSize!;
      return Number(p.toFixed(Math.max(0, Math.min(8, tickDecimals))));
    };

    const isLong = input.side === "buy";

    const assertValidExitPrice = (kind: "SL" | "TP", px: number, ref: number) => {
      if (!Number.isFinite(px) || px <= 0) {
        throw new Error(`placeBracketsAfterEntry: ${kind} price invalid ${String(px)}`);
      }
      if (isLong) {
        if (kind === "SL" && px >= ref) {
          throw new Error(
            `placeBracketsAfterEntry: SL must be < refPrice for LONG (sl=${px} ref=${ref})`
          );
        }
        if (kind === "TP" && px <= ref) {
          throw new Error(
            `placeBracketsAfterEntry: TP must be > refPrice for LONG (tp=${px} ref=${ref})`
          );
        }
      } else {
        if (kind === "SL" && px <= ref) {
          throw new Error(
            `placeBracketsAfterEntry: SL must be > refPrice for SHORT (sl=${px} ref=${ref})`
          );
        }
        if (kind === "TP" && px >= ref) {
          throw new Error(
            `placeBracketsAfterEntry: TP must be < refPrice for SHORT (tp=${px} ref=${ref})`
          );
        }
      }
    };

    console.log("[projectx-adapter] bracket calc", {
      entryOrderId: input.entryOrderId ?? null,
      side: input.side,
      isLong,
      tickSize,
      slTicks: slAbs,
      tpTicks: tpAbs,
    });

    // --- Get a reference price: prefer actual filledPrice from Order/search ---
    let refPrice: number | null = null;

    if (input.entryOrderId) {
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 10 * 60 * 1000);

        const res = await fetch("https://api.topstepx.com/api/Order/search", {
          method: "POST",
          headers: {
            accept: "text/plain",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            accountId: this.accountId,
            startTimestamp: start.toISOString(),
            endTimestamp: end.toISOString(),
          }),
        });

        const text = await res.text();
        const json = parseJsonOrNull(text);
        const orders = Array.isArray(json?.orders) ? json.orders : [];

        const entryIdNum = Number(input.entryOrderId);
        const found = orders.find((o: any) => Number(o?.id) === entryIdNum) ?? null;

        const filledRaw = found?.filledPrice ?? found?.avgFillPrice ?? null;
        const filledPrice = typeof filledRaw === "number" ? filledRaw : Number(filledRaw);

        if (Number.isFinite(filledPrice) && filledPrice > 0) {
          refPrice = filledPrice;
        }

        console.log("[projectx-adapter] entry fill lookup", {
          entryOrderId: input.entryOrderId,
          found: Boolean(found),
          filledPrice: Number.isFinite(filledPrice) ? filledPrice : null,
          status: found?.status ?? null,
          type: found?.type ?? null,
          side: found?.side ?? null,
        });
      } catch (e) {
        console.warn("[projectx-adapter] entry fill lookup failed", {
          entryOrderId: input.entryOrderId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Fallback: latest bar close (only if sane)
    if (refPrice == null) {
      const end = new Date();
      const start = new Date(end.getTime() - 2 * 60 * 1000);

      const barsRes = await fetch("https://api.topstepx.com/api/History/retrieveBars", {
        method: "POST",
        headers: {
          accept: "text/plain",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          contractId,
          live: true,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          unit: 1,
          unitNumber: 15,
          limit: 5,
          includePartialBar: true,
        }),
      });

      const barsText = await barsRes.text();
      const barsJson = parseJsonOrNull(barsText);
      const bars = Array.isArray(barsJson?.bars) ? barsJson.bars : [];

      const lastBar = bars.length ? bars[bars.length - 1] : null;
      const refRaw = lastBar?.c ?? lastBar?.C ?? null;
      const barClose = typeof refRaw === "number" ? refRaw : Number(refRaw);

      if (Number.isFinite(barClose) && barClose > 0) {
        refPrice = barClose;
      }

      console.log("[projectx-adapter] bars refPrice fallback", {
        status: barsRes.status,
        ok: barsRes.ok,
        barsCount: bars.length,
        barClose: Number.isFinite(barClose) ? barClose : null,
      });
    }

    if (refPrice == null || !Number.isFinite(refPrice) || refPrice <= 0) {
      throw new Error(
        `placeBracketsAfterEntry: cannot determine valid refPrice for contractId=${contractId} entryOrderId=${String(
          input.entryOrderId
        )}`
      );
    }

    // Prefer absolute prices from strategy when provided.
    // Fallback to refPrice±ticks only if prices are missing.

    const stopPxIn = input.stopPrice != null ? Number(input.stopPrice) : null;
    const tpPxIn = input.takeProfitPrice != null ? Number(input.takeProfitPrice) : null;

    const hasStopPx = stopPxIn != null && Number.isFinite(stopPxIn) && stopPxIn > 0;
    const hasTpPx = tpPxIn != null && Number.isFinite(tpPxIn) && tpPxIn > 0;

    const slRawPreferred =
      wantsSL
        ? hasStopPx
          ? stopPxIn!
          : isLong
            ? refPrice - slAbs! * tickSize
            : refPrice + slAbs! * tickSize
        : null;

    const tpRawPreferred =
      wantsTP
        ? hasTpPx
          ? tpPxIn!
          : isLong
            ? refPrice + tpAbs! * tickSize
            : refPrice - tpAbs! * tickSize
        : null;

    let slPrice = slRawPreferred != null ? roundToTick(slRawPreferred) : null;
    let tpPrice = tpRawPreferred != null ? roundToTick(tpRawPreferred) : null;

    // If absolute prices are on the wrong side due to slippage, fallback to ticks from refPrice.
    if (wantsSL && slPrice != null) {
      try {
        assertValidExitPrice("SL", slPrice, refPrice);
      } catch (e) {
        const fallback = isLong
          ? refPrice - slAbs! * tickSize
          : refPrice + slAbs! * tickSize;

        const slFallback = roundToTick(fallback);

        console.warn("[projectx-adapter] SL absolute invalid vs refPrice - falling back to ticks", {
          entryOrderId: input.entryOrderId ?? null,
          isLong,
          refPrice,
          stopPxIn: hasStopPx ? stopPxIn : null,
          slAbs,
          tickSize,
          slPriceAttempt: slPrice,
          slPriceFallback: slFallback,
        });

        slPrice = slFallback;
        assertValidExitPrice("SL", slPrice, refPrice);
      }
    }

    if (wantsTP && tpPrice != null) {
      try {
        assertValidExitPrice("TP", tpPrice, refPrice);
      } catch (e) {
        const fallback = isLong
          ? refPrice + tpAbs! * tickSize
          : refPrice - tpAbs! * tickSize;

        const tpFallback = roundToTick(fallback);

        console.warn("[projectx-adapter] TP absolute invalid vs refPrice - falling back to ticks", {
          entryOrderId: input.entryOrderId ?? null,
          isLong,
          refPrice,
          tpPxIn: hasTpPx ? tpPxIn : null,
          tpAbs,
          tickSize,
          tpPriceAttempt: tpPrice,
          tpPriceFallback: tpFallback,
        });

        tpPrice = tpFallback;
        assertValidExitPrice("TP", tpPrice, refPrice);
      }
    }

    // Exit orders are always the OPPOSITE side
    const exitSide = isLong ? 1 : 0; // 1=Ask(sell), 0=Bid(buy)

    let stopOrderId: number | null = null;
    let takeProfitOrderId: number | null = null;

    const baseTag = (input.customTag || "brackets").trim() || "brackets";
    const entryTagPart = input.entryOrderId ? `:${input.entryOrderId}` : "";

      try {
      if (wantsSL && slPrice != null) {
        const body = {
          accountId: this.accountId,
          contractId,
          type: 4, // Stop
          side: exitSide,
          size,
          limitPrice: null,
          stopPrice: slPrice,
          trailPrice: null,
          customTag: `${baseTag}:SL${entryTagPart}`,
        };

        logTag("[projectx-adapter] SL_EXIT_PRICES", {
          contractId,
          entryOrderId: input.entryOrderId ?? null,
          isLong,
          exitSide,
          size,
          slTicks: slAbs,
          refPrice,
          tickSize,
          stopPrice: slPrice,
          customTag: body.customTag,
        });

        const res = await fetch("https://api.topstepx.com/api/Order/place", {
          method: "POST",
          headers: {
            accept: "text/plain",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        const parsed = parseJsonOrNull(text) as PlaceOrderResponse | null;

        console.log("[projectx-adapter] SL exit response", {
          status: res.status,
          ok: res.ok,
          success: parsed?.success,
          errorCode: parsed?.errorCode,
          errorMessage: parsed?.errorMessage ?? null,
          orderId: parsed?.orderId ?? null,
        });

        if (!res.ok || !parsed?.success || !parsed?.orderId) {
          throw new Error(
            `ProjectX SL exit Order/place failed (HTTP ${res.status})${
              parsed?.errorCode != null ? ` code=${parsed.errorCode}` : ""
            }${parsed?.errorMessage ? ` msg=${parsed.errorMessage}` : ""}`
          );
        }

        stopOrderId = parsed.orderId;
      }

      if (wantsTP && tpPrice != null) {
        const body = {
          accountId: this.accountId,
          contractId,
          type: 1, // Limit
          side: exitSide,
          size,
          limitPrice: tpPrice,
          stopPrice: null,
          trailPrice: null,
          customTag: `${baseTag}:TP${entryTagPart}`,
        };

        logTag("[projectx-adapter] TP_EXIT_PRICES", {
          contractId,
          entryOrderId: input.entryOrderId ?? null,
          isLong,
          exitSide,
          size,
          tpTicks: tpAbs,
          refPrice,
          tickSize,
          limitPrice: tpPrice,
          customTag: body.customTag,
        });

        const res = await fetch("https://api.topstepx.com/api/Order/place", {
          method: "POST",
          headers: {
            accept: "text/plain",
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(body),
        });

        const text = await res.text();
        const parsed = parseJsonOrNull(text) as PlaceOrderResponse | null;

        console.log("[projectx-adapter] TP exit response", {
          status: res.status,
          ok: res.ok,
          success: parsed?.success,
          errorCode: parsed?.errorCode,
          errorMessage: parsed?.errorMessage ?? null,
          orderId: parsed?.orderId ?? null,
        });

        if (!res.ok || !parsed?.success || !parsed?.orderId) {
          throw new Error(
            `ProjectX TP exit Order/place failed (HTTP ${res.status})${
              parsed?.errorCode != null ? ` code=${parsed.errorCode}` : ""
            }${parsed?.errorMessage ? ` msg=${parsed.errorMessage}` : ""}`
          );
        }

        takeProfitOrderId = parsed.orderId;
      }
    } catch (e) {
      // Critical safety: never leave a half-bracket behind.
      // If one exit was placed but the other failed, cancel the one that was placed.
      await this.safeCancel(stopOrderId, "HALF_BRACKET_CLEANUP");
      await this.safeCancel(takeProfitOrderId, "HALF_BRACKET_CLEANUP");
      throw e;
    }

    console.log("[projectx-adapter] brackets placed (separate exit orders)", {
      contractId,
      entryOrderId: input.entryOrderId ?? null,
      refPrice,
      tickSize,
      stopOrderId,
      takeProfitOrderId,
    });

    return {
      ok: true,
      refPrice,
      tickSize,
      stopOrderId,
      takeProfitOrderId,
    };
  }

  startKeepAlive(): void {
    if (!this.token) {
      throw new Error("Cannot start keepalive without ProjectX token");
    }
    if (this.keepAliveTimer) {
      console.warn("[projectx-adapter] keepalive already running");
      return;
    }

    console.log("[projectx-adapter] starting keepalive");

    this.lastValidateAtMs = Date.now();

    this.keepAliveTimer = setInterval(() => {
      console.log("[projectx-adapter] keepalive tick", {
        hasToken: Boolean(this.token),
        hasAccountId: Boolean(this.accountId),
        at: new Date().toISOString(),
      });

      const now = Date.now();
      const tenMin = 10 * 60 * 1000;
      if (now - this.lastValidateAtMs >= tenMin) {
        this.lastValidateAtMs = now;
        void (async () => {
          try {
            await this.validateToken();
          } catch (e) {
            console.error("[projectx-adapter] scheduled token validate failed", e);
          }
        })();
      }
    }, 30_000);
  }

  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
      console.log("[projectx-adapter] keepalive stopped");
    }
  }

  async disconnect(): Promise<void> {
    this.stopKeepAlive();
    this.token = null;
    this.accountId = null;
    this.accountName = null;
    this.accountSimulated = null;
    this.contractTickSize = null;
    this.contractTickValue = null;
    console.log("[projectx-adapter] disconnected");
  }

  async placeBracketOrder(plan: PlaceBracketOrderPlan): Promise<PlaceBracketOrderResult> {
    const caps = this.capabilities;

    const canFlowA =
      caps.supportsBracketInSingleCall && typeof (this as any).placeOrderWithBrackets === "function";

    const canFlowB =
      caps.supportsAttachBracketsAfterEntry &&
      typeof (this as any).placeOrder === "function" &&
      typeof (this as any).placeBracketsAfterEntry === "function";

    if (!canFlowA && !canFlowB) {
      throw new Error("ProjectXBrokerAdapter: no supported bracket placement flow");
    }

    // -------------------------
    // Flow A (single call)
    // NOTE: ProjectX caps currently set this false, but keep it correct anyway.
    // -------------------------
    if (canFlowA) {
      const res = await this.placeOrderWithBrackets({
        contractId: plan.contractId,
        side: plan.side,
        size: plan.size,
        type: plan.entryType,
        limitPrice: null,
        stopPrice: null,
        stopLossTicks: plan.stopLossTicks ?? null,
        takeProfitTicks: plan.takeProfitTicks ?? null,
        customTag: plan.customTag ?? null,
      });

      return {
        entryOrderId: res?.orderId != null ? String(res.orderId) : null,
        stopOrderId: null, // ProjectX single-call doesn't return these IDs here
        takeProfitOrderId: null,
        raw: res,
      };
    }

    // -------------------------
    // Flow B (entry first, then separate exits)
    // -------------------------
    const entryRes = await this.placeOrder({
      contractId: plan.contractId,
      side: plan.side,
      size: plan.size,
      type: plan.entryType,
      limitPrice: null,
      stopPrice: null,
      customTag: plan.customTag ?? null,
    });

    const entryOrderId = entryRes?.orderId != null ? String(entryRes.orderId) : null;

    const wantsSL =
      plan.stopLossTicks != null ||
      (plan.stopPrice != null && Number.isFinite(Number(plan.stopPrice)));

    const wantsTP =
      plan.takeProfitTicks != null ||
      (plan.takeProfitPrice != null && Number.isFinite(Number(plan.takeProfitPrice)));

    let stopOrderId: string | null = null;
    let takeProfitOrderId: string | null = null;

    if (wantsSL || wantsTP) {
      const bracketRes = await this.placeBracketsAfterEntry({
        entryOrderId,
        contractId: plan.contractId,
        side: plan.side,
        size: plan.size,
        stopLossTicks: plan.stopLossTicks ?? null,
        takeProfitTicks: plan.takeProfitTicks ?? null,
        stopPrice: plan.stopPrice ?? null,
        takeProfitPrice: plan.takeProfitPrice ?? null,
        customTag: plan.customTag ?? null,
      });

      stopOrderId =
        bracketRes?.stopOrderId != null ? String(bracketRes.stopOrderId) : null;

      takeProfitOrderId =
        bracketRes?.takeProfitOrderId != null ? String(bracketRes.takeProfitOrderId) : null;

      return {
        entryOrderId,
        stopOrderId,
        takeProfitOrderId,
        raw: { entry: entryRes, brackets: bracketRes },
      };
    }

    return {
      entryOrderId,
      stopOrderId: null,
      takeProfitOrderId: null,
      raw: { entry: entryRes, brackets: null },
    };
  }
}
