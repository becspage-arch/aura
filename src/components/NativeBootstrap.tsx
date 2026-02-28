// src/components/NativeBootstrap.tsx
"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";

export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeAppUrlOpen: null | (() => void) = null;

    (async () => {
      // 1) Handle deep links (OAuth callback)
      try {
        // Dynamic import so Next/web builds don't require this module
        const mod = await import("@capacitor/app");
        const App = mod.App;

        const sub = await App.addListener("appUrlOpen", async (event: { url: string }) => {
          try {
            // Let Clerk consume the OAuth callback URL
            const clerk = (window as any).Clerk;
            if (clerk?.handleRedirectCallback) {
              await clerk.handleRedirectCallback(event.url);
            }
          } catch (e) {
            console.error("Clerk handleRedirectCallback failed", e);
          } finally {
            // After callback handling, go to the app
            window.location.href = "/app";
          }
        });

        removeAppUrlOpen = () => sub.remove();
      } catch (e) {
        // If @capacitor/app isn't installed yet, you'll see it in the build logs.
        console.error("Failed to init App deep link handler", e);
      }

      // 2) Push registration (your existing logic)
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
              environment: "production", // TestFlight
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
      if (removeAppUrlOpen) removeAppUrlOpen();
    };
  }, []);

  return null;
}