// worker/src/broker/projectx/startProjectXMarketFeed.ts
import { ProjectXMarketHub } from "./projectxMarketHub.js";
import { Candle15sAggregator } from "../../candles/candle15sAggregator.js";
import { makeHandleClosed15s } from "./handleClosed15s.js";

function toNum(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const lastPersistAtByInstrument = new Map<string, number>();
const PERSIST_EVERY_MS = 250;

const candle15s = new Candle15sAggregator();

export async function startProjectXMarketFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;
  status: any;

  instrument: { baseSymbol: string; contractId: string | null };

  getPrisma: () => any;
  emitSafe: (event: any) => Promise<void>;

  getUserTradingState: () => Promise<{ isPaused: boolean; isKillSwitched: boolean }>;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string; brokerAccountId: string }>;
  getStrategyEnabledForAccount: (p: { brokerName: string; externalAccountId: string }) => Promise<boolean>;

  getStrategySettingsForWorker: () => Promise<{
    sessions: { asia: boolean; london: boolean; ny: boolean };
    maxContracts?: number | null;
    maxOpenTrades?: number | null;
  }>;

  strategy: any;

  token: string;
  contractId: string;
}) {
  let lastLiveQuoteAtMs = 0;
  const rolloverOkLoggedRef = { value: false };

  const handleClosed15s = makeHandleClosed15s({
    env: params.env,
    DRY_RUN: params.DRY_RUN,
    broker: params.broker,
    instrument: params.instrument,
    getPrisma: params.getPrisma,
    emitSafe: params.emitSafe,
    getUserTradingState: params.getUserTradingState,
    getUserIdentityForWorker: params.getUserIdentityForWorker,
    getStrategySettingsForWorker: params.getStrategySettingsForWorker,
    getStrategyEnabledForAccount: params.getStrategyEnabledForAccount,
    strategy: params.strategy,
    status: params.status,
    rolloverOkLoggedRef,
  });

  const marketHub = new ProjectXMarketHub({
    token: params.token,
    contractId: params.contractId,
    raw: true,
    debugInvocations: true,
    onQuote: async (q) => {
      const tsMs = q.ts ? Date.parse(q.ts) : NaN;
      const ageMs = Number.isFinite(tsMs) ? Date.now() - tsMs : null;

      // ---- normalize numeric fields (ProjectX can send strings) ----
      const bid = toNum((q as any).bid);
      const ask = toNum((q as any).ask);
      const last = toNum((q as any).last);

      // lastPrice used for debugging / queries (prefer last, else mid, else bid/ask)
      const lastPrice =
        last != null ? last :
        (bid != null && ask != null) ? (bid + ask) / 2 :
        bid != null ? bid :
        ask != null ? ask :
        null;

      const LIVE_QUOTE_MAX_AGE_MS = 15_000;
      if (ageMs !== null && ageMs <= LIVE_QUOTE_MAX_AGE_MS) {
        lastLiveQuoteAtMs = Date.now();
      }

      // 1) Persist quote snapshot (THROTTLED)
      try {
        const instrumentKey = q.contractId;
        const now = Date.now();
        const lastPersist = lastPersistAtByInstrument.get(instrumentKey) ?? 0;

        if (now - lastPersist >= PERSIST_EVERY_MS) {
          lastPersistAtByInstrument.set(instrumentKey, now);

          const db = params.getPrisma();
          const ident = await params.getUserIdentityForWorker();

          await db.eventLog.create({
            data: {
              type: "market.quote",
              level: "info",
              message: "ProjectX quote",
              data: {
                clerkUserId: ident.clerkUserId,
                broker: "projectx",
                contractId: q.contractId,
                bid,
                ask,
                last,
                lastPrice,
                ts: q.ts ?? null,
              },
              userId: ident.userId,
              brokerAccountId: ident.brokerAccountId,
            },
          });
        }
      } catch (e) {
        console.error("[projectx-market] failed to persist quote", e);
      }

      // 2) Emit quote event
      await params.emitSafe({
        name: "broker.market.quote",
        ts: new Date().toISOString(),
        broker: "projectx",
        data: {
          contractId: q.contractId,
          bid,
          ask,
          last,
          lastPrice,
          ts: q.ts ?? null,
        },
      });

      console.log("[projectx-market] quote", { contractId: q.contractId, lastPrice, bid, ask });

      if (last == null && bid == null && ask == null) return;

      // 3) Build 15s candle from quote stream
      const closed = candle15s.ingest(
        {
          contractId: q.contractId,
          bid,
          ask,
          last,
          ts: q.ts ?? null,
        },
        Date.now()
      );

      if (closed) {
        if (process.env.DEBUG_CANDLES === "1") {
          console.log("[candles] 15s closed", {
            source: "rollover",
            t: closed.time,
            o: closed.open,
            h: closed.high,
            l: closed.low,
            c: closed.close,
            ticks: closed.ticks ?? null,
          });
        }
        await handleClosed15s({ source: "rollover", closed });
      }
    },
  });

  await marketHub.start();

  // --- quote stream watchdog ---
  try {
    const live = await marketHub.waitForLiveQuotes({
      minQuotes: 5,
      withinMs: 10_000,
    });

    const s = marketHub.getQuoteStats();

    if (live) {
      console.log(
        `[quotes] QUOTE_STREAM_OK count=${s.quoteCount} firstAt=${s.firstQuoteAtMs} lastAt=${s.lastQuoteAtMs}`
      );
    } else {
      console.warn(
        `[quotes] QUOTE_STREAM_NOT_LIVE count=${s.quoteCount} (snapshot only? market closed? connection issue)`
      );
    }
  } catch (e) {
    console.warn("[quotes] watchdog failed (non-fatal)", e);
  }

  // Weekend/quiet-market force-close (only if live quotes recently)
  setInterval(() => {
    void (async () => {
      try {
        const now = Date.now();
        const activeWindowMs = 30_000;

        if (!lastLiveQuoteAtMs || now - lastLiveQuoteAtMs > activeWindowMs) {
          return;
        }

        const forced = candle15s.forceCloseIfDue(now);
        if (!forced) return;

        if (process.env.DEBUG_CANDLES === "1") {
          console.log("[candles] 15s closed", {
            source: "forceClose",
            t: forced.time,
            o: forced.open,
            h: forced.high,
            l: forced.low,
            c: forced.close,
            ticks: forced.ticks ?? null,
          });
        }
        await handleClosed15s({ source: "forceClose", closed: forced });
      } catch (e) {
        console.error("[projectx-market] forceCloseIfDue failed", e);
      }
    })();
  }, 1000);

  console.log("[projectx-market] started", {
    accountId: params.status?.accountId ?? null,
    contractId: params.contractId,
    instrument: params.instrument,
  });

  // IMPORTANT:
  // Keep this function alive for the lifetime of the worker.
  // ProjectXMarketHub drives callbacks/events asynchronously, so if we return here,
  // startBrokerFeed() thinks the feed ended and restarts it in a loop.
  await new Promise<void>(() => {});
}
