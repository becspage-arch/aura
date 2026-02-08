"use client";

export async function registerRootServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const existing = await navigator.serviceWorker.getRegistrations();
  if (existing.length > 0) return;

  await navigator.serviceWorker.register("/OneSignalSDKWorker.js", {
    scope: "/",
  });
}
