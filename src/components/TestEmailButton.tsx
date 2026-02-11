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

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text();

      let data: any = null;
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(raw);
        } catch {
          // fall through (we'll show raw below)
        }
      }

      if (!res.ok) {
        setStatus("error");

        // If it's JSON, show the API error. If it's HTML/other, show a short snippet.
        const msg =
          data?.error ??
          (raw ? raw.slice(0, 180) : `HTTP ${res.status} with empty response`);

        setMessage(`HTTP ${res.status}: ${msg}`);
        return;
      }

      if (!data?.ok) {
        setStatus("error");
        setMessage(data?.error ?? "Unexpected response");
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
