// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { SignIn, useSignIn } from "@clerk/nextjs";
import { Capacitor } from "@capacitor/core";

export default function Page() {
  const { signIn } = useSignIn();

  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const pkHint = pk ? `${pk.slice(0, 12)}…${pk.slice(-6)}` : "MISSING";
  const pkType = pk.startsWith("pk_live_") ? "LIVE" : pk.startsWith("pk_test_") ? "TEST" : "UNKNOWN";

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // safety: clear any stale error state on mount
    setErr(null);
  }, []);

  async function signInWithGoogleNative() {
    setBusy(true);
    setErr(null);
    try {
      if (!signIn) throw new Error("Clerk signIn not ready");

      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "net.tradeaura.app://callback",
        redirectUrlComplete: "/app",
      });
    } catch (e: any) {
      console.error("Native Google OAuth start failed", e);
      setErr(e?.message || "Failed to start Google sign-in");
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div
        style={{
          padding: 10,
          borderRadius: 10,
          marginBottom: 12,
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.06)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <div>Clerk PK: {pkType} ({pkHint})</div>
        <div>Host: {typeof window !== "undefined" ? window.location.host : "n/a"}</div>
        <div>Origin: {typeof window !== "undefined" ? window.location.origin : "n/a"}</div>
        <div>Native: {isNative ? "YES" : "NO"}</div>
      </div>

      {isNative ? (
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <button
            onClick={signInWithGoogleNative}
            disabled={busy}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              fontSize: 16,
              cursor: busy ? "not-allowed" : "pointer",
              textAlign: "left",
            }}
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>

          {err ? (
            <div style={{ color: "#ffb4b4", fontSize: 13, lineHeight: 1.4 }}>
              {err}
            </div>
          ) : null}

          <div style={{ opacity: 0.7, fontSize: 13, lineHeight: 1.4 }}>
            If Google opens Safari, come back to Aura after approving access.
          </div>
        </div>
      ) : (
        <SignIn />
      )}
    </div>
  );
}