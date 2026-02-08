// src/components/EnablePushCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getPushStatus, requestPushPermission } from "@/lib/onesignal/client";

type PushStatus = {
  permission: string;
  subscribed: boolean;
  subscriptionId?: string | null;
};

type Diag = {
  pageUrl: string;
  origin: string;
  userAgent: string;
  isStandalone: boolean;
  notificationPermission: string;

  oneSignalGlobalType: string; // "array(queue)" | "object" | "undefined"
  oneSignalHasUserModel: boolean;

  oneSignalOptedIn: string; // stringified
  oneSignalSubscriptionId: string; // stringified

  swRegistrations: { scope: string; scriptURL: string }[];
  errors: string[];
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

async function collectDiagnostics(): Promise<Diag> {
  const errors: string[] = [];

  const pageUrl = typeof window !== "undefined" ? window.location.href : "unknown";
  const origin = typeof window !== "undefined" ? window.location.origin : "unknown";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const standalone = isStandalone();

  const notificationPermission =
    typeof window !== "undefined" && (window as any).Notification
      ? String((window as any).Notification.permission)
      : "Notification API missing";

  const oneSignalAny = typeof window !== "undefined" ? (window as any).OneSignal : undefined;

  const oneSignalGlobalType = Array.isArray(oneSignalAny)
    ? "array(queue)"
    : typeof oneSignalAny;

  const oneSignalHasUserModel =
    !!oneSignalAny &&
    !Array.isArray(oneSignalAny) &&
    !!oneSignalAny.User &&
    !!oneSignalAny.User.PushSubscription;

  let oneSignalOptedIn = "unreadable";
  let oneSignalSubscriptionId = "unreadable";

  try {
    if (oneSignalAny && !Array.isArray(oneSignalAny)) {
      oneSignalOptedIn = String(await oneSignalAny.User.PushSubscription.optedIn);
      oneSignalSubscriptionId = String(await oneSignalAny.User.PushSubscription.id);
    } else {
      oneSignalOptedIn = "OneSignal not ready (still queue)";
      oneSignalSubscriptionId = "OneSignal not ready (still queue)";
    }
  } catch (e) {
    errors.push(`OneSignal read error: ${e instanceof Error ? e.message : String(e)}`);
  }

  let swRegistrations: { scope: string; scriptURL: string }[] = [];
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      swRegistrations = regs.map((r) => ({
        scope: r.scope,
        scriptURL:
          r.active?.scriptURL ||
          r.installing?.scriptURL ||
          r.waiting?.scriptURL ||
          "(no active scriptURL)",
      }));
    } else {
      errors.push("serviceWorker API missing");
    }
  } catch (e) {
    errors.push(`SW registrations error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    pageUrl,
    origin,
    userAgent,
    isStandalone: standalone,
    notificationPermission,
    oneSignalGlobalType,
    oneSignalHasUserModel,
    oneSignalOptedIn,
    oneSignalSubscriptionId,
    swRegistrations,
    errors,
  };
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

  const [diag, setDiag] = useState<Diag | null>(null);

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
      const res = await Promise.race([
        requestPushPermission(),
        new Promise<{ enabled: boolean; subscriptionId?: string | null }>((_, reject) =>
            setTimeout(() => reject(new Error("Enable timed out. Tap Diagnostics → Collect and paste it here.")), 15000)
        ),
        ]);

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
      } else if (res.enabled && !res.subscriptionId) {
        throw new Error(
          "Permission granted, but no OneSignal subscription id was created. This means OneSignal never registered the device."
        );
      }

      await refresh();
      setDiag(await collectDiagnostics());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDiag(await collectDiagnostics());
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
      if (!r.ok) throw new Error(`Test push failed (${r.status}) ${txt}`);

      setDiag(await collectDiagnostics());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDiag(await collectDiagnostics());
    } finally {
      setSendingTest(false);
    }
  }

  const ios = isIOS();
  const standalone = isStandalone();

  // Only "Enabled" when we have a real OneSignal subscription id
  const isEnabled = status.permission === "granted" && !!status.subscriptionId;

  const diagText = useMemo(() => {
    if (!diag) return "";
    return JSON.stringify(diag, null, 2);
  }, [diag]);

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
              <li>b. Tap Share → More → Add to Home Screen</li>
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
              <li>b. Install Aura when prompted</li>
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
              Click the button below, then immediately lock your phone to see the notification.
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

      {/* DIAGNOSTICS (Fact 3 + Fact 4) */}
      <div className="aura-card-muted">
        <div className="aura-control-title">Diagnostics (copy + paste to me)</div>

        <div className="aura-control-row aura-mt-10">
          <div className="aura-control-meta">
            <div className="aura-control-help">
              Tap Collect after clicking Enable. Then Copy and paste the JSON into ChatGPT.
            </div>
          </div>

          <div className="aura-control-right">
            <button
              type="button"
              className="aura-btn aura-btn-subtle"
              onClick={async () => setDiag(await collectDiagnostics())}
            >
              Collect
            </button>

            <button
              type="button"
              className="aura-btn aura-btn-subtle"
              disabled={!diagText}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(diagText);
                } catch {
                  // clipboard can fail on iOS - still renders text for manual copy
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>

        {diagText ? (
          <pre className="aura-mt-12 aura-text-xs aura-muted">{diagText}</pre>
        ) : null}
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
