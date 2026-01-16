import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";

type ProjectXMarketHubOpts = {
  token: string;
  contractId: string;

  // Optional hooks so the worker can forward data into Aura events
  onQuote?: (q: {
    contractId: string;
    bid?: number;
    ask?: number;
    last?: number;
    ts?: string;
  }) => Promise<void> | void;

  // Feature flags (defaults)
  quotes?: boolean;
  trades?: boolean;
  depth?: boolean;

  // If true, dumps raw incoming SignalR frames (very noisy)
  raw?: boolean;
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

  async start(): Promise<void> {
    const {
      token,
      contractId,
      onQuote,
      quotes = true,
      trades = false,
      depth = false,
      raw = false,
    } = this.opts;

    // ProjectX docs use token in query string for SignalR
    const url = `https://rtc.topstepx.com/hubs/market?access_token=${encodeURIComponent(
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

    // Prevent "Server timeout elapsed..." disconnects
    conn.keepAliveIntervalInMilliseconds = 15_000;
    conn.serverTimeoutInMilliseconds = 120_000;

    this.conn = conn;

    console.log("[projectx-market] config", {
      contractId,
      quotes,
      trades,
      depth,
      raw,
    });

    // Optional diagnostic raw frame logging
    if (raw) {
      const httpConn = (conn as any).connection;
      if (httpConn && typeof httpConn.onreceive === "function") {
        const origOnReceive = httpConn.onreceive.bind(httpConn);
        httpConn.onreceive = (data: any) => {
          try {
            const s =
              typeof data === "string"
                ? data
                : Buffer.isBuffer(data)
                ? data.toString("utf8")
                : JSON.stringify(data);
            if (typeof s === "string") console.log("[projectx-market] incoming", s);
          } catch {
            // ignore
          }
          return origOnReceive(data);
        };
      } else if (httpConn) {
        console.warn(
          "[projectx-market] raw hook not available (no connection.onreceive)"
        );
      } else {
        console.warn("[projectx-market] raw hook not available (no connection)");
      }
    }

    // QUOTES
    if (quotes) {
      conn.on("GatewayQuote", async (a: any, b?: any) => {
        this.lastEventAtMs = Date.now();

        // ProjectX sometimes sends (contractId, payload) and sometimes (payload)
        const cid = typeof a === "string" ? a : contractId;
        const payload = typeof a === "string" ? b : a;

        const bid =
          payload?.bid ?? payload?.Bid ?? payload?.bestBid ?? payload?.BestBid;
        const ask =
          payload?.ask ?? payload?.Ask ?? payload?.bestAsk ?? payload?.BestAsk;
        const last =
          payload?.last ??
          payload?.Last ??
          payload?.tradePrice ??
          payload?.TradePrice;

        const ts =
          payload?.ts ??
          payload?.Ts ??
          payload?.timestamp ??
          payload?.Timestamp ??
          payload?.time ??
          payload?.Time;

        // Merge partial updates (keep last known values)
        if (typeof bid === "number") this.lastBid = bid;
        if (typeof ask === "number") this.lastAsk = ask;
        if (typeof last === "number") this.lastLast = last;
        if (typeof ts === "string") this.lastTs = ts;

        const merged = {
          contractId: cid,
          bid: this.lastBid,
          ask: this.lastAsk,
          last: this.lastLast,
          ts: this.lastTs,
        };

        console.log("[projectx-market] quote", merged);

        // Call hook if provided (non-fatal)
        if (onQuote) {
          try {
            await onQuote(merged);
          } catch (e) {
            console.error("[projectx-market] onQuote handler failed (non-fatal)", e);
          }
        }
      });
    }

    // TRADES
    if (trades) {
      conn.on("GatewayTrade", (a: any, b?: any) => {
        this.lastEventAtMs = Date.now();
        const cid = typeof a === "string" ? a : contractId;
        const payload = typeof a === "string" ? b : a;
        console.log("[projectx-market] trade", { contractId: cid, data: payload });
      });
    }

    // DEPTH
    if (depth) {
      conn.on("GatewayDepth", (a: any, b?: any) => {
        this.lastEventAtMs = Date.now();
        const cid = typeof a === "string" ? a : contractId;
        const payload = typeof a === "string" ? b : a;
        console.log("[projectx-market] depth", { contractId: cid, data: payload });
      });
    }

    const subscribe = async () => {
      console.log("[projectx-market] subscribing", { contractId, quotes, trades, depth });

      if (quotes) {
        try {
          await conn.invoke("SubscribeContractQuotes", contractId);
          console.log("[projectx-market] subscribed quotes", { contractId });
        } catch (e) {
          console.error("[projectx-market] SubscribeContractQuotes FAILED", e);
          throw e;
        }
      }

      if (trades) {
        try {
          await conn.invoke("SubscribeContractTrades", contractId);
          console.log("[projectx-market] subscribed trades", { contractId });
        } catch (e) {
          console.error("[projectx-market] SubscribeContractTrades FAILED", e);
          throw e;
        }
      }

      if (depth) {
        try {
          await conn.invoke("SubscribeContractMarketDepth", contractId);
          console.log("[projectx-market] subscribed depth", { contractId });
        } catch (e) {
          console.error("[projectx-market] SubscribeContractMarketDepth FAILED", e);
          throw e;
        }
      }

      console.log("[projectx-market] subscribed", { contractId });
    };

    conn.onreconnected(async () => {
      console.log("[projectx-market] reconnected");
      try {
        await subscribe();
      } catch (e) {
        console.error("[projectx-market] resubscribe failed", e);
      }
    });

    conn.onclose((err) => {
      console.warn("[projectx-market] closed", err ? err.message : null);
    });

    console.log("[projectx-market] starting connection...");
      // DEBUG: log every incoming hub invocation so we can see the REAL event names.
      // This is the only "wildcard" style hook that actually works with SignalR.
      try {
        const proto = (conn as any).connection?.features?.inherentKeepAlive
          ? null
          : (conn as any).protocol;

        const protocol = (conn as any).protocol;
        if (protocol && typeof protocol.parseMessages === "function") {
          const originalParse = protocol.parseMessages.bind(protocol);

          protocol.parseMessages = (input: any, logger: any) => {
            const messages = originalParse(input, logger);
            for (const m of messages) {
              // Invocation messages contain the target (method/event name) + arguments
              if (m?.type === 1 /* Invocation */) {
                console.log("[projectx-market][debug] invocation", {
                  target: m.target,
                  arguments: m.arguments,
                });
              } else {
                console.log("[projectx-market][debug] message", m);
              }
            }
            return messages;
          };
        } else {
          console.warn("[projectx-market][debug] protocol.parseMessages not available");
        }
      } catch (e) {
        console.warn("[projectx-market][debug] failed to hook protocol.parseMessages", e);
      }

    try {
      await conn.start();
      console.log("[projectx-market] connected");
    } catch (e) {
      console.error("[projectx-market] start failed", e);
      throw e;
    }

    await subscribe();

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
