// src/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";

export function OneSignalInit() {
  useEffect(() => {
    // OneSignal v16 loads/initializes via the global OneSignalDeferred queue.
    // We do NOT call ensureOneSignalLoaded here because your client.ts does not export it.
    // This component is intentionally a no-op to avoid build/runtime issues.
  }, []);

  return null;
}
