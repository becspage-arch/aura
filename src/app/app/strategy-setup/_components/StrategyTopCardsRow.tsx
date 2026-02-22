// src/app/app/strategy-setup/_components/StrategyTopCardsRow.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

export function StrategyTopCardsRow(props: { current: StrategySettings | null }) {
  const strategyLabel =
    props.current?.preset === "coreplus315" ? "CorePlus 315" : "CorePlus 315";

  const symbolLabel =
    props.current?.symbols?.length ? props.current.symbols.join(", ") : "—";

  return (
    <section className="aura-kpi-row-2">
      <div className="aura-card">
        <div className="aura-stat-label">Strategy</div>
        <div className="aura-stat-value">{strategyLabel}</div>
        <div className="aura-stat-sub">The strategy Aura will run</div>
      </div>

      <div className="aura-card">
        <div className="aura-stat-label">Symbol</div>
        <div className="aura-stat-value">{symbolLabel}</div>
        <div className="aura-stat-sub">The market Aura will trade</div>
      </div>
    </section>
  );
}
