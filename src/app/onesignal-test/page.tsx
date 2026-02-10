"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
  }
}

export default function OneSignalTestPage() {
  const [log, setLog] = useState<string>("Ready.");

  const appId = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  const safariWebId = (process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "").trim();

  async function run() {
    try {
      if (!appId) throw new Error("Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
      if (!safariWebId) throw new Error("Missing NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID");

      setLog("Running…");

      window.OneSignalDeferred = window.OneSignalDeferred || [];

      await new Promise<void>((resolve) => {
        window.OneSignalDeferred!.push(async function (OneSignal: any) {
          await OneSignal.init({
            appId,
            safari_web_id: safariWebId,
            serviceWorkerPath: "/OneSignalSDKWorker.js",
            serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
            notifyButton: { enable: false },
            allowLocalhostAsSecureOrigin: true,
          });

          // Must be triggered by user click (this function is called by button)
          await OneSignal.Notifications.requestPermission();
          await OneSignal.User.PushSubscription.optIn();

          const subId =
            OneSignal?.User?.PushSubscription?.id ??
            (await OneSignal?.User?.PushSubscription?.getId?.()) ??
            null;

          const onesignalId = OneSignal?.User?.onesignalId ?? null;

          const browserPerm = (window.Notification?.permission || "unknown").toString();

          setLog(
            JSON.stringify(
              {
                browserPermission: browserPerm,
                onesignalId,
                subscriptionId: subId,
                optedIn: OneSignal?.User?.PushSubscription?.optedIn ?? null,
              },
              null,
              2
            )
          );

          resolve();
        });
      });
    } catch (e) {
      setLog(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>OneSignal Subscribe Test</h1>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        This page is only for isolating the subscription problem.
      </p>

      <button
        onClick={run}
        style={{
          marginTop: 12,
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid #ccc",
        }}
      >
        Subscribe on this device
      </button>

      <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{log}</pre>

      <Script
        src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
        strategy="afterInteractive"
      />
    </div>
  );
}
