"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // Avoid hydration weirdness where theme is undefined on first render
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted ? theme !== "light" : true;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: "var(--muted-foreground)", minWidth: 88 }}>
        Dark Mode
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Toggle dark mode"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        style={{
          width: 52,
          height: 30,
          borderRadius: 999,
          border: `1px solid var(--border)`,
          background: isDark ? "var(--primary)" : "var(--muted)",
          position: "relative",
          cursor: "pointer",
          padding: 0,
          transition: "background 140ms ease, border-color 140ms ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            background: isDark ? "var(--primary-foreground)" : "var(--card)",
            border: `1px solid var(--border)`,
            position: "absolute",
            top: 2,
            left: isDark ? 26 : 2,
            transition: "left 140ms ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          }}
        />
      </button>

      <span style={{ color: "var(--muted-foreground)" }}>
        {isDark ? "On" : "Off"}
      </span>
    </div>
  );
}
