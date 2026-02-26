// src/components/live-control/AccountSelectorCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type SystemStatus = {
  ok: true;
  accounts: Array<{
    brokerAccountId: string;
    brokerName: string;
    accountLabel: string | null;
    externalId: string | null;

    isEnabled: boolean;
    isPaused: boolean;
    isKillSwitched: boolean;

    workerLeaseStatus: string;
    heartbeatHealthy: boolean;
    workerHealthy: boolean;
    systemRunning: boolean;

    lastHeartbeatAt: string | null;

    latestError: null | {
      createdAt: string;
      type: string;
      level: string;
      message: string;
    };
  }>;
};

type PauseGetResponse = {
  ok: true;
  brokerAccountId: string | null;
  isPaused: boolean;
  isKillSwitched: boolean;
  killSwitchedAt: string | null;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data as T;
}

function nameForAccount(a: SystemStatus["accounts"][number]) {
  const label = a.accountLabel?.trim();
  if (label) return label;
  const ext = a.externalId?.trim();
  if (ext) return `${a.brokerName.toUpperCase()} • ${ext}`;
  return `${a.brokerName.toUpperCase()} • ${a.brokerAccountId.slice(0, 6)}`;
}

export function AccountSelectorCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedBrokerAccountId, setSelectedBrokerAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<SystemStatus["accounts"]>([]);

  async function refresh() {
    setErr(null);
    setLoading(true);
    try {
      const [pause, sys] = await Promise.all([
        fetchJSON<PauseGetResponse>("/api/trading-state/pause"),
        fetchJSON<SystemStatus>("/api/system/status"),
      ]);

      setSelectedBrokerAccountId(pause.brokerAccountId ?? null);
      setStatus(sys.accounts ?? []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load account status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, []);

  const selected = useMemo(
    () => status.find((a) => a.brokerAccountId === selectedBrokerAccountId) ?? null,
    [status, selectedBrokerAccountId]
  );

  async function selectAccount(brokerAccountId: string) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      await fetchJSON("/api/trading-state/select-broker-account", {
        method: "POST",
        body: JSON.stringify({ brokerAccountId }),
      });
      setSelectedBrokerAccountId(brokerAccountId);
    } catch (e: any) {
      setErr(e?.message || "Failed to select account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Account</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            Choose which account Live Trading controls apply to.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">
          {loading ? "Loading…" : selected ? (selected.systemRunning ? "Running" : "Not running") : "No account selected"}
        </div>
      </div>

      {err ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{err}</div>
        </div>
      ) : null}

      <div className="aura-mt-12 aura-grid-gap-12">
        {status.length === 0 && !loading ? (
          <div className="aura-muted aura-text-xs">
            No broker accounts yet. Go to Account → Broker Connections to connect.
          </div>
        ) : null}

        {status.map((a) => {
          const isSelected = a.brokerAccountId === selectedBrokerAccountId;

          const state =
            !a.isEnabled
              ? "Disabled"
              : a.isKillSwitched
              ? "Emergency Stop"
              : a.isPaused
              ? "Paused"
              : a.workerHealthy
              ? "Ready"
              : "Worker issue";

          const sub =
            a.latestError?.message
              ? `${a.latestError.level.toUpperCase()} • ${a.latestError.message}`
              : a.lastHeartbeatAt
              ? `Last heartbeat: ${new Date(a.lastHeartbeatAt).toLocaleString()}`
              : "No heartbeat yet";

          return (
            <button
              key={a.brokerAccountId}
              type="button"
              className={[
                "aura-card-muted",
                "aura-control-row",
                isSelected ? "aura-outline-gold" : "",
              ].join(" ")}
              onClick={() => void selectAccount(a.brokerAccountId)}
              disabled={loading || saving}
              style={{ textAlign: "left" }}
              title="Select this account for Live Trading controls"
            >
              <div className="aura-control-meta">
                <div className="aura-control-title">{nameForAccount(a)}</div>
                <div className="aura-control-help">
                  {state} • {sub}
                </div>
              </div>

              <span className="aura-select-pill">
                {isSelected ? (saving ? "Selecting…" : "Selected") : "Select"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
