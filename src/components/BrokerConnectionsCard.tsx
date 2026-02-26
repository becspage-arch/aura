// src/components/BrokerConnectionsCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type SavedBrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  accountLabel?: string | null;
  externalId?: string | null;
  balanceUsd?: number | null;
};

type DiscoveredAccountRow = {
  externalId: string; // required for saving
  accountLabel: string; // required for saving
  balanceUsd?: number | string | null; // optional display
};

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed: ${res.status}`);
  return data as T;
}

function brokerLabel(brokerName: string) {
  return brokerName === "projectx" ? "ProjectX" : brokerName;
}

function fmtMoney(v: unknown) {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return null;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function accountLine(a: {
  brokerName?: string | null;
  accountLabel?: string | null;
  externalId?: string | null;
  balanceUsd?: unknown;
}) {
  const broker = brokerLabel(String(a.brokerName || "projectx"));
  const name = (a.accountLabel ?? "").trim();
  const id = (a.externalId ?? "").trim();
  const bal = fmtMoney(a.balanceUsd);

  return [broker, name || "Account", id || null, bal || null].filter(Boolean).join(" | ");
}

export function BrokerConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saved rows from DB
  const [saved, setSaved] = useState<SavedBrokerAccountRow[]>([]);

  // Discovered accounts from ProjectX (not saved yet)
  const [discovered, setDiscovered] = useState<DiscoveredAccountRow[]>([]);

  // Credentials input (only what the user types)
  const [username, setUsername] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // When user wants to add more accounts / refresh list
  const [showConnect, setShowConnect] = useState(false);

  const savedProjectX = useMemo(
    () => saved.filter((a) => a.brokerName === "projectx"),
    [saved]
  );

  const hasSavedProjectX = savedProjectX.length > 0;

  async function refreshSaved() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: SavedBrokerAccountRow[] }>("/api/broker-accounts", {
        method: "GET",
      });
      setSaved(data.accounts ?? []);
    } catch (e: any) {
      setError(e?.message || "Failed to load broker accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function discoverFromProjectX() {
    // Loads the account list from ProjectX using the entered credentials.
    // This does NOT save anything by itself (it just populates the list).
    const data = await fetchJSON<{ ok: true; accounts: DiscoveredAccountRow[] }>(
      "/api/broker-accounts/projectx/discover",
      {
        method: "POST",
        body: JSON.stringify({ username, apiKey }),
      }
    );

    const rows = Array.isArray(data.accounts) ? data.accounts : [];
    // Hard guard so the UI can never show broken rows
    const cleaned = rows
      .map((a) => ({
        externalId: String(a.externalId ?? "").trim(),
        accountLabel: String(a.accountLabel ?? "").trim(),
        balanceUsd: a.balanceUsd ?? null,
      }))
      .filter((a) => a.externalId && a.accountLabel);

    setDiscovered(cleaned);
  }

  async function onConnect() {
    setError(null);

    if (!username.trim() || !apiKey.trim()) {
      // Friendly, UI-level validation (no scary API error)
      setError("Enter your ProjectX username and API key to continue.");
      return;
    }

    setBusy(true);
    try {
      await discoverFromProjectX();
      // Once we have the list, we keep credentials in-memory for enabling accounts,
      // but we do NOT show them again unless user clicks "Add / refresh".
      setShowConnect(false);
    } catch (e: any) {
      setError(e?.message || "Couldn’t connect to ProjectX. Check your username / API key.");
      setDiscovered([]);
    } finally {
      setBusy(false);
    }
  }

  async function onEnableSaved(accountId: string, next: boolean) {
    setError(null);
    setBusy(true);
    try {
      await fetchJSON(`/api/broker-accounts/${accountId}`, {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: next }),
      });
      await refreshSaved();
    } catch (e: any) {
      setError(e?.message || "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function onEnableDiscovered(a: DiscoveredAccountRow, next: boolean) {
    // If enabling a discovered account, we must SAVE it (create brokerAccount row).
    // If disabling a discovered account that isn't saved yet, it's just a UI toggle (no DB).
    if (!next) return;

    setError(null);

    if (!username.trim() || !apiKey.trim()) {
      setError("To enable an account, enter your ProjectX username and API key first.");
      return;
    }

    setBusy(true);
    try {
      await fetchJSON("/api/broker-accounts", {
        method: "POST",
        body: JSON.stringify({
          brokerName: "projectx",
          username,
          apiKey,
          contractId: "CON.F.US.MGC.J26",
          externalId: a.externalId,
          accountLabel: a.accountLabel,
          enable: true,
        }),
      });

      await refreshSaved();

      // Optional: once they successfully save at least one account,
      // clear the apiKey from UI memory (safer).
      setApiKey("");
      setShowKey(false);
    } catch (e: any) {
      setError(e?.message || "Couldn’t enable that account");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteProjectXCredentials() {
    setError(null);
    if (savedProjectX.length === 0) return;

    const ok = window.confirm(
      "Delete ProjectX broker credentials?\n\nThis will remove all saved ProjectX accounts from Aura."
    );
    if (!ok) return;

    setBusy(true);
    try {
      // Delete every saved ProjectX brokerAccount row (no per-account delete UI)
      for (const row of savedProjectX) {
        await fetchJSON(`/api/broker-accounts/${row.id}`, { method: "DELETE" });
      }

      // Reset UI
      setDiscovered([]);
      setUsername("");
      setApiKey("");
      setShowKey(false);
      setShowConnect(false);

      await refreshSaved();
    } catch (e: any) {
      setError(e?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  // Saved lookup by externalId so we can show discovered rows as enabled/disabled accurately
  const savedByExternalId = useMemo(() => {
    const m = new Map<string, SavedBrokerAccountRow>();
    for (const s of savedProjectX) {
      const k = (s.externalId ?? "").trim();
      if (k) m.set(k, s);
    }
    return m;
  }, [savedProjectX]);

  const statusPill = loading
    ? "Loading…"
    : hasSavedProjectX
      ? savedProjectX.some((a) => a.isEnabled)
        ? "Connected"
        : "Connected"
      : "Not connected";

  const disabled = busy || loading;

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
          {/* Header row */}
          <div className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">ProjectX</div>
            </div>

            <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
              {hasSavedProjectX ? (
                <>
                  <button
                    className="aura-btn"
                    type="button"
                    disabled={disabled}
                    onClick={() => setShowConnect((v) => !v)}
                  >
                    {showConnect ? "Hide" : "Add / refresh"}
                  </button>

                  <button
                    className="aura-btn"
                    type="button"
                    disabled={disabled}
                    onClick={onDeleteProjectXCredentials}
                    title="Delete saved ProjectX credentials and accounts from Aura"
                  >
                    Delete ProjectX broker credentials
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {/* CONNECT (only when not connected OR when user chooses Add/refresh) */}
          {!hasSavedProjectX || showConnect ? (
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
                  <button
                    className="aura-btn"
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    disabled={disabled}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                  <button
                    className="aura-btn"
                    type="button"
                    onClick={onConnect}
                    disabled={disabled}
                    title="Load your ProjectX accounts"
                  >
                    {busy ? "Connecting…" : "Connect"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ACCOUNTS (no gap) */}
          <div className="aura-grid-gap-12" style={{ marginTop: 0 }}>
            <div className="aura-control-title">Accounts</div>

            {/* If we have saved accounts, show them. */}
            {savedProjectX.length > 0 ? (
              <div className="aura-grid-gap-12">
                {savedProjectX.map((a) => (
                  <div key={a.id} className="aura-control-row">
                    <div className="aura-control-meta">
                      <div className="aura-control-title">
                        {accountLine({
                          brokerName: a.brokerName,
                          accountLabel: a.accountLabel,
                          externalId: a.externalId,
                          balanceUsd: a.balanceUsd ?? null,
                        })}
                      </div>
                    </div>

                    <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                      <button
                        className="aura-btn"
                        type="button"
                        disabled={disabled}
                        onClick={() => onEnableSaved(a.id, !a.isEnabled)}
                      >
                        {a.isEnabled ? "Enabled" : "Disabled"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* If not connected and not discovered yet, show a single helpful line (no scary errors). */}
            {savedProjectX.length === 0 && discovered.length === 0 ? (
              <div className="aura-muted aura-text-xs">Connect to ProjectX to load your accounts.</div>
            ) : null}

            {/* Discovered list (for enabling additional accounts) */}
            {discovered.length > 0 ? (
              <div className="aura-grid-gap-12">
                {discovered.map((a) => {
                  const savedRow = savedByExternalId.get(a.externalId) ?? null;
                  const enabled = savedRow ? savedRow.isEnabled : false;

                  return (
                    <div key={a.externalId} className="aura-control-row">
                      <div className="aura-control-meta">
                        <div className="aura-control-title">
                          {accountLine({
                            brokerName: "projectx",
                            accountLabel: a.accountLabel,
                            externalId: a.externalId,
                            balanceUsd: a.balanceUsd ?? null,
                          })}
                        </div>
                      </div>

                      <div className="aura-control-right" style={{ display: "flex", gap: 8 }}>
                        <button
                          className="aura-btn"
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (savedRow) {
                              void onEnableSaved(savedRow.id, !savedRow.isEnabled);
                            } else {
                              void onEnableDiscovered(a, true);
                            }
                          }}
                          title={enabled ? "Disable trading" : "Enable trading"}
                        >
                          {enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* If connected but user hasn’t clicked add/refresh, keep UI clean */}
        </div>
      </div>
    </section>
  );
}
