"use client";

import { useEffect, useMemo, useState } from "react";

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

type RiskFormState = {
  riskUsd: string;
  rr: string;
  maxStopTicks: string;
  entryType: EntryType;
};

function formFromCurrent(current: StrategySettings): RiskFormState {
  return {
    riskUsd: String(current.riskUsd),
    rr: String(current.rr),
    maxStopTicks: String(current.maxStopTicks),
    entryType: (current.entryType ?? "market") as EntryType,
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
    entryType: "market",
  }));

  const dirtyRisk = useMemo(() => {
    if (!current) return false;
    return (
      riskForm.riskUsd !== String(current.riskUsd) ||
      riskForm.rr !== String(current.rr) ||
      riskForm.maxStopTicks !== String(current.maxStopTicks) ||
      riskForm.entryType !== (current.entryType ?? "market")
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
      setErr("Please enter valid numbers for Risk, RR, and Max Stop Ticks.");
      return;
    }

    const ok = window.confirm(
      `Apply these strategy risk settings?\n\nMax Risk (USD): ${riskUsd}\nRR: ${rr}\nMaxStopTicks: ${maxStopTicks}\nEntryType: ${riskForm.entryType}`
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
        <div className="aura-card-title">Risk Configuration</div>
        <div className="aura-muted aura-text-xs">
          {current
            ? `Current: $${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks} • ${
                current.entryType ?? "market"
              }`
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
            className={`aura-btn ${disabled || !dirtyRisk ? "aura-disabled-btn" : ""}`}
            onClick={applyRisk}
            disabled={disabled || !dirtyRisk}
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>

        <p className="aura-muted aura-text-xs">
          Tip: this writes to{" "}
          <span className="aura-mono">strategySettings</span>. The worker will
          consume these at boot (and later via hot updates).
        </p>
      </div>
    </section>
  );
}
