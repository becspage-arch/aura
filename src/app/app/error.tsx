"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // This will appear in browser console too
    console.error("APP_ROUTE_ERROR", error);
  }, [error]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Aura crashed on /app</h1>

      <p style={{ marginTop: 12, opacity: 0.8 }}>
        This is the real error being thrown (not the generic Next overlay).
      </p>

      <pre
        style={{
          marginTop: 12,
          padding: 12,
          borderRadius: 8,
          background: "rgba(0,0,0,0.2)",
          overflow: "auto",
          fontSize: 12,
        }}
      >
        {String(error?.message || error)}
        {"\n"}
        {error?.digest ? `\nDigest: ${error.digest}\n` : ""}
        {"\n"}
        {error?.stack || ""}
      </pre>

      <button
        onClick={() => reset()}
        style={{
          marginTop: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: "#6d28d9",
          color: "white",
          fontWeight: 600,
        }}
      >
        Retry
      </button>
    </div>
  );
}
