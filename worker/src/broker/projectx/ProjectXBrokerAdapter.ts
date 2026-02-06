import type { IBrokerAdapter } from "../IBrokerAdapter.js";

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
      tokenPreview: this.token
        ? `${this.token.slice(0, 12)}...${this.token.slice(-12)}`
        : null,
    });

    if (!this.token) {
      throw new Error("ProjectX authorization failed - no token returned");
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
      tokenPreview: this.token
        ? `${this.token.slice(0, 12)}...${this.token.slice(-12)}`
        : null,
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

    const preferredName = process.env.PROJECTX_ACCOUNT_NAME?.trim();
    const preferredIdRaw = process.env.PROJECTX_ACCOUNT_ID?.trim();
    const preferredId = preferredIdRaw ? Number(preferredIdRaw) : null;

    const preferredById =
      typeof preferredId === "number" && Number.isFinite(preferredId)
        ? accounts.find((a) => a.id === preferredId)
        : null;

    const preferredByName = preferredName
      ? accounts.find((a) => a.name === preferredName)
      : null;

    const selected =
      preferredById ??
      preferredByName ??
      accounts.find((a) => a.canTrade && a.isVisible) ??
      accounts[0] ??
      null;

    this.accountId = selected?.id ?? null;
    this.accountName = selected?.name ?? null;
    this.accountSimulated = selected?.simulated ?? null;

    console.log("[projectx-adapter] account search", {
      status: res.status,
      ok: res.ok,
      success: json?.success,
      errorCode: json?.errorCode,
      errorMessage: json?.errorMessage ?? null,
      activeAccountsCount: accounts.length,
      preferredAccountName: preferredName ?? null,
      preferredAccountId: preferredIdRaw ?? null,
      selectedAccountId: this.accountId,
      selectedAccountName: this.accountName,
      selectedAccountSimulated: this.accountSimulated,
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

  // Proves market-data entitlement + whether "live" vs "sim" matters for your token.
  private async testHistoryBars(): Promise<void> {
    if (!this.token) return;

    const contractId = process.env.PROJECTX_CONTRACT_ID?.trim();
    if (!contractId) {
      console.log("[projectx-adapter] history test skipped (no PROJECTX_CONTRACT_ID)");
      return;
    }

    const end = new Date();
    const start = new Date(end.getTime() - 10 * 60 * 1000); // last 10 minutes

    const run = async (live: boolean) => {
      const body = {
        contractId,
        live,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        unit: 1, // Second
        unitNumber: 15, // 15-second bars
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

  // Proves whether the contractId exists / is accessible for your token.
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

    // Store contract spec for sizing/risk
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

  async warmup(): Promise<void> {
    // Runs before broker.ready is emitted (called by startBrokerFeed if present)
    await this.validateToken();
    await this.fetchActiveAccounts();
    await this.testHistoryBars();
    await this.testContractAccess();
  }

  /**
   * Places a MARKET/LIMIT/STOP order with optional stop-loss and take-profit brackets (ticks).
   * Uses: POST https://api.topstepx.com/api/Order/place
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

    // OrderType enum: 1=Limit, 2=Market, 4=Stop
    const orderType = input.type === "limit" ? 1 : input.type === "stop" ? 4 : 2;

    // OrderSide enum: 0=Bid(buy), 1=Ask(sell)
    const side = input.side === "sell" ? 1 : 0;

    const stopLossTicks =
      input.stopLossTicks != null ? Number(input.stopLossTicks) : null;
    const takeProfitTicks =
      input.takeProfitTicks != null ? Number(input.takeProfitTicks) : null;

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

    // Brackets are configured in *signed* ticks for ProjectX.
    // Convention:
    // - Long (buy): SL must be negative, TP must be positive
    // - Short (sell): SL must be positive, TP must be negative
    //
    // We accept user/strategy inputs as positive "distance" ticks
    // and convert here so the rest of Aura can stay intuitive.
    const isLong = side === 0; // 0=buy, 1=sell

    const slAbs =
      stopLossTicks != null && Number.isFinite(stopLossTicks)
        ? Math.floor(Math.abs(stopLossTicks))
        : null;

    const tpAbs =
      takeProfitTicks != null && Number.isFinite(takeProfitTicks)
        ? Math.floor(Math.abs(takeProfitTicks))
        : null;

    if (slAbs != null && slAbs > 0) {
      body.stopLossBracket = {
        ticks: isLong ? -slAbs : slAbs,
        type: 4, // Stop
      };
    }

    if (tpAbs != null && tpAbs > 0) {
      body.takeProfitBracket = {
        ticks: isLong ? tpAbs : -tpAbs,
        type: 1, // Limit
      };
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

  startKeepAlive(): void {
    if (!this.token) {
      throw new Error("Cannot start keepalive without ProjectX token");
    }
    if (this.keepAliveTimer) {
      console.warn("[projectx-adapter] keepalive already running");
      return;
    }

    console.log("[projectx-adapter] starting keepalive");

    // warmup() handles initial validate + account selection before broker.ready
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
}
