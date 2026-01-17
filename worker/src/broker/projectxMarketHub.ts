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
};

export class ProjectXMarketHub {
  private conn: HubConnection | null = null;
  private lastEventAtMs = 0;
  private heartbeatTimer: NodeJS.Timer | null = null;

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
    // SignalR handlers sometimes pass:
    // - an object
    // - an array with 1 object
    // - an envelope like { data: {...} } or { quote: {...} } etc
    const p = Array.isArray(payload) ? payload[0] : payload;
    if (!p) return p;

    // common wrappers
    if (p.data && typeof p.data === "object") return p.data;
    if (p.quote && typeof p.quote === "object") return p.quote;
    if (p.payload && typeof p.payload === "object") return p.payload;

    return p;
  }

  private normalizeQuote(cid: string, rawPayload: any): Quote {
    const payload = this.unwrapPayload(rawPayload);

    // Try a wider set of field names
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

    const tsRaw =
      payload?.timestamp ??
      payload?.Timestamp ??
      payload?.lastUpdated ??
      payload?.LastUpdated ??
      payload?.ts ??
      payload?.Ts ??
      payload?.time ??
      payload?.Time ??
      payload?.t;

    const bid = this.toNum(bidRaw);
    const ask = this.toNum(askRaw);
    const last = this.toNum(lastRaw);
    const ts = typeof tsRaw === "string" ? tsRaw : undefined;

    // Merge partial updates (keep last known values)
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

  private parseSignalRFrames(data: any): any[] {
    const s =
      typeof data === "string"
        ? data
        : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : String(data);

    const parts = s.split("\u001e").filter(Boolean);
    const msgs: any[] = [];

    for (const p of parts) {
      try {
        msgs.push(JSON.parse(p));
      } catch {
        // ignore
      }
    }

    return msgs;
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
    });

    console.log("[projectx-market] starting connection...");

    await conn.start();
    console.log("[projectx-market] connected");

    const handleGatewayQuote = async (payload: any) => {
      this.lastEventAtMs = Date.now();

      // Helpful: if raw mode is on, log the incoming payload once per event
      // If the hub callback gives us ONLY the contractId string, it's not the payload.
      // The real payload will come via the invocation frames we route below.
      if (typeof payload === "string") {
        if (raw) console.log("[projectx-market] quote(rawPayload:stringOnly)", payload);
        return;
      }

      if (raw) {
        console.log("[projectx-market] quote(rawPayload)", payload);
      }

      // Normalize but FORCE the subscribed contractId (don’t trust payload’s id)
      const merged = this.normalizeQuote(contractId, payload);
      merged.contractId = contractId;

      console.log("[projectx-market] quote", merged);

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

    // Keep the raw frame hook for debugging invocation targets/args
    try {
      const httpConn = (conn as any).connection;
      const hasOnReceive = httpConn && typeof httpConn.onreceive === "function";

      if (!hasOnReceive) {
        console.warn("[projectx-market] http connection.onreceive not available");
      } else {
        const orig = httpConn.onreceive.bind(httpConn);

        httpConn.onreceive = async (data: any) => {
          const msgs = this.parseSignalRFrames(data);

          for (const msg of msgs) {
            if (raw) {
              console.log("[projectx-market] frame", msg);
            }

            if (msg?.type === 1) {
              this.lastEventAtMs = Date.now();

              const target = String(msg.target || "");
              const targetLc = target.toLowerCase();

              if (debugInvocations) {
                console.log("[projectx-market][invoke]", {
                  target,
                  args: msg.arguments,
                });
              }

              // IMPORTANT:
              // Some ProjectX feeds don't populate conn.on("GatewayQuote") with the payload.
              // Instead, the payload arrives as a SignalR invocation frame.
              if (targetLc === "gatewayquote" || targetLc === "gatewayquotes") {
                try {
                  // msg.arguments is typically an array. Pass the args through so unwrapPayload() can handle it.
                  await handleGatewayQuote(msg.arguments);
                } catch (e) {
                  console.error("[projectx-market] gatewayquote frame handling failed", e);
                }
              }
            }
          }

          return orig(data);
        };
      }
    } catch (e) {
      console.warn("[projectx-market] failed to hook onreceive", e);
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
