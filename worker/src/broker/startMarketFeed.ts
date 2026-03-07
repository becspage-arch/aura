// worker/src/broker/startMarketFeed.ts

import { runQuoteDrivenMarketPipeline } from "../market/runQuoteDrivenMarketPipeline.js";
import { startProjectXMarketFeed } from "./projectx/startProjectXMarketFeed.js";

export async function startMarketFeed(params: {
  env: { WORKER_NAME: string };
  DRY_RUN: boolean;

  broker: any;
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

  token?: string | null;
  contractId?: string | null;
}) {
  const pipeline = runQuoteDrivenMarketPipeline({
    env: params.env,
    DRY_RUN: params.DRY_RUN,
    broker: params.broker,
    brokerName: params.broker.name,
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

  if (params.broker.name === "projectx") {
    const token = String(params.token ?? "").trim();
    const contractId = String(params.contractId ?? "").trim();

    if (!token) {
      console.warn("[market] no token available, market feed not started", {
        broker: params.broker.name,
      });
      return;
    }

    if (!contractId) {
      console.warn("[market] contractId missing, market feed not started", {
        broker: params.broker.name,
        instrument: params.instrument,
      });
      return;
    }

    await startProjectXMarketFeed({
      env: params.env,
      broker: params.broker,
      status: params.status,
      instrument: params.instrument,
      token,
      contractId,
      onQuote: pipeline.onQuote,
      onForceCloseIfDue: pipeline.forceCloseIfDue,
    });

    return;
  }

  console.warn("[market] no market feed starter for broker", {
    broker: params.broker.name,
  });

  await new Promise<void>(() => {});
}