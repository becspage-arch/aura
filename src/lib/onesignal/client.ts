// src/lib/onesignal/client.ts
"use client";

declare global {
  interface Window {
    OneSignal?: any;
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

export async function ensureOneSignalLoaded() {
  if (typeof window === "undefined") return;

  const appId = getOneSignalAppId();
  if (!appId) throw new Error("NEXT_PUBLIC_ONESIGNAL_APP_ID missing");

  const safariWebId = getOneSignalSafariWebId();
  if (!safariWebId) throw new Error("NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID missing");

  window.OneSignal = window.OneSignal || [];

  if ((window as any).__auraOneSignalInited) return;
  (window as any).__auraOneSignalInited = true;

  window.OneSignal.push(function () {
    window.OneSignal.init({
      appId,
      safari_web_id: safariWebId,
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKWorker.js",
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
  });
}

// Browser-level permission ("default" | "granted" | "denied")
function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

async function waitForSubscriptionId(timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const id = await window.OneSignal?.User?.PushSubscription?.id;
      if (id) return String(id);
    } catch {
      // ignore
    }
    await sleep(250);
  }
  return null;
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve) => {
    window.OneSignal!.push(async function () {
      // 1) Ask permission (native browser prompt)
      await window.OneSignal.Notifications.requestPermission();

      const perm = browserPermission();
      const enabled = perm === "granted";

      // 2) If granted, opt-in on OneSignal user model
      if (enabled) {
        try {
          await window.OneSignal.User.PushSubscription.optIn();
        } catch {
          // ignore
        }
      }

      // 3) Wait until OneSignal generates a real subscription id
      const subscriptionId = enabled ? await waitForSubscriptionId(6000) : null;

      resolve({ enabled, subscriptionId });
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
    window.OneSignal!.push(async function () {
      const permission = browserPermission();

      let subscribed = false;
      let subscriptionId: string | null = null;

      try {
        subscribed = !!(await window.OneSignal.User.PushSubscription.optedIn);
      } catch {
        subscribed = false;
      }

      try {
        const id = await window.OneSignal.User.PushSubscription.id;
        subscriptionId = id ? String(id) : null;
      } catch {
        subscriptionId = null;
      }

      resolve({ permission, subscribed, subscriptionId });
    });
  });
}
