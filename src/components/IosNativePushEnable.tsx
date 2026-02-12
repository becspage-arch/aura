// src/components/IosNativePushEnable.tsx
"use client";

import { useEffect, useState } from "react";

function isNative() {
  const cap: any = typeof window !== "undefined" ? (window as any).Capacitor : null;
  return !!cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform() === true;
}

export function IosNativePushEnable() {
  const [status, setStatus] = useState<string>("Idle");
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNative());
  }, []);

  async function enable() {
    if (!isNative()) {
      setStatus("Not in native app");
      return;
    }

    setStatus("Requesting permission…");

    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { Device } = await import("@capacitor/device");

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      setStatus("Permission not granted");
      return;
    }

    setStatus("Registering with APNs…");

    // Remove old listeners (best-effort)
    try {
      await PushNotifications.removeAllListeners();
    } catch {
      // ignore
    }

    PushNotifications.addListener("registration", async (token) => {
      try {
        const info = await Device.getInfo();
        const name = `${info.platform} ${info.model || ""}`.trim();

        // iOS dev builds often produce sandbox tokens; TestFlight/AppStore = production
        const env: "sandbox" | "production" =
          (process.env.NODE_ENV === "development" ? "sandbox" : "production");

        const r = await fetch("/api/push/ios/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceToken: token.value,
            environment: env,
            deviceName: name || null,
          }),
        });

        const txt = await r.text().catch(() => "");
        if (!r.ok) throw new Error(`Register failed (${r.status}) ${txt}`);

        setStatus("✅ Registered with Aura");
      } catch (e: any) {
        setStatus(`❌ ${e?.message ?? "Register error"}`);
      }
    });

    PushNotifications.addListener("registrationError", (err) => {
      setStatus(`❌ APNs registration error: ${JSON.stringify(err)}`);
    });

    await PushNotifications.register();
  }

  return (
    <div className="aura-row-between">
      <button type="button" className="aura-btn" onClick={enable} disabled={!native}>
        Enable iPhone push (native)
      </button>

      <div className="aura-muted aura-text-xs" style={{ textAlign: "right" }}>
        {status}
      </div>
    </div>
  );
}
