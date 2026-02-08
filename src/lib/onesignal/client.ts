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

  // wait for activation (bounded)
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

  // ✅ SW must exist for iOS web push
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

async function requestBrowserPermissionNative(): Promise<string> {
  if (typeof window === "undefined") return "unknown";
  if (!window.Notification || typeof window.Notification.requestPermission !== "function") {
    return browserPermission();
  }

  // If already decided, don't call again
  const cur = browserPermission();
  if (cur !== "default") return cur;

  // ✅ Use native iOS permission request (most reliable)
  const res = await withTimeout(window.Notification.requestPermission(), 8000, "Notification.requestPermission()");
  return String(res || browserPermission());
}

export async function requestPushPermission() {
  await ensureOneSignalLoaded();

  // Everything below must never hang silently
  return await withTimeout(
    new Promise<{ enabled: boolean; subscriptionId?: string | null }>((resolve, reject) => {
      window.OneSignal!.push(async function () {
        try {
          // 1) Native browser permission prompt (iOS-safe)
          const perm = await requestBrowserPermissionNative();
          const enabled = perm === "granted";

          // 2) Tell OneSignal we want to opt-in (no-op if already)
          if (enabled) {
            try {
              await window.OneSignal.User.PushSubscription.optIn();
            } catch {
              // ignore
            }
          }

          // 3) Wait for OneSignal to generate a subscription id
          const subscriptionId = enabled ? await waitForSubscriptionId(10000) : null;

          resolve({ enabled, subscriptionId });
        } catch (e) {
          reject(e);
        }
      });
    }),
    12000,
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
