// src/components/NotificationsListener.tsx
"use client";

import { useEffect, useState } from "react";
import { ToastHost, type ToastItem } from "./ToastHost";
import type { AuraToastPayload } from "./toastBus";
import { subscribeMyUiChannel } from "@/lib/ably/client";

type InAppPayload = {
  type?: string;
  title?: string;
  body?: string;
  ts?: string;
  deepLink?: string;
};

export function NotificationsListener() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function pushToast(p: InAppPayload) {
    const title = p.title ?? "Aura";
    const body = p.body ?? "";
    const ts = p.ts ?? new Date().toISOString();

    if (!body.trim()) return;

    const id = `${ts}:${Math.random().toString(36).slice(2)}`;

    setToasts((prev) => {
      const next = [{ id, title, body, ts, deepLink: p.deepLink }, ...prev];
      return next.slice(0, 3);
    });

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, 6000);
  }

  // Local toasts (no Ably)
  useEffect(() => {
    const onLocalToast = (ev: Event) => {
      const e = ev as CustomEvent<AuraToastPayload>;
      const p = e.detail;
      if (!p?.body) return;

      pushToast({
        title: p.title,
        body: p.body,
        ts: p.ts,
        deepLink: p.deepLink,
      });
    };

    window.addEventListener("aura:toast", onLocalToast);
    return () => window.removeEventListener("aura:toast", onLocalToast);
  }, []);

  // Ably toasts - deterministic per-user UI channel only
  useEffect(() => {
    return subscribeMyUiChannel(({ event }) => {
      const p = event?.data as InAppPayload | undefined;
      if (!p) return;
      pushToast(p);
    });
  }, []);

  return <ToastHost toasts={toasts} />;
}