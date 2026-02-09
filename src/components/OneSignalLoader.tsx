// src/components/OneSignalLoader.tsx
"use client";

import { useEffect } from "react";
import Script from "next/script";
import { ensureOneSignalLoaded } from "@/lib/onesignal/client";

export function OneSignalLoader() {
  useEffect(() => {
    ensureOneSignalLoaded().catch(() => {});
  }, []);

  return (
    <>
      {/* Ensure the queue exists BEFORE the SDK runs */}
      <Script
        id="onesignal-deferred-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: "window.OneSignalDeferred = window.OneSignalDeferred || [];",
        }}
      />

      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
    </>
  );
}
