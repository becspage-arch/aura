"use client";

import { useEffect, useMemo, useState } from "react";

type RiskSettings = {
  riskUsd: number;
  rr: number;
  maxStopTicks: number;
  entryType: "market" | "limit" | string;
};

type RiskGetResponse = {
  ok: true;
  riskSettings: RiskSettings;
};

type RiskPostResponse = {
  ok: true;
  riskSettings: RiskSettings;
};

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

export function RiskSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [current, setCurrent] = useState<RiskSettings | null>(null);

  const [form, setForm] = useState<{
    riskUsd: string;
    rr: string;
    maxStopTicks: string;
    entryType: string;
  }>({
    riskUsd: "",
    rr: "",
    maxStopTicks: "",
    entryType: "market",
  });

  const dirty = useMemo(() => {
    if (!current) return false;
    return (
      form.riskUsd !== String(current.riskUsd) ||
      form.rr !== String(current.rr) ||
      form.maxStopTicks !== String(current.maxStopTicks) ||
      form.entryType !== String(current.entryType)
    );
  }, [current, form]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetchJSON<RiskGetResponse>("/api/trading-state/risk-settings");
        if (cancelled) return;

        setCurrent(res.riskSettings);
        setForm({
          riskUsd: String(res.riskSettings.riskUsd),
          rr: String(res.riskSettings.rr),
          maxStopTicks: String(res.riskSettings.maxStopTicks),
          entryType: res.riskSettings.entryType ?? "market",
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

  const save = async () => {
    const riskUsd = toNumberOrNull(form.riskUsd);
    const rr = toNumberOrNull(form.rr);
    const maxStopTicks = toNumberOrNull(form.maxStopTicks);

    if (riskUsd === null || rr === null || maxStopTicks === null) {
      setErr("Please enter valid numbers for Risk, RR, and Max Stop Ticks.");
      return;
    }

    const ok = window.confirm(
      `Apply these risk settings?\n\nRiskUsd: ${riskUsd}\nRR: ${rr}\nMaxStopTicks: ${maxStopTicks}\nEntryType: ${form.entryType || "market"}`
    );
    if (!ok) return;

    try {
      setSaving(true);
      setErr(null);

      const res = await fetchJSON<RiskPostResponse>("/api/trading-state/risk-settings", {
        method: "POST",
        body: JSON.stringify({
          riskUsd,
          rr,
          maxStopTicks,
          entryType: form.entryType || "market",
        }),
      });

      setCurrent(res.riskSettings);
      setForm({
        riskUsd: String(res.riskSettings.riskUsd),
        rr: String(res.riskSettings.rr),
        maxStopTicks: String(res.riskSettings.maxStopTicks),
        entryType: res.riskSettings.entryType ?? "market",
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!current) return;
    setErr(null);
    setForm({
      riskUsd: String(current.riskUsd),
      rr: String(current.rr),
      maxStopTicks: String(current.maxStopTicks),
      entryType: current.entryType ?? "market",
    });
  };

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Risk Settings</div>
          <p className="aura-muted aura-text-xs aura-mt-10">
            These settings are per-user and hot-reload into the worker.
          </p>
        </div>

        {loading ? (
          <div className="aura-muted aura-text-xs">Loading…</div>
        ) : current ? (
          <div className="aura-muted aura-text-xs">
            Current: ${current.riskUsd} • RR {current.rr} • Max stop {current.maxStopTicks} •{" "}
            {String(current.entryType)}
          </div>
        ) : (
          <div className="aura-muted aura-text-xs"></div>
        )}
      </div>

      {err ? (
        <div className="aura-mt-12" style={{ color: "var(--destructive)" }}>
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      {/* 2-column aligned form */}
      <div className="aura-mt-12" style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr 1fr",
            alignItems: "start",
          }}
        >
          {/* Risk USD */}
          <div>
            <div className="aura-muted aura-text-xs">Risk (USD)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={form.riskUsd}
              onChange={(e) => setForm((s) => ({ ...s, riskUsd: e.target.value }))}
              placeholder="e.g. 50"
              disabled={loading || saving}
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            />
          </div>

          {/* RR */}
          <div>
            <div className="aura-muted aura-text-xs">RR (reward:risk)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="decimal"
              value={form.rr}
              onChange={(e) => setForm((s) => ({ ...s, rr: e.target.value }))}
              placeholder="e.g. 2"
              disabled={loading || saving}
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            />
          </div>

          {/* Max stop ticks */}
          <div>
            <div className="aura-muted aura-text-xs">Max stop (ticks)</div>
            <input
              className="aura-input aura-mt-10"
              inputMode="numeric"
              value={form.maxStopTicks}
              onChange={(e) => setForm((s) => ({ ...s, maxStopTicks: e.target.value }))}
              placeholder="e.g. 50"
              disabled={loading || saving}
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            />
          </div>

          {/* Entry type */}
          <div>
            <div className="aura-muted aura-text-xs">Entry type</div>
            <select
              className="aura-input aura-mt-10"
              value={form.entryType}
              onChange={(e) => setForm((s) => ({ ...s, entryType: e.target.value }))}
              disabled={loading || saving}
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                background: "var(--card)",
              }}
            >
              <option value="market">market</option>
              <option value="limit">limit</option>
            </select>
            <div className="aura-muted aura-text-xs aura-mt-10">
              (Limit support in execution can come later – this is just config.)
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="aura-row-between aura-mt-10">
          <button
            type="button"
            className="aura-btn"
            onClick={reset}
            disabled={loading || saving || !dirty}
            style={{ opacity: loading || saving || !dirty ? 0.6 : 1 }}
          >
            Reset
          </button>

          <button
            type="button"
            className="aura-btn"
            onClick={save}
            disabled={loading || saving || !dirty}
            style={{ opacity: loading || saving || !dirty ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Apply"}
          </button>
        </div>

        <p className="aura-muted aura-text-xs">
          Tip: keep this page open - you should see the worker log{" "}
          <span style={{ fontFamily: "var(--font-geist-mono)" }}>riskSettings applied</span> within ~5
          seconds after Apply.
        </p>
      </div>
    </section>
  );
}
