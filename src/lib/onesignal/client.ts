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

function readSubSnapshot(OneSignal: any): { id: string | null; token: string | null; optedIn: boolean | null } {
  const sub = OneSignal?.User?.PushSubscription ?? null;
  if (!sub) return { id: null, token: null, optedIn: null };

  const id = sub?.id ? String(sub.id) : null;
  const token = sub?.token ? String(sub.token) : null;

  const oi = sub?.optedIn;
  const optedIn = typeof oi === "boolean" ? oi : null;

  return { id, token, optedIn };
}

export async function requestPushPermission(): Promise<{ enabled: boolean; subscriptionId: string | null }> {
  return await withOneSignal(async (OneSignal) => {
    const sub = OneSignal?.User?.PushSubscription;
    if (!sub?.addEventListener) {
      throw new Error("OneSignal PushSubscription listener not available");
    }

    // Must be invoked from a user gesture (your button does that)
    await OneSignal.Notifications.requestPermission();

    const perm = browserPermission();
    const enabled = perm === "granted";
    if (!enabled) return { enabled: false, subscriptionId: null };

    // IMPORTANT: iOS PWA often needs an explicit optIn() to actually kick off token/id creation.
    try {
      OneSignal?.User?.PushSubscription?.optIn?.();
    } catch {
      // ignore
    }

    // Resolve when we actually have a real subscription id (or timeout)
    const timeoutMs = 120000; // iOS can be slow; 2 minutes is realistic
    const started = Date.now();

    // 1) If already present, return immediately
    const snap0 = readSubSnapshot(OneSignal);
    if (snap0.id) return { enabled: true, subscriptionId: snap0.id };

    // 2) Otherwise wait for the "change" event OR poll (whichever happens first)
    return await new Promise<{ enabled: boolean; subscriptionId: string | null }>((resolve) => {
      let done = false;

      const finish = (id: string | null) => {
        if (done) return;
        done = true;
        try {
          sub.removeEventListener?.("change", onChange);
        } catch {
          // ignore
        }
        resolve({ enabled: true, subscriptionId: id });
      };

      const onChange = (event: any) => {
        const id = event?.current?.id ? String(event.current.id) : null;
        if (id) finish(id);
      };

      sub.addEventListener("change", onChange);

      (async () => {
        while (!done && Date.now() - started < timeoutMs) {
          const snap = readSubSnapshot(OneSignal);
          if (snap.id) {
            finish(snap.id);
            return;
          }
          await sleep(250);
        }

        // Timed out - permission is granted but OneSignal never got an id
        finish(null);
      })().catch(() => finish(null));
    });
  });
}

export async function getPushStatus(): Promise<{ permission: string; subscribed: boolean; subscriptionId: string | null }> {
  return await withOneSignal(async (OneSignal) => {
    const permission = browserPermission();

    const snap = readSubSnapshot(OneSignal);
    const subscribed = !!snap.optedIn;

    return {
      permission,
      subscribed,
      subscriptionId: snap.id,
    };
  });
}
