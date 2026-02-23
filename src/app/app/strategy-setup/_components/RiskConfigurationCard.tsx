// src/app/app/strategy-setup/_components/RiskConfigurationCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import type { StrategySettings } from "../_lib/types";
import { toNumberOrNull } from "../_lib/api";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  patchStrategySettings: (patch: Partial<StrategySettings>) => Promise<any>;
};

type RiskFormState = {
  riskUsd: string;
  rr: string;
  maxStopTicks: string;
};

function formFromCurrent(current: StrategySettings): RiskFormState {
  return {
    riskUsd: String(current.riskUsd),
    rr: String(current.rr),
    maxStopTicks: String(current.maxStopTicks),
  };
}

function isPositiveNumber(n: number) {
  return Number.isFinite(n) && n > 0;
}

export function RiskConfigurationCard({ current, saving, disabled, patchStrategySettings }: Props) {
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const [riskForm, setRiskForm] = useState<RiskFormState>({
    riskUsd: "",
    rr: "",
    maxStopTicks: "",
  });

  const dirtyRisk = useMemo(() => {
    if (!current) return false;
    return (
      riskForm.riskUsd !== String(current.riskUsd) ||
      riskForm.rr !== String(current.rr) ||
      riskForm.maxStopTicks !== String(current.maxStopTicks)
    );
  }, [current, riskForm]);

  useEffect(() => {
    if (!current) return;

    const isBlank = riskForm.riskUsd === "" && riskForm.rr === "" && riskForm.maxStopTicks === "";
    if (isBlank || !dirtyRisk) setRiskForm(formFromCurrent(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const summary = current
    ? `Current: $${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks} ticks`
    : "—";

  const resetRisk = () => {
    if (!current) return;
    setErrorLocal(null);
    setRiskForm(formFromCurrent(current));
  };

  const applyRisk = async () => {
    setErrorLocal(null);

    const riskUsd = toNumberOrNull(riskForm.riskUsd);
    const rr = toNumberOrNull(riskForm.rr);
    const maxStopTicks = toNumberOrNull(riskForm.maxStopTicks);

    if (riskUsd === null || rr === null || maxStopTicks === null) {
      setErrorLocal("Please enter valid numbers for Max Risk, RR, and Max Stop (ticks).");
      return;
    }

    if (!isPositiveNumber(riskUsd)) {
      setErrorLocal("Max Risk (USD) must be greater than 0.");
      return;
    }

    if (!isPositiveNumber(rr)) {
      setErrorLocal("RR must be greater than 0.");
      return;
    }

    if (!isPositiveNumber(maxStopTicks)) {
      setErrorLocal("Max Stop (ticks) must be greater than 0.");
      return;
    }

    await patchStrategySettings({ riskUsd, rr, maxStopTicks });
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Risk</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Set max risk and stop-size limits (in ticks). Aura sizes positions around these rules.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">{saving ? "Saving…" : summary}</div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        <div className="aura-form-2col">
          <div>
            <div className="aura-muted aura-text-xs">Max Risk (USD)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={riskForm.riskUsd}
              onChange={(e) => setRiskForm((s) => ({ ...s, riskUsd: e.target.value }))}
              placeholder="e.g. 50"
              disabled={disabled}
            />
          </div>

          <div>
            <div className="aura-muted aura-text-xs">RR (reward:risk)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={riskForm.rr}
              onChange={(e) => setRiskForm((s) => ({ ...s, rr: e.target.value }))}
              placeholder="e.g. 2"
              disabled={disabled}
            />
          </div>

          <div>
            <div className="aura-muted aura-text-xs">Max stop (ticks)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="numeric"
              value={riskForm.maxStopTicks}
              onChange={(e) => setRiskForm((s) => ({ ...s, maxStopTicks: e.target.value }))}
              placeholder="e.g. 50"
              disabled={disabled}
            />
            <div className="aura-muted aura-text-xs aura-mt-10">
              If a setup needs a bigger stop than this, Aura will skip the trade.
            </div>
          </div>

          <div>
            <div className="aura-muted aura-text-xs">Order type</div>
            <div className="aura-input aura-mt-10 aura-input--readonly" aria-readonly="true">
              market (fixed)
            </div>
            <div className="aura-muted aura-text-xs aura-mt-10">Aura places market orders only.</div>
          </div>
        </div>

        {errorLocal ? (
          <div className="aura-error-block aura-text-sm">{errorLocal}</div>
        ) : null}

        <div className="aura-row-between aura-mt-10">
          <button
            type="button"
            className={`aura-btn aura-btn-subtle ${disabled || !dirtyRisk ? "aura-disabled-btn" : ""}`}
            onClick={resetRisk}
            disabled={disabled || !dirtyRisk}
          >
            Reset
          </button>

          <button
            type="button"
            className={`aura-btn ${disabled || !dirtyRisk ? "aura-disabled-btn" : ""}`}
            onClick={applyRisk}
            disabled={disabled || !dirtyRisk}
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>
      </div>
    </section>
  );
}
