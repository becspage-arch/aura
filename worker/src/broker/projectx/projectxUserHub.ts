// worker/src/broker/projectx/projectxUserHub.ts
import {
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
  type HubConnection,
} from "@microsoft/signalr";

type ProjectXUserHubOpts = {
  token: string;
  accountId?: number | null;

  onOrder?: (payload: any) => Promise<void> | void;
  onTrade?: (payload: any) => Promise<void> | void;
  onPosition?: (payload: any) => Promise<void> | void;

  debugInvocations?: boolean;
  rtcUrl?: string;
};

export class ProjectXUserHub {
  private conn: HubConnection | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastEventAtMs = 0;

  constructor(private opts: ProjectXUserHubOpts) {}

  private unwrap(payload: any): any {
    const p = Array.isArray(payload) ? payload[0] : payload;
    if (!p) return p;
    if (p.data && typeof p.data === "object") return p.data;
    if (p.payload && typeof p.payload === "object") return p.payload;
    if (p.trade && typeof p.trade === "object") return p.trade;
    if (p.order && typeof p.order === "object") return p.order;
    if (p.position && typeof p.position === "object") return p.position;
    return p;
  }

  async start(): Promise<void> {
    const {
      token,
      debugInvocations = false,
      rtcUrl,
      onOrder,
      onTrade,
      onPosition,
      accountId,
    } = this.opts;

    const hubBase = (rtcUrl || process.env.PROJECTX_RTC_URL || "").trim();
    const base = hubBase || "https://rtc.topstepx.com";
    const url = `${base.replace(/\/$/, "")}/hubs/user?access_token=${encodeURIComponent(
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

    console.log("[projectx-user] starting connection...", {
      urlBase: base,
      accountId: accountId ?? null,
    });

    await conn.start();
    console.log("[projectx-user] connected");

    const wrap =
      (name: "GatewayUserOrder" | "GatewayUserTrade" | "GatewayUserPosition", fn?: (p: any) => Promise<void> | void) =>
      async (...args: any[]) => {
        this.lastEventAtMs = Date.now();
        const payload = args.length >= 1 ? args[args.length - 1] : null;
        const unwrapped = this.unwrap(payload);

        if (debugInvocations) {
          console.log(`[projectx-user] ${name} recv`, {
            at: new Date().toISOString(),
            argsCount: args.length,
            headTypes: args.slice(0, 3).map((a) => typeof a),
            head: args.slice(0, 2),
          });
          console.log(`[projectx-user] ${name} payload`, unwrapped);
        }

        if (!fn) return;

        try {
          await fn(unwrapped);
        } catch (e) {
          console.error(`[projectx-user] ${name} handler failed (non-fatal)`, e);
        }
      };

    // Wire handlers (case variations)
    conn.on("GatewayUserOrder", wrap("GatewayUserOrder", onOrder));
    conn.on("gatewayuserorder", wrap("GatewayUserOrder", onOrder));

    conn.on("GatewayUserTrade", wrap("GatewayUserTrade", onTrade));
    conn.on("gatewayusertrade", wrap("GatewayUserTrade", onTrade));

    conn.on("GatewayUserPosition", wrap("GatewayUserPosition", onPosition));
    conn.on("gatewayuserposition", wrap("GatewayUserPosition", onPosition));

    // Subscribe to account-scoped streams (some implementations require this)
    // If your docs show different method names, we’ll adjust to match.
    if (typeof accountId === "number" && Number.isFinite(accountId)) {
      try {
        const res = await conn.invoke("SubscribeUserAccount", accountId);
        console.log("[projectx-user] subscribed account", { accountId, res });
      } catch (e) {
        console.warn("[projectx-user] SubscribeUserAccount failed (may be optional)", {
          accountId,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        const ageMs = this.lastEventAtMs ? Date.now() - this.lastEventAtMs : null;
        console.log("[projectx-user] heartbeat", { lastEventAgeMs: ageMs });
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
