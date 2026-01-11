"use client";

import Ably from "ably";
import { AuraRealtimeEvent } from "@/lib/realtime/events";

let realtime: Ably.Realtime | null = null;

export function getAblyRealtime() {
  if (realtime) return realtime;

  realtime = new Ably.Realtime({
    authUrl: "/api/ably/token",
    // Ably will call GET /api/ably/token to get a token request
  });

  return realtime;
}

export type TimelineItem = {
  name: string; // event name e.g. "order_filled"
  event: AuraRealtimeEvent;
};

export function subscribeUserChannel(
  channelName: string,
  onMessage: (item: TimelineItem) => void
) {
  const client = getAblyRealtime();
  const channel = client.channels.get(channelName);

  const handler = (msg: Ably.Message) => {
    // Our payload is { type, ts, data }
    const event = msg.data as AuraRealtimeEvent;
    onMessage({ name: msg.name ?? "event", event });
  };

  // Subscribe to all events on the channel
  channel.subscribe(handler);

  return () => {
    channel.unsubscribe(handler);
  };
}
