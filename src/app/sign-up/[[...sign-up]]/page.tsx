// src/app/sign-up/[[...sign-up]]/page.tsx
"use client";

import { SignUp } from "@clerk/nextjs";

function isNativeIOS() {
  if (typeof window === "undefined") return false;
  return !!(window as any).Capacitor;
}

export default function Page() {
  const nativeRedirect = "net.tradeaura.app://oauth_callback";
  const after = isNativeIOS() ? nativeRedirect : "/app";

  return (
    <SignUp
      redirectUrl={after}
      afterSignInUrl={after}
      afterSignUpUrl={after}
    />
  );
}