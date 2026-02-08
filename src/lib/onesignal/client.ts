"use client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
    __auraOneSignalInited?: boolean;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function getOneSignalAppId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

export function getOneSignalSafariWebId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

/**
 * v16 init uses OneSignalDeferred, NOT OneSignal.push(...)
 */
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
      safari_web_id: safariWebId,

      // Important: use the standard filenames OneSignal expects
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",

      notifyButton: { enable: false },

      // ok for local dev only
      allowLocalhostAsSecureOrigin: true,
    });
  });
}

async function readSubscriptionId(OneSignal: any): Promise<string | null> {
  try {
    const id = OneSignal?.User?.PushSubscription?.id;
    if (!id) return null;
    return String(id);
  } catch {
    return null;
  }
}

async function waitForSubscriptionId(OneSignal: any, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const id = await readSubscriptionId(OneSignal);
    if (id) return id;
    await sleep(250);
  }
  return null;
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await new Promise<{ enabled: boolean; subscriptionId?: string | null }>(
    (resolve) => {
      window.OneSignalDeferred!.push(async function (OneSignal: any) {
        // 1) Ask browser permission
        await OneSignal.Notifications.requestPermission();

        const perm = browserPermission();
        const enabled = perm === "granted";

        // 2) If granted, opt-in at OneSignal level
        if (enabled) {
          try {
            await OneSignal.User.PushSubscription.optIn();
          } catch {
            // ignore
          }
        }

        // 3) Wait for real id to exist
        const subscriptionId = enabled ? await waitForSubscriptionId(OneSignal, 10000) : null;

        resolve({ enabled, subscriptionId });
      });
    }
  );
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

      let subscribed = false;
      let subscriptionId: string | null = null;

      try {
        subscribed = !!OneSignal?.User?.PushSubscription?.optedIn;
      } catch {
        subscribed = false;
      }

      subscriptionId = await readSubscriptionId(OneSignal);

      resolve({ permission, subscribed, subscriptionId });
    });
  });
}
