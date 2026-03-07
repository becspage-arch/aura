// worker/src/broker/projectx/startProjectXMarketFeed.ts
import { ProjectXMarketHub } from "./projectxMarketHub.js";
import { runQuoteDrivenMarketPipeline } from "../../market/runQuoteDrivenMarketPipeline.js";

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
  const pipeline = runQuoteDrivenMarketPipeline({
    env: params.env,
    DRY_RUN: params.DRY_RUN,
    broker: params.broker,
    brokerName: "projectx",
    status: params.status,
    instrument: params.instrument,
    getPrisma: params.getPrisma,
    emitSafe: params.emitSafe,
    getUserTradingState: params.getUserTradingState,
    getUserIdentityForWorker: params.getUserIdentityForWorker,
    getStrategyEnabledForAccount: params.getStrategyEnabledForAccount,
    getStrategySettingsForWorker: params.getStrategySettingsForWorker,
    strategy: params.strategy,
  });

  const marketHub = new ProjectXMarketHub({
    token: params.token,
    contractId: params.contractId,
    raw: true,
    debugInvocations: true,
    onQuote: pipeline.onQuote,
  });

  await marketHub.start();

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

  setInterval(() => {
    void pipeline.forceCloseIfDue().catch((e) => {
      console.error("[projectx-market] forceCloseIfDue failed", e);
    });
  }, 1000);

  console.log("[projectx-market] started", {
    accountId: params.status?.accountId ?? null,
    contractId: params.contractId,
    instrument: params.instrument,
  });

  await new Promise<void>(() => {});
}