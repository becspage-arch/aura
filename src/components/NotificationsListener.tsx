// src/components/NotificationsListener.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Ably from "ably";
import { getAblyRealtime } from "@/lib/ably/client";
import { ToastHost, type ToastItem } from "./ToastHost";

type InAppPayload = {
  type?: string;
  title?: string;
  body?: string;
  ts?: string;
  deepLink?: string;
};

export function NotificationsListener() {
  const { user, isLoaded } = useUser();
  const userId = user?.id;

  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const channelName = useMemo(() => {
    if (!userId) return null;
    return `user:${userId}:notifications`;
  }, [userId]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!channelName) return;

    const client = getAblyRealtime();
    const channel = client.channels.get(channelName);

    console.log("[notifications] subscribing", { channelName });

    const handler = (msg: Ably.Message) => {
    console.log("[notifications] received", msg.name, msg.data);
      const p = msg.data as InAppPayload;

      const title = p.title ?? "Aura";
      const body = p.body ?? "";
      const ts = p.ts ?? new Date().toISOString();

      const id = `${ts}:${Math.random().toString(36).slice(2)}`;

      setToasts((prev) => {
        const next = [{ id, title, body, ts, deepLink: p.deepLink }, ...prev];
        return next.slice(0, 3); // keep max 3 stacked
      });

      // auto-dismiss after 6 seconds
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, 6000);
    };

    channel.subscribe("notification", handler);

    return () => {
      channel.unsubscribe("notification", handler);
    };
  }, [isLoaded, channelName]);

  return <ToastHost toasts={toasts} />;
}
