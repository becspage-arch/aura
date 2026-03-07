// worker/src/broker/projectx/startProjectXMarketFeed.ts
import { ProjectXMarketHub } from "./projectxMarketHub.js";

export async function startProjectXMarketFeed(params: {
  env: { WORKER_NAME: string };

  broker: any;
  status: any;

  instrument: { baseSymbol: string; contractId: string | null };

  token: string;
  contractId: string;

  onQuote: (q: {
    contractId: string;
    bid?: number;
    ask?: number;
    last?: number;
    ts?: string;
  }) => Promise<void>;

  onForceCloseIfDue: () => Promise<void>;
}) {
  const marketHub = new ProjectXMarketHub({
    token: params.token,
    contractId: params.contractId,
    raw: true,
    debugInvocations: true,
    onQuote: params.onQuote,
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
    void params.onForceCloseIfDue().catch((e) => {
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