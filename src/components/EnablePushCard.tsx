// src/components/EnablePushCard.tsx
"use client";

import { useEffect, useState } from "react";
import {
  getPushStatus,
  requestPushPermission,
} from "@/lib/onesignal/client";

type PushStatus = {
  permission: string;
  subscribed: boolean;
  subscriptionId?: string | null;
};

function statusLabelFrom(status: PushStatus) {
  if (status.permission === "granted" && status.subscribed) return "Enabled";
  if (status.permission === "denied") return "Blocked";
  if (status.permission === "granted" && !status.subscribed)
    return "Allowed (not subscribed)";
  return "Not enabled";
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  if ((window.navigator as any).standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function EnablePushCard() {
  const [loading, setLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<PushStatus>({
    permission: "unknown",
    subscribed: false,
    subscriptionId: null,
  });

  async function refresh() {
    const s = await getPushStatus();
    setStatus({
      permission: s.permission,
      subscribed: !!s.subscribed,
      subscriptionId: s.subscriptionId ?? null,
    });
  }

  useEffect(() => {
    refresh().catch((e) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  }, []);

  async function enableOnThisDevice() {
    setLoading(true);
    setError(null);

    try {
      const res = await requestPushPermission();

      if (res.enabled && res.subscriptionId) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId: res.subscriptionId }),
        });
      }

      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sendTestPush() {
    setSendingTest(true);
    setError(null);

    try {
      await fetch("/api/push/test", { method: "POST" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTest(false);
    }
  }

  const statusLabel = statusLabelFrom(status);
  const ios = isIOS();
  const standalone = isStandalone();

  return (
    <div className="aura-grid-gap-12">
      {/* STATUS */}
      <div className="aura-control-row">
        <div className="aura-control-meta">
          <div className="aura-control-title">Phone push status</div>
          <div className="aura-control-help">
            Permission:{" "}
            <span className="aura-muted">{status.permission}</span>
            {" · "}
            Subscribed:{" "}
            <span className="aura-muted">
              {status.subscribed ? "Yes" : "No"}
            </span>
          </div>

          {status.subscriptionId ? (
            <div className="aura-muted aura-text-xs aura-mt-6">
              Device ID: {status.subscriptionId}
            </div>
          ) : null}
        </div>

        <span className="aura-select-pill">{statusLabel}</span>
      </div>

      {/* ERROR */}
      {error ? (
        <div className="aura-card-muted aura-error-block">
          <div className="aura-control-title">Something went wrong</div>
          <div className="aura-control-help">{error}</div>
        </div>
      ) : null}

      {/* ACTIONS */}
      <div className="aura-control-row">
        <div className="aura-control-meta">
          <div className="aura-control-title">Enable on this device</div>
          <div className="aura-control-help">
            You will only see the browser permission prompt after clicking Enable.
          </div>
        </div>

        <div className="aura-control-right">
          <button
            type="button"
            className="aura-btn"
            disabled={loading}
            onClick={enableOnThisDevice}
          >
            {loading ? "Enabling…" : "Enable"}
          </button>

          <button
            type="button"
            className="aura-btn aura-btn-subtle"
            disabled={sendingTest || !status.subscriptionId}
            onClick={sendTestPush}
          >
            {sendingTest ? "Sending…" : "Send test push"}
          </button>
        </div>
      </div>

      {/* PUSH PROMPTS */}
      <div className="aura-card-muted">
        <div className="aura-control-title">Push prompts</div>

        <div className="aura-grid-gap-10 aura-text-xs aura-mt-10">
          {/* iOS */}
          <div>
            <div className="aura-font-semibold">iPhone (Safari)</div>
            <ol className="aura-mt-6 aura-muted">
              <li>Open Aura in Safari</li>
              <li>Tap Share → Add to Home Screen</li>
              <li>Open Aura from the Home Screen icon</li>
              <li>Return here and click Enable</li>
            </ol>

            {ios ? (
              <div className="aura-muted aura-text-xs aura-mt-6">
                Detected: iPhone ·{" "}
                {standalone ? "Installed mode" : "Not installed"}
              </div>
            ) : null}
          </div>

          {/* Android */}
          <div>
            <div className="aura-font-semibold">Android (Chrome)</div>
            <ol className="aura-mt-6 aura-muted">
              <li>Open Aura in Chrome</li>
              <li>(Optional) Install Aura when prompted</li>
              <li>Click Enable above</li>
              <li>Tap Allow on the permission prompt</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
