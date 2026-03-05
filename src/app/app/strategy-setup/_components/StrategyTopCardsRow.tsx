// src/app/app/strategy-setup/_components/StrategyTopCardsRow.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

const INSTRUMENTS = ["MGC"]; // future: ["MGC","MES","MNQ"]

export function StrategyTopCardsRow({
  current,
  saving,
  disabled,
  patchStrategySettings,
}: Props) {
  const strategyLabel =
    current?.preset === "coreplus315" ? "CorePlus 315" : "CorePlus 315";

  const selected = current?.symbols?.[0] ?? "MGC";

  async function onChange(symbol: string) {
    await patchStrategySettings({
      symbols: [symbol],
    });
  }

  return (
    <section className="aura-kpi-row-2">
      <div className="aura-card">
        <div className="aura-stat-label">Strategy</div>
        <div className="aura-stat-value">{strategyLabel}</div>
        <div className="aura-stat-sub">The strategy Aura will run</div>
      </div>

      <div className="aura-card">
        <div className="aura-stat-label">Instrument</div>

        <select
          className="aura-input"
          value={selected}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value)}
        >
          {INSTRUMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="aura-stat-sub">The market Aura will trade</div>
      </div>
    </section>
  );
}
