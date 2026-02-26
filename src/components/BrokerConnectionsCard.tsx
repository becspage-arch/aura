// src/components/BrokerConnectionsCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type BrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;

  // Optional display fields (safe if your API doesn’t return them yet)
  accountLabel?: string | null;
  externalId?: string | null;
  balanceUsd?: number | string | null;
};

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

function fmtMoney(v: unknown) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function displayAccountLine(a: BrokerAccountRow) {
  const name = (a.accountLabel ?? "").trim();
  const id = (a.externalId ?? "").trim();
  const bal = fmtMoney(a.balanceUsd);

  // Your preferred: Name | AccountNumber | Balance
  // If some parts are missing, it gracefully collapses.
  const parts = [name || null, id || null, bal || null].filter(Boolean) as string[];
  return parts.length ? parts.join(" | ") : "Account";
}

export function BrokerConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<BrokerAccountRow[]>([]);

  // Credentials inputs (never loaded from API; only what the user types)
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const projectXAccounts = useMemo(
    () => accounts.filter((a) => a.brokerName === "projectx"),
    [accounts]
  );

  const anyProjectXConnected = projectXAccounts.length > 0;

  async function refreshConnections() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: BrokerAccountRow[] }>("/api/broker-accounts", {
        method: "GET",
      });
      setAccounts(data.accounts ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load broker accounts");
    } finally {
      setLoading(false);
    }
  }

  async function discoverProjectXAccounts() {
    // This should create/update BrokerAccount rows in DB (your discover route),
    // then we refresh the list from /api/broker-accounts.
    await fetchJSON("/api/broker-accounts/projectx/discover", { method: "POST" });
    await refreshConnections();
  }

  useEffect(() => {
    (async () => {
      await refreshConnections();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On refresh/page load: if ProjectX is already connected, auto-discover so the Accounts list is always populated.
  useEffect(() => {
    if (!loading && anyProjectXConnected) {
      // fire and forget (but still show errors if any)
      (async () => {
        try {
          await discoverProjectXAccounts();
        } catch (e: any) {
          setError(e?.message || "Failed to load ProjectX accounts");
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function onConnect() {
    setError(null);
    setSaving(true);
    try {
      // 1) Save credentials
      await fetchJSON("/api/broker-accounts", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "projectx",
          username,
          apiKey,
          // If your POST requires these, keep them. If not, harmless.
          contractId: "CON.F.US.MGC.J26",
          enable: true,
        }),
      });

      // 2) Clear secret field immediately
      setApiKey("");
      setShowKey(false);

      // 3) Discover accounts + refresh list
      await discoverProjectXAccounts();
    } catch (e: any) {
      setError(e?.message || "Connect failed");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleEnabled(accountId: string, next: boolean) {
    setError(null);
    setSaving(true);
    try {
      await fetchJSON(`/api/broker-accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: next }),
      });
      await refreshConnections();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteAccount(accountId: string) {
    setError(null);
    setSaving(true);
    try {
      await fetchJSON(`/api/broker-accounts/${accountId}`, { method: "DELETE" });
      await refreshConnections();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  const statusPill = loading
    ? "Loading…"
    : anyProjectXConnected
      ? projectXAccounts.some((a) => a.isEnabled)
        ? "Connected - trading enabled"
        : "Connected - trading disabled"
      : "Not connected";

  const canConnect = username.trim().length > 0 && apiKey.trim().length > 0 && !saving && !loading;
  const disabled = saving || loading;

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
          <div className="aura-control-title">ProjectX</div>

          {/* Connect row (always visible) */}
          <div className="aura-grid-gap-12">
            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">Username</div>
              </div>
              <input
                className="aura-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@email.com"
                autoComplete="off"
                name="aura_projectx_username"
              />
            </div>

            <div className="aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">API key</div>
              </div>

              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <input
                  className="aura-input"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  autoComplete="new-password"
                  name="aura_projectx_apikey"
                  style={{ flex: 1 }}
                />
                <button className="aura-btn" type="button" onClick={() => setShowKey((v) => !v)} disabled={disabled}>
                  {showKey ? "Hide" : "Show"}
                </button>
                <button className="aura-btn" type="button" onClick={onConnect} disabled={!canConnect}>
                  {saving ? "Connecting…" : "Connect"}
                </button>
              </div>
            </div>
          </div>

          {/* Accounts list (no extra gap) */}
          <div className="aura-card-muted aura-grid-gap-12" style={{ marginTop: 0 }}>
            <div className="aura-control-title">Accounts</div>

            {projectXAccounts.length === 0 ? (
              <div className="aura-muted aura-text-xs">
                Connect to ProjectX to load your accounts.
              </div>
            ) : (
              <div className="aura-grid-gap-12">
                {projectXAccounts.map((a) => (
                  <div key={a.id} className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-control-title">{displayAccountLine(a)}</div>
                    </div>

                    <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                      <button
                        className="aura-btn"
                        type="button"
                        disabled={disabled}
                        onClick={() => onToggleEnabled(a.id, !a.isEnabled)}
                        title={a.isEnabled ? "Disable trading" : "Enable trading"}
                      >
                        {a.isEnabled ? "Enabled" : "Disabled"}
                      </button>

                      <button
                        className="aura-btn"
                        type="button"
                        disabled={disabled}
                        onClick={() => onDeleteAccount(a.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
