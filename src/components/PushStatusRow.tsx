// src/components/PushStatusRow.tsx
"use client";

import { useEffect, useState } from "react";

export function PushStatusRow() {
  const [perm, setPerm] = useState<string>("unknown");

  useEffect(() => {
    try {
      setPerm(String(window.Notification?.permission || "unknown"));
    } catch {
      setPerm("unknown");
    }
  }, []);

  const label = perm === "granted" ? "Allowed" : perm === "denied" ? "Blocked" : "Not allowed";

  return <span className="aura-select-pill">{label}</span>;
}
