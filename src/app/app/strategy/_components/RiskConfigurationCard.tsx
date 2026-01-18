"use client";

import { useMemo, useState } from "react";

import type {
  EntryType,
  StrategyPostResponse,
  StrategySettings,
} from "../_lib/types";

import { fetchJSON, toNumberOrNull } from "../_lib/api";

type Props = {
  current: StrategySettings | null;
  saving: boolean;
  disabled: boolean;
  setCurrent: (next: StrategySettings | null) => void;
  setSaving: (next: boolean) => void;
  setErr: (next: string | null) => void;
};

export function RiskConfigurationCard({
  current,
  saving,
  disabled,
  setCurrent,
  setSaving,
  setErr,
}: Props) {
  const [riskForm, setRiskForm] = useState<{
    riskUsd: string;
    rr: string;
    maxStopTicks: string;
    entryType: EntryType;
  }>(() => ({
    riskUsd: current ? String(current.riskUsd) : "",
    rr: current ? String(current.rr) : "",
    maxStopTicks: current ? String(current.maxStopTicks) : "",
    entryType: (current?.entryType ?? "market") as EntryType,
  }));

  // When current loads later, this local state won’t auto-update.
  // So we compute reset values from current and offer a reset button.
  const dirtyRisk = useMemo(() => {
    if (!current) return false;
    return (
      riskForm.riskUsd !== String(current.riskUsd) ||
      riskForm.rr !== String(current.rr) ||
      riskForm.maxStopTicks !== String(current.maxStopTicks) ||
      riskForm.entryType !== (current.entryType ?? "market")
    );
  }, [current, riskForm]);

  const resetRisk = () => {
    if (!current) return;
    setErr(null);
    setRiskForm({
      riskUsd: String(current.riskUsd),
      rr: String(current.rr),
      maxStopTicks: String(current.maxStopTicks),
      entryType: (current.entryType ?? "market") as EntryType,
    });
  };

  const applyRisk = async () => {
    const riskUsd = toNumberOrNull(riskForm.riskUsd);
    const rr = toNumberOrNull(riskForm.rr);
    const maxStopTicks = toNumberOrNull(riskForm.maxStopTicks);

    if (riskUsd === null || rr === null || maxStopTicks === null) {
      setErr("Please enter valid numbers for Risk, RR, and Max Stop Ticks.");
      return;
    }

    const ok = window.confirm(
      `Apply these strategy risk settings?\n\nRiskUsd: ${riskUsd}\nRR: ${rr}\nMaxStopTicks: ${maxStopTicks}\nEntryType: ${riskForm.entryType}`
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
            entryType: riskForm.entryType,
          }),
        }
      );

      setCurrent(res.strategySettings);

      setRiskForm({
        riskUsd: String(res.strategySettings.riskUsd),
        rr: String(res.strategySettings.rr),
        maxStopTicks: String(res.strategySettings.maxStopTicks),
        entryType: (res.strategySettings.entryType ?? "market") as EntryType,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Risk Configuration</div>
        <div className="aura-muted aura-text-xs">
          {current
            ? `Current: $${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks} • ${current.entryType ?? "market"}`
            : "—"}
        </div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        <div className="aura-form-2col">
          <div>
            <div className="aura-muted aura-text-xs">Risk (USD)</div>
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
          </div>

          <div>
            <div className="aura-muted aura-text-xs">RR (reward:risk)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={riskForm.rr}
              onChange={(e) =>
                setRiskForm((s) => ({ ...s, rr: e.target.value }))
              }
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
              onChange={(e) =>
                setRiskForm((s) => ({ ...s, maxStopTicks: e.target.value }))
              }
              placeholder="e.g. 50"
              disabled={disabled}
            />
          </div>

          <div>
            <div className="aura-muted aura-text-xs">Entry type</div>
            <select
              className="aura-input aura-mt-10"
              value={riskForm.entryType}
              onChange={(e) =>
                setRiskForm((s) => ({
                  ...s,
                  entryType: e.target.value as EntryType,
                }))
              }
              disabled={disabled}
            >
              <option value="market">market</option>
              <option value="limit">limit</option>
            </select>

            <div className="aura-muted aura-text-xs aura-mt-10">
              (Limit support in execution can come later - this is just config.)
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
            className={`aura-btn ${
              disabled || !dirtyRisk ? "aura-disabled-btn" : ""
            }`}
            onClick={applyRisk}
            disabled={disabled || !dirtyRisk}
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>

        <p className="aura-muted aura-text-xs">
          Tip: this writes to{" "}
          <span className="aura-mono">strategySettings</span>. The worker will be
          wired to consume these next.
        </p>
      </div>
    </section>
  );
}
