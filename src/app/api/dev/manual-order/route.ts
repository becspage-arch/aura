// src/lib/onesignal/client.ts
"use client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
    __auraOneSignalInited?: boolean;

    // for diagnostics
    __auraOsInitInfo?: any;
    __auraPushLastChange?: any;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getOneSignalAppId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

export function getOneSignalSafariWebId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

function safeJson(obj: any) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return String(obj);
  }
}

export async function ensureOneSignalLoaded() {
  if (typeof window === "undefined") return;

  const appId = getOneSignalAppId();
  if (!appId) throw new Error("NEXT_PUBLIC_ONESIGNAL_APP_ID missing");

  const safariWebId = getOneSignalSafariWebId();
  if (!safariWebId) throw new Error("NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID missing");

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  if (window.__auraOneSignalInited) return;
  window.__auraOneSignalInited = true;

  window.OneSignalDeferred.push(async function (OneSignal: any) {
    await OneSignal.init({
      appId,
      safariWebId,
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });

    try {
      await OneSignal.Notifications.isPushSupported();
    } catch {}

    // Capture baseline init info for diagnostics
    try {
      const isPushSupported = await OneSignal.Notifications.isPushSupported();
      const osPermission = await OneSignal.Notifications.permission; // OneSignal’s own permission state
      window.__auraOsInitInfo = {
        initialized: OneSignal.initialized,
        isPushSupported,
        osPermission,
        browserPermission: browserPermission(),
        onesignalId: OneSignal?.User?.onesignalId ?? null,
        subId: OneSignal?.User?.PushSubscription?.id ?? null,
        token: OneSignal?.User?.PushSubscription?.token ?? null,
      };
    } catch (e) {
      window.__auraOsInitInfo = { error: e instanceof Error ? e.message : String(e) };
    }

    // Recommended: listen for subscription changes
    try {
      OneSignal.User.PushSubscription.addEventListener("change", (event: any) => {
        window.__auraPushLastChange = safeJson({
          previous: event?.previous,
          current: event?.current,
        });
      });
    } catch (e) {
      window.__auraPushLastChange = { error: e instanceof Error ? e.message : String(e) };
    }
  });

  // allow the pushed init callback to run
  await sleep(0);
}

async function waitForIdViaListener(OneSignal: any, timeoutMs: number) {
  const started = Date.now();

  // quick check first
  const existing = OneSignal?.User?.PushSubscription?.id;
  if (existing) return String(existing);

  return await new Promise<string | null>((resolve) => {
    let done = false;

    const stop = () => {
      done = true;
      try {
        OneSignal?.User?.PushSubscription?.removeEventListener?.("change", onChange);
      } catch {
        // ignore
      }
    };

    const onChange = (event: any) => {
      const id = event?.current?.id;
      if (id) {
        stop();
        resolve(String(id));
      }
    };

    try {
      OneSignal.User.PushSubscription.addEventListener("change", onChange);
    } catch {
      // if removeEventListener isn't supported in this build, we still resolve by timeout/poll
    }

    const tick = async () => {
      while (!done && Date.now() - started < timeoutMs) {
        const id = OneSignal?.User?.PushSubscription?.id;
        if (id) {
          stop();
          resolve(String(id));
          return;
        }
        await sleep(250);
      }
      stop();
      resolve(null);
    };

    tick();
  });
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve) => {
    window.OneSignalDeferred!.push(async function (OneSignal: any) {
      // 1) request browser permission
      await OneSignal.Notifications.requestPermission();

      const perm = browserPermission();
      const enabled = perm === "granted";

      if (!enabled) {
        resolve({ enabled: false, subscriptionId: null });
        return;
      }

      // 2) opt-in with OneSignal
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch {
        // ignore
      }

      // 3) wait for subscription id via listener (more reliable on iOS)
      const subscriptionId = await waitForIdViaListener(OneSignal, 30000);

      resolve({ enabled: true, subscriptionId });
    });
  });
}

export async function getPushStatus() {
  await ensureOneSignalLoaded();

  return await new Promise<{
    permission: string;
    subscribed: boolean;
    subscriptionId?: string | null;
  }>((resolve) => {
    window.OneSignalDeferred!.push(async function (OneSignal: any) {
      const permission = browserPermission();

      const subscribed = !!OneSignal?.User?.PushSubscription?.optedIn;
      const subscriptionId = OneSignal?.User?.PushSubscription?.id
        ? String(OneSignal.User.PushSubscription.id)
        : null;

      resolve({ permission, subscribed, subscriptionId });
    });
  });
}
