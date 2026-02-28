// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";

function isNativeIOS() {
  if (typeof window === "undefined") return false;
  // Capacitor injects `window.Capacitor` in the native shell
  return !!(window as any).Capacitor;
}

export default function Page() {
  const nativeRedirect = "net.tradeaura.app://oauth_callback";

  const after = isNativeIOS() ? nativeRedirect : "/app";

  return (
    <SignIn
      redirectUrl={after}
      afterSignInUrl={after}
      afterSignUpUrl={after}
    />
  );
}
