"use client";

import { useEffect } from "react";
import { initNativeOneSignal } from "@/lib/onesignal/native";

export default function NativeBootstrap() {
  useEffect(() => {
    initNativeOneSignal();
  }, []);

  return null;
}
