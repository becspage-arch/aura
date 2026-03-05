// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import * as React from "react";
import { SignIn, useSignIn } from "@clerk/nextjs";
import type { OAuthStrategy } from "@clerk/types";

function isNativeApp() {
  return typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.();
}

export default function Page() {
  const native = isNativeApp();
  const { signIn } = useSignIn();

  if (!native) {
    return <SignIn />;
  }

  if (!signIn) return null;

  const signInWithGoogle = async () => {
    const strategy: OAuthStrategy = "oauth_google";
    await signIn.authenticateWithRedirect({
      strategy,
      // MUST match your Clerk allowlist exactly
      redirectUrl: "net.tradeaura.app://callback?",
      // After Clerk finishes, iOS will open the app via the same URL
      redirectUrlComplete: "net.tradeaura.app://callback?",
    });
  };

  return (
    <div style={{ padding: 24 }}>
      <button
        onClick={signInWithGoogle}
        style={{
          width: "100%",
          height: 48,
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "#fff",
          fontSize: 16,
        }}
      >
        Continue with Google
      </button>
    </div>
  );
}