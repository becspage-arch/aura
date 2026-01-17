// worker/scripts/verifyProjectXLive60s.ts
import "dotenv/config";
import { ProjectXBrokerAdapter } from "../src/broker/ProjectXBrokerAdapter.js";
import { ProjectXMarketHub } from "../src/broker/projectxMarketHub.js";
import { Candle15sAggregator } from "../src/candles/candle15sAggregator.js";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const contractId = (process.env.PROJECTX_CONTRACT_ID || "").trim();
  if (!contractId) throw new Error("PROJECTX_CONTRACT_ID missing");

  const adapter = new ProjectXBrokerAdapter();

  // Auth + warmup are safe on weekends (they hit REST endpoints only)
  await adapter.connect();
  await adapter.authorize();
  await adapter.warmup();
  adapter.startKeepAlive();

  const token = adapter.getAuthToken();
  if (!token) throw new Error("No ProjectX token after authorize");

  const agg = new Candle15sAggregator();

  let quoteCount = 0;
  let staleIgnored = 0;
  let candleClosed = 0;
  let candleForceClosed = 0;
  let lastQuoteAt: number | null = null;

  // Use a shorter stale window for the verifier so it’s obvious when timestamps are old
  const hub = new ProjectXMarketHub({
    token,
    contractId,
    maxQuoteAgeMs: 10_000,
    onQuote: (q) => {
      quoteCount += 1;
      lastQuoteAt = Date.now();

      const ev = agg.ingest(
        {
          contractId: q.contractId,
          bid: q.bid ?? null,
          ask: q.ask ?? null,
          last: q.last ?? null,
          ts: q.ts ?? null,
        },
        Date.now()
      );

      if (ev) {
        candleClosed += 1;
        // The aggregator logs the reason; we track forceClose by sniffing ticks==0 in the *new* candle
        // (forceClose opens next candle with ticks=0)
      }
    },
  });

  // Monkey-patch: count stale ignores by watching stdout line patterns is messy
  // Instead: temporarily set raw=true and rely on hub logs, OR just trust the hub’s “stale quote - ignoring” logs.
  // We’ll measure “silence” via lastQuoteAt below.
  await hub.start();

  console.log("[verify] running 60s window...");
  const startedAt = Date.now();

  // Also run forceClose checks every second so we can see if it’s doing anything
  const forceTimer = setInterval(() => {
    const ev = agg.forceCloseIfDue(Date.now());
    if (ev) {
      candleForceClosed += 1;
    }
  }, 1000);

  await sleep(60_000);

  clearInterval(forceTimer);
  await hub.stop();
  await adapter.disconnect();

  const elapsedMs = Date.now() - startedAt;

  console.log("[verify] summary", {
    contractId,
    elapsedSec: Math.round(elapsedMs / 1000),
    quoteCount,
    approxQuotesPerMin: Math.round((quoteCount / elapsedMs) * 60_000),
    lastQuoteAgeMs: lastQuoteAt ? Date.now() - lastQuoteAt : null,
    candleClosed,
    candleForceClosed,
    notes:
      "When market is OPEN you expect quoteCount >> 0 and candleForceClosed should be 0 (or near 0). When CLOSED you expect quoteCount=0 and candleForceClosed may be >0 depending on how your worker calls forceClose.",
  });
}

main().catch((e) => {
  console.error("[verify] failed", e);
  process.exitCode = 1;
});
