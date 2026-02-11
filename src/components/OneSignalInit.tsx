// src/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
    __auraOneSignalInit?: any;
  }
}

export function OneSignalInit() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

    if (!appId) {
      console.error("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID (web init)");
      return;
    }

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        await OneSignal.init({
          appId,
        });

        window.__auraOneSignalInit = { ok: true, ts: new Date().toISOString() };

        console.log("[OneSignal] Web initialised", { appId });
      } catch (e) {
        console.error("[OneSignal] Web init failed", e);
        window.__auraOneSignalInit = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          ts: new Date().toISOString(),
        };
      }
    });
  }, []);

  return null;
}
