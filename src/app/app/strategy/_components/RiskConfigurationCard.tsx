// src/app/app/strategy/_components/RiskConfigurationCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import type { StrategyPostResponse, StrategySettings } from "../_lib/types";
import { fetchJSON, toNumberOrNull } from "../_lib/api";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  setCurrent: (next: StrategySettings | null) => void;
  setSaving: (next: boolean) => void;
  setErr: (next: string | null) => void;
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

export function RiskConfigurationCard({
  current,
  saving,
  disabled,
  setCurrent,
  setSaving,
  setErr,
}: Props) {
  const [riskForm, setRiskForm] = useState<RiskFormState>(() => ({
    riskUsd: "",
    rr: "",
    maxStopTicks: "",
  }));

  const dirtyRisk = useMemo(() => {
    if (!current) return false;
    return (
      riskForm.riskUsd !== String(current.riskUsd) ||
      riskForm.rr !== String(current.rr) ||
      riskForm.maxStopTicks !== String(current.maxStopTicks)
    );
  }, [current, riskForm]);

  // Hydrate the form when `current` arrives/changes.
  // - If the user has already edited (dirty), don't clobber.
  // - If the form is still blank (common after refresh), always hydrate.
  useEffect(() => {
    if (!current) return;

    const isBlank =
      riskForm.riskUsd === "" &&
      riskForm.rr === "" &&
      riskForm.maxStopTicks === "";

    if (isBlank || !dirtyRisk) {
      setRiskForm(formFromCurrent(current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const resetRisk = () => {
    if (!current) return;
    setErr(null);
    setRiskForm(formFromCurrent(current));
  };

  const applyRisk = async () => {
    const riskUsd = toNumberOrNull(riskForm.riskUsd);
    const rr = toNumberOrNull(riskForm.rr);
    const maxStopTicks = toNumberOrNull(riskForm.maxStopTicks);

    if (riskUsd === null || rr === null || maxStopTicks === null) {
      setErr("Please enter valid numbers for Max Risk, RR, and Max stop (ticks).");
      return;
    }

    const ok = window.confirm(
      [
        "Apply these risk settings?",
        "",
        `Max Risk (USD): ${riskUsd}`,
        `RR (reward:risk): ${rr}`,
        `Max stop (ticks): ${maxStopTicks}`,
        "Order type: Market (fixed)",
      ].join("\n")
    );
    if (!ok) return;

    try {
      setSaving(true);
      setErr(null);

      const res = await fetchJSON<StrategyPostResponse>(
        "/api/trading-state/strategy-settings",
        {
          method: "POST",
          body: JSON.stringify({
            riskUsd,
            rr,
            maxStopTicks,
          }),
        }
      );

      setCurrent(res.strategySettings);
      setRiskForm(formFromCurrent(res.strategySettings));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Risk Configuration</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Sets your max risk per trade. Aura sizes positions to stay within this
            risk when possible.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">
          {current
            ? `Current: $${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks}t • Market`
            : "—"}
        </div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        <div className="aura-form-2col">
          <div>
            <div className="aura-muted aura-text-xs">Max Risk (USD)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={riskForm.riskUsd}
              onChange={(e) =>
                setRiskForm((s) => ({ ...s, riskUsd: e.target.value }))
              }
              placeholder="e.g. 50"
              disabled={disabled}
            />
            <div className="aura-muted aura-text-xs aura-mt-10">
              The most Aura will risk on a single trade.
            </div>
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
            <div className="aura-muted aura-text-xs aura-mt-10">
              Target size relative to risk (e.g. 2 = 2R).
            </div>
          </div>

          <div>
            <div className="aura-muted aura-text-xs">Max stop (ticks)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="numeric"
              value={riskForm.maxStopTicks}
              onChange={(e) =>
                setRiskForm((s) => ({ ...s, maxStopTicks: e.target.value }))
              }
              placeholder="e.g. 50"
              disabled={disabled}
            />
            <div className="aura-muted aura-text-xs aura-mt-10">
              Aura will skip setups that require a stop larger than this.
            </div>
          </div>

          <div>
            <div className="aura-muted aura-text-xs">Order type</div>
            <div className="aura-input aura-mt-10 aura-disabled">
              Market (fixed)
            </div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              Aura uses market orders for execution.
            </div>
          </div>
        </div>

        <div className="aura-row-between aura-mt-10">
          <button
            type="button"
            className={`aura-btn aura-btn-subtle ${
              disabled || !dirtyRisk ? "aura-disabled-btn" : ""
            }`}
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

        <p className="aura-muted aura-text-xs">
          Tip: These settings are saved to{" "}
          <span className="aura-mono">strategySettings</span> and will be used by the
          worker.
        </p>
      </div>
    </section>
  );
}
