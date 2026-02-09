// src/components/OneSignalInit.tsx
"use client";

import { useEffect } from "react";
import { ensureOneSignalLoaded } from "@/lib/onesignal/client";

export function OneSignalInit() {
  useEffect(() => {
    ensureOneSignalLoaded().catch(() => {});
  }, []);

  return null;
}
