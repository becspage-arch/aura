"use client";

import { useState } from "react";
import Link from "next/link";

export default function GatePage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/gate/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Incorrect password.");
        setLoading(false);
        return;
      }

      // success - go to the real homepage
      window.location.href = "/home";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 34, marginBottom: 10 }}>Aura is coming soon</h1>
      <p style={{ opacity: 0.8, marginBottom: 28 }}>
        Enter the password to access the site.
      </p>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10 }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          gap: 12,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Link href="/sign-in">
          <button
            type="button"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
        </Link>

        <Link href="/sign-up">
          <button
            type="button"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Sign up
          </button>
        </Link>

        <Link href="/app">
          <button
            type="button"
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "white",
              cursor: "pointer",
            }}
          >
            Dashboard
          </button>
        </Link>
      </div>

      {error && (
        <p style={{ color: "crimson", marginTop: 12 }}>
          {error}
        </p>
      )}
    </main>
  );
}
