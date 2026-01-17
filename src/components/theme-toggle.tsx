"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <span style={{ color: "var(--muted-foreground)" }}>Theme</span>

      <button
        type="button"
        className="aura-btn"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle theme"
      >
        {theme === "light" ? "Light" : "Dark"}
      </button>
    </div>
  );
}
