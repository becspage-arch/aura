// src/broker/projectx/startProjectXMarketFeed.ts
import { ProjectXMarketHub } from "./projectxMarketHub.js";
import { Candle15sAggregator } from "../../candles/candle15sAggregator.js";
import { makeHandleClosed15s } from "./handleClosed15s.js";

const lastPersistAtByInstrument = new Map<string, number>();
const PERSIST_EVERY_MS = 250;

const candle15s = new Candle15sAggregator();

export async function startProjectXMarketFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;
  status: any;

  getPrisma: () => any;
  emitSafe: (event: any) => Promise<void>;

  getUserTradingState: () => Promise<{ isPaused: boolean; isKillSwitched: boolean }>;
  getUserIdentityForWorker: () => Promise<{ clerkUserId: string; userId: string }>;
  getStrategyEnabledForAccount: (p: { brokerName: string; externalAccountId: string }) => Promise<boolean>;

  strategy: any;

  token: string;
  contractId: string;
}) {
  // Gate forceClose so it only runs when we are actually seeing live quotes
  let lastLiveQuoteAtMs = 0;
  const rolloverOkLoggedRef = { value: false };

  const handleClosed15s = makeHandleClosed15s({
    env: params.env,
    DRY_RUN: params.DRY_RUN,
    broker: params.broker,
    getPrisma: params.getPrisma,
    emitSafe: params.emitSafe,
    getUserTradingState: params.getUserTradingState,
    getUserIdentityForWorker: params.getUserIdentityForWorker,
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
      // Used to gate forceClose so we never fabricate candles when the market is closed
      const tsMs = q.ts ? Date.parse(q.ts) : NaN;
      const ageMs = Number.isFinite(tsMs) ? Date.now() - tsMs : null;

      const LIVE_QUOTE_MAX_AGE_MS = 15_000;
      if (ageMs !== null && ageMs <= LIVE_QUOTE_MAX_AGE_MS) {
        lastLiveQuoteAtMs = Date.now();
      }

      // 1) Persist quote snapshot (THROTTLED)
      try {
        const instrumentKey = q.contractId;
        const now = Date.now();
        const last = lastPersistAtByInstrument.get(instrumentKey) ?? 0;

        if (now - last >= PERSIST_EVERY_MS) {
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
                bid: q.bid ?? null,
                ask: q.ask ?? null,
                last: q.last ?? null,
                ts: q.ts ?? null,
              },
              userId: ident.userId,
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
          bid: q.bid,
          ask: q.ask,
          last: q.last ?? null,
          ts: q.ts ?? null,
        },
      });

      // If we have no price, we can't build candles.
      if (q.last == null && q.bid == null && q.ask == null) return;

      // 3) Build 15s candle from quote stream
      const closed = candle15s.ingest(
        {
          contractId: q.contractId,
          bid: q.bid,
          ask: q.ask,
          last: q.last ?? null,
          ts: q.ts ?? null,
        },
        Date.now()
      );

      if (closed) {
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

        await handleClosed15s({ source: "forceClose", closed: forced });
      } catch (e) {
        console.error("[projectx-market] forceCloseIfDue failed", e);
      }
    })();
  }, 1000);

  console.log("[projectx-market] started", {
    accountId: params.status?.accountId ?? null,
    contractId: params.contractId,
  });
}
