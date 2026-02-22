// src/app/app/strategy-setup/_components/StrategyPresetCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

export function StrategyPresetCard(props: { current: StrategySettings | null }) {
  const presetLabel = props.current?.preset === "coreplus315" ? "CorePlus 315" : "CorePlus 315";

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Strategy</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Select the strategy Aura will run on your account.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">{props.current ? presetLabel : "—"}</div>
        </div>
      </div>

      <div className="aura-mt-12">
        <div className="aura-card-muted">
          <div className="aura-control-help">
            Current strategy: <span className="aura-mono">{presetLabel}</span>. (More strategies will be added later.)
          </div>
        </div>
      </div>
    </section>
  );
}
