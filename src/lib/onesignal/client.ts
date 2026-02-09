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
    // Listen for the moment iOS actually provides token/id
    const sub = OneSignal?.User?.PushSubscription;
    if (!sub?.addEventListener) {
      throw new Error("OneSignal PushSubscription listener not available");
    }

    let done = false;

    const waitForRealSubscription = new Promise<{ enabled: boolean; subscriptionId: string | null }>(
      (resolve) => {
        const onChange = (event: any) => {
          const id = event?.current?.id ? String(event.current.id) : null;
          const token = event?.current?.token ? String(event.current.token) : null;

          // We care about ID. Token is nice to see in diagnostics.
          if (id && !done) {
            done = true;
            try {
              sub.removeEventListener?.("change", onChange);
            } catch {
              // ignore
            }
            resolve({ enabled: true, subscriptionId: id });
          }

          // Optional: if you want, you can console.log token/id here for debugging
          // console.log("[OneSignal] sub change", { id, token, optedIn: event?.current?.optedIn });
        };

        sub.addEventListener("change", onChange);

        // Safety timeout: return enabled but null id if never arrives
        setTimeout(() => {
          if (!done) {
            done = true;
            try {
              sub.removeEventListener?.("change", onChange);
            } catch {
              // ignore
            }
            resolve({ enabled: browserPermission() === "granted", subscriptionId: null });
          }
        }, 90000); // 90s for iOS
      }
    );

    // 1) Ask browser permission (must be from a user click)
    await OneSignal.Notifications.requestPermission();

    const perm = browserPermission();
    const enabled = perm === "granted";
    if (!enabled) return { enabled: false, subscriptionId: null };

    // 2) Do NOT force optIn here. On iOS it can mark optedIn=true even before token/id exists.
    // Let the subscription change event tell us when the token/id actually arrives.

    // 3) Wait for real subscription id via the official listener
    return await waitForRealSubscription;
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
