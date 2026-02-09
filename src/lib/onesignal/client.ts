// src/lib/onesignal/client.ts
"use client";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

async function withOneSignal<T>(fn: (OneSignal: any) => Promise<T>): Promise<T> {
  if (typeof window === "undefined") throw new Error("OneSignal unavailable on server");

  window.OneSignalDeferred = window.OneSignalDeferred || [];

  return await new Promise<T>((resolve, reject) => {
    window.OneSignalDeferred!.push(async (OneSignal: any) => {
      try {
        const result = await fn(OneSignal);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function waitForSubscriptionId(OneSignal: any, timeoutMs: number) {
  const started = Date.now();

  const readId = () => {
    const id =
      OneSignal?.User?.PushSubscription?.id ??
      OneSignal?.User?.PushSubscription?.getId?.() ??
      null;
    return id ? String(id) : null;
  };

  const existing = readId();
  if (existing) return existing;

  while (Date.now() - started < timeoutMs) {
    const id = readId();
    if (id) return id;
    await sleep(250);
  }

  return null;
}

export async function requestPushPermission() {
  return await withOneSignal(async (OneSignal) => {
    // 1) Ask browser permission (must be from a user click)
    await OneSignal.Notifications.requestPermission();

    const perm = browserPermission();
    const enabled = perm === "granted";
    if (!enabled) return { enabled: false, subscriptionId: null };

    // 2) Ensure OneSignal subscription is opted in
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      // ignore
    }

    // 3) Wait for subscription id (iOS can be slow)
    const subscriptionId = await waitForSubscriptionId(OneSignal, 30000);

    return { enabled: true, subscriptionId };
  });
}

export async function getPushStatus() {
  return await withOneSignal(async (OneSignal) => {
    const permission = browserPermission();

    const subscribed = !!OneSignal?.User?.PushSubscription?.optedIn;

    const id =
      OneSignal?.User?.PushSubscription?.id ??
      OneSignal?.User?.PushSubscription?.getId?.() ??
      null;

    return {
      permission,
      subscribed,
      subscriptionId: id ? String(id) : null,
    };
  });
}
