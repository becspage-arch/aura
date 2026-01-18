// src/app/app/strategy/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  // This should be true when Aura is actively running / trading for the user.
  const [isTrading, setIsTrading] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [current, setCurrent] = useState<StrategySettings | null>(null);

  const [fixedContractsDraft, setFixedContractsDraft] = useState<string>("");
  const [maxStopoutsDraft, setMaxStopoutsDraft] = useState<string>("");
  const [cooldownDraft, setCooldownDraft] = useState<string>("");

  const [bodyDominanceDraft, setBodyDominanceDraft] = useState<string>("");
  const [emaEnabledDraft, setEmaEnabledDraft] = useState<boolean>(false);
  const [entryTimingDraft, setEntryTimingDraft] = useState<"immediate" | "wait_confirm">("immediate");

  const [maxTradesDraft, setMaxTradesDraft] = useState<string>("");

  // Safety drafts
  const [maxDailyLossDraft, setMaxDailyLossDraft] = useState<string>("");
  const [maxConsecutiveLossesDraft, setMaxConsecutiveLossesDraft] =
    useState<string>("");
  const [autoPauseDraft, setAutoPauseDraft] = useState<boolean>(false);

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
        // TODO: Replace this with your real endpoint
        // Expected response shape: { ok: true, isTrading: boolean }
        const res = await fetchJSON<{ ok: true; isTrading: boolean }>(
          "/api/trading-state/runtime"
        );
        if (cancelled) return;
        setIsTrading(!!res.isTrading);
      } catch {
        // If runtime state isn't available yet, default to editable.
        if (!cancelled) setIsTrading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    const ms = current?.coreplus315?.maxStopoutsPerSession;
    const cd = current?.coreplus315?.cooldownMinutesAfterStopout;

    setMaxStopoutsDraft(typeof ms === "number" ? String(ms) : "");
    setCooldownDraft(typeof cd === "number" ? String(cd) : "");
  }, [current?.coreplus315?.maxStopoutsPerSession, current?.coreplus315?.cooldownMinutesAfterStopout]);

  useEffect(() => {
    const bd = current?.coreplus315?.requireBodyDominancePct;
    const ema = current?.coreplus315?.emaFilterEnabled;
    const et = current?.coreplus315?.entryTiming;
    const mt = current?.coreplus315?.maxTradesPerSession;

    setBodyDominanceDraft(typeof bd === "number" ? String(bd) : "");
    setEmaEnabledDraft(!!ema);
    setEntryTimingDraft(et ?? "immediate");
    setMaxTradesDraft(typeof mt === "number" ? String(mt) : "");
  }, [
    current?.coreplus315?.requireBodyDominancePct,
    current?.coreplus315?.emaFilterEnabled,
    current?.coreplus315?.entryTiming,
    current?.coreplus315?.maxTradesPerSession,
  ]);

  useEffect(() => {
    const mdl = current?.safety?.maxDailyLossUsd;
    const mcl = current?.safety?.maxConsecutiveLosses;
    const ap = current?.safety?.autoPauseEnabled;

    setMaxDailyLossDraft(typeof mdl === "number" ? String(mdl) : "");
    setMaxConsecutiveLossesDraft(typeof mcl === "number" ? String(mcl) : "");
    setAutoPauseDraft(!!ap);
  }, [
    current?.safety?.maxDailyLossUsd,
    current?.safety?.maxConsecutiveLosses,
    current?.safety?.autoPauseEnabled,
  ]);

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

    {/* Strategy Summary (read-only strip) */}
    <div className="aura-summary-strip" aria-label="Strategy summary">
      <div className="aura-row-between">
        <div>
          <div className="aura-summary-title">Summary</div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            Read-only snapshot of the key settings on this page.
          </div>
        </div>
        <div className="aura-muted aura-text-xs">{loading ? "Loading…" : "Overview"}</div>
      </div>

      <div className="aura-mt-12 aura-health-strip">
        <div className="aura-health-pill aura-health-pill--static">
          <span className="aura-health-key">Mode</span>
          <span className="aura-health-val">{current?.mode ?? "—"}</span>
        </div>

        <div className="aura-health-pill aura-health-pill--static">
          <span className="aura-health-key">Strategy</span>
          <span className="aura-health-val">315 CorePlus</span>
        </div>

        <div className="aura-health-pill aura-health-pill--static">
          <span className="aura-health-key">Symbol(s)</span>
          <span className="aura-health-val">
            {current?.symbols?.length ? current.symbols.join(", ") : "—"}
          </span>
        </div>

        <div className="aura-health-pill aura-health-pill--static">
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

        <div className="aura-health-pill aura-health-pill--static">
          <span className="aura-health-key">Risk</span>
          <span className="aura-health-val">
            {current ? `$${current.riskUsd} • RR ${current.rr}` : "—"}
          </span>
        </div>

        <div className="aura-health-pill aura-health-pill--static">
          <span className="aura-health-key">State</span>
          <span className="aura-health-val">—</span>
        </div>
      </div>
    </div>

      {err ? (
        <section className="aura-card">
          <div className="aura-card-title">Error</div>
          <p className="aura-muted aura-text-xs aura-mt-10">{err}</p>
        </section>
      ) : null}

      {/* Strategy lock header + locked content wrapper */}
      <div className="aura-lock-section">
      <div className="aura-row-between aura-mt-24">
        <div>
          <div className="aura-summary-title">
            {isTrading ? "Strategy Locked" : "Strategy Editable"}
          </div>
          <div className="aura-muted aura-text-xs aura-mt-6">
            {isTrading
              ? "Strategy settings are locked while Aura is trading. Pause Aura to edit."
              : "Strategy settings are currently editable. When you are happy with your settings, start Aura from the Live Control page."}
          </div>
        </div>

        <div
          className={`aura-lock-badge ${
            isTrading ? "aura-lock-badge--locked" : "aura-lock-badge--editable"
          }`}
        >
          <span className="aura-lock-dot" />
          <span>{isTrading ? "Read-only" : "Editable"}</span>
        </div>
      </div>

        <div className="aura-lock-wrap">
          {/* If locked, show overlay that catches ALL interaction */}
          {isTrading ? (
            <div
              className="aura-lock-overlay"
              onClick={() => {
                const ok = window.confirm(
                  "Strategy settings are locked while Aura is trading.\n\nPause Aura to edit.\n\nGo to Live Control now?"
                );
                if (ok) router.push("/app/live-control");
              }}
            />
          ) : null}

          {/* Everything below this point is considered the "locked area" */}
          <div className={`aura-section-stack ${isTrading ? "aura-locked" : ""}`}>


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
            <div className="aura-card-title">
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
            <div className="aura-card-title">
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

      {/* Trading Options */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Trading Options</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              Guardrails and quality filters for execution. 
            </div>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">
              {current?.coreplus315
                ? `Stop-outs ${current.coreplus315.maxStopoutsPerSession} • Cooldown ${current.coreplus315.cooldownMinutesAfterStopout}m`
                : "—"}
            </div>
          </div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-12">
          {/* Group 1: Session Guardrails (BOUND) */}
          <div className="aura-card-muted">
            <div className="aura-group-header">
              <div>
                <div className="aura-group-title">Session Guardrails</div>
                <div className="aura-control-help">
                  Limits after losses so Aura can pause and recover.
                </div>
              </div>
              <div className="aura-muted aura-text-xs">
                {saving ? "Saving…" : "Auto-save"}
              </div>
            </div>

            <div className="aura-divider" />

            {(() => {
              const isDisabled = !current || saving;

              const saveMaxStopouts = async () => {
                if (!current) return;
                if (!maxStopoutsDraft.trim()) return;

                const n = Number(maxStopoutsDraft);
                if (!Number.isFinite(n)) return;

                const asInt = Math.max(0, Math.floor(n));

                await patchStrategySettings({
                  coreplus315: {
                    ...current.coreplus315,
                    maxStopoutsPerSession: asInt,
                  },
                });
              };

              const saveCooldown = async () => {
                if (!current) return;
                if (!cooldownDraft.trim()) return;

                const n = Number(cooldownDraft);
                if (!Number.isFinite(n)) return;

                const asInt = Math.max(0, Math.floor(n));

                await patchStrategySettings({
                  coreplus315: {
                    ...current.coreplus315,
                    cooldownMinutesAfterStopout: asInt,
                  },
                });
              };

              return (
                <div className={isDisabled ? "aura-disabled" : ""}>
                  <div className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-group-title">
                        Max stop-outs per session
                      </div>
                      <div className="aura-control-help">
                        Number of stop-outs allowed before Aura pauses for the rest of
                        the session. 0 disables.
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ minWidth: 140 }}>
                      <input
                        className="aura-input"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g. 2"
                        value={maxStopoutsDraft}
                        disabled={isDisabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]+$/.test(v)) setMaxStopoutsDraft(v);
                        }}
                        onBlur={saveMaxStopouts}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="aura-divider" />

                  <div className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-group-title">
                        Cooldown after stop-out (minutes)
                      </div>
                      <div className="aura-control-help">
                        How long Aura waits before trading again after a stop-out.
                        0 disables.
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ minWidth: 140 }}>
                      <input
                        className="aura-input"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g. 15"
                        value={cooldownDraft}
                        disabled={isDisabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]+$/.test(v)) setCooldownDraft(v);
                        }}
                        onBlur={saveCooldown}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Group 2: Entry Quality Filters (BOUND) */}
          <div className="aura-card-muted">


            {(() => {
              const isDisabled = !current || saving;

              const saveBodyDominance = async () => {
                if (!current) return;
                if (!bodyDominanceDraft.trim()) return;

                const n = Number(bodyDominanceDraft);
                if (!Number.isFinite(n)) return;

                const pct = Math.max(50, Math.min(99, Math.floor(n))); // sensible clamp

                await patchStrategySettings({
                  coreplus315: {
                    ...current.coreplus315,
                    requireBodyDominancePct: pct,
                  },
                });
              };

              const toggleEma = async () => {
                if (!current) return;
                const next = !emaEnabledDraft;
                setEmaEnabledDraft(next);

                await patchStrategySettings({
                  coreplus315: {
                    ...current.coreplus315,
                    emaFilterEnabled: next,
                  },
                });
              };

              const setTiming = async (next: "immediate" | "wait_confirm") => {
                if (!current) return;
                setEntryTimingDraft(next);

                await patchStrategySettings({
                  coreplus315: {
                    ...current.coreplus315,
                    entryTiming: next,
                  },
                });
              };

              return (
                <div className={isDisabled ? "aura-disabled" : ""}>
                  {/* Body dominance */}
                  <div className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-group-title">Require candle body dominance (%)</div>
                      <div className="aura-control-help">
                        Minimum % of the candle body that must be on one side of the EMA to qualify.
                        (Recommended: 90)
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ minWidth: 140 }}>
                      <input
                        className="aura-input"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="e.g. 90"
                        value={bodyDominanceDraft}
                        disabled={isDisabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]+$/.test(v)) setBodyDominanceDraft(v);
                        }}
                        onBlur={saveBodyDominance}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="aura-divider" />

                  {/* EMA filter toggle (cards) */}
                  <div className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-group-title">Expansion candle EMA filter</div>
                      <div className="aura-control-help">
                        When enabled, Aura requires additional EMA confirmation before allowing entries.
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ minWidth: 260 }}>
                      <div className="aura-select-grid" role="group" aria-label="EMA filter toggle">
                        <div
                          className="aura-select-card"
                          role="button"
                          tabIndex={0}
                          aria-pressed={emaEnabledDraft === true}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            if (!emaEnabledDraft) toggleEma();
                          }}
                          onKeyDown={(e) => {
                            if (isDisabled) return;
                            if ((e.key === "Enter" || e.key === " ") && !emaEnabledDraft) {
                              e.preventDefault();
                              toggleEma();
                            }
                          }}
                        >
                          <div className="aura-select-card__top">
                            <div>
                              <div className="aura-select-card__title">Enabled</div>
                              <div className="aura-select-card__desc">Stricter filtering</div>
                            </div>
                            <span className="aura-select-card__dot" />
                          </div>
                        </div>

                        <div
                          className="aura-select-card"
                          role="button"
                          tabIndex={0}
                          aria-pressed={emaEnabledDraft === false}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            if (emaEnabledDraft) toggleEma();
                          }}
                          onKeyDown={(e) => {
                            if (isDisabled) return;
                            if ((e.key === "Enter" || e.key === " ") && emaEnabledDraft) {
                              e.preventDefault();
                              toggleEma();
                            }
                          }}
                        >
                          <div className="aura-select-card__top">
                            <div>
                              <div className="aura-select-card__title">Disabled</div>
                              <div className="aura-select-card__desc">More permissive</div>
                            </div>
                            <span className="aura-select-card__dot" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="aura-divider" />

                  {/* Entry timing (cards) */}
                  <div className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-group-title">Entry timing window</div>
                      <div className="aura-control-help">
                        Immediate enters on signal. Wait-for-confirm delays entry until confirmation.
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ minWidth: 260 }}>
                      <div className="aura-select-grid" role="group" aria-label="Entry timing">
                        <div
                          className="aura-select-card"
                          role="button"
                          tabIndex={0}
                          aria-pressed={entryTimingDraft === "immediate"}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setTiming("immediate");
                          }}
                          onKeyDown={(e) => {
                            if (isDisabled) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setTiming("immediate");
                            }
                          }}
                        >
                          <div className="aura-select-card__top">
                            <div>
                              <div className="aura-select-card__title">Immediate</div>
                              <div className="aura-select-card__desc">Faster entries</div>
                            </div>
                            <span className="aura-select-card__dot" />
                          </div>
                        </div>

                        <div
                          className="aura-select-card"
                          role="button"
                          tabIndex={0}
                          aria-pressed={entryTimingDraft === "wait_confirm"}
                          aria-disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            setTiming("wait_confirm");
                          }}
                          onKeyDown={(e) => {
                            if (isDisabled) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setTiming("wait_confirm");
                            }
                          }}
                        >
                          <div className="aura-select-card__top">
                            <div>
                              <div className="aura-select-card__title">Wait for confirm</div>
                              <div className="aura-select-card__desc">Higher confirmation</div>
                            </div>
                            <span className="aura-select-card__dot" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

 
        </div>
      </section>

      {/* Execution Preferences */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Execution Preferences</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              Controls how often Aura is allowed to act. These settings don’t change
              the strategy logic - only the execution guardrails.
            </div>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">
              {saving
                ? "Saving…"
                : current
                ? [
                    current.execution.allowMultipleTradesPerSession
                      ? "Multi-trade"
                      : "Single-trade",
                    current.execution.allowTradeStacking ? "Stacking" : "No stacking",
                    current.execution.requireFlatBeforeNewEntry ? "Flat first" : "Can re-enter",
                  ].join(" • ")
                : "—"}
            </div>
          </div>
        </div>

        <div className="aura-mt-12 aura-grid-gap-10">
          {/* Max trades per session (moved here) */}
          {(() => {
            const isDisabled = !current || saving;

            const saveMaxTrades = async () => {
              if (!current) return;
              if (!maxTradesDraft.trim()) return;

              const n = Number(maxTradesDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(0, Math.floor(n)); // 0 disables

              await patchStrategySettings({
                coreplus315: {
                  ...current.coreplus315,
                  maxTradesPerSession: asInt,
                },
              });
            };

            return (
              <div className={`aura-card-muted ${isDisabled ? "aura-disabled" : ""}`}>
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">Max trades per session</div>
                    <div className="aura-control-help">
                      Caps the number of trades Aura can take in a session. 0 disables.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 180 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 1"
                      value={maxTradesDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v)) setMaxTradesDraft(v);
                      }}
                      onBlur={saveMaxTrades}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Execution rules (row-based, consistent with Trading Options) */}
          <div className="aura-card-muted">
            {(() => {
              const isDisabled = !current || saving;

              const setExec = async (
                key:
                  | "allowMultipleTradesPerSession"
                  | "allowTradeStacking"
                  | "requireFlatBeforeNewEntry",
                value: boolean
              ) => {
                if (!current) return;

                const prev = current;
                const nextLocal = {
                  ...current,
                  execution: { ...current.execution, [key]: value },
                };
                setCurrent(nextLocal);

                try {
                  await patchStrategySettings({
                    execution: { [key]: value } as any,
                  });
                } catch (e) {
                  setCurrent(prev);
                  throw e;
                }
              };

              const rows: Array<{
                key:
                  | "allowMultipleTradesPerSession"
                  | "allowTradeStacking"
                  | "requireFlatBeforeNewEntry";
                title: string;
                help: string;
              }> = [
                {
                  key: "allowMultipleTradesPerSession",
                  title: "Allow multiple trades per session",
                  help: "If disabled, Aura will only take one trade per session.",
                },
                {
                  key: "allowTradeStacking",
                  title: "Allow trade stacking",
                  help: "If enabled, Aura may add positions when new valid setups appear.",
                },
                {
                  key: "requireFlatBeforeNewEntry",
                  title: "Require flat before new entry",
                  help: "If enabled, Aura won’t enter a new trade until the prior position is flat.",
                },
              ];

              return (
                <div className={isDisabled ? "aura-disabled" : ""}>
                  {rows.map((row, idx) => {
                    const on = !!current?.execution?.[row.key];

                    return (
                      <div key={row.key}>
                        <div className="aura-control-row">
                          <div className="aura-control-meta">
                            <div className="aura-group-title">{row.title}</div>
                            <div className="aura-control-help">{row.help}</div>
                          </div>

                          <div className="aura-control-right" style={{ minWidth: 260 }}>
                            <div
                              className="aura-pill-group"
                              role="group"
                              aria-label={row.title}
                            >
                              <button
                                type="button"
                                className="aura-pill-toggle"
                                aria-pressed={on}
                                disabled={isDisabled}
                                onClick={() => {
                                  if (isDisabled) return;
                                  setExec(row.key, true);
                                }}
                              >
                                <span className="aura-pill-indicator" />
                                <span>Enabled</span>
                              </button>

                              <button
                                type="button"
                                className="aura-pill-toggle"
                                aria-pressed={!on}
                                disabled={isDisabled}
                                onClick={() => {
                                  if (isDisabled) return;
                                  setExec(row.key, false);
                                }}
                              >
                                <span className="aura-pill-indicator" />
                                <span>Disabled</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {idx < rows.length - 1 && <div className="aura-divider" />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Safety & Limits (BOUND) */}
      <section className="aura-card">
        <div className="aura-row-between">
          <div>
            <div className="aura-card-title">Safety & Limits</div>
            <div className="aura-muted aura-text-xs aura-mt-10">
              System-level guardrails. 0 disables numeric limits.
            </div>
          </div>

          <div className="aura-right">
            <div className="aura-stat-label">
              {saving
                ? "Saving…"
                : current
                ? `${current.safety.maxDailyLossUsd ? `$${current.safety.maxDailyLossUsd}/day` : "Daily off"} • ${
                    current.safety.maxConsecutiveLosses
                      ? `${current.safety.maxConsecutiveLosses} losses`
                      : "Streak off"
                  } • ${current.safety.autoPauseEnabled ? "Auto-pause on" : "Auto-pause off"}`
                : "—"}
            </div>
          </div>
        </div>

        <div className="aura-mt-12">
          {(() => {
            const isDisabled = !current || saving;

            const saveMaxDailyLoss = async () => {
              if (!current) return;
              if (!maxDailyLossDraft.trim()) return; // empty = do nothing

              const n = Number(maxDailyLossDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(0, Math.floor(n)); // USD whole dollars; 0 disables

              await patchStrategySettings({
                safety: { maxDailyLossUsd: asInt } as any,
              });
            };

            const saveMaxConsecutiveLosses = async () => {
              if (!current) return;
              if (!maxConsecutiveLossesDraft.trim()) return; // empty = do nothing

              const n = Number(maxConsecutiveLossesDraft);
              if (!Number.isFinite(n)) return;

              const asInt = Math.max(0, Math.floor(n)); // 0 disables

              await patchStrategySettings({
                safety: { maxConsecutiveLosses: asInt } as any,
              });
            };

            const setAutoPause = async (next: boolean) => {
              if (!current) return;

              const prev = autoPauseDraft;
              setAutoPauseDraft(next);

              try {
                await patchStrategySettings({
                  safety: { autoPauseEnabled: next } as any,
                });
              } catch (e) {
                setAutoPauseDraft(prev);
                throw e;
              }
            };

            return (
              <div className={`aura-card-muted ${isDisabled ? "aura-disabled" : ""}`}>
                {/* Max daily loss */}
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">Max daily loss (USD)</div>
                    <div className="aura-control-help">
                      If reached, Aura will stop trading for the day. 0 disables.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 180 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 300"
                      value={maxDailyLossDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v)) setMaxDailyLossDraft(v);
                      }}
                      onBlur={saveMaxDailyLoss}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </div>
                </div>

                <div className="aura-divider" />

                {/* Max consecutive losses */}
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">Max consecutive losses</div>
                    <div className="aura-control-help">
                      If hit, Aura will pause trading until the next session. 0 disables.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 180 }}>
                    <input
                      className="aura-input"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 3"
                      value={maxConsecutiveLossesDraft}
                      disabled={isDisabled}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^[0-9]+$/.test(v))
                          setMaxConsecutiveLossesDraft(v);
                      }}
                      onBlur={saveMaxConsecutiveLosses}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </div>
                </div>

                <div className="aura-divider" />

                {/* Auto-pause */}
                <div className="aura-control-row">
                  <div className="aura-control-meta">
                    <div className="aura-group-title">Auto-pause</div>
                    <div className="aura-control-help">
                      When enabled, Aura can pause itself after safety triggers.
                    </div>
                  </div>

                  <div className="aura-control-right" style={{ minWidth: 260 }}>
                    <div className="aura-pill-group" role="group" aria-label="Auto-pause">
                      <button
                        type="button"
                        className="aura-pill-toggle"
                        aria-pressed={autoPauseDraft === true}
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setAutoPause(true);
                        }}
                      >
                        <span className="aura-pill-indicator" />
                        <span>Enabled</span>
                      </button>

                      <button
                        type="button"
                        className="aura-pill-toggle"
                        aria-pressed={autoPauseDraft === false}
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          setAutoPause(false);
                        }}
                      >
                        <span className="aura-pill-indicator" />
                        <span>Disabled</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <p className="aura-muted aura-text-xs aura-mt-10">
          Some safeguards are always enforced at the system level, even if you disable
          these thresholds.
        </p>
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
      </div>
      </div>
    </div>
  );
}
