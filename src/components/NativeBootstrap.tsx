// src/components/NativeBootstrap.tsx
"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

function isNative() {
  return Capacitor.isNativePlatform();
}

async function registerApnsToken(token: string) {
  // In Capacitor with server.url, fetch() is fine — it will hit https://tradeaura.net
  // Ensure cookies/session exist (you must be logged in inside the app webview).
  const res = await fetch("/api/push/ios/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      deviceToken: token,
      environment: "production", // TestFlight = production APNs
      deviceName: "iPhone",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Register device failed: ${res.status} ${text}`);
  }
}

export default function NativeBootstrap() {
  useEffect(() => {
    if (!isNative()) return;

    // 1) Deep link return handler (fixes “login happened in Safari but app didn’t update”)
    const sub = App.addListener("appUrlOpen", async ({ url }) => {
      try {
        // Close Safari / SFSafariViewController if it’s open
        await Browser.close();

        // If Clerk redirects back with a custom scheme or universal link,
        // bring it into the webview
        if (url) {
          // simplest: navigate the webview to the callback URL
          window.location.href = url;
        }
      } catch {
        // ignore
      }
    });

    // 2) APNs registration
    (async () => {
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
        try {
          await registerApnsToken(token.value);
        } catch (e) {
          console.error(e);
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("APNs registrationError", err);
      });
    })();

    return () => {
      sub.remove();
    };
  }, []);

  return null;
}
