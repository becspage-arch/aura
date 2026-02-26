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

type GetResponse = { ok: true; accounts: BrokerAccountRow[] };
type PostResponse = { ok: true; account: { id: string; brokerName: string; isEnabled: boolean } };
type PatchResponse = { ok: true; account: { id: string; brokerName: string; isEnabled: boolean } };
type DeleteResponse = { ok: true };

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

function shortId(id: string) {
  if (!id) return "—";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function BrokerConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BrokerAccountRow[]>([]);

  // UI mode
  const [editing, setEditing] = useState(false);

  // Form state (ProjectX v1)
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [contractId, setContractId] = useState("CON.F.US.MGC.J26");
  const [externalAccountId, setExternalAccountId] = useState("");
  const [enableAfterSave, setEnableAfterSave] = useState(true);

  const projectXAccounts = useMemo(
    () => accounts.filter((a) => a.brokerName === "projectx"),
    [accounts]
  );

  const anyConnected = projectXAccounts.length > 0;
  const anyEnabled = projectXAccounts.some((a) => a.isEnabled);

  const statusPill = loading
    ? "Loading…"
    : anyConnected
      ? anyEnabled
        ? "Connected - Trading enabled"
        : "Connected - Trading disabled"
      : "Not connected";

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<GetResponse>("/api/broker-accounts", { method: "GET" });
      const rows = data.accounts ?? [];
      setAccounts(rows);

      // If they already have ProjectX saved, default to collapsed view
      if (rows.some((a) => a.brokerName === "projectx")) setEditing(false);
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
      await fetchJSON<PostResponse>("/api/broker-accounts", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "projectx",
          username,
          apiKey,
          contractId,
          externalAccountId: externalAccountId || "",
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

  async function onToggleEnabled(accountId: string, next: boolean) {
    setError(null);
    setBusyId(accountId);
    try {
      await fetchJSON<PatchResponse>(`/api/broker-accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: next }),
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(accountId: string) {
    const ok = window.confirm(
      "Delete this broker connection?\n\nThis removes the saved credentials from Aura."
    );
    if (!ok) return;

    setError(null);
    setBusyId(accountId);
    try {
      await fetchJSON<DeleteResponse>(`/api/broker-accounts/${accountId}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  const disabled = saving || loading;
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

      <div className="aura-mt-12 aura-grid-gap-12">
        {error ? (
          <div className="aura-card-muted aura-text-sm" style={{ borderColor: "rgba(255,0,0,0.35)" }}>
            {error}
          </div>
        ) : null}

        <div className="aura-card-muted aura-grid-gap-12">
          {/* CONNECTED (collapsed) VIEW */}
          {anyConnected && !editing ? (
            <div className="aura-grid-gap-12">
              {projectXAccounts.map((acct) => {
                const rowBusy = busyId === acct.id || disabled;
                return (
                  <div key={acct.id} className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-control-title">ProjectX</div>
                      <div className="aura-control-help">
                        Account {shortId(acct.id)}
                      </div>
                    </div>

                    <div
                      className="aura-control-right"
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <button
                        className="aura-btn"
                        type="button"
                        disabled={rowBusy}
                        onClick={() => onToggleEnabled(acct.id, !acct.isEnabled)}
                        title={acct.isEnabled ? "Disable trading" : "Enable trading"}
                      >
                        {acct.isEnabled ? "Trading: ON" : "Trading: OFF"}
                      </button>

                      <button
                        className="aura-btn"
                        type="button"
                        disabled={disabled}
                        onClick={() => setEditing(true)}
                      >
                        Edit credentials
                      </button>

                      <button
                        className="aura-btn"
                        type="button"
                        disabled={rowBusy}
                        onClick={() => onDelete(acct.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
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
                  <div className="aura-control-help">Default contract id for the worker (e.g. MGC).</div>
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
                  <div className="aura-control-title">Account ID</div>
                  <div className="aura-control-help">Optional. If you have one, paste it here.</div>
                </div>
                <input
                  className="aura-input"
                  value={externalAccountId}
                  onChange={(e) => setExternalAccountId(e.target.value)}
                  placeholder="50IKTC-V2-..."
                />
              </div>

              <div className="aura-control-row">
                <div className="aura-control-meta">
                  <div className="aura-control-title">Trading enabled</div>
                  <div className="aura-control-help">
                    If off, Aura will not run this broker account even when you press RUN.
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
                  <div className="aura-control-title">Save</div>
                  <div className="aura-control-help">Credentials are stored securely.</div>
                </div>

                <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                  <button className="aura-btn" onClick={onSave} disabled={!canSave}>
                    {saving ? "Saving…" : anyConnected ? "Save" : "Save & connect"}
                  </button>

                  {anyConnected ? (
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
