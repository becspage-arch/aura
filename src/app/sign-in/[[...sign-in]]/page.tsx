// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import * as React from "react";
import { SignIn, useSignIn } from "@clerk/nextjs";
import type { OAuthStrategy } from "@clerk/types";

function isNativeApp() {
  return (
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

export default function Page() {
  const native = isNativeApp();
  const { signIn } = useSignIn();

  if (!native) return <SignIn />;
  if (!signIn) return null;

  const signInWithGoogle = async () => {
    const strategy: OAuthStrategy = "oauth_google";
    await signIn.authenticateWithRedirect({
      strategy,
      redirectUrl: "net.tradeaura.app://callback?",
      redirectUrlComplete: "net.tradeaura.app://callback?",
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingLeft: "24px",
        paddingRight: "24px",
        paddingBottom: "24px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <button
        onClick={signInWithGoogle}
        style={{
          width: "100%",
          maxWidth: 420,
          height: 52,
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "#fff",
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        Continue with Google
      </button>
    </div>
  );
}