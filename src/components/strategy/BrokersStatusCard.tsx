// src/components/strategy/BrokersStatusCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type BrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
  accountLabel?: string | null;
  externalId?: string | null;
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

function accountLine(a: BrokerAccountRow) {
  const name = (a.accountLabel ?? "").trim();
  const id = (a.externalId ?? "").trim();

  const parts = [name || null, id || null].filter(Boolean) as string[];
  return parts.length ? parts.join(" | ") : "Account";
}

export function BrokersStatusCard(props: {
  isTrading?: boolean;
  onEnabledCountChange?: (n: number) => void;
}) {
  const { isTrading = false, onEnabledCountChange } = props;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BrokerAccountRow[]>([]);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: BrokerAccountRow[] }>("/api/broker-accounts");
      const rows = data.accounts ?? [];
      setAccounts(rows);
      onEnabledCountChange?.(rows.filter((a) => a.isEnabled).length);
    } catch (e: any) {
      setError(e?.message || "Failed to load broker accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const enabledCount = useMemo(
    () => accounts.filter((a) => a.isEnabled).length,
    [accounts]
  );

  async function toggleAccount(id: string, next: boolean) {
    setError(null);
    setSaving(true);

    try {
      await fetchJSON(`/api/broker-accounts/${id}`, {
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

  const disabled = loading || saving || isTrading;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Trading Accounts</div>
          <div className="aura-muted aura-text-xs">
            Aura will run this strategy on all enabled accounts.
          </div>
        </div>

        <div className="aura-muted aura-text-xs">
          {loading
            ? "Loading…"
            : `${enabledCount} enabled`}
        </div>
      </div>

      {error ? (
        <div
          className="aura-card-muted aura-text-xs aura-mt-12"
          style={{ borderColor: "rgba(255,0,0,0.35)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="aura-mt-12 aura-grid-gap-12">
        {!loading && accounts.length === 0 ? (
          <div className="aura-card-muted">
            <div className="aura-control-title">No broker accounts connected</div>
            <div className="aura-control-help aura-mt-6">
              Connect your broker in Account to allow Aura to trade.
            </div>
          </div>
        ) : null}

        {accounts.map((a) => (
          <div key={a.id} className="aura-control-row">
            <div className="aura-control-meta">
              <div className="aura-control-title">
                {accountLine(a)}
              </div>
              <div className="aura-control-help">
                {a.isEnabled
                  ? "Strategy will run on this account"
                  : "Strategy will not run on this account"}
              </div>
            </div>

            <div className="aura-control-right">
              <button
                className="aura-btn"
                type="button"
                disabled={disabled}
                onClick={() => toggleAccount(a.id, !a.isEnabled)}
              >
                {a.isEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {isTrading ? (
        <div className="aura-muted aura-text-xs aura-mt-12">
          Settings locked while Aura is running.
        </div>
      ) : null}
    </section>
  );
}
