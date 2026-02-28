// src/app/sign-up/[[...sign-up]]/page.tsx
"use client";

import { SignUp } from "@clerk/nextjs";

function isNativeApp() {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

export default function Page() {
  const redirectUrl = isNativeApp() ? "net.tradeaura.app://sso-callback" : "/sso-callback";
  const after = isNativeApp() ? "net.tradeaura.app://app" : "/app";

  return <SignUp redirectUrl={redirectUrl} forceRedirectUrl={after} />;
}