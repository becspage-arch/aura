// src/components/IosNativePushEnable.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "idle" | "unsupported" | "ready" | "registering" | "registered" | "error";

function isNativeIos(): boolean {
  // Capacitor injects window.Capacitor on native; in browser it won't exist.
  // We keep this super defensive.
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

export function IosNativePushEnable() {
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string>("");

  const native = useMemo(() => isNativeIos(), []);

  useEffect(() => {
    if (!native) {
      setStatus("unsupported");
      setDetail("Open this inside the installed Aura iPhone app.");
      return;
    }
    setStatus("ready");
    setDetail("Ready to enable iPhone push.");
  }, [native]);

  async function enable() {
    setStatus("registering");
    setDetail("Requesting permission…");

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const { Device } = await import("@capacitor/device");

      // Permission
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== "granted") {
          setStatus("error");
          setDetail("Permission not granted.");
          return;
        }
      }

      // Register with APNs
      await PushNotifications.register();

      // Wait for token
      const token: string = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Timed out waiting for device token.")), 15000);

        PushNotifications.addListener("registration", (tkn) => {
          clearTimeout(t);
          resolve(tkn.value);
        });

        PushNotifications.addListener("registrationError", (err) => {
          clearTimeout(t);

          // Capacitor typings vary; RegistrationError doesn't guarantee `message`.
          // Common shapes: { error: string } or sometimes something else.
          const msg =
            (err as any)?.message ||
            (err as any)?.error ||
            (typeof err === "string" ? err : null) ||
            "registrationError";

          reject(new Error(msg));
        });
      });

      setDetail("Saving device…");

      const info = await Device.getInfo();
      const name = info?.model ? `${info.model}` : "iPhone";

      const res = await fetch("/api/push/ios/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceToken: token,
          // We don't force env here; server can cope + we fallback on BadDeviceToken now.
          deviceName: name,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `REGISTER_HTTP_${res.status}`);
      }

      setStatus("registered");
      setDetail("iPhone registered. You can send a test push now.");
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message || "Unknown error");
    }
  }

  return (
    <div className="aura-grid-gap-10">
      <div className="aura-row-between">
        <div className="aura-muted aura-text-xs">{detail}</div>

        <button
          type="button"
          className="aura-btn"
          onClick={enable}
          disabled={status === "registering" || status === "unsupported"}
        >
          {status === "registered"
            ? "Enabled"
            : status === "registering"
            ? "Enabling…"
            : "Enable iPhone push"}
        </button>
      </div>
    </div>
  );
}
