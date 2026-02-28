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
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return;

      await PushNotifications.register();

      PushNotifications.addListener("registration", async (token) => {
        try {
          const info = await Device.getInfo().catch(() => null);
          const deviceName = info ? `${info.manufacturer ?? ""} ${info.model ?? ""}`.trim() : null;

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
  }, []);

  return null;
}