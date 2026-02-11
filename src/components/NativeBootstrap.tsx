// src/lib/onesignal/native.ts
import { Capacitor } from "@capacitor/core";

export async function initNativeOneSignal() {
  if (!Capacitor.isNativePlatform()) return;

  const appId = (process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "").trim();
  if (!appId) {
    console.error("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
    return;
  }

  console.log("[OneSignal] Native platform detected. Booting OneSignal…");

  const OneSignal = (window as any).plugins?.OneSignal;
  if (!OneSignal) {
    console.error("[OneSignal] Native plugin not found on window.plugins.OneSignal");
    return;
  }

  OneSignal.setAppId(appId);

  // Android 13+ permission prompt (safe to call; will no-op on older)
  OneSignal.promptForPushNotificationsWithUserResponse((accepted: boolean) => {
    console.log("[OneSignal] Permission accepted:", accepted);
  });

  // Print device state (this is what we care about)
  OneSignal.getDeviceState((state: any) => {
    console.log("[OneSignal] Device state:", state);
    // Typical fields include userId, pushToken, isSubscribed (varies by plugin version)
  });
}
