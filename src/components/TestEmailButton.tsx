"use client";

import { useState } from "react";

export function TestEmailButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function onSend() {
    setStatus("sending");
    setMessage("");

    try {
      const res = await fetch("/api/notifications/test-email", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setStatus("error");
        setMessage(data?.error ?? "Failed to send test email");
        return;
      }

      setStatus("ok");
      setMessage(`Sent to ${data.to}`);
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message ?? "Network error");
    }
  }

  return (
    <div className="aura-row-between">
      <button
        type="button"
        className="aura-btn"
        onClick={onSend}
        disabled={status === "sending"}
      >
        {status === "sending" ? "Sending..." : "Send test email"}
      </button>

      <div className="aura-muted aura-text-xs" style={{ textAlign: "right" }}>
        {status === "ok" ? `✅ ${message}` : status === "error" ? `❌ ${message}` : ""}
      </div>
    </div>
  );
}
