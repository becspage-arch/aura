// src/app/sign-in/[[...sign-in]]/page.tsx
 "use client";

import { SignIn } from "@clerk/nextjs";

function isNativeApp() {
  return typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.();
}

export default function Page() {
  const redirectUrl = isNativeApp()
    ? "net.tradeaura.app://callback"
    : "/";

  const after = isNativeApp()
    ? "net.tradeaura.app://callback"
    : "/app";

  return (
    <SignIn
      redirectUrl={redirectUrl}
      forceRedirectUrl={after}
    />
  );
}