"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<StrategySettings>;
};

export function TradableSymbolsCard({ current, saving, patchStrategySettings }: Props) {
  const AVAILABLE_SYMBOLS: Array<{ key: string; label: string; sublabel: string }> = [
    { key: "MGC", label: "MGC", sublabel: "Micro Gold Futures" },
    { key: "GC", label: "GC", sublabel: "Gold Futures" },
  ];

  const selected = current?.symbols ?? [];
  const on = (k: string) => selected.includes(k);

  const toggle = async (k: string) => {
    if (!current) return;

    const next = on(k) ? selected.filter((s) => s !== k) : [...selected, k];

    // Guardrail: never allow empty selection
    if (next.length === 0) return;

    await patchStrategySettings({ symbols: next });
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Tradable Symbols</div>
          <div className="aura-muted aura-mt-6">
            Choose which markets the strategy is allowed to trade. Multi-select. At
            least one symbol must remain enabled.
          </div>
        </div>

        <div className="aura-right">
          <div className="aura-stat-label">
            {(current?.symbols?.length ?? 0) > 0 ? current!.symbols.join(", ") : "—"}
          </div>
        </div>
      </div>

      <div className="aura-mt-12">
        <div className="aura-pill-group">
          {AVAILABLE_SYMBOLS.map((sym) => {
            const isOn = on(sym.key);
            const isDisabled =
              !current ||
              saving ||
              (isOn && selected.length === 1); // prevent turning off last enabled

            return (
              <button
                key={sym.key}
                type="button"
                className="aura-pill-toggle"
                aria-pressed={isOn}
                disabled={isDisabled}
                onClick={() => toggle(sym.key)}
                title={
                  !current
                    ? "Loading…"
                    : saving
                    ? "Saving…"
                    : isOn && selected.length === 1
                    ? "At least one symbol must remain enabled."
                    : undefined
                }
              >
                <span className="aura-pill-indicator" />
                <span className="aura-pill-toggle__stack">
                  <span>{sym.label}</span>
                  <span className="aura-pill-toggle__sublabel">{sym.sublabel}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
