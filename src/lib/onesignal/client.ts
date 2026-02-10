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

async function waitForSubscriptionId(OneSignal: any, timeoutMs: number): Promise<string | null> {
  const started = Date.now();

  const readId = () => {
    const sub = OneSignal?.User?.PushSubscription ?? null;
    const id = sub?.id ?? (typeof sub?.getId === "function" ? sub.getId() : null);
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
    if (!enabled) return { enabled: false, subscriptionId: null as string | null };

    // 2) Explicitly opt-in (THIS is what actually triggers OneSignal to create a device/subscription)
    // iOS PWA can show permission=granted but will not produce a OneSignal subscription unless optIn is called.
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch {
      // Even if this throws, we still try to read id below
    }

    // 3) Wait for a real subscription id:
    // - change listener (best)
    // - polling fallback (necessary on iOS when the event is flaky)
    const sub = OneSignal?.User?.PushSubscription ?? null;

    const byEvent = new Promise<string | null>((resolve) => {
      if (!sub?.addEventListener) return resolve(null);

      const onChange = (event: any) => {
        const id = event?.current?.id ? String(event.current.id) : null;
        if (id) {
          try {
            sub.removeEventListener?.("change", onChange);
          } catch {
            // ignore
          }
          resolve(id);
        }
      };

      sub.addEventListener("change", onChange);

      // Safety timeout for event path
      setTimeout(() => {
        try {
          sub.removeEventListener?.("change", onChange);
        } catch {
          // ignore
        }
        resolve(null);
      }, 30000);
    });

    const byPoll = waitForSubscriptionId(OneSignal, 90000);

    const subscriptionId = (await Promise.race([byEvent, byPoll])) ?? (await byPoll);

    return {
      enabled: true,
      subscriptionId,
    };
  });
}

export async function getPushStatus() {
  return await withOneSignal(async (OneSignal) => {
    const permission = browserPermission();

    const sub = OneSignal?.User?.PushSubscription ?? null;

    const subscribed = !!sub?.optedIn;

    const id =
      sub?.id ??
      (typeof sub?.getId === "function" ? sub.getId() : null) ??
      null;

    return {
      permission,
      subscribed,
      subscriptionId: id ? String(id) : null,
    };
  });
}
