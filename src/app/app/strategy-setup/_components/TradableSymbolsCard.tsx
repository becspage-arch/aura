// src/app/app/strategy-setup/_components/TradableSymbolsCard.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<StrategySettings>;
};

export function TradableSymbolsCard({ current, saving, patchStrategySettings }: Props) {
  // For now we ship only MGC. Keep it DB-backed, but not user-changeable yet.
  const isDisabled = !current || saving;

  const ensureMgc = async () => {
    if (!current) return;
    const hasMgc = (current.symbols ?? []).includes("MGC");
    if (hasMgc) return;

    await patchStrategySettings({ symbols: ["MGC"] });
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Instrument</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Select the instrument Aura will trade.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {current?.symbols?.length ? current.symbols.join(", ") : "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12">
        <div className="aura-pill-group" role="group" aria-label="Instrument">
          <button
            type="button"
            className="aura-pill-toggle"
            aria-pressed={true}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              ensureMgc();
            }}
            title="Micro Gold Futures (MGC)"
          >
            <span className="aura-pill-indicator" />
            <span className="aura-pill-toggle__stack">
              <span>MGC</span>
              <span className="aura-pill-toggle__sublabel">Micro Gold Futures</span>
            </span>
          </button>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          More instruments (GC, ES, etc.) will appear here later.
        </p>
      </div>
    </section>
  );
}
