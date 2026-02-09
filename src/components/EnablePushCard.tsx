// src/components/EnablePushCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getPushStatus, requestPushPermission } from "@/lib/onesignal/client";
import { registerRootServiceWorker } from "@/lib/onesignal/registerServiceWorker";

type PushStatus = {
  permission: string;
  subscribed: boolean;
  subscriptionId?: string | null;
};

type FetchDiag = {
  ok: boolean;
  status: number;
  redirected: boolean;
  finalUrl: string;
  contentType: string;
  snippet: string;
  error?: string;
};

type OneSignalLiveInfo = {
  ok: boolean;
  error?: string;

  initialized?: boolean;
  isPushSupported?: boolean;

  osPermission?: string | null;
  browserPermission?: string;

  onesignalId?: string | null;
  subscriptionId?: string | null;
  token?: string | null;
  optedIn?: boolean | null;

  // extra internal reads (best-effort)
  rawUser?: any;
  rawPushSub?: any;
};

type IosPwaInfo = {
  uaHasIosDevice: boolean;
  navigatorStandalone?: boolean;
  displayModeStandalone?: boolean;
  referrer?: string;
};

type PermissionInfo = {
  notificationPermission: string;
  permissionsApi_supported: boolean;
  permissionsApi_notifications?: string | null;
  permissionsApi_push?: string | null;
};

type StorageInfo = {
  localStorage_ok: boolean;
  sessionStorage_ok: boolean;
  localStorage_error?: string;
  sessionStorage_error?: string;
};

type NetworkInfo = {
  online?: boolean;
  effectiveType?: string | null;
  rtt?: number | null;
  downlink?: number | null;
  saveData?: boolean | null;
};

type Diag = {
  pageUrl: string;
  origin: string;
  userAgent: string;

  isStandalone: boolean;
  iosPwa: IosPwaInfo;

  permission: PermissionInfo;

  // OneSignal (global + internal)
  oneSignalGlobalType: string;
  oneSignalHasUserModel: boolean;
  oneSignalOptedIn: string;
  oneSignalSubscriptionId: string;
  auraOneSignalInit?: any;
  auraPushSubLast?: any;

  // service worker
  swSupported: boolean;
  swController: boolean;
  swRegistrations: { scope: string; scriptURL: string; state?: string }[];

  swRegisterAttempt?: {
    ok: boolean;
    scope?: string;
    scriptURL?: string;
    error?: string;
  };

  // fetch checks
  fetchWorker?: FetchDiag;
  fetchUpdaterWorker?: FetchDiag;
  fetchManifest?: FetchDiag;
  fetchIcon192?: FetchDiag;

  // api probes
  pingApi?: { ok: boolean; status: number; error?: string };
  pingOneSignalCdn?: { ok: boolean; status: number; error?: string };
  pingOneSignalApi?: { ok: boolean; status: number; error?: string };

  // storage/network
  storage: StorageInfo;
  network: NetworkInfo;

  // OneSignal live snapshot
  oneSignalLive?: OneSignalLiveInfo;

  // any errors we captured
  errors: string[];
};

function isIOSDeviceUA(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as any).standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

async function safeFetchDiag(path: string): Promise<FetchDiag> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");
    const snippet = text.slice(0, 140).replace(/\s+/g, " ").trim();

    return {
      ok: res.ok,
      status: res.status,
      redirected: res.redirected,
      finalUrl: res.url,
      contentType,
      snippet,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      redirected: false,
      finalUrl: path,
      contentType: "",
      snippet: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function ping(url: string): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      // avoid CORS failures looking like "network down"
      mode: "no-cors" as RequestMode,
    });

    // With no-cors, status may be 0 even if it succeeded. Still useful.
    return { ok: true, status: (res as any).status ?? 0 };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function readPermissionsApi(): Promise<PermissionInfo> {
  const info: PermissionInfo = {
    notificationPermission: browserPermission(),
    permissionsApi_supported: false,
    permissionsApi_notifications: null,
    permissionsApi_push: null,
  };

  try {
    if (typeof navigator === "undefined" || !(navigator as any).permissions?.query) {
      return info;
    }
    info.permissionsApi_supported = true;

    try {
      const n = await (navigator as any).permissions.query({ name: "notifications" });
      info.permissionsApi_notifications = n?.state ?? null;
    } catch {
      info.permissionsApi_notifications = null;
    }

    // "push" is not consistently supported on iOS Permissions API
    try {
      const p = await (navigator as any).permissions.query({ name: "push" });
      info.permissionsApi_push = p?.state ?? null;
    } catch {
      info.permissionsApi_push = null;
    }

    return info;
  } catch {
    return info;
  }
}

function readStorageInfo(): StorageInfo {
  const out: StorageInfo = {
    localStorage_ok: false,
    sessionStorage_ok: false,
  };

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const k = "__aura_ls_test";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      out.localStorage_ok = true;
    }
  } catch (e) {
    out.localStorage_ok = false;
    out.localStorage_error = e instanceof Error ? e.message : String(e);
  }

  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const k = "__aura_ss_test";
      window.sessionStorage.setItem(k, "1");
      window.sessionStorage.removeItem(k);
      out.sessionStorage_ok = true;
    }
  } catch (e) {
    out.sessionStorage_ok = false;
    out.sessionStorage_error = e instanceof Error ? e.message : String(e);
  }

  return out;
}

function readNetworkInfo(): NetworkInfo {
  const n: any = typeof navigator !== "undefined" ? (navigator as any) : null;
  const c: any = n?.connection ?? n?.mozConnection ?? n?.webkitConnection ?? null;
  return {
    online: n?.onLine,
    effectiveType: c?.effectiveType ?? null,
    rtt: typeof c?.rtt === "number" ? c.rtt : null,
    downlink: typeof c?.downlink === "number" ? c.downlink : null,
    saveData: typeof c?.saveData === "boolean" ? c.saveData : null,
  };
}

async function readOneSignalLive(): Promise<OneSignalLiveInfo> {
  try {
    if (typeof window === "undefined") {
      return { ok: false, error: "No window", browserPermission: "unknown" };
    }

    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];

    return await new Promise<OneSignalLiveInfo>((resolve) => {
      w.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          const info: OneSignalLiveInfo = {
            ok: true,
            initialized: !!OneSignal?.initialized,
            browserPermission: browserPermission(),
          };

          try {
            info.isPushSupported = await OneSignal.Notifications.isPushSupported();
          } catch {
            info.isPushSupported = undefined;
          }

          try {
            info.osPermission = String(await OneSignal.Notifications.permission);
          } catch {
            info.osPermission = null;
          }

          try {
            info.onesignalId = OneSignal?.User?.onesignalId ?? null;
          } catch {
            info.onesignalId = null;
          }

          try {
            const sub =
              OneSignal?.User?.PushSubscription ??
              OneSignal?.User?.pushSubscription ??
              null;

            info.rawUser = OneSignal?.User ?? null;
            info.rawPushSub = sub ?? null;

            const subId = sub?.id ?? sub?.getId?.() ?? null;
            info.subscriptionId = subId ? String(subId) : null;

            const tok = sub?.token ?? sub?.getToken?.() ?? null;
            info.token = tok ? String(tok) : null;

            const oi = sub?.optedIn;
            info.optedIn = typeof oi === "boolean" ? oi : null;
          } catch {
            info.subscriptionId = null;
            info.token = null;
            info.optedIn = null;
          }

          resolve(info);
        } catch (e) {
          resolve({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            browserPermission: browserPermission(),
          });
        }
      });
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      browserPermission: browserPermission(),
    };
  }
}

async function collectDiagnostics(extra?: {
  swRegisterAttempt?: Diag["swRegisterAttempt"];
}): Promise<Diag> {
  const errors: string[] = [];

  const pageUrl = typeof window !== "undefined" ? window.location.href : "unknown";
  const origin = typeof window !== "undefined" ? window.location.origin : "unknown";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "unknown";
  const standalone = isStandalone();

  const iosPwa: IosPwaInfo = {
    uaHasIosDevice: isIOSDeviceUA(),
    navigatorStandalone: typeof window !== "undefined" ? (window.navigator as any).standalone : undefined,
    displayModeStandalone: typeof window !== "undefined" ? window.matchMedia("(display-mode: standalone)").matches : undefined,
    referrer: typeof document !== "undefined" ? document.referrer || "" : "",
  };

  const permission = await readPermissionsApi();
  const storage = readStorageInfo();
  const network = readNetworkInfo();

  const oneSignalAny = typeof window !== "undefined" ? (window as any).OneSignal : undefined;
  const auraInitMarker = typeof window !== "undefined" ? (window as any).__auraOneSignalInit : null;
  const auraPushSubLast = typeof window !== "undefined" ? (window as any).__auraPushSubLast : null;

  const oneSignalGlobalType = Array.isArray(oneSignalAny) ? "array(queue)" : typeof oneSignalAny;

  const oneSignalHasUserModel =
    !!oneSignalAny &&
    !Array.isArray(oneSignalAny) &&
    !!oneSignalAny.User &&
    !!oneSignalAny.User.PushSubscription;

  let oneSignalOptedIn = "unreadable";
  let oneSignalSubscriptionId = "unreadable";

  try {
    if (oneSignalAny && !Array.isArray(oneSignalAny)) {
      oneSignalOptedIn = String(oneSignalAny.User.PushSubscription.optedIn);
      oneSignalSubscriptionId = String(oneSignalAny.User.PushSubscription.id);
    } else {
      oneSignalOptedIn = "OneSignal not ready (still queue)";
      oneSignalSubscriptionId = "OneSignal not ready (still queue)";
    }
  } catch (e) {
    errors.push(`OneSignal read error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const swSupported = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  const swController = !!(typeof navigator !== "undefined" && navigator.serviceWorker?.controller);

  let swRegistrations: { scope: string; scriptURL: string; state?: string }[] = [];
  try {
    if (swSupported && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      swRegistrations = regs.map((r) => ({
        scope: r.scope,
        scriptURL:
          r.active?.scriptURL ||
          r.installing?.scriptURL ||
          r.waiting?.scriptURL ||
          "(no active scriptURL)",
        state: r.active?.state || r.waiting?.state || r.installing?.state,
      }));
    } else {
      errors.push("serviceWorker API missing");
    }
  } catch (e) {
    errors.push(`SW registrations error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const [
    fetchWorker,
    fetchUpdaterWorker,
    fetchManifest,
    fetchIcon192,
    oneSignalLive,
    pingApi,
    pingOneSignalCdn,
    pingOneSignalApi,
  ] = await Promise.all([
    safeFetchDiag("/OneSignalSDKWorker.js"),
    safeFetchDiag("/OneSignalSDKUpdaterWorker.js"),
    safeFetchDiag("/manifest.json"),
    safeFetchDiag("/icons/icon-192.png"),
    readOneSignalLive(),
    ping("/api/health"),
    ping("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"),
    ping("https://onesignal.com"),
  ]);

  return {
    pageUrl,
    origin,
    userAgent,
    isStandalone: standalone,
    iosPwa,
    permission,
    oneSignalGlobalType,
    oneSignalHasUserModel,
    oneSignalOptedIn,
    oneSignalSubscriptionId,
    auraOneSignalInit: auraInitMarker,
    auraPushSubLast,
    swSupported,
    swController,
    swRegistrations,
    fetchWorker,
    fetchUpdaterWorker,
    fetchManifest,
    fetchIcon192,
    pingApi,
    pingOneSignalCdn,
    pingOneSignalApi,
    storage,
    network,
    swRegisterAttempt: extra?.swRegisterAttempt,
    oneSignalLive,
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

    let swAttempt: Diag["swRegisterAttempt"] | undefined;

    try {
      try {
        const reg = await registerRootServiceWorker();
        swAttempt = {
          ok: true,
          scope: reg?.scope,
          scriptURL:
            reg?.active?.scriptURL ||
            reg?.installing?.scriptURL ||
            reg?.waiting?.scriptURL ||
            "(no active scriptURL)",
        };
      } catch (e) {
        swAttempt = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      const res = await Promise.race([
        requestPushPermission(),
        new Promise<{ enabled: boolean; subscriptionId?: string | null }>((_, reject) =>
          setTimeout(() => reject(new Error("Enable timed out.")), 20000)
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
      setDiag(await collectDiagnostics({ swRegisterAttempt: swAttempt }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDiag(await collectDiagnostics({ swRegisterAttempt: swAttempt }));
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

  const ios = isIOSDeviceUA();
  const standalone = isStandalone();
  const isEnabled = status.permission === "granted" && !!status.subscriptionId;

  const diagText = useMemo(() => {
    if (!diag) return "";
    return JSON.stringify(diag, null, 2);
  }, [diag]);

  return (
    <div className="aura-grid-gap-12">
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
                  // ignore
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

      {error ? (
        <div className="aura-card-muted aura-error-block">
          <div className="aura-control-title">Something went wrong</div>
          <div className="aura-control-help">{error}</div>
        </div>
      ) : null}
    </div>
  );
}
