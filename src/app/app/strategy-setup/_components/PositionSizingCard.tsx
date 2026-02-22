// src/app/app/strategy-setup/_components/PositionSizingCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
};

export function PositionSizingCard({ current }: Props) {
  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Position Sizing</div>
          <div className="aura-muted aura-mt-6">
            Aura sizes positions automatically based on your risk and stop size.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {current ? "Risk-based (automatic)" : "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-14">
        <div className="aura-card-muted">
          <div className="aura-control-help">
            Contract size is calculated so your USD risk remains consistent per trade.
          </div>
        </div>
      </div>
    </section>
  );
}
