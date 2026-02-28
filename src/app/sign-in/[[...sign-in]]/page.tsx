// src/app/sign-in/[[...sign-in]]/page.tsx
"use client";

import { SignIn } from "@clerk/nextjs";

export default function Page() {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const pkHint = pk ? `${pk.slice(0, 12)}…${pk.slice(-6)}` : "MISSING";
  const pkType = pk.startsWith("pk_live_") ? "LIVE" : pk.startsWith("pk_test_") ? "TEST" : "UNKNOWN";

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
      </div>

      <SignIn />
    </div>
  );
}