// src/components/BrokerConnectionsCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type SavedBrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
  accountLabel: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
};

type DiscoveredAccount = {
  externalId: string;    // ProjectX account id (string)
  accountName: string;   // ProjectX name (Topstep display)
  balance: number;
  canTrade: boolean;
  simulated: boolean;
  isVisible: boolean;
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

function fmtUsd(n: number) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${Number(n ?? 0).toFixed(2)}`;
  }
}

export function BrokerConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved rows in DB (one per broker account)
  const [saved, setSaved] = useState<SavedBrokerAccountRow[]>([]);

  // Credentials input (only used for discovery + saving)
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Discovered broker accounts (live from ProjectX)
  const [found, setFound] = useState<DiscoveredAccount[] | null>(null);

  const projectxSaved = useMemo(
    () => saved.filter((a) => a.brokerName === "projectx"),
    [saved]
  );

  const connected = projectxSaved.length > 0;

  const statusPill = loading
    ? "Loading…"
    : connected
      ? projectxSaved.some((a) => a.isEnabled)
        ? "Connected - trading enabled"
        : "Connected - trading disabled"
      : "Not connected";

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: SavedBrokerAccountRow[] }>(
        "/api/broker-accounts",
        { method: "GET" }
      );
      setSaved(data.accounts ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load broker accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onDiscover() {
    setError(null);
    setBusy(true);
    setFound(null);
    try {
      const data = await fetchJSON<{ ok: true; accounts: DiscoveredAccount[] }>(
        "/api/broker-accounts/projectx/discover",
        {
          method: "POST",
          body: JSON.stringify({ username, apiKey }),
        }
      );
      setFound(data.accounts ?? []);
    } catch (e: any) {
      setError(e?.message || "Could not connect to ProjectX");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleAccount(a: DiscoveredAccount, next: boolean) {
    setError(null);
    setBusy(true);
    try {
      // Persist this specific broker account row (upsert), with enable flag
      await fetchJSON("/api/broker-accounts", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "projectx",
          username,
          apiKey,
          contractId: "CON.F.US.MGC.J26",
          externalId: a.externalId,
          accountLabel: a.accountName,
          enable: next,
        }),
      });

      await refresh();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSavedRow(rowId: string) {
    setError(null);
    setBusy(true);
    try {
      await fetchJSON(`/api/broker-accounts/${rowId}`, { method: "DELETE" });
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function isEnabledSaved(externalId: string) {
    const row = projectxSaved.find((r) => r.externalId === externalId);
    return Boolean(row?.isEnabled);
  }

  function savedRowId(externalId: string) {
    const row = projectxSaved.find((r) => r.externalId === externalId);
    return row?.id ?? null;
  }

  const canDiscover = username.trim().length > 0 && apiKey.trim().length > 0 && !busy && !loading;

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

        {/* Minimal connect form */}
        <div className="aura-card-muted aura-grid-gap-12">
          <div className="aura-control-meta">
            <div className="aura-control-title">ProjectX</div>
          </div>

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
                autoComplete="username"
                disabled={busy || loading}
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
                  autoComplete="off"
                  style={{ flex: 1 }}
                  disabled={busy || loading}
                />
                <button
                  className="aura-btn"
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  disabled={busy || loading}
                >
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="aura-control-row">
              <div className="aura-control-meta" />
              <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                <button className="aura-btn" type="button" onClick={onDiscover} disabled={!canDiscover}>
                  {busy ? "Connecting…" : "Connect"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Accounts list (only appears after Connect succeeds) */}
        {found ? (
          <div className="aura-card-muted aura-grid-gap-12">
            <div className="aura-control-meta">
              <div className="aura-control-title">Accounts</div>
            </div>

            <div className="aura-grid-gap-12">
              {found.length === 0 ? (
                <div className="aura-muted aura-text-sm">No active accounts found.</div>
              ) : (
                found.map((a) => {
                  const enabled = isEnabledSaved(a.externalId);
                  const rowId = savedRowId(a.externalId);

                  const display = `${a.accountName} | ${a.externalId} | ${fmtUsd(a.balance)}`;

                  return (
                    <div key={a.externalId} className="aura-control-row">
                      <div className="aura-control-meta">
                        <div className="aura-control-title">{display}</div>
                      </div>

                      <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                        <button
                          className="aura-btn"
                          type="button"
                          disabled={busy || loading}
                          onClick={() => onToggleAccount(a, !enabled)}
                          title={enabled ? "Disable trading on this account" : "Enable trading on this account"}
                        >
                          {enabled ? "Enabled" : "Disabled"}
                        </button>

                        {rowId ? (
                          <button
                            className="aura-btn"
                            type="button"
                            disabled={busy || loading}
                            onClick={() => onDeleteSavedRow(rowId)}
                            title="Remove this account from Aura"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
