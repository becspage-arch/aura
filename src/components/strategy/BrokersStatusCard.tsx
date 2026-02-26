// src/components/strategy/BrokersStatusCard.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BrokerAccountRow = {
  id: string;
  brokerName: string;
  isEnabled: boolean;
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

export function BrokersStatusCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BrokerAccountRow[]>([]);

  const anyAccounts = accounts.length > 0;
  const allEnabled = useMemo(
    () => accounts.length > 0 && accounts.every((a) => a.isEnabled),
    [accounts]
  );

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchJSON<{ ok: true; accounts: BrokerAccountRow[] }>("/api/broker-accounts", {
        method: "GET",
      });
      setAccounts((data.accounts ?? []).map((a) => ({ id: a.id, brokerName: a.brokerName, isEnabled: a.isEnabled })));
    } catch (e: any) {
      setError(e?.message || "Failed to load broker connections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function setEnabledForOne(id: string, next: boolean) {
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

  async function setEnabledForAll(next: boolean) {
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

  const disabled = loading || saving;

  return (
    <section className="aura-card">
      <div className="aura-row-between">
        <div>
          <div className="aura-card-title">Connected brokers</div>
          <div className="aura-muted aura-text-xs aura-mt-10">
            Choose which broker accounts Aura is allowed to trade on when you press RUN.
          </div>
        </div>

        {anyAccounts ? (
          <button
            className="aura-btn"
            type="button"
            disabled={disabled}
            onClick={() => setEnabledForAll(!allEnabled)}
            title={allEnabled ? "Disable trading on all accounts" : "Enable trading on all accounts"}
          >
            {allEnabled ? "Disable all" : "Enable all"}
          </button>
        ) : (
          <Link href="/app/account" className="aura-btn">
            Go to Account
          </Link>
        )}
      </div>

      {error ? (
        <div className="aura-mt-12 aura-error-block">
          <div className="aura-text-xs">Error</div>
          <div className="aura-text-xs">{error}</div>
        </div>
      ) : null}

      <div className="aura-mt-12 aura-grid-gap-12">
        {!anyAccounts ? (
          <div className="aura-card-muted">
            <div className="aura-control-title">No broker connected yet</div>
            <div className="aura-control-help aura-mt-6">
              Connect your broker in Account to start trading.
            </div>
            <div className="aura-mt-12">
              <Link href="/app/account" className="aura-btn aura-btn-primary">
                Connect broker
              </Link>
            </div>
          </div>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="aura-card-muted aura-control-row">
              <div className="aura-control-meta">
                <div className="aura-control-title">{a.brokerName === "projectx" ? "ProjectX" : a.brokerName}</div>
                <div className="aura-control-help">{a.isEnabled ? "Trading enabled" : "Trading disabled"}</div>
              </div>

              <button
                className="aura-btn"
                type="button"
                disabled={disabled}
                onClick={() => setEnabledForOne(a.id, !a.isEnabled)}
              >
                {a.isEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
