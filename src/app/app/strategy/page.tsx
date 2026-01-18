// src/app/app/strategy/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

export const dynamic = "force-dynamic";

type EntryType = "market" | "limit";

type StrategySettings = {
  mode: "paper" | "live";
  preset: "coreplus315";

  symbols: string[];
  sessions: { asia: boolean; london: boolean; ny: boolean };

  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: EntryType;

  sizing: { mode: "risk_based" | "fixed_contracts"; fixedContracts: number };

  coreplus315: {
    maxStopoutsPerSession: number;
    cooldownMinutesAfterStopout: number;
    maxTradesPerSession: number;
    requireBodyDominancePct: number;
    emaFilterEnabled: boolean;
    entryTiming: "immediate" | "wait_confirm";
  };

  execution: {
    allowMultipleTradesPerSession: boolean;
    allowTradeStacking: boolean;
    requireFlatBeforeNewEntry: boolean;
  };

  safety: {
    maxDailyLossUsd: number;
    maxConsecutiveLosses: number;
    autoPauseEnabled: boolean;
  };
};

type StrategyGetResponse = { ok: true; strategySettings: StrategySettings };
type StrategyPostResponse = { ok: true; strategySettings: StrategySettings };

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

function toNumberOrNull(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function StrategyPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [current, setCurrent] = useState<StrategySettings | null>(null);

  const [fixedContractsDraft, setFixedContractsDraft] = useState<string>("");

  const [riskForm, setRiskForm] = useState<{
    riskUsd: string;
    rr: string;
    maxStopTicks: string;
    entryType: EntryType;
  }>({
    riskUsd: "",
    rr: "",
    maxStopTicks: "",
    entryType: "market",
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<StrategyGetResponse>(
          "/api/trading-state/strategy-settings"
        );
        if (cancelled) return;

        setCurrent(res.strategySettings);
        setRiskForm({
          riskUsd: String(res.strategySettings.riskUsd),
          rr: String(res.strategySettings.rr),
          maxStopTicks: String(res.strategySettings.maxStopTicks),
          entryType: res.strategySettings.entryType ?? "market",
        });
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const v = current?.sizing?.fixedContracts;
    setFixedContractsDraft(typeof v === "number" ? String(v) : "");
  }, [current?.sizing?.fixedContracts]);

  const dirtyRisk = useMemo(() => {
    if (!current) return false;
    return (
      riskForm.riskUsd !== String(current.riskUsd) ||
      riskForm.rr !== String(current.rr) ||
      riskForm.maxStopTicks !== String(current.maxStopTicks) ||
      riskForm.entryType !== current.entryType
    );
  }, [current, riskForm]);

  const disabled = loading || saving;

  const resetRisk = () => {
    if (!current) return;
    setErr(null);
    setRiskForm({
      riskUsd: String(current.riskUsd),
      rr: String(current.rr),
      maxStopTicks: String(current.maxStopTicks),
      entryType: current.entryType ?? "market",
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
        entryType: res.strategySettings.entryType ?? "market",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

    const patchStrategySettings = async (patch: Partial<StrategySettings>) => {
    try {
      setSaving(true);
      setErr(null);

      const res = await fetchJSON<StrategyPostResponse>(
        "/api/trading-state/strategy-settings",
        {
          method: "POST",
          body: JSON.stringify(patch),
        }
      );

      setCurrent(res.strategySettings);
      return res.strategySettings;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl aura-page">
      {/* Page intro */}
      <div>
        <h1 className="aura-page-title">Strategy</h1>
        <p className="aura-page-subtitle">
          Configure how Aura executes the strategy on your account.
        </p>
      </div>

      {/* Strategy Status (mini dashboard overview) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Strategy Status</div>
          <div className="aura-muted aura-text-xs">
            {loading ? "Loading…" : "Overview"}
          </div>
        </div>

        <div
          className="aura-mt-12 aura-health-strip"
          aria-label="Strategy status overview"
        >
          <div className="aura-health-pill">
            <span className="aura-health-key">Mode</span>
            <span className="aura-health-val">{current?.mode ?? "—"}</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Strategy</span>
            <span className="aura-health-val">315 CorePlus</span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Symbol(s)</span>
            <span className="aura-health-val">
              {current?.symbols?.length ? current.symbols.join(", ") : "—"}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Sessions</span>
            <span className="aura-health-val">
              {current
                ? [
                    current.sessions.asia ? "Asia" : null,
                    current.sessions.london ? "London" : null,
                    current.sessions.ny ? "NY" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                : "—"}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">Risk</span>
            <span className="aura-health-val">
              {current ? `$${current.riskUsd} • RR ${current.rr}` : "—"}
            </span>
          </div>

          <div className="aura-health-pill">
            <span className="aura-health-key">State</span>
            <span className="aura-health-val">—</span>
          </div>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          This summary reflects the current configuration Aura would run with.
        </p>
      </section>

      {err ? (
        <section className="aura-card">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      ) : null}

      {/* Strategy lock notice */}
      <section className="aura-card-muted">
        <div className="aura-row-between">
          <span className="aura-card-title">Strategy Locked</span>
          <span className="aura-muted aura-text-xs">Read-only</span>
        </div>

        <p className="aura-muted aura-text-xs aura-mt-6">
          Strategy settings are locked while Live Control is running. To make
          changes, pause or stop Aura from the Live Control page.
        </p>
      </section>

      {/* Strategy Mode */}
      <section className="aura-card">
        <div className="aura-card-title">Strategy Mode</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted">
            <div className="aura-row-between">
              <span>Paper Trading</span>
              <span className="aura-muted">Default</span>
            </div>
            <p className="aura-muted aura-text-xs aura-mt-6">
              Aura simulates trades using real market data without placing live
              orders.
            </p>
          </div>

          <div className="aura-card-muted">
            <div className="aura-row-between">
              <span>Live Trading</span>
              <span className="aura-muted">Disabled</span>
            </div>
            <p className="aura-muted aura-text-xs aura-mt-6">
              Executes real orders through your connected broker account.
              Additional confirmations will be required before enabling.
            </p>
          </div>
        </div>
      </section>

      {/* Strategy Preset */}
      <section className="aura-card">
        <div className="aura-card-title">Strategy Preset</div>

        <div className="aura-mt-12 aura-card-muted">
          <div className="aura-row-between">
            <span>Active Strategy</span>
            <span className="aura-muted">315 CorePlus</span>
          </div>
          <p className="aura-muted aura-text-xs aura-mt-6">
            Aura currently operates a single validated production strategy. Core
            logic is fixed to protect consistency and execution quality.
          </p>
        </div>
      </section>

      {/* =========================
          Tradable Symbols
        ========================= */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title" style={{ fontSize: 18 }}>
              Tradable Symbols
            </div>
            <div className="aura-muted aura-mt-6">
              Choose which markets the strategy is allowed to trade. Multi-select. At
              least one symbol must remain enabled.
            </div>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">
              {(current?.symbols?.length ?? 0) > 0
                ? current!.symbols.join(", ")
                : "—"}
            </div>
          </div>
        </div>

        <div className="aura-mt-12">
          {(() => {
            const AVAILABLE_SYMBOLS: Array<{
              key: string;
              label: string;
              sublabel: string;
            }> = [
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
              <div className="aura-pill-group">
                {AVAILABLE_SYMBOLS.map((sym) => {
                  const isOn = on(sym.key);
                  const disabled =
                    !current ||
                    saving ||
                    (isOn && selected.length === 1); // prevent turning off last enabled

                  return (
                    <button
                      key={sym.key}
                      type="button"
                      className="aura-pill-toggle"
                      aria-pressed={isOn}
                      disabled={disabled}
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
                        <span className="aura-pill-toggle__sublabel">
                          {sym.sublabel}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Sessions (INLINE PILLS) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Trading Sessions</div>
          <div className="aura-muted aura-text-xs">
            {saving
              ? "Saving…"
              : current
              ? [
                  current.sessions.asia ? "Asia" : null,
                  current.sessions.london ? "London" : null,
                  current.sessions.ny ? "NY" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "None"
              : "—"}
          </div>
        </div>

        <div className="aura-mt-12">
          <div className="aura-pill-group" role="group" aria-label="Trading sessions">
            {([
              { key: "asia", label: "Asia" },
              { key: "london", label: "London" },
              { key: "ny", label: "New York" },
            ] as const).map((s) => {
              const on = !!current?.sessions[s.key];

              return (
                <button
                  key={s.key}
                  type="button"
                  className="aura-pill-toggle"
                  aria-pressed={on}
                  onClick={async () => {
                    if (!current) return;

                    const prev = current;
                    const nextLocal = {
                      ...current,
                      sessions: { ...current.sessions, [s.key]: !on },
                    };
                    setCurrent(nextLocal);

                    try {
                      setSaving(true);
                      setErr(null);

                      const res = await fetchJSON<StrategyPostResponse>(
                        "/api/trading-state/strategy-settings",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            sessions: { [s.key]: !on },
                          }),
                        }
                      );

                      setCurrent(res.strategySettings);
                    } catch (e) {
                      setCurrent(prev);
                      setErr(e instanceof Error ? e.message : String(e));
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={disabled || !current}
                  title={on ? "Enabled" : "Disabled"}
                >
                  <span className="aura-pill-indicator" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          <p className="aura-muted aura-text-xs aura-mt-10">
            Aura will only execute trades during selected sessions.
          </p>
        </div>
      </section>

      {/* Risk (NOW EDITABLE) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div className="aura-card-title">Risk Configuration</div>
          <div className="aura-muted aura-text-xs">
            {current
              ? `Current: $${current.riskUsd} • RR ${current.rr} • Max stop ${current.maxStopTicks} • ${current.entryType}`
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
            Tip: this writes to <span className="aura-mono">strategySettings</span>.
            The worker will be wired to consume these next.
          </p>
        </div>
      </section>

      {/* =========================
          Position Sizing
        ========================= */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title" style={{ fontSize: 18 }}>
              Position Sizing
            </div>
            <div className="aura-muted aura-mt-6">
              Choose how Aura sizes positions.
            </div>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">
              {(() => {
                const mode = current?.sizing?.mode ?? "risk_based";
                const fc = current?.sizing?.fixedContracts;
                if (mode === "fixed_contracts") {
                  return `Fixed (${typeof fc === "number" ? fc : "—"})`;
                }
                return "Risk-based";
              })()}
            </div>
          </div>
        </div>

        <div className="aura-mt-12">
          {(() => {
            const mode = current?.sizing?.mode ?? "risk_based";

            const setMode = async (next: "risk_based" | "fixed_contracts") => {
              if (!current) return;
              await patchStrategySettings({
                sizing: {
                  ...current.sizing,
                  mode: next,
                },
              });
            };

            const saveFixedContracts = async () => {
              if (!current) return;

              // empty means "do nothing"
              if (!fixedContractsDraft.trim()) return;

              const n = Number(fixedContractsDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(1, Math.floor(n));

              await patchStrategySettings({
                sizing: {
                  ...current.sizing,
                  fixedContracts: asInt,
                },
              });
            };

            const isDisabled = !current || saving;

            return (
              <div className="aura-grid-gap-12">
                <div className="aura-select-grid" role="group" aria-label="Position sizing">
                  {/* Risk-based */}
                  <div
                    className="aura-select-card"
                    role="button"
                    tabIndex={0}
                    aria-pressed={mode === "risk_based"}
                    aria-disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      setMode("risk_based");
                    }}
                    onKeyDown={(e) => {
                      if (isDisabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMode("risk_based");
                      }
                    }}
                  >
                    <div className="aura-select-card__top">
                      <div>
                        <div className="aura-select-card__title">Risk-based</div>
                        <div className="aura-select-card__desc">
                          Uses stop distance to size the position so your USD risk stays
                          consistent.
                        </div>
                      </div>
                      <span className="aura-select-card__dot" />
                    </div>
                  </div>

                  {/* Fixed contracts */}
                  <div
                    className="aura-select-card"
                    role="button"
                    tabIndex={0}
                    aria-pressed={mode === "fixed_contracts"}
                    aria-disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      setMode("fixed_contracts");
                    }}
                    onKeyDown={(e) => {
                      if (isDisabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setMode("fixed_contracts");
                      }
                    }}
                  >
                    <div className="aura-select-card__top">
                      <div>
                        <div className="aura-select-card__title">Fixed contracts</div>
                        <div className="aura-select-card__desc">
                          Uses a fixed contract count per trade. Useful for testing and
                          simple rule sets.
                        </div>
                      </div>
                      <span className="aura-select-card__dot" />
                    </div>

                    {mode === "fixed_contracts" ? (
                      <div className="aura-select-card__content">
                        <div className="aura-control-row">
                          <div className="aura-control-meta">
                            <div className="aura-control-title">Contracts per trade</div>
                            <div className="aura-control-help">
                              Minimum 1. Saved when you click away or press Enter.
                            </div>
                          </div>

                          <div className="aura-control-right" style={{ minWidth: 160 }}>
                            <input
                              className="aura-input"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="e.g. 1"
                              value={fixedContractsDraft}
                              disabled={isDisabled}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^[0-9]+$/.test(v)) setFixedContractsDraft(v);
                              }}
                              onBlur={saveFixedContracts}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="aura-muted aura-text-xs">
                  Tip: Risk-based sizing is recommended for consistent USD risk.
                </div>
              </div>
            );
          })()}
        </div>
      </section>

      {/* 315 CorePlus Options */}
      <section className="aura-card">
        <div className="aura-card-title">315 CorePlus Options</div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          These settings adjust guardrails and filters for execution. They do not
          expose or rewrite the underlying strategy logic. (UI only for now.)
        </p>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Max stop-outs per session</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Cooldown after stop-out</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Expansion candle EMA filter</span>
            <span className="aura-muted">Require ≥ 50% beyond EMA (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Require candle body dominance</span>
            <span className="aura-muted">90%+ on one side (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Entry timing window</span>
            <span className="aura-muted">Immediate / Wait-for-confirm (placeholder)</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max trades per session</span>
            <span className="aura-muted">—</span>
          </div>
        </div>
      </section>

      {/* Execution Preferences */}
      <section className="aura-card">
        <div className="aura-card-title">Execution Preferences</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Allow multiple trades per session</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Allow trade stacking</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Require flat before new entry</span>
            <span className="aura-muted">—</span>
          </div>

          <p className="aura-muted aura-text-xs">
            These controls affect how often Aura is allowed to act. The underlying
            strategy logic remains unchanged.
          </p>
        </div>
      </section>

      {/* Safety */}
      <section className="aura-card">
        <div className="aura-card-title">Safety & Limits</div>

        <div className="aura-mt-12 aura-grid-gap-10">
          <div className="aura-card-muted aura-row-between">
            <span>Max daily loss</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Max consecutive losses</span>
            <span className="aura-muted">—</span>
          </div>

          <div className="aura-card-muted aura-row-between">
            <span>Auto-pause conditions</span>
            <span className="aura-muted">Enabled (placeholder)</span>
          </div>

          <p className="aura-muted aura-text-xs">
            Aura includes system-level safety checks such as loss thresholds and
            automatic pause conditions. Some safeguards cannot be disabled.
          </p>
        </div>
      </section>

      {/* Coming soon */}
      <section className="aura-card">
        <div className="aura-card-title">Coming Soon</div>
        <p className="aura-muted aura-text-xs aura-mt-10">
          Per-symbol risk profiles, backtest summaries, strategy changelog/version
          history, and advanced filters (news windows, volatility/spread checks,
          execution slippage limits).
        </p>
      </section>
    </div>
  );
}
