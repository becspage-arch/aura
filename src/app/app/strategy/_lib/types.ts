export type EntryType = "market" | "limit";

export type StrategySettings = {
  mode: "paper" | "live";
  preset: "coreplus315";

  symbols: string[];
  sessions: { asia: boolean; london: boolean; ny: boolean };

  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: EntryType;

  sizing: { mode: "risk_based" | "fixed_contracts"; fixedContracts: number };

  coreplus315: {
    maxStopoutsPerSession: number;
    cooldownMinutesAfterStopout: number;
    maxTradesPerSession: number;
    requireBodyDominancePct: number;
    emaFilterEnabled: boolean;
    entryTiming: "immediate" | "wait_confirm";
  };

  execution: {
    allowMultipleTradesPerSession: boolean;
    allowTradeStacking: boolean;
    requireFlatBeforeNewEntry: boolean;
  };

  safety: {
    maxDailyLossUsd: number;
    maxConsecutiveLosses: number;
    autoPauseEnabled: boolean;
  };
};

export type StrategyGetResponse = { ok: true; strategySettings: StrategySettings };
export type StrategyPostResponse = { ok: true; strategySettings: StrategySettings };
