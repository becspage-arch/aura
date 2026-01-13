"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
  type LogicalRange,
} from "lightweight-charts";
import type { Timeframe } from "@/lib/time/timeframes";
import { floorToTf, TF_SECONDS } from "@/lib/time/timeframes";
import type { Candle } from "@/lib/charts/types";
import type { AuraRealtimeEvent, CandleClosedData } from "@/lib/realtime/events";
import { useAuraStream } from "@/lib/realtime/useAuraStream";
import type { ChartMarker } from "@/lib/charts/markers";
import { to15sBucket } from "@/lib/charts/markerTime";

type Props = {
  symbol: string;
  initialTf?: Timeframe;
  channelName?: string | null;
};

type ApiResponse = {
  symbol: string;
  tf: Timeframe;
  candles: Candle[];
  nextTo: number | null;
};

function toSeries(c: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function mergeClosedCandle(prev: Candle[], candle: Candle): Candle[] {
  if (!prev.length) return [candle];
  const last = prev[prev.length - 1];

  if (last.time === candle.time) {
    const next = prev.slice(0, -1);
    next.push(candle);
    return next;
  }
  if (candle.time > last.time) return [...prev, candle];

  const idx = prev.findIndex((c) => c.time === candle.time);
  if (idx >= 0) {
    const next = prev.slice();
    next[idx] = candle;
    return next;
  }

  const next = prev.slice();
  let insertAt = next.findIndex((c) => c.time > candle.time);
  if (insertAt === -1) insertAt = next.length;
  next.splice(insertAt, 0, candle);
  return next;
}

function upsertMarker(list: ChartMarker[], m: ChartMarker): ChartMarker[] {
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const next = list.slice();
    next[idx] = m;
    return next;
  }
  return [...list, m];
}

