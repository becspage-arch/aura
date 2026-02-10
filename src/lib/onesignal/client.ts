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

function readSubId(OneSignal: any): string | null {
  const id =
    OneSignal?.User?.PushSubscription?.id ??
    OneSignal?.User?.PushSubscription?.getId?.() ??
    null;

  return id ? String(id) : null;
}

function readToken(OneSignal: any): string | null {
  const tok =
    OneSignal?.User?.PushSubscription?.token ??
    OneSignal?.User?.PushSubscription?.getToken?.() ??
    null;

  return tok ? String(tok) : null;
}

async function waitForSubReady(params: {
  OneSignal: any;
  timeoutMs: number;
}): Promise<{ subscriptionId: string | null; token: string | null }> {
  const { OneSignal, timeoutMs } = params;
  const started = Date.now();

  // Fast path
  const existingId = readSubId(OneSignal);
  const existingTok = readToken(OneSignal);
  if (existingId || existingTok) {
    return { subscriptionId: existingId, token: existingTok };
  }

  // Prefer official change event when available
  const sub = OneSignal?.User?.PushSubscription;
  if (sub?.addEventListener) {
    return await new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        try {
          sub.removeEventListener?.("change", onChange);
        } catch {
          // ignore
        }
        resolve({ subscriptionId: readSubId(OneSignal), token: readToken(OneSignal) });
      };

      const onChange = () => {
        const id = readSubId(OneSignal);
        const tok = readToken(OneSignal);
        if (id || tok) finish();
      };

      sub.addEventListener("change", onChange);

      const tick = async () => {
        while (!done && Date.now() - started < timeoutMs) {
          const id = readSubId(OneSignal);
          const tok = readToken(OneSignal);
          if (id || tok) {
            finish();
            return;
          }
          await sleep(250);
        }
        finish();
      };

      void tick();
    });
  }

  // Fallback polling
  while (Date.now() - started < timeoutMs) {
    const id = readSubId(OneSignal);
    const tok = readToken(OneSignal);
    if (id || tok) return { subscriptionId: id, token: tok };
    await sleep(250);
  }

  return { subscriptionId: null, token: null };
}

export async function requestPushPermission() {
  return await withOneSignal(async (OneSignal) => {
    // 1) Ask browser permission (must be from a user click)
    await OneSignal.Notifications.requestPermission();

    const perm = browserPermission();
    const enabled = perm === "granted";
    if (!enabled) {
      return { enabled: false, subscriptionId: null as string | null };
    }

    // 2) Explicitly opt-in so OneSignal actually creates the subscription (critical on iOS PWA)
    try {
      await OneSignal?.User?.PushSubscription?.optIn?.();
    } catch {
      // If optIn isn't available for some reason, keep going and rely on wait.
    }

    // 3) Wait for OneSignal to actually generate subscription id/token (iOS can be slow)
    const ready = await waitForSubReady({ OneSignal, timeoutMs: 120000 }); // 2 minutes
    return { enabled: true, subscriptionId: ready.subscriptionId };
  });
}

export async function getPushStatus() {
  return await withOneSignal(async (OneSignal) => {
    const permission = browserPermission();

    const subscribed = !!OneSignal?.User?.PushSubscription?.optedIn;

    const id = readSubId(OneSignal);

    return {
      permission,
      subscribed,
      subscriptionId: id ? String(id) : null,
    };
  });
}
