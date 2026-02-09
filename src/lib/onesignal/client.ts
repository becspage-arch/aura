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

export function getOneSignalAppId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

/**
 * Safari Web ID is ONLY needed for legacy Safari Web Push (mostly macOS Safari legacy).
 * Do NOT require it for iOS PWA web push.
 */
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

  // safariWebId is optional
  const safariWebId = getOneSignalSafariWebId();

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  if (window.__auraOneSignalInited) return;
  window.__auraOneSignalInited = true;

  window.OneSignalDeferred.push(async function (OneSignal: any) {
    const initConfig: any = {
      appId,
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    };

    // Only include if set
    if (safariWebId) initConfig.safariWebId = safariWebId;

    await OneSignal.init(initConfig);

    // Capture baseline init info for diagnostics
    try {
      const isPushSupported = await OneSignal.Notifications.isPushSupported();
      const osPermission = await OneSignal.Notifications.permission;
      window.__auraOsInitInfo = {
        initialized: OneSignal.initialized,
        isPushSupported,
        osPermission,
        browserPermission: browserPermission(),
        onesignalId: OneSignal?.User?.onesignalId ?? null,
        subId:
          OneSignal?.User?.PushSubscription?.id ??
          OneSignal?.User?.PushSubscription?.getId?.() ??
          null,
        token:
          OneSignal?.User?.PushSubscription?.token ??
          OneSignal?.User?.PushSubscription?.getToken?.() ??
          null,
      };
    } catch (e) {
      window.__auraOsInitInfo = { error: e instanceof Error ? e.message : String(e) };
    }

    // Listen for subscription changes
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

  await sleep(0);
}

async function waitForId(OneSignal: any, timeoutMs: number) {
  const started = Date.now();

  const getIdNow = () =>
    OneSignal?.User?.PushSubscription?.id ??
    OneSignal?.User?.PushSubscription?.getId?.() ??
    null;

  const existing = getIdNow();
  if (existing) return String(existing);

  while (Date.now() - started < timeoutMs) {
    const id = getIdNow();
    if (id) return String(id);
    await sleep(250);
  }

  return null;
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve) => {
    window.OneSignalDeferred!.push(async function (OneSignal: any) {
      // 1) request browser permission (must be user-initiated)
      await OneSignal.Notifications.requestPermission();

      const perm = browserPermission();
      const enabled = perm === "granted";

      if (!enabled) {
        resolve({ enabled: false, subscriptionId: null });
        return;
      }

      // 2) opt-in
      try {
        await OneSignal.User.PushSubscription.optIn();
      } catch {
        // ignore
      }

      // 3) wait for subscription id (iOS can take a bit)
      const subscriptionId = await waitForId(OneSignal, 30000);

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

      const optedIn = !!OneSignal?.User?.PushSubscription?.optedIn;
      const id =
        OneSignal?.User?.PushSubscription?.id ??
        OneSignal?.User?.PushSubscription?.getId?.() ??
        null;

      resolve({
        permission,
        subscribed: optedIn && !!id,
        subscriptionId: id ? String(id) : null,
      });
    });
  });
}
