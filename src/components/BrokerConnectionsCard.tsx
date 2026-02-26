// src/components/BrokerConnectionsCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type BrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export function BrokerConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BrokerAccountRow[]>([]);

  // Form state (ProjectX v1)
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [contractId, setContractId] = useState("CON.F.US.MGC.J26");
  const [enableAfterSave, setEnableAfterSave] = useState(true);

  const projectX = useMemo(
    () => accounts.find((a) => a.brokerName === "projectx") ?? null,
    [accounts]
  );

  const allEnabled =
  accounts.length > 0 && accounts.every((a) => a.isEnabled);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: BrokerAccountRow[] }>(
        "/api/broker-accounts",
        { method: "GET" }
      );
      setAccounts(data.accounts ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load broker accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      await fetchJSON("/api/broker-accounts", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "projectx",
          username,
          apiKey,
          contractId,
          enable: enableAfterSave,
        }),
      });
      // Clear secrets from UI after save
      setApiKey("");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleEnabled(next: boolean) {
    if (!projectX) return;
    setError(null);
    setSaving(true);
    try {
      await fetchJSON(`/api/broker-accounts/${projectX.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: next }),
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!projectX) return;
    setError(null);
    setSaving(true);
    try {
      await fetchJSON(`/api/broker-accounts/${projectX.id}`, { method: "DELETE" });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  async function onRunAllToggle() {
    if (accounts.length === 0) return;

    const next = !allEnabled;

    const ok = window.confirm(
      next
        ? "Enable all broker accounts?\n\nAura will allow workers to run for every connected account."
        : "Disable all broker accounts?\n\nAura will stop workers for every account."
    );
    if (!ok) return;

    setError(null);
    setSaving(true);
    try {
      await fetchJSON("/api/broker-accounts/bulk-enable", {
        method: "POST",
        body: JSON.stringify({ isEnabled: next }),
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  const statusPill = loading
    ? "Loading…"
    : projectX
      ? projectX.isEnabled
        ? "Connected (enabled)"
        : "Saved (disabled)"
      : "Not connected";

  const canSave =
    username.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    !saving &&
    !loading;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Broker Connections</div>
        <div className="aura-muted aura-text-xs">{statusPill}</div>
      </div>

      <div className="aura-mt-12 aura-card-muted aura-control-row">
        <div className="aura-control-meta">
          <div className="aura-control-title">Run all accounts</div>
          <div className="aura-control-help">
            Enable or disable workers for every connected broker account.
          </div>
        </div>

        <button
          className="aura-btn"
          type="button"
          onClick={onRunAllToggle}
          disabled={saving || loading || accounts.length === 0}
        >
          {accounts.length === 0 ? "—" : allEnabled ? "On" : "Off"}
        </button>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        {error ? (
          <div className="aura-card-muted aura-text-sm" style={{ borderColor: "rgba(255,0,0,0.35)" }}>
            {error}
          </div>
        ) : null}

        <div className="aura-card-muted aura-grid-gap-12">
          <div className="aura-control-meta">
            <div className="aura-control-title">ProjectX</div>
            <div className="aura-control-help">
              Save your credentials (encrypted). Enable to let the orchestrator launch the worker.
            </div>
          </div>

          <div className="aura-grid-gap-12">
            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Username (email)</div>
                <div className="aura-control-help">Your ProjectX login username.</div>
              </div>
              <input
                className="aura-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@email.com"
                autoComplete="username"
              />
            </div>

            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">API Key</div>
                <div className="aura-control-help">ProjectX API key.</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="aura-input"
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="ProjectX API key"
                      autoComplete="off"
                    />
                    <button
                      className="aura-btn"
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
              </div>

            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Contract ID</div>
                <div className="aura-control-help">Default MGC contract id for the worker.</div>
              </div>
              <input
                className="aura-input"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                placeholder="CON.F.US.MGC.J26"
              />
            </div>

            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Enable after save</div>
                <div className="aura-control-help">If enabled, orchestrator will treat this account as runnable.</div>
              </div>
              <button
                className="aura-btn"
                onClick={() => setEnableAfterSave((v) => !v)}
                type="button"
              >
                {enableAfterSave ? "On" : "Off"}
              </button>
            </div>

            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Actions</div>
                <div className="aura-control-help">
                  Save updates credentials. Enable/Disable controls whether workers should run.
                </div>
              </div>

              <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                <button className="aura-btn" onClick={onSave} disabled={!canSave}>
                  {saving ? "Saving…" : "Save"}
                </button>

                {projectX ? (
                  <>
                    <button
                      className="aura-btn"
                      onClick={() => onToggleEnabled(!projectX.isEnabled)}
                      disabled={saving || loading}
                    >
                      {projectX.isEnabled ? "Disable" : "Enable"}
                    </button>

                    <button className="aura-btn" onClick={onDelete} disabled={saving || loading}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
