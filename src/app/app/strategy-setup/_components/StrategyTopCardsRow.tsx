// src/app/app/strategy-setup/_components/StrategyTopCardsRow.tsx
"use client";

import type { StrategySettings } from "../_lib/types";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

const INSTRUMENTS: Array<{ value: string; label: string }> = [
  { value: "MGC", label: "Micro Gold (MGC)" },
  { value: "GC",  label: "Gold (GC)" },

  { value: "MES", label: "Micro E-mini S&P 500 (MES)" },
  { value: "ES",  label: "E-mini S&P 500 (ES)" },

  { value: "MNQ", label: "Micro E-mini Nasdaq-100 (MNQ)" },
  { value: "NQ",  label: "E-mini Nasdaq-100 (NQ)" },
];

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
          {INSTRUMENTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="aura-stat-sub">The market Aura will trade</div>
      </div>
    </section>
  );
}
