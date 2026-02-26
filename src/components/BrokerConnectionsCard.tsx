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

  // UI mode
  const [editing, setEditing] = useState(false);

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

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: BrokerAccountRow[] }>(
        "/api/broker-accounts",
        { method: "GET" }
      );
      const rows = data.accounts ?? [];
      setAccounts(rows);

      // If they already have a ProjectX saved, default to collapsed view.
      if (rows.some((a) => a.brokerName === "projectx")) {
        setEditing(false);
      }
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
      setShowKey(false);

      await refresh();
      setEditing(false);
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
    const ok = window.confirm(
      "Delete ProjectX connection?\n\nThis removes the saved broker credentials from Aura."
    );
    if (!ok) return;

    setError(null);
    setSaving(true);
    try {
      await fetchJSON(`/api/broker-accounts/${projectX.id}`, { method: "DELETE" });
      // Clear UI fields
      setUsername("");
      setApiKey("");
      setShowKey(false);
      setContractId("CON.F.US.MGC.J26");
      setEnableAfterSave(true);
      setEditing(false);

      await refresh();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const statusPill = loading
    ? "Loading…"
    : projectX
      ? projectX.isEnabled
        ? "Connected - trading enabled"
        : "Connected - trading disabled"
      : "Not connected";

  const canSave =
    username.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    !saving &&
    !loading;

  const disabled = saving || loading;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div className="aura-card-title">Broker Connections</div>
        <div className="aura-muted aura-text-xs">{statusPill}</div>
      </div>

      <div className="aura-mt-12 aura-grid-gap-12">
        {error ? (
          <div
            className="aura-card-muted aura-text-sm"
            style={{ borderColor: "rgba(255,0,0,0.35)" }}
          >
            {error}
          </div>
        ) : null}

        <div className="aura-card-muted aura-grid-gap-12">
          <div className="aura-control-meta">
            <div className="aura-control-title">ProjectX</div>
          </div>

          {/* COLLAPSED (connected) VIEW */}
          {projectX && !editing ? (
            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">ProjectX</div>
                <div className="aura-control-help">
                  {projectX.isEnabled ? "Trading enabled" : "Trading disabled"}
                </div>
              </div>

              <div className="aura-control-right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="aura-btn"
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleEnabled(!projectX.isEnabled)}
                  title={projectX.isEnabled ? "Disable trading" : "Enable trading"}
                >
                  {projectX.isEnabled ? "Enabled" : "Disabled"}
                </button>

                <button
                  className="aura-btn"
                  type="button"
                  disabled={disabled}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>

                <button
                  className="aura-btn"
                  type="button"
                  disabled={disabled}
                  onClick={onDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            /* EDIT / CONNECT VIEW */
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
                  <div className="aura-control-help">Your ProjectX API key.</div>
                </div>

                <div style={{ display: "flex", gap: 8, width: "100%" }}>
                  <input
                    className="aura-input"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="ProjectX API key"
                    autoComplete="off"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="aura-btn"
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    disabled={disabled}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-control-title">Contract ID</div>
                  <div className="aura-control-help">
                    Default contract id for the worker (e.g. MGC).
                  </div>
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
                  <div className="aura-control-title">Trading enabled after save</div>
                  <div className="aura-control-help">
                    If enabled, Aura can run this account when you press RUN.
                  </div>
                </div>
                <button
                  className="aura-btn"
                  onClick={() => setEnableAfterSave((v) => !v)}
                  type="button"
                  disabled={disabled}
                >
                  {enableAfterSave ? "On" : "Off"}
                </button>
              </div>

              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-control-title">Actions</div>
                  <div className="aura-control-help">
                    Save credentials to connect your broker.
                  </div>
                </div>

                <div
                  className="aura-control-right"
                  style={{ display: "flex", gap: 8 }}
                >
                  <button
                    className="aura-btn"
                    onClick={onSave}
                    disabled={!canSave}
                  >
                    {saving ? "Saving…" : projectX ? "Save" : "Save & connect"}
                  </button>

                  {projectX ? (
                    <button
                      className="aura-btn"
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setApiKey("");
                        setShowKey(false);
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
