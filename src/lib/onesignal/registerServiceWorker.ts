// src/lib/onesignal/registerServiceWorker.ts
"use client";

export async function registerRootServiceWorker() {
  if (typeof window === "undefined") throw new Error("No window");
  if (!("serviceWorker" in navigator)) throw new Error("serviceWorker not supported");
  if (!window.isSecureContext) throw new Error("Not a secure context");

  const existing = await navigator.serviceWorker.getRegistrations();
  if (existing.length > 0) return existing[0];

  // Must be a direct 200 JS response (no redirects, no HTML).
  return await navigator.serviceWorker.register("/OneSignalSDKWorker.js", {
    scope: "/",
  });
}
