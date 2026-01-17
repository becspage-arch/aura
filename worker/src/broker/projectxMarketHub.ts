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

  // Optional hook so the worker can forward data into Aura events
  onQuote?: (q: Quote) => Promise<void> | void;

  // Feature flags (defaults)
  quotes?: boolean;
  trades?: boolean;
  depth?: boolean;

  // Debug
  raw?: boolean; // logs every parsed SignalR message object
  debugInvocations?: boolean; // logs invocation target + args
  rtcUrl?: string; // override hub base url if needed
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

  private normalizeQuote(cid: string, payload: any): Quote {
    const bid =
      payload?.bestBid ?? payload?.BestBid ?? payload?.bid ?? payload?.Bid;
    const ask =
      payload?.bestAsk ?? payload?.BestAsk ?? payload?.ask ?? payload?.Ask;
    const last =
      payload?.lastPrice ??
      payload?.LastPrice ??
      payload?.last ??
      payload?.Last ??
      payload?.tradePrice ??
      payload?.TradePrice;

    const ts =
      payload?.timestamp ??
      payload?.Timestamp ??
      payload?.lastUpdated ??
      payload?.LastUpdated ??
      payload?.ts ??
      payload?.Ts ??
      payload?.time ??
      payload?.Time;

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
    // SignalR JSON protocol frames are delimited by 0x1e
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
        // ignore non-json parts
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

    // Prevent disconnects
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

    // ✅ Register actual handlers so SignalR doesn't warn + drop the event
    // NOTE: SignalR JS lowercases method names internally, so we register both.
    const handleGatewayQuote = async (payload: any) => {
      this.lastEventAtMs = Date.now();

      const merged = this.normalizeQuote(contractId, payload);

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

    // Optional: keep the raw frame hook for debugging other event names
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

              if (debugInvocations) {
                console.log("[projectx-market][invoke]", {
                  target: msg.target,
                  args: msg.arguments,
                });
              }
            }
          }

          return orig(data);
        };
      }
    } catch (e) {
      console.warn("[projectx-market] failed to hook onreceive", e);
    }

    // --- Subscribe ---
    console.log("[projectx-market] subscribing", { contractId, quotes, trades, depth });

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
