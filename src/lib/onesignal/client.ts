// src/lib/onesignal/client.ts
"use client";

declare global {
  interface Window {
    OneSignal?: any;
  }
}

export function getOneSignalAppId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

export async function ensureOneSignalLoaded() {
  if (typeof window === "undefined") return;
  const appId = getOneSignalAppId();
  if (!appId) throw new Error("NEXT_PUBLIC_ONESIGNAL_APP_ID missing");

  // OneSignal v16+ uses a global array API: window.OneSignal = window.OneSignal || []
  window.OneSignal = window.OneSignal || [];

  // init only once
  if ((window as any).__auraOneSignalInited) return;
  (window as any).__auraOneSignalInited = true;

  window.OneSignal.push(function () {
    window.OneSignal.init({
      appId,
      // Service worker is served from /OneSignalSDKWorker.js because it's in /public
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKWorker.js",
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true, // helps dev on http://localhost
    });
  });
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve) => {
    window.OneSignal!.push(async function () {
      // This triggers the browser permission prompt
      await window.OneSignal.Notifications.requestPermission();

      const enabled = await window.OneSignal.Notifications.permission;
      const isGranted = enabled === "granted";

      let subscriptionId: string | null = null;
      try {
        subscriptionId = await window.OneSignal.User.PushSubscription.id;
      } catch {
        subscriptionId = null;
      }

      resolve({ enabled: isGranted, subscriptionId });
    });
  });
}

export async function getPushStatus() {
  await ensureOneSignalLoaded();

  return await new Promise<{ permission: string; subscribed: boolean; subscriptionId?: string | null }>(
    (resolve) => {
      window.OneSignal!.push(async function () {
        const permission = await window.OneSignal.Notifications.permission;
        let subscribed = false;
        let subscriptionId: string | null = null;

        try {
          subscribed = await window.OneSignal.User.PushSubscription.optedIn;
          subscriptionId = await window.OneSignal.User.PushSubscription.id;
        } catch {
          subscribed = false;
          subscriptionId = null;
        }

        resolve({ permission, subscribed, subscriptionId });
      });
    }
  );
}

export async function identifyOneSignalUser(userId: string) {
  await ensureOneSignalLoaded();

  return await new Promise<void>((resolve) => {
    window.OneSignal!.push(async function () {
      await window.OneSignal.login(userId);
      resolve();
    });
  });
}