export function TradingChart({ symbol, initialTf = "15s", channelName }: Props) {
  const instanceIdRef = useRef(Math.random().toString(16).slice(2));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const [tf, setTf] = useState<Timeframe>(initialTf);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest tf in a ref so chart subscriptions never go stale
  const tfRef = useRef<Timeframe>(initialTf);
  useEffect(() => {
    tfRef.current = tf;
  }, [tf]);

  const fetchSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const cacheRef = useRef<Record<Timeframe, Candle[]>>({
    "15s": [],
    "3m": [],
  });

  // Server cursor for older history (if implemented by API)
  const nextToRef = useRef<Record<Timeframe, number | null>>({
    "15s": null,
    "3m": null,
  });

  // If the API gets stuck returning the same cursor + no growth, stop spamming.
  const exhaustedCursorRef = useRef<Record<Timeframe, number | null>>({
    "15s": null,
    "3m": null,
  });

  // Marker state (keep as state for rendering)
  const [markers, setMarkers] = useState<ChartMarker[]>([]);

  // Computed screen positions for markers (state for render)
  const [markerPositions, setMarkerPositions] = useState<Array<ChartMarker & { x: number }>>([]);

  // DEBUG: show how many markers are present vs actually drawn
  const [debugMarkerStats, setDebugMarkerStats] = useState({ total: 0, shown: 0 });

  // DEBUG: shows paging behavior + cache times
  const [debugPaging, setDebugPaging] = useState({
    triggers: 0,
    loads: 0,
    lastOlderCount: 0, // raw candles returned from API (not filtered)
    grew: 0, // 1 if cache grew, 0 if not
    cursor: null as number | null,
    cacheLen: 0,
    oldest: null as number | null,
    newest: null as number | null,
  });

  const pagingDebugRef = useRef({
    triggers: 0,
    loads: 0,
    lastOlderCount: 0,
    grew: 0,
    cursor: null as number | null,
    cacheLen: 0,
    oldest: null as number | null,
    newest: null as number | null,
  });

  const bumpPagingDebug = (patch: Partial<typeof pagingDebugRef.current>) => {
    pagingDebugRef.current = { ...pagingDebugRef.current, ...patch };
    setDebugPaging(pagingDebugRef.current);
  };

  // Keep latest recompute function for chart callbacks (prevents stale closure bug)
  const recomputeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    console.log(`[TradingChart ${instanceIdRef.current}] MOUNT`, { symbol });
    return () => {
      console.log(`[TradingChart ${instanceIdRef.current}] UNMOUNT`, { symbol });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recomputeMarkerPositions = useCallback(() => {
    if (!chartRef.current || !overlayRef.current) return;

    const ts = chartRef.current.timeScale();
    const bucket = TF_SECONDS[tf];

    const positioned: Array<ChartMarker & { x: number }> = [];
    for (const m of markers) {
      if (m.symbol !== symbol) continue;

      const t = tf === "15s" ? m.time : Math.floor(m.time / bucket) * bucket;
      const x = ts.timeToCoordinate(t as UTCTimestamp);
      if (x == null || Number.isNaN(x)) continue;

      positioned.push({ ...m, x });
    }

    setMarkerPositions(positioned);

    const total = markers.filter((m) => m.symbol === symbol).length;
    setDebugMarkerStats({ total, shown: positioned.length });
  }, [markers, symbol, tf]);

  useEffect(() => {
    recomputeRef.current = recomputeMarkerPositions;
  }, [recomputeMarkerPositions]);

  const updateCacheDebugForTf = useCallback((nextTf: Timeframe) => {
    const arr = cacheRef.current[nextTf] ?? [];
    const oldest = arr.length ? arr[0].time : null;
    const newest = arr.length ? arr[arr.length - 1].time : null;

    bumpPagingDebug({
      cacheLen: arr.length,
      oldest,
      newest,
      cursor: nextToRef.current[nextTf],
    });
  }, []);

  const fetchCandles = useCallback(
    async (nextTf: Timeframe) => {
      if (!seriesRef.current) return;

      setIsLoading(true);
      setError(null);

      fetchSeqRef.current += 1;
      const seq = fetchSeqRef.current;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const cached = cacheRef.current[nextTf];
        seriesRef.current.setData(cached.map(toSeries));

        const to = floorToTf(Math.floor(Date.now() / 1000), nextTf);
        const url = `/api/charts/candles?symbol=${encodeURIComponent(symbol)}&tf=${nextTf}&to=${to}&limit=800`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`Failed to load candles (${res.status})`);

        const json = (await res.json()) as ApiResponse;
        if (seq !== fetchSeqRef.current) return;

        const candles = Array.isArray(json.candles) ? json.candles : [];
        cacheRef.current[nextTf] = candles;

        nextToRef.current[nextTf] = json.nextTo ?? null;
        exhaustedCursorRef.current[nextTf] = null; // clear stuck state after full reload

        seriesRef.current.setData(candles.map(toSeries));
        chartRef.current?.timeScale().fitContent();

        updateCacheDebugForTf(nextTf);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            recomputeRef.current?.();
          });
        });
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Unknown error");
      } finally {
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    },
    [symbol, updateCacheDebugForTf]
  );

  // Pagination refs
  const isPagingRef = useRef(false);

  // Queue-one-more-page mechanism (prevents blank strip when user drags faster than fetch)
  const pendingPageRef = useRef(false);
  const lastRangeFromRef = useRef<number | null>(null);

  // Reset cursors + debug when symbol changes
  useEffect(() => {
    nextToRef.current["15s"] = null;
    nextToRef.current["3m"] = null;
    exhaustedCursorRef.current["15s"] = null;
    exhaustedCursorRef.current["3m"] = null;

    isPagingRef.current = false;
    pagingCooldownAtRef.current = 0;
    pendingPageRef.current = false;
    lastRangeFromRef.current = null;

    pagingDebugRef.current = {
      triggers: 0,
      loads: 0,
      lastOlderCount: 0,
      grew: 0,
      cursor: null,
      cacheLen: 0,
      oldest: null,
      newest: null,
    };
    setDebugPaging(pagingDebugRef.current);
  }, [symbol]);

  const requestOlderPage = useCallback(
    async (nextTf: Timeframe, toParam: number) => {
      const url = `/api/charts/candles?symbol=${encodeURIComponent(symbol)}&tf=${nextTf}&to=${toParam}&limit=800`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as ApiResponse;
      return json;
    },
    [symbol]
  );

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const loadOlderCandles = useCallback(
    async (nextTf: Timeframe) => {
      if (!seriesRef.current) return;
      if (!chartRef.current) return;
      if (isPagingRef.current) return;

      const existing = cacheRef.current[nextTf] ?? [];
      if (!existing.length) return;

      // If we previously detected a stuck cursor for this TF, stop.
      const exhaustedCursor = exhaustedCursorRef.current[nextTf];
      if (exhaustedCursor != null && exhaustedCursor === nextToRef.current[nextTf]) return;

      isPagingRef.current = true;

      try {
        const oldestTime = existing[0].time;
        const beforeLen = existing.length;
        const beforeCursor = nextToRef.current[nextTf];

        // Prefer server cursor if available, else fall back to inclusive oldestTime, then oldestTime - 1.
        let json: ApiResponse | null = null;

        if (beforeCursor != null) {
          json = await requestOlderPage(nextTf, beforeCursor);
        } else {
          json = await requestOlderPage(nextTf, oldestTime);
        }

        const raw1 = Array.isArray(json?.candles) ? (json!.candles as Candle[]) : [];
        let raw = raw1;

        // Update cursor from server
        nextToRef.current[nextTf] = json?.nextTo ?? null;

        // If no cursor and we got nothing useful, try the exclusive fallback
        if (beforeCursor == null && raw.length === 0) {
          const json2 = await requestOlderPage(nextTf, oldestTime - 1);
          const raw2 = Array.isArray(json2?.candles) ? (json2!.candles as Candle[]) : [];
          raw = raw2;
          nextToRef.current[nextTf] = json2?.nextTo ?? nextToRef.current[nextTf];
        }

        bumpPagingDebug({
          loads: pagingDebugRef.current.loads + 1,
          lastOlderCount: raw.length,
          cursor: nextToRef.current[nextTf],
        });

        if (!raw.length) {
          if (nextToRef.current[nextTf] === beforeCursor) {
            exhaustedCursorRef.current[nextTf] = beforeCursor ?? null;
          }
          updateCacheDebugForTf(nextTf);
          bumpPagingDebug({ grew: 0 });
          return;
        }

        // Merge: raw + existing, dedupe by time
        const map = new Map<number, Candle>();
        for (const c of raw) map.set(c.time, c);
        for (const c of existing) map.set(c.time, c);

        const merged = Array.from(map.values()).sort((a, b) => a.time - b.time);
        const afterLen = merged.length;
        const grew = afterLen > beforeLen ? 1 : 0;

        if (!grew && nextToRef.current[nextTf] === beforeCursor) {
          exhaustedCursorRef.current[nextTf] = beforeCursor ?? null;
          updateCacheDebugForTf(nextTf);
          bumpPagingDebug({ grew: 0 });
          return;
        }

        // --- NO-JUMP FIX (deferred + clamped) ---
        const ts = chartRef.current.timeScale();
        const currentRange = ts.getVisibleLogicalRange();
        const addedBars = merged.length - beforeLen;

        cacheRef.current[nextTf] = merged;
        seriesRef.current.setData(merged.map(toSeries));

        // Defer range shift to next frame so the chart rebuilds its logical indices first.
        if (currentRange && addedBars > 0) {
          requestAnimationFrame(() => {
            if (!chartRef.current) return;
            const ts2 = chartRef.current.timeScale();

            const maxIdx = Math.max(0, merged.length - 1);

            const nextFrom = clamp(currentRange.from + addedBars, 0, maxIdx);
            const nextTo = clamp(currentRange.to + addedBars, 0, maxIdx);

            ts2.setVisibleLogicalRange({
              from: Math.min(nextFrom, nextTo),
              to: Math.max(nextFrom, nextTo),
            });
          });
        }

        updateCacheDebugForTf(nextTf);
        bumpPagingDebug({ grew });

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            recomputeRef.current?.();
          });
        });
      } finally {
        isPagingRef.current = false;

        // ✅ If user dragged super fast and we queued another page, run it immediately
        if (pendingPageRef.current) {
          pendingPageRef.current = false;

          const from = lastRangeFromRef.current;
          if (from != null && from <= leftEdgeThresholdBars) {
            void Promise.resolve(loadOlderRef.current(tfRef.current)).catch((err) => {
              console.error("queued loadOlderCandles failed", err);
            });
          }
        }
      }
    },
    [requestOlderPage, updateCacheDebugForTf]
  );

  const loadOlderRef = useRef<(nextTf: Timeframe) => Promise<void> | void>(() => {});
  useEffect(() => {
    loadOlderRef.current = loadOlderCandles;
  }, [loadOlderCandles]);

  // ✅ Recommended settings for smoothness
  // - trigger earlier so we load before the user hits the wall
  // - shorter cooldown so fast dragging still pages
  const pagingCooldownAtRef = useRef(0);
  const pagingCooldownMs = 350;
  const leftEdgeThresholdBars = 300;

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    if (chartRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 520,
      width: containerRef.current.clientWidth,
      layout: { background: { color: "transparent" }, textColor: "#9CA3AF" },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: true },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: 1 },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    const onRange = () => {
      recomputeRef.current?.();
    };
    chart.timeScale().subscribeVisibleTimeRangeChange(onRange);

    const onLogicalRange = (range: LogicalRange | null) => {
      if (!range) return;

      // record latest position for queue logic
      lastRangeFromRef.current = range.from;

      // only act when near left edge
      if (range.from > leftEdgeThresholdBars) return;

      bumpPagingDebug({ triggers: pagingDebugRef.current.triggers + 1 });

      // ✅ If a load is already happening, queue ONE more and exit
      if (isPagingRef.current) {
        pendingPageRef.current = true;
        return;
      }

      const now = Date.now();
      if (now - pagingCooldownAtRef.current < pagingCooldownMs) return;
      pagingCooldownAtRef.current = now;

      void Promise.resolve(loadOlderRef.current(tfRef.current)).catch((err) => {
        console.error("loadOlderCandles failed", err);
      });
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRange);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRange);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onRange);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load markers initially (and when symbol changes)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(`/api/charts/markers?symbol=${encodeURIComponent(symbol)}&limit=500`, {
          cache: "no-store",
        });

        if (!res.ok) return;

        const json: any = await res.json().catch(() => null);
        const ms = Array.isArray(json?.markers) ? (json.markers as ChartMarker[]) : [];

        if (cancelled) return;
        setMarkers(ms);
      } catch {
        // non-fatal
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Fetch candles when timeframe changes
  useEffect(() => {
    fetchCandles(tf);
  }, [fetchCandles, tf]);

  // Recompute markers when markers/tf change (non-chart-driven)
  useEffect(() => {
    recomputeMarkerPositions();
  }, [recomputeMarkerPositions]);

  const onAuraEvent = useCallback(
    (evt: AuraRealtimeEvent) => {
      if (!evt) return;

      if (evt.type === "candle_closed") {
        const data = evt.data as CandleClosedData;
        if (!data || data.symbol !== symbol) return;

        const candle: Candle = {
          time: data.time,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: data.volume,
        };

        cacheRef.current["15s"] = mergeClosedCandle(cacheRef.current["15s"], candle);

        if (tf === "15s" && seriesRef.current) {
          seriesRef.current.update(toSeries(candle));
        }

        if (tf === "3m") {
          const bucket = TF_SECONDS["3m"]; // 180
          const last15sOpen = bucket - TF_SECONDS["15s"]; // 165
          if (candle.time % bucket === last15sOpen) {
            fetchCandles("3m");
          }
        }

        return;
      }

      if (evt.type === "order_submitted") {
        const d: any = evt.data;
        if (!d?.symbol || d.symbol !== symbol) return;

        const t = to15sBucket(Math.floor(new Date(evt.ts).getTime() / 1000));

        const m: ChartMarker = {
          id: `order_submitted:${d.orderId ?? `${evt.ts}:${d.symbol}:${d.side}`}`,
          symbol: d.symbol,
          time: t,
          tf: "15s",
          kind: d.side === "buy" ? "order_buy" : "order_sell",
          price: d.price != null ? Number(d.price) : undefined,
          label: `${d.side?.toUpperCase?.() ?? ""} ${d.qty ?? ""}`.trim(),
          brokerAccountId: d.accountId ?? null,
          orderId: d.orderId ?? null,
          fillId: null,
        };

        setMarkers((prev) => upsertMarker(prev, m));
        return;
      }

      if (evt.type === "order_filled") {
        const d: any = evt.data;
        if (!d?.symbol || d.symbol !== symbol) return;

        const t = to15sBucket(Math.floor(new Date(evt.ts).getTime() / 1000));
        const side = d.side === "buy" ? "buy" : "sell";

        const m: ChartMarker = {
          id: `fill:${d.fillId ?? d.orderId ?? `${evt.ts}:${d.symbol}`}`,
          symbol: d.symbol,
          time: t,
          tf: "15s",
          kind: side === "buy" ? "fill_buy_full" : "fill_sell_full",
          price: d.fillPrice != null ? Number(d.fillPrice) : undefined,
          label: `FILL ${d.qty ?? ""}`.trim(),
          brokerAccountId: d.accountId ?? null,
          orderId: d.orderId ?? null,
          fillId: d.fillId ?? null,
        };

        setMarkers((prev) => upsertMarker(prev, m));
        return;
      }

      if (evt.type === "order_cancelled") {
        const d: any = evt.data;
        if (d?.symbol && d.symbol !== symbol) return;

        const t = to15sBucket(Math.floor(new Date(evt.ts).getTime() / 1000));

        const m: ChartMarker = {
          id: `order_cancelled:${d.orderId ?? `${evt.ts}`}`,
          symbol,
          time: t,
          tf: "15s",
          kind: "order_cancelled",
          label: "CANCELLED",
          brokerAccountId: d.accountId ?? null,
          orderId: d.orderId ?? null,
          fillId: null,
        };

        setMarkers((prev) => upsertMarker(prev, m));
      }
    },
    [symbol, tf, fetchCandles]
  );

  useAuraStream(channelName ?? null, onAuraEvent);

  const tfButtons = useMemo(
    () => (
      <div className="flex gap-2">
        <button
          className={`px-3 py-1 rounded ${tf === "15s" ? "bg-white/10" : "bg-white/5"}`}
          onClick={() => setTf("15s")}
          type="button"
        >
          15s (DBG)
        </button>
        <button
          className={`px-3 py-1 rounded ${tf === "3m" ? "bg-white/10" : "bg-white/5"}`}
          onClick={() => setTf("3m")}
          type="button"
        >
          3m (DBG)
        </button>
      </div>
    ),
    [tf]
  );

  const markerClass = (kind: ChartMarker["kind"]) => {
    switch (kind) {
      case "order_buy":
        return "bg-emerald-600/90 text-white";
      case "order_sell":
        return "bg-rose-600/90 text-white";
      case "fill_buy_full":
      case "fill_sell_full":
        return "bg-blue-600/90 text-white";
      case "fill_sell_full":
        return "bg-blue-600/90 text-white";
      case "order_cancelled":
        return "bg-zinc-600/90 text-white";
      default:
        return "bg-white/10 text-white";
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm text-black">{symbol}</div>
          <div className="text-[11px] text-black">
            markers: {debugMarkerStats.shown}/{debugMarkerStats.total}
          </div>
          <div className="text-[11px] text-black">
            paging: triggers {debugPaging.triggers} - loads {debugPaging.loads} - older(raw) {debugPaging.lastOlderCount}{" "}
            - grew {debugPaging.grew} - cursor {debugPaging.cursor ?? "null"} - cache {debugPaging.cacheLen} - oldest{" "}
            {debugPaging.oldest ?? "null"} - newest {debugPaging.newest ?? "null"}
          </div>
        </div>
        {tfButtons}
      </div>

      <div className="relative">
        <div ref={containerRef} className="w-full rounded-lg overflow-hidden border border-white/10" />

        <div ref={overlayRef} className="pointer-events-none absolute inset-0" style={{ top: 0, left: 0 }}>
          {markerPositions.map((m) => (
            <div
              key={m.id}
              className={`pointer-events-none absolute top-3 -translate-x-1/2 px-2 py-1 rounded text-[11px] ${markerClass(
                m.kind
              )}`}
              style={{ left: `${m.x}px` }}
              title={`${m.kind}${m.price != null ? ` @ ${m.price}` : ""}`}
            >
              {m.label ?? m.kind}
            </div>
          ))}
        </div>

        {isLoading && (
          <div className="absolute top-2 right-2 text-xs text-white/70 bg-black/40 px-2 py-1 rounded">Loading…</div>
        )}

        {error && (
          <div className="absolute bottom-2 left-2 text-xs text-red-200 bg-red-900/30 px-2 py-1 rounded">{error}</div>
        )}

        {!isLoading && !error && cacheRef.current[tf].length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            No candles yet (waiting for data)
          </div>
        )}
      </div>
    </div>
  );
}
