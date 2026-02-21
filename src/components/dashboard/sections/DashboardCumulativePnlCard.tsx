// src/components/dashboard/sections/DashboardCumulativePnlCard.tsx
"use client";

import { useMemo } from "react";

export default function DashboardCumulativePnlCard({
  points,
  cumRange,
  setCumRange,
}: {
  points: any[] | null | undefined;
  cumRange: "1M" | "3M" | "6M" | "1Y" | "ALL";
  setCumRange: (r: "1M" | "3M" | "6M" | "1Y" | "ALL") => void;
}) {
  const cumChart = useMemo(() => {
    const pts = points;
    if (!Array.isArray(pts) || pts.length < 2) return null;

    const ys = pts.map((p: any) => Number(p.cumulativeUsd));
    const xs = pts.map((p: any) => String(p.day));

    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const span = yMax - yMin || 1;

    const W = 1000;
    const H = 260;
    const padL = 22;
    const padR = 18;
    const padT = 16;
    const padB = 26;

    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const toX = (i: number) => padL + (i / (pts.length - 1)) * innerW;
    const toY = (v: number) => padT + (1 - (v - yMin) / span) * innerH;

    const lineD = pts
      .map((p: any, i: number) => {
        const x = toX(i);
        const y = toY(Number(p.cumulativeUsd));
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

    const areaD = `${lineD} L ${(padL + innerW).toFixed(2)} ${(padT + innerH).toFixed(
      2
    )} L ${padL.toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;

    return { W, H, lineD, areaD, startLabel: xs[0], endLabel: xs[xs.length - 1] };
  }, [points]);

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Cumulative P&amp;L</div>
          <div className="aura-muted aura-text-xs">Performance overview</div>
        </div>

        <div className="aura-range-tabs" role="tablist" aria-label="Cumulative P&L range">
          {(["1M", "3M", "6M", "1Y", "ALL"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`aura-range-tab ${cumRange === r ? "aura-range-tab--active" : ""}`}
              onClick={() => setCumRange(r)}
              role="tab"
              aria-selected={cumRange === r}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {cumChart ? (
        <div className="aura-linechart">
          <svg
            className="aura-linechart__svg"
            viewBox={`0 0 ${cumChart.W} ${cumChart.H}`}
            role="img"
            aria-label="Cumulative P&L line chart"
          >
            <path className="aura-linechart__area" d={cumChart.areaD} />
            <path className="aura-linechart__line" d={cumChart.lineD} />
          </svg>

          <div className="aura-linechart__x">
            <span className="aura-muted aura-text-xs">{cumChart.startLabel}</span>
            <span className="aura-muted aura-text-xs">{cumChart.endLabel}</span>
          </div>
        </div>
      ) : (
        <div className="aura-muted aura-text-xs aura-mt-10">No chart data yet.</div>
      )}
    </section>
  );
}
