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

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export function getOneSignalAppId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
}

export function getOneSignalSafariWebId() {
  return (process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();
}

async function registerOneSignalServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser context.");
  }

  const regs = await navigator.serviceWorker.getRegistrations();
  const already = regs.some((r) => r.active?.scriptURL?.includes("/OneSignalSDKWorker.js"));
  if (already) return;

  await navigator.serviceWorker.register("/OneSignalSDKWorker.js", { scope: "/" });

  for (let i = 0; i < 30; i++) {
    const r2 = await navigator.serviceWorker.getRegistrations();
    const ok = r2.some((r) => r.active?.scriptURL?.includes("/OneSignalSDKWorker.js"));
    if (ok) return;
    await sleep(200);
  }

  throw new Error("Service worker did not become active after registration.");
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

  await withTimeout(registerOneSignalServiceWorker(), 8000, "Service worker registration");

  window.OneSignal.push(function () {
    window.OneSignal.init({
      appId,
      safari_web_id: safariWebId,
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/" },
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
    });
  });
}

function browserPermission(): string {
  if (typeof window === "undefined") return "unknown";
  return (window.Notification?.permission || "unknown").toString();
}

async function requestBrowserPermissionNative(): Promise<string> {
  if (typeof window === "undefined") return "unknown";
  if (!window.Notification || typeof window.Notification.requestPermission !== "function") {
    return browserPermission();
  }

  const cur = browserPermission();
  if (cur !== "default") return cur;

  const res = await withTimeout(
    window.Notification.requestPermission(),
    8000,
    "Notification.requestPermission()"
  );

  return String(res || browserPermission());
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

async function ensureOneSignalOptInFlow(): Promise<void> {
  // Runs inside OneSignal.push() callback (OneSignal is ready)
  // 1) Prompt flow (this is what actually finalises the iOS web-push registration)
  try {
    if (window.OneSignal?.Slidedown?.promptPush) {
      await window.OneSignal.Slidedown.promptPush();
    }
  } catch {
    // ignore - some contexts won't show slidedown
  }

  // 2) Opt in (should flip optedIn -> true when device is truly registered)
  try {
    await window.OneSignal?.User?.PushSubscription?.optIn();
  } catch {
    // ignore
  }
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  return await withTimeout(
    new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve, reject) => {
      window.OneSignal!.push(async function () {
        try {
          // 1) native iOS prompt
          const perm = await requestBrowserPermissionNative();
          const enabled = perm === "granted";

          if (!enabled) {
            resolve({ enabled: false, subscriptionId: null });
            return;
          }

          // 2) Force OneSignal to run its registration / opt-in flow
          await ensureOneSignalOptInFlow();

          // 3) Wait for real id
          const subscriptionId = await waitForSubscriptionId(15000);

          resolve({ enabled: true, subscriptionId });
        } catch (e) {
          reject(e);
        }
      });
    }),
    20000,
    "Push enable flow"
  );
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
