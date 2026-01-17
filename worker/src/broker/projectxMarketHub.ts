import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";

type Quote = {
  contractId: string;
  bid?: number;
  ask?: number;
  last?: number;
  ts?: string;
};

type ProjectXMarketHubOpts = {
  token: string;
  contractId: string;

  onQuote?: (q: Quote) => Promise<void> | void;

  quotes?: boolean;
  trades?: boolean;
  depth?: boolean;

  raw?: boolean;
  debugInvocations?: boolean;
  rtcUrl?: string;

  // Ignore old snapshot quotes (prevents candles being built from stale data).
  // If you want to change this later, make it a dashboard setting.
  maxQuoteAgeMs?: number;
};

export class ProjectXMarketHub {
  private conn: HubConnection | null = null;
  private lastEventAtMs = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // merge state (ProjectX often sends partial quote updates)
  private lastBid: number | undefined;
  private lastAsk: number | undefined;
  private lastLast: number | undefined;
  private lastTs: string | undefined;

  constructor(private opts: ProjectXMarketHubOpts) {}

  private toNum(v: any): number | undefined {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private unwrapPayload(payload: any): any {
    // handlers sometimes pass:
    // - an object
    // - an array with 1 object
    // - wrappers like { data: {...} } or { quote: {...} }
    const p = Array.isArray(payload) ? payload[0] : payload;
    if (!p) return p;

    if (p.data && typeof p.data === "object") return p.data;
    if (p.quote && typeof p.quote === "object") return p.quote;
    if (p.payload && typeof p.payload === "object") return p.payload;

    return p;
  }

  private normalizeQuote(cid: string, rawPayload: any): Quote {
    const payload = this.unwrapPayload(rawPayload);

    const bidRaw =
      payload?.bestBid ??
      payload?.BestBid ??
      payload?.bid ??
      payload?.Bid ??
      payload?.b;

    const askRaw =
      payload?.bestAsk ??
      payload?.BestAsk ??
      payload?.ask ??
      payload?.Ask ??
      payload?.a;

    const lastRaw =
      payload?.lastPrice ??
      payload?.LastPrice ??
      payload?.last ??
      payload?.Last ??
      payload?.tradePrice ??
      payload?.TradePrice ??
      payload?.price ??
      payload?.Price ??
      payload?.p;

    // Prefer "lastUpdated" for “quote updated at”, fall back to timestamp, etc.
    const tsRaw =
      payload?.lastUpdated ??
      payload?.LastUpdated ??
      payload?.timestamp ??
      payload?.Timestamp ??
      payload?.ts ??
      payload?.Ts ??
      payload?.time ??
      payload?.Time ??
      payload?.t;

    const bid = this.toNum(bidRaw);
    const ask = this.toNum(askRaw);
    const last = this.toNum(lastRaw);
    const ts = typeof tsRaw === "string" ? tsRaw : undefined;

    // Merge partial updates
    if (typeof bid === "number") this.lastBid = bid;
    if (typeof ask === "number") this.lastAsk = ask;
    if (typeof last === "number") this.lastLast = last;
    if (typeof ts === "string") this.lastTs = ts;

    return {
      contractId: cid,
      bid: this.lastBid,
      ask: this.lastAsk,
      last: this.lastLast,
      ts: this.lastTs,
    };
  }

  private quoteAgeMs(ts: string | undefined): number | null {
    if (!ts) return null;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    return Date.now() - ms;
  }

  async start(): Promise<void> {
    const {
      token,
      contractId,
      onQuote,
      quotes = true,
      trades = false,
      depth = false,
      raw = false,
      debugInvocations = false,
      rtcUrl,
      maxQuoteAgeMs = 2 * 60 * 60_000, // 2 hours (practice snapshots can lag)
    } = this.opts;

    const hubBase = (rtcUrl || process.env.PROJECTX_RTC_URL || "").trim();
    const base = hubBase || "https://rtc.topstepx.com";
    const url = `${base.replace(/\/$/, "")}/hubs/market?access_token=${encodeURIComponent(
      token
    )}`;

    const conn = new HubConnectionBuilder()
      .withUrl(url, {
        skipNegotiation: true,
        transport: HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    conn.keepAliveIntervalInMilliseconds = 15_000;
    conn.serverTimeoutInMilliseconds = 120_000;

    this.conn = conn;

    console.log("[projectx-market] config", {
      urlBase: base,
      contractId,
      quotes,
      trades,
      depth,
      raw,
      debugInvocations,
      maxQuoteAgeMs,
    });

    console.log("[projectx-market] starting connection...");
    await conn.start();
    console.log("[projectx-market] connected");

    // Based on your log, ProjectX calls GatewayQuote as:
    // GatewayQuote(contractId: string, quoteObj: object)
    const handleGatewayQuote = async (...args: any[]) => {
      this.lastEventAtMs = Date.now();

      if (debugInvocations) {
        console.log("[projectx-market] GatewayQuote recv", {
          at: new Date().toISOString(),
          argsCount: args.length,
          cid: args[0],
        });
        console.log("[projectx-market] GatewayQuote args", {
          count: args.length,
          types: args.map((a) => typeof a),
          head: args.slice(0, 2),
        });
      }

      const cid = typeof args[0] === "string" ? args[0] : contractId;

      // If we got two args, payload is arg1 (object). If not, fall back safely.
      const payload = args.length >= 2 ? args[1] : args[0];

      if (typeof payload === "string") {
        if (raw) console.log("[projectx-market] quote(rawPayload:stringOnly)", payload);
        return;
      }

      if (raw) {
        console.log("[projectx-market] quote(rawPayload)", payload);
      }

      // Normalize but force our subscribed contractId
      const merged = this.normalizeQuote(contractId, payload);
      merged.contractId = contractId;

      const age = this.quoteAgeMs(merged.ts);

      // If the quote has a timestamp and it's old, ignore it (prevents fake candle building)
      if (age !== null && age > maxQuoteAgeMs) {
        console.log("[projectx-market] stale quote - ignoring", {
          contractId,
          ts: merged.ts,
          ageMs: age,
          maxQuoteAgeMs,
        });
        return;
      }

      console.log("[projectx-market] quote", merged, {
        ageMs: age,
      });

      if (onQuote) {
        try {
          await onQuote(merged);
        } catch (e) {
          console.error("[projectx-market] onQuote handler failed (non-fatal)", e);
        }
      }
    };

    if (quotes) {
      conn.on("GatewayQuote", handleGatewayQuote);
      conn.on("gatewayquote", handleGatewayQuote);
    }

    console.log("[projectx-market] subscribing", {
      contractId,
      quotes,
      trades,
      depth,
    });

    if (quotes) {
      const res = await conn.invoke("SubscribeContractQuotes", contractId);
      console.log("[projectx-market] subscribed quotes", { contractId, res });
    }

    if (trades) {
      const res = await conn.invoke("SubscribeContractTrades", contractId);
      console.log("[projectx-market] subscribed trades", { contractId, res });
    }

    if (depth) {
      const res = await conn.invoke("SubscribeContractMarketDepth", contractId);
      console.log("[projectx-market] subscribed depth", { contractId, res });
    }

    console.log("[projectx-market] subscribed", { contractId });

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        const ageMs = this.lastEventAtMs ? Date.now() - this.lastEventAtMs : null;
        console.log("[projectx-market] heartbeat", { contractId, lastEventAgeMs: ageMs });
      }, 10_000);
    }
  }

  async stop(): Promise<void> {
    if (!this.conn) return;

    try {
      await this.conn.stop();
    } finally {
      this.conn = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
