// src/app/onesignal-test/page.tsx
"use client";

import Script from "next/script";
import { useState } from "react";

declare global {
  interface Window {
    OneSignalDeferred?: any[];
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

      await new Promise<void>((resolve, reject) => {
        window.OneSignalDeferred!.push(async (OneSignal: any) => {
          try {
            await OneSignal.init({
              appId,
              safari_web_id: safariWebId, // IMPORTANT: snake_case for v16 config
              serviceWorkerPath: "/OneSignalSDKWorker.js",
              serviceWorkerUpdaterPath: "/OneSignalSDKUpdaterWorker.js",
              serviceWorkerParam: { scope: "/" },
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: false,
            });

            const browserPerm = (window.Notification?.permission || "unknown").toString();

            // Must be triggered by user click (this function is called by button)
            await OneSignal.Notifications.requestPermission();

            const sub = OneSignal?.User?.PushSubscription;
            if (!sub?.addEventListener) {
              throw new Error("PushSubscription listener not available (unexpected for v16)");
            }

            // Wait for a REAL subscription (id/token) from iOS.
            // Do NOT call optIn() here - it can set optedIn=true before iOS supplies token/id.
            let done = false;

            const resultPromise = new Promise<any>((res) => {
              const onChange = (event: any) => {
                const id = event?.current?.id ? String(event.current.id) : null;
                const token = event?.current?.token ? String(event.current.token) : null;
                const optedIn = typeof event?.current?.optedIn === "boolean" ? event.current.optedIn : null;

                if ((id || token) && !done) {
                  done = true;
                  try {
                    sub.removeEventListener?.("change", onChange);
                  } catch {
                    // ignore
                  }
                  res({ id, token, optedIn, via: "pushSubscription.change" });
                }
              };

              sub.addEventListener("change", onChange);

              // Also poll, because iOS sometimes doesn’t emit promptly
              (async () => {
                for (let i = 0; i < 120 && !done; i++) {
                  const id = sub?.id ?? (await sub?.getId?.()) ?? null;
                  const token = sub?.token ?? (await sub?.getToken?.()) ?? null;
                  const optedIn = typeof sub?.optedIn === "boolean" ? sub.optedIn : null;

                  if ((id || token) && !done) {
                    done = true;
                    try {
                      sub.removeEventListener?.("change", onChange);
                    } catch {
                      // ignore
                    }
                    res({
                      id: id ? String(id) : null,
                      token: token ? String(token) : null,
                      optedIn,
                      via: "polling",
                    });
                    return;
                  }

                  await sleep(500);
                }

                if (!done) {
                  done = true;
                  try {
                    sub.removeEventListener?.("change", onChange);
                  } catch {
                    // ignore
                  }
                  res({ id: null, token: null, optedIn: sub?.optedIn ?? null, via: "timeout" });
                }
              })().catch(() => {
                // ignore
              });
            });

            const onesignalId = OneSignal?.User?.onesignalId ?? null;

            const result = await resultPromise;

            setLog(
              JSON.stringify(
                {
                  browserPermission: (window.Notification?.permission || "unknown").toString(),
                  browserPermBeforeRequest: browserPerm,
                  onesignalId,
                  subscriptionId: result.id,
                  token: result.token,
                  optedIn: result.optedIn,
                  resolvedBy: result.via,
                },
                null,
                2
              )
            );

            resolve();
          } catch (e) {
            reject(e);
          }
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
        This page only checks whether iOS produces a real OneSignal subscription (id/token).
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
