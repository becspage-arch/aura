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

type SeriesCandle = ISeriesApi<"Candlestick">;

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

type RenderedMarker = {
  id: string;
  kind: ChartMarker["kind"];
  label?: string | null;
  x: number;
  y: number;
  time: number;
  price?: number;
};

function markerTimeForTf(t: number, tf: Timeframe): number {
  if (tf === "15s") return t;
  const bucket = TF_SECONDS[tf];
  return Math.floor(t / bucket) * bucket;
}

function markerStyle(kind: ChartMarker["kind"]): { bg: string; glyph: string } {
  switch (kind) {
    case "order_buy":
      return { bg: "#7fa8a1", glyph: "▲" };
    case "order_sell":
      return { bg: "#b07a7a", glyph: "▼" };
    case "fill_buy_full":
    case "fill_sell_full":
      return { bg: "#d6c28f", glyph: "●" };
    case "order_cancelled":
      return { bg: "#8a919e", glyph: "■" };
    default:
      return { bg: "#8a919e", glyph: "●" };
  }
}

export function TradingChart({ symbol, initialTf = "15s", channelName }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<SeriesCandle | null>(null);

  const [tf, setTf] = useState<Timeframe>(initialTf);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const nextToRef = useRef<Record<Timeframe, number | null>>({
    "15s": null,
    "3m": null,
  });

  const exhaustedCursorRef = useRef<Record<Timeframe, number | null>>({
    "15s": null,
    "3m": null,
  });

  const [markers, setMarkers] = useState<ChartMarker[]>([]);
  const [renderedMarkers, setRenderedMarkers] = useState<RenderedMarker[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const [debugMarkerStats, setDebugMarkerStats] = useState({ total: 0, shown: 0 });

  const [debugPaging, setDebugPaging] = useState({
    triggers: 0,
    loads: 0,
    lastOlderCount: 0,
    grew: 0,
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

  // ✅ HTML overlay marker renderer (works across lightweight-charts versions)
  const recomputeOverlayMarkers = useCallback(
    (nextTf: Timeframe) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) {
        setRenderedMarkers([]);
        setDebugMarkerStats({
          total: markers.filter((m) => m.symbol === symbol).length,
          shown: 0,
        });
        return;
      }

      const total = markers.filter((m) => m.symbol === symbol).length;

      const ms = markers
        .filter((m) => m.symbol === symbol)
        .map((m) => {
          const t = markerTimeForTf(m.time, nextTf) as UTCTimestamp;
          const x = chart.timeScale().timeToCoordinate(t);
          const price =
            m.price != null
              ? Number(m.price)
              : undefined;

          // If price missing, place it roughly mid-chart (still clickable)
          const y =
            price != null
              ? series.priceToCoordinate(price)
              : (overlayRef.current?.clientHeight ?? 520) * 0.5;

          if (x == null || y == null) return null;

          return {
            id: m.id,
            kind: m.kind,
            label: m.label ?? null,
            x,
            y,
            time: Number(t),
            price,
          } satisfies RenderedMarker;
        })
        .filter(Boolean) as RenderedMarker[];

      setRenderedMarkers(ms);
      setDebugMarkerStats({ total, shown: ms.length });
    },
    [markers, symbol]
  );

  const fetchCandles = useCallback(
    async (nextTf: Timeframe) => {
      const s = seriesRef.current;
      if (!s) return;

      setIsLoading(true);
      setError(null);

      fetchSeqRef.current += 1;
      const seq = fetchSeqRef.current;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const cached = cacheRef.current[nextTf];
        s.setData(cached.map(toSeries));

        const to = floorToTf(Math.floor(Date.now() / 1000), nextTf);
        const url = `/api/charts/candles?symbol=${encodeURIComponent(symbol)}&tf=${nextTf}&to=${to}&limit=800&fill=1`;

        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`Failed to load candles (${res.status})`);

        const json = (await res.json()) as ApiResponse;
        if (seq !== fetchSeqRef.current) return;

        const candles = Array.isArray(json.candles) ? json.candles : [];
        cacheRef.current[nextTf] = candles;

        nextToRef.current[nextTf] = json.nextTo ?? null;
        exhaustedCursorRef.current[nextTf] = null;

        s.setData(candles.map(toSeries));
        chartRef.current?.timeScale().fitContent();

        updateCacheDebugForTf(nextTf);

        // after data changes, recompute marker positions
        recomputeOverlayMarkers(nextTf);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Unknown error");
      } finally {
        if (seq === fetchSeqRef.current) setIsLoading(false);
      }
    },
    [symbol, updateCacheDebugForTf, recomputeOverlayMarkers]
  );

  const isPagingRef = useRef(false);
  const pendingPageRef = useRef(false);
  const lastRangeFromRef = useRef<number | null>(null);

  const pagingCooldownAtRef = useRef(0);
  const pagingCooldownMs = 350;
  const leftEdgeThresholdBars = 300;

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
      const url = `/api/charts/candles?symbol=${encodeURIComponent(symbol)}&tf=${nextTf}&to=${toParam}&limit=800&fill=1`;
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
      const s = seriesRef.current;
      if (!s) return;
      if (!chartRef.current) return;
      if (isPagingRef.current) return;

      const existing = cacheRef.current[nextTf] ?? [];
      if (!existing.length) return;

      const exhaustedCursor = exhaustedCursorRef.current[nextTf];
      if (exhaustedCursor != null && exhaustedCursor === nextToRef.current[nextTf]) return;

      isPagingRef.current = true;

      try {
        const oldestTime = existing[0].time;
        const beforeLen = existing.length;
        const beforeCursor = nextToRef.current[nextTf];

        let json: ApiResponse | null = null;

        if (beforeCursor != null) json = await requestOlderPage(nextTf, beforeCursor);
        else json = await requestOlderPage(nextTf, oldestTime);

        const raw1 = Array.isArray(json?.candles) ? (json!.candles as Candle[]) : [];
        let raw = raw1;

        nextToRef.current[nextTf] = json?.nextTo ?? null;

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

        const ts = chartRef.current.timeScale();
        const currentRange = ts.getVisibleLogicalRange();
        const addedBars = merged.length - beforeLen;

        cacheRef.current[nextTf] = merged;
        s.setData(merged.map(toSeries));

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

            // positions depend on range
            recomputeOverlayMarkers(nextTf);
          });
        } else {
          recomputeOverlayMarkers(nextTf);
        }

        updateCacheDebugForTf(nextTf);
        bumpPagingDebug({ grew });
      } finally {
        isPagingRef.current = false;

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
    [requestOlderPage, updateCacheDebugForTf, recomputeOverlayMarkers]
  );

  const loadOlderRef = useRef<(nextTf: Timeframe) => Promise<void> | void>(() => {});
  useEffect(() => {
    loadOlderRef.current = loadOlderCandles;
  }, [loadOlderCandles]);

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
    seriesRef.current = series as SeriesCandle;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      recomputeOverlayMarkers(tfRef.current);
    });
    ro.observe(containerRef.current);

    const onLogicalRange = (range: LogicalRange | null) => {
      if (!range) return;

      lastRangeFromRef.current = range.from;

      // marker positions depend on visible range/scale
      recomputeOverlayMarkers(tfRef.current);

      if (range.from > leftEdgeThresholdBars) return;

      bumpPagingDebug({ triggers: pagingDebugRef.current.triggers + 1 });

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
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [recomputeOverlayMarkers]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch(
          `/api/charts/markers?symbol=${encodeURIComponent(symbol)}&limit=500`,
          { cache: "no-store" }
        );
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

  useEffect(() => {
    fetchCandles(tf);
  }, [fetchCandles, tf]);

  useEffect(() => {
    recomputeOverlayMarkers(tf);
  }, [recomputeOverlayMarkers, tf]);

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
          recomputeOverlayMarkers("15s");
        }

        if (tf === "3m") {
          const bucket = TF_SECONDS["3m"];
          const last15sOpen = bucket - TF_SECONDS["15s"];
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

        setMarkers((prev) => {
          const next = upsertMarker(prev, m);
          return next;
        });
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

        setMarkers((prev) => {
          const next = upsertMarker(prev, m);
          return next;
        });
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

        setMarkers((prev) => {
          const next = upsertMarker(prev, m);
          return next;
        });
      }
    },
    [symbol, tf, fetchCandles, recomputeOverlayMarkers]
  );

  // If you don't have 8D.4 emitting Ably events yet, this just won’t update in realtime — fine.
  useAuraStream(channelName ?? null, onAuraEvent);

  // When markers state changes, recompute positions
  useEffect(() => {
    recomputeOverlayMarkers(tf);
  }, [markers, tf, recomputeOverlayMarkers]);

  const tfButtons = useMemo(
    () => (
      <div className="aura-btn-group">
        <button
          className={`aura-btn ${tf === "15s" ? "aura-btn-active" : ""}`}
          onClick={() => setTf("15s")}
          type="button"
        >
          15s
        </button>
        <button
          className={`aura-btn ${tf === "3m" ? "aura-btn-active" : ""}`}
          onClick={() => setTf("3m")}
          type="button"
        >
          3m
        </button>
      </div>
    ),
    [tf]
  );

  return (
    <div className="w-full">
      <div className="aura-chart-top aura-mt-6">
        <div className="aura-chart-meta">
          <div className="aura-chart-meta-title">{symbol}</div>
          <div className="aura-chart-meta-line">
            Markers: {debugMarkerStats.shown}/{debugMarkerStats.total}
          </div>
          <div className="aura-chart-meta-line">
            Paging: triggers {debugPaging.triggers} - loads {debugPaging.loads} - older(raw){" "}
            {debugPaging.lastOlderCount} - grew {debugPaging.grew} - cursor {debugPaging.cursor ?? "null"} - cache{" "}
            {debugPaging.cacheLen} - oldest {debugPaging.oldest ?? "null"} - newest {debugPaging.newest ?? "null"}
          </div>
        </div>
        {tfButtons}
      </div>

      <div className="aura-chart-frame" style={{ position: "relative" }}>
        <div ref={containerRef} className="aura-chart-surface" />

        {/* HTML overlay markers */}
        <div
          ref={overlayRef}
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
        >
          {renderedMarkers.map((m) => {
            const st = markerStyle(m.kind);
            const isActive = activeMarkerId === m.id;

            return (
              <div
                key={m.id}
                style={{
                  position: "absolute",
                  left: m.x,
                  top: m.y,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "auto",
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMarkerId((cur) => (cur === m.id ? null : m.id));
                }}
                title={m.label ?? st.glyph}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    lineHeight: "12px",
                    background: st.bg,
                    color: "#0b0f14",
                    border: "1px solid rgba(0,0,0,0.35)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.35)",
                  }}
                >
                  {st.glyph}
                </div>

                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      top: 22,
                      left: "50%",
                      transform: "translateX(-50%)",
                      minWidth: 180,
                      maxWidth: 260,
                      padding: "10px 10px",
                      borderRadius: 12,
                      background: "rgba(12,16,22,0.92)",
                      color: "#e7eaee",
                      border: "1px solid rgba(255,255,255,0.10)",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
                      fontSize: 12,
                      pointerEvents: "auto",
                      zIndex: 20,
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.kind}</div>
                    {m.label && <div style={{ opacity: 0.95, marginBottom: 6 }}>{m.label}</div>}
                    <div style={{ opacity: 0.85 }}>
                      t: {m.time}
                      {m.price != null ? ` · px: ${m.price}` : ""}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isLoading && <div className="aura-float aura-float-top-right">Loading…</div>}
        {error && <div className="aura-float aura-float-bottom-left">{error}</div>}
        {!isLoading && !error && cacheRef.current[tf].length === 0 && (
          <div className="aura-float aura-float-center">No candles yet (waiting for data)</div>
        )}
      </div>
    </div>
  );
}
