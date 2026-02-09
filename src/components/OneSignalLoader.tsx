// src/components/OneSignalLoader.tsx
"use client";

import Script from "next/script";

export function OneSignalLoader() {
  // Just loads the SDK script. Your OneSignal functions use window.OneSignalDeferred,
  // so we do not import/call ensureOneSignalLoaded here (it does not exist in your client.ts).
  return (
    <Script
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  );
}
