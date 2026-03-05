// src/components/NativeBootstrap.tsx
"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";

export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeUrlOpen: null | (() => void) = null;

    (async () => {
      // 0) Deep links: forward Clerk callback into the WebView route
      const mod = await import("@capacitor/app");
      const App = mod.App;

      const sub = await App.addListener("appUrlOpen", (event) => {
        const url = event?.url || "";
        // Clerk allowlist = net.tradeaura.app://callback?
        if (url.startsWith("net.tradeaura.app://callback")) {
          const q = url.includes("?") ? url.slice(url.indexOf("?")) : "";
          // Forward into the WebView where Clerk can finish
          window.location.href = `/sign-in/sso-callback${q}`;
        }
      });

      removeUrlOpen = () => sub.remove();

      // 1) Push registration (keep this)
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
        try {
          const info = await Device.getInfo().catch(() => null);
          const deviceName = info
            ? `${info.manufacturer ?? ""} ${info.model ?? ""}`.trim()
            : null;

          await fetch("/api/push/ios/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              deviceToken: token.value,
              environment: "production",
              deviceName,
            }),
          });
        } catch {
          // no-op
        }
      });

      PushNotifications.addListener("registrationError", () => {});
    })();

    return () => {
      if (removeUrlOpen) removeUrlOpen();
    };
  }, []);

  return null;
}
