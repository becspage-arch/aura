// src/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";
import { ensureOneSignalLoaded } from "@/lib/onesignal/client";

export function OneSignalInit() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // iOS PWA: run init after first paint + on first focus
      await new Promise((r) => setTimeout(r, 750));
      if (cancelled) return;
      await ensureOneSignalLoaded().catch(() => {});
    };

    run();

    const onFocus = () => {
      ensureOneSignalLoaded().catch(() => {});
    };

    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
