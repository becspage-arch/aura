// src/lib/onesignal/native.ts
import { Capacitor } from "@capacitor/core";

export async function initNativeOneSignal() {
  if (!Capacitor.isNativePlatform()) return;

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;

  if (!appId) {
    console.error("[OneSignal] Missing NEXT_PUBLIC_ONESIGNAL_APP_ID");
    return;
  }

  const OneSignal = (window as any).plugins?.OneSignal;

  if (!OneSignal) {
    console.error("[OneSignal] Native plugin not found");
    return;
  }

  console.log("[OneSignal] Initialising native with App ID:", appId);

  OneSignal.setAppId(appId);

  // Android 13+ permission
  OneSignal.promptForPushNotificationsWithUserResponse((accepted: boolean) => {
    console.log("[OneSignal] Permission accepted:", accepted);
  });

  OneSignal.getDeviceState((state: any) => {
    console.log("[OneSignal] Device state:", state);
  });
}
