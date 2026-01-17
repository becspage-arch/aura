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

  const handleGatewayQuote = async (...args: any[]) => {
    this.lastEventAtMs = Date.now();

    // SignalR passes multiple server args as separate parameters.
    // In our case, arg0 appears to be contractId string.
    if (raw) {
      console.log("[projectx-market] GatewayQuote args", {
        count: args.length,
        types: args.map((a) => typeof a),
        head: args.slice(0, 3),
      });
    }

    // If the server sends (contractId, payloadObj) or (contractId, bid, ask, last, ts...)
    // we want everything AFTER arg0 if arg0 is the contractId string.
    const payload =
      args.length === 1
        ? args[0]
        : typeof args[0] === "string"
        ? args.slice(1)
        : args;

    // If we still only got a string, it's not usable as a quote payload.
    if (typeof payload === "string") {
      if (raw) console.log("[projectx-market] quote(rawPayload:stringOnly)", payload);
      return;
    }

    if (raw) {
      console.log("[projectx-market] quote(rawPayload)", payload);
    }

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

    // Hook raw frames for debugging + to catch gatewayquote invocations
    try {
      const httpConn = (conn as any).connection;
      const hasOnReceive = httpConn && typeof httpConn.onreceive === "function";

      if (!hasOnReceive) {
        console.warn("[projectx-market] http connection.onreceive not available");
      } else {
        const orig = httpConn.onreceive.bind(httpConn);

        httpConn.onreceive = async (data: any) => {
          // ALWAYS let SignalR process the message first
          const ret = orig(data);

          try {
            const t = typeof data;
            const len =
              t === "string"
                ? data.length
                : data?.byteLength ?? data?.length ?? null;

            console.log("[projectx-market][onreceive]", { type: t, len });

            if (t === "string") {
              console.log(
                "[projectx-market][onreceive:string]",
                data.slice(0, 200)
              );
            }
          } catch {}

          try {
            const msgs = this.parseSignalRFrames(data);

            for (const msg of msgs) {
              if (raw) {
                console.log("[projectx-market] frame", msg);
              }

              // Invocation frame
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

                // Some feeds deliver the quote ONLY via invocation frames
                if (targetLc === "gatewayquote" || targetLc === "gatewayquotes") {
                  try {
                    // pass args through (unwrapPayload handles arrays)
                    await handleGatewayQuote(msg.arguments);
                  } catch (e) {
                    console.error(
                      "[projectx-market] gatewayquote frame handling failed",
                      e
                    );
                  }
                }
              }
            }
          } catch {
            // ignore parsing errors
          }

          return ret;
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
        console.log("[projectx-market] heartbeat", {
          contractId,
          lastEventAgeMs: ageMs,
        });
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
