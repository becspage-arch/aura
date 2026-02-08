// src/components/EnablePushCard.tsx
"use client";

import { useEffect, useState } from "react";
import { getPushStatus, requestPushPermission } from "@/lib/onesignal/client";

type PushStatus = {
  permission: string;
  subscribed: boolean;
  subscriptionId?: string | null;
};

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
    refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function enableOnThisDevice() {
    setLoading(true);
    setError(null);

    try {
      const res = await requestPushPermission();

      if (res.enabled && res.subscriptionId) {
        const r = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId: res.subscriptionId }),
        });

        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`Subscribe save failed (${r.status}) ${txt}`);
        }
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
      const r = await fetch("/api/push/test", { method: "POST" });
      const txt = await r.text().catch(() => "");

      if (!r.ok) {
        throw new Error(`Test push failed (${r.status}) ${txt}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingTest(false);
    }
  }

  const ios = isIOS();
  const standalone = isStandalone();
  const isEnabled = status.permission === "granted" && status.subscribed;

  return (
    <div className="aura-grid-gap-12">
      {/* STEP 1 */}
      <div className="aura-card-muted">
        <div className="aura-control-title">Step 1 – Add Aura to your device</div>

        <div className="aura-grid-gap-10 aura-text-xs aura-mt-10">
          <div>
            <div className="aura-font-semibold">iPhone (Safari)</div>
            <ol className="aura-mt-6 aura-muted">
              <li>a. Open Aura in Safari and log in</li>
              <li>b. Tap Share → Add to Home Screen</li>
              <li>c. Open Aura from the Home Screen icon</li>
            </ol>

            {ios ? (
              <div className="aura-muted aura-text-xs aura-mt-6">
                Detected: iPhone · {standalone ? "Installed" : "Not installed"}
              </div>
            ) : null}
          </div>

          <div>
            <div className="aura-font-semibold">Android (Chrome)</div>
            <ol className="aura-mt-6 aura-muted">
              <li>a. Open Aura in Chrome and log in</li>
              <li>b. (Optional) Install Aura when prompted</li>
            </ol>
          </div>
        </div>
      </div>

      {/* STEP 2 */}
      <div className="aura-card-muted">
        <div className="aura-control-title">Step 2 – Enable notifications</div>

        <div className="aura-control-row aura-mt-10">
          <div className="aura-control-meta">
            <div className="aura-control-help">
              Click Enable and allow notifications for this device.
            </div>

            <div className="aura-muted aura-text-xs aura-mt-6">
              Debug: permission={status.permission} · subscribed={String(status.subscribed)} · id=
              {status.subscriptionId ? "yes" : "no"}
            </div>

            {status.subscriptionId ? (
              <div className="aura-muted aura-text-xs aura-mt-6">Device registered</div>
            ) : null}
          </div>

          <div className="aura-control-right">
            <button
              type="button"
              className="aura-btn"
              disabled={loading || isEnabled}
              onClick={enableOnThisDevice}
            >
              {loading ? "Enabling…" : isEnabled ? "Enabled" : "Enable"}
            </button>
          </div>
        </div>
      </div>

      {/* STEP 3 */}
      <div className="aura-card-muted">
        <div className="aura-control-title">Step 3 – Send a test notification</div>

        <div className="aura-control-row aura-mt-10">
          <div className="aura-control-meta">
            <div className="aura-control-help">
              Lock your phone after sending to see the notification.
            </div>
          </div>

          <div className="aura-control-right">
            <button
              type="button"
              className="aura-btn aura-btn-subtle"
              disabled={sendingTest || !isEnabled}
              onClick={sendTestPush}
            >
              {sendingTest ? "Sending…" : "Send test notification"}
            </button>
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error ? (
        <div className="aura-card-muted aura-error-block">
          <div className="aura-control-title">Something went wrong</div>
          <div className="aura-control-help">{error}</div>
        </div>
      ) : null}
    </div>
  );
}
