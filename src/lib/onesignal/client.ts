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

async function registerOneSignalServiceWorker(): Promise<void> {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser context.");
  }

  // If already registered, do nothing
  const regs = await navigator.serviceWorker.getRegistrations();
  const already = regs.some((r) => r.active?.scriptURL?.includes("/OneSignalSDKWorker.js"));
  if (already) return;

  // Explicit registration (this is the missing piece on iOS PWA)
  await navigator.serviceWorker.register("/OneSignalSDKWorker.js", { scope: "/" });

  // Wait briefly for activation
  for (let i = 0; i < 20; i++) {
    const r2 = await navigator.serviceWorker.getRegistrations();
    const ok = r2.some((r) => r.active?.scriptURL?.includes("/OneSignalSDKWorker.js"));
    if (ok) return;
    await sleep(150);
  }

  throw new Error(
    "OneSignal service worker register attempted, but it never became active. (No SW registrations found.)"
  );
}

export async function ensureOneSignalLoaded() {
  if (typeof window === "undefined") return;

  const appId = getOneSignalAppId();
  if (!appId) throw new Error("NEXT_PUBLIC_ONESIGNAL_APP_ID missing");

  const safariWebId = getOneSignalSafariWebId();
  if (!safariWebId) throw new Error("NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID missing");

  // OneSignal global
  window.OneSignal = window.OneSignal || [];

  // init only once
  if ((window as any).__auraOneSignalInited) return;
  (window as any).__auraOneSignalInited = true;

  // ✅ Ensure SW is really registered BEFORE init
  await registerOneSignalServiceWorker();

  window.OneSignal.push(function () {
    window.OneSignal.init({
      appId,
      safari_web_id: safariWebId,

      // Worker file is at site root and we want root scope
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      serviceWorkerUpdaterPath: "/OneSignalSDKWorker.js",
      serviceWorkerParam: { scope: "/" }, // OneSignal-supported scope config :contentReference[oaicite:1]{index=1}

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
      const subscriptionId = enabled ? await waitForSubscriptionId(8000) : null;

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
