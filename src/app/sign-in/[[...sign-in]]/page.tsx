// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";
import { useMemo, useState } from "react";

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

const GOOGLE_WEB_CLIENT_ID =
  "453466232987-cn3sp0rj0dut4iou9tkemlutqtitlv5t.apps.googleusercontent.com";

export default function Page() {
  const native = useMemo(() => isNativeApp(), []);
  const [status, setStatus] = useState(
    `loaded | native=${native ? "true" : "false"}`
  );

  if (!native) return <SignIn />;

  const onGoogle = async () => {
    setStatus("tap received");

    try {
      const GoogleSignIn = (window as any)?.Capacitor?.Plugins?.GoogleSignIn;

      setStatus(
        `plugin lookup | found=${GoogleSignIn ? "true" : "false"}`
      );

      if (!GoogleSignIn) {
        console.error("GoogleSignIn plugin not available");
        setStatus("plugin missing");
        return;
      }

      setStatus("initialize start");
      await GoogleSignIn.initialize({
        clientId: GOOGLE_WEB_CLIENT_ID,
      });
      setStatus("initialize ok");

      setStatus("signIn start");
      const result = await GoogleSignIn.signIn();
      setStatus("signIn returned");

      const idToken = result?.idToken;

      if (!idToken) {
        console.error("GoogleSignIn returned no idToken", result);
        setStatus("no idToken returned");
        return;
      }

      setStatus("exchange start");
      const res = await fetch("/api/native/google/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        console.error("native google exchange failed", res.status);
        setStatus(`exchange failed | status=${res.status}`);
        return;
      }

      setStatus("exchange ok");
      const data = await res.json();
      const ticket = data?.ticket;

      if (!ticket) {
        console.error("native google exchange returned no ticket", data);
        setStatus("no ticket returned");
        return;
      }

      setStatus("redirecting");
      window.location.href =
        `/native/consume-ticket?ticket=${encodeURIComponent(ticket)}`;
    } catch (err: any) {
      console.error("native google sign-in failed", err);
      setStatus(
        `error | ${String(err?.message || err || "unknown error")}`
      );
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

      <div
        style={{
          marginTop: 16,
          maxWidth: 420,
          fontSize: 14,
          lineHeight: 1.5,
          color: "#333",
          wordBreak: "break-word",
        }}
      >
        Status: {status}
      </div>
    </div>
  );
}