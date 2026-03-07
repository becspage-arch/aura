// worker/src/market/runQuoteDrivenMarketPipeline.ts

import { Candle15sAggregator } from "../candles/candle15sAggregator.js";
import { makeHandleClosed15s } from "../execution/handleClosed15s.js";

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

export function runQuoteDrivenMarketPipeline(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;
  brokerName: string;
  status: any;

  instrument: { baseSymbol: string; contractId: string | null };

  getPrisma: () => any;
  emitSafe: (event: any) => Promise<void>;

  getUserTradingState: () => Promise<{ isPaused: boolean; isKillSwitched: boolean }>;
  getUserIdentityForWorker: () => Promise<{
    clerkUserId: string;
    userId: string;
    brokerAccountId: string;
  }>;
  getStrategyEnabledForAccount: (p: {
    brokerName: string;
    externalAccountId: string;
  }) => Promise<boolean>;

  getStrategySettingsForWorker: () => Promise<{
    sessions: { asia: boolean; london: boolean; ny: boolean };
    maxContracts?: number | null;
    maxOpenTrades?: number | null;
  }>;

  strategy: any;
}) {
  const candle15s = new Candle15sAggregator();
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

  async function onQuote(q: {
    contractId: string;
    bid?: number;
    ask?: number;
    last?: number;
    ts?: string;
  }) {
    const tsMs = q.ts ? Date.parse(q.ts) : NaN;
    const ageMs = Number.isFinite(tsMs) ? Date.now() - tsMs : null;

    const bid = toNum((q as any).bid);
    const ask = toNum((q as any).ask);
    const last = toNum((q as any).last);

    const lastPrice =
      last != null
        ? last
        : bid != null && ask != null
          ? (bid + ask) / 2
          : bid != null
            ? bid
            : ask != null
              ? ask
              : null;

    const LIVE_QUOTE_MAX_AGE_MS = 15_000;
    if (ageMs !== null && ageMs <= LIVE_QUOTE_MAX_AGE_MS) {
      lastLiveQuoteAtMs = Date.now();
    }

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
            message: `${params.brokerName} quote`,
            data: {
              clerkUserId: ident.clerkUserId,
              broker: params.brokerName,
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
      console.error(`[${params.brokerName}-market] failed to persist quote`, e);
    }

    await params.emitSafe({
      name: "broker.market.quote",
      ts: new Date().toISOString(),
      broker: params.brokerName,
      data: {
        contractId: q.contractId,
        bid,
        ask,
        last,
        lastPrice,
        ts: q.ts ?? null,
      },
    });

    console.log(`[${params.brokerName}-market] quote`, {
      contractId: q.contractId,
      lastPrice,
      bid,
      ask,
    });

    if (last == null && bid == null && ask == null) return;

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
          t0: closed.data.t0,
          o: closed.data.o,
          h: closed.data.h,
          l: closed.data.l,
          c: closed.data.c,
          ticks: closed.data.ticks ?? null,
        });
      }

      await handleClosed15s({ source: "rollover", closed });
    }
  }

  async function forceCloseIfDue() {
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
        t0: forced.data.t0,
        o: forced.data.o,
        h: forced.data.h,
        l: forced.data.l,
        c: forced.data.c,
        ticks: forced.data.ticks ?? null,
      });
    }

    await handleClosed15s({ source: "forceClose", closed: forced });
  }

  return {
    onQuote,
    forceCloseIfDue,
  };
}