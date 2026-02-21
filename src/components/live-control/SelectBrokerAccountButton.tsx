"use client";

import { useState } from "react";

export function SelectBrokerAccountButton(props: { brokerAccountId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trading-state/select-broker-account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brokerAccountId: props.brokerAccountId }),
      });

      const text = await res.text();
      if (!res.ok) {
        setMsg(`FAILED ${res.status}: ${text}`);
        return;
      }

      setMsg(`OK: ${text}`);
    } catch (e) {
      setMsg(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="aura-card">
      <div className="aura-card-title">Broker Account (temporary)</div>
      <p className="aura-muted aura-text-xs aura-mt-10">
        This is a temporary control to set selectedBrokerAccountId for your user.
      </p>

      <div className="aura-mt-10 flex flex-col gap-2">
        <button
          type="button"
          className="aura-btn aura-btn-primary"
          disabled={busy}
          onClick={onClick}
        >
          {busy ? "Setting…" : "Select ProjectX account"}
        </button>

        {msg ? <pre className="aura-pre aura-text-xs">{msg}</pre> : null}
      </div>
    </section>
  );
}
