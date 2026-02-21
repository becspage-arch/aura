"use client";

import Ably from "ably";
import { AuraRealtimeEvent } from "@/lib/realtime/events";

let realtime: Ably.Realtime | null = null;

export function getAblyRealtime() {
  if (realtime) return realtime;

  realtime = new Ably.Realtime({
    authUrl: "/api/ably/token",
  });

  return realtime;
}

export type TimelineItem = {
  name: string;
  event: AuraRealtimeEvent;
};

// ✅ Deterministic per-user UI channel (no caller-provided channelName)
export function subscribeMyUiChannel(
  onMessage: (item: TimelineItem) => void
) {
  const client = getAblyRealtime();

  // Clerk sets clientId on the token request (we set it to userId).
  // Ably exposes it after auth.
  const me = String((client as any).auth?.clientId ?? "").trim();
  if (!me) {
    throw new Error("Ably clientId missing (not authenticated yet)");
  }

  const channelName = `aura:ui:${me}`;
  const channel = client.channels.get(channelName);

  const handler = (msg: Ably.Message) => {
    const event = msg.data as AuraRealtimeEvent;
    onMessage({ name: msg.name ?? "event", event });
  };

  channel.subscribe(handler);

  return () => {
    channel.unsubscribe(handler);
  };
}
