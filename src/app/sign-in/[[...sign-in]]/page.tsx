// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

const GOOGLE_WEB_CLIENT_ID =
  "453466232987-cn3sp0rj0dut4iou9tkemlutqtitlv5t.apps.googleusercontent.com";

export default function Page() {
  const native = isNativeApp();

  if (!native) return <SignIn />;

  const onGoogle = async () => {
    try {
      const GoogleSignIn = (window as any)?.Capacitor?.Plugins?.GoogleSignIn;

      if (!GoogleSignIn) {
        console.error("GoogleSignIn plugin not available");
        return;
      }

      await GoogleSignIn.initialize({
        clientId: GOOGLE_WEB_CLIENT_ID,
      });

      const result = await GoogleSignIn.signIn();
      const idToken = result?.idToken;

      if (!idToken) {
        console.error("GoogleSignIn returned no idToken", result);
        return;
      }

      const res = await fetch("/api/native/google/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        console.error("native google exchange failed", res.status);
        return;
      }

      const data = await res.json();
      const ticket = data?.ticket;

      if (!ticket) {
        console.error("native google exchange returned no ticket", data);
        return;
      }

      window.location.href =
        `/native/consume-ticket?ticket=${encodeURIComponent(ticket)}`;
    } catch (err) {
      console.error("native google sign-in failed", err);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        paddingTop: "calc(env(safe-area-inset-top) + 224px)",
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