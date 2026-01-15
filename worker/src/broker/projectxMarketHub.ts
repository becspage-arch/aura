import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";

type ProjectXMarketHubOpts = {
  token: string;
  contractId: string;
};

export class ProjectXMarketHub {
  private conn: HubConnection | null = null;
  private lastEventAtMs = 0;
  private heartbeatTimer: NodeJS.Timer | null = null;

  constructor(private opts: ProjectXMarketHubOpts) {}

  async start(): Promise<void> {
    const { token, contractId } = this.opts;

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
      .configureLogging(LogLevel.Warning)
      .build();

    // ✅ Prevent "Server timeout elapsed..." disconnects
    // - keepAliveInterval: how often *client* sends a ping to server
    // - serverTimeout: how long client waits with no messages (incl. pings) before disconnecting
    conn.keepAliveIntervalInMilliseconds = 15_000;
    conn.serverTimeoutInMilliseconds = 120_000;

    this.conn = conn;

    // RAW frame logger (underlying transport)
    const underlying = (conn as any).connection;
    if (underlying) {
      underlying.onreceive = (data: any) => {
        console.log("[projectx-market] raw", data);
      };
    }

    conn.on("GatewayQuote", (a: any, b?: any) => {
      this.lastEventAtMs = Date.now();
      const cid = typeof a === "string" ? a : contractId;
      const data = typeof a === "string" ? b : a;
      console.log("[projectx-market] quote", { contractId: cid, data });
    });

    conn.on("GatewayTrade", (a: any, b?: any) => {
      this.lastEventAtMs = Date.now();
      const cid = typeof a === "string" ? a : contractId;
      const data = typeof a === "string" ? b : a;
      console.log("[projectx-market] trade", { contractId: cid, data });
    });

    conn.on("GatewayDepth", (a: any, b?: any) => {
      this.lastEventAtMs = Date.now();
      const cid = typeof a === "string" ? a : contractId;
      const data = typeof a === "string" ? b : a;
      console.log("[projectx-market] depth", { contractId: cid, data });
    });

    const subscribe = async () => {
      await conn.invoke("SubscribeContractQuotes", contractId);
      await conn.invoke("SubscribeContractTrades", contractId);
      await conn.invoke("SubscribeContractMarketDepth", contractId);
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

    try {
      await conn.start();
      console.log("[projectx-market] connected");
    } catch (e) {
      console.error("[projectx-market] start failed", e);
      throw e;
    }

    try {
      await subscribe();
    } catch (e) {
      console.error("[projectx-market] subscribe failed", e);
      throw e;
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        const ageMs = this.lastEventAtMs
          ? Date.now() - this.lastEventAtMs
          : null;

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
