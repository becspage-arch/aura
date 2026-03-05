// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export default function Page() {
  const native = isNativeApp();

  if (!native) return <SignIn />;

  const onGoogle = async () => {
    // Dynamic import so web build doesn’t require the plugin
    const mod = await import("@codetrix-studio/capacitor-google-auth");
    const GoogleAuth = mod.GoogleAuth;

    const result = await GoogleAuth.signIn();
    const idToken = result?.authentication?.idToken;

    if (!idToken) {
      // stay on page, no guessing UI
      return;
    }

    const res = await fetch("/api/native/google/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) return;
    const data = await res.json();

    const ticket = data?.ticket;
    if (!ticket) return;

    window.location.href = `/native/consume-ticket?ticket=${encodeURIComponent(ticket)}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <button
        onClick={onGoogle}
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