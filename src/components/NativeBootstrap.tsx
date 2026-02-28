// src/components/NativeBootstrap.tsx
"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Device } from "@capacitor/device";

export default function NativeBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    (async () => {
      // 1) Ask permission + register with APNs
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.register();

      // 2) When we receive the APNs token, register it to our backend
      PushNotifications.addListener("registration", async (token) => {
        try {
          const info = await Device.getInfo().catch(() => null);
          const deviceName = info ? `${info.manufacturer ?? ""} ${info.model ?? ""}`.trim() : null;

          await fetch("/api/push/ios/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceToken: token.value,
              environment: "production", // TestFlight is production APNs
              deviceName,
            }),
          });
        } catch {
          // no-op: we don't want bootstrap to crash the app
        }
      });

      // Optional: avoid silent failures during setup
      PushNotifications.addListener("registrationError", () => {});
    })();
  }, []);

  return null;
}