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

function getMeOrThrow(client: Ably.Realtime) {
  const me = String((client as any).auth?.clientId ?? "").trim();
  if (!me) throw new Error("Ably clientId missing (not authenticated yet)");
  return me;
}

// ✅ Preferred: deterministic per-user UI channel
export function subscribeMyUiChannel(onMessage: (item: TimelineItem) => void) {
  const client = getAblyRealtime();
  const me = getMeOrThrow(client);

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

/**
 * ✅ Back-compat for existing imports (AppTopBar/useAuraStream/etc).
 * SECURITY: caller may ONLY subscribe to their own aura:ui:<me> channel.
 */
export function subscribeUserChannel(
  channelName: string,
  onMessage: (item: TimelineItem) => void
) {
  const client = getAblyRealtime();
  const me = getMeOrThrow(client);

  const expected = `aura:ui:${me}`;
  if (channelName !== expected) {
    throw new Error(`Forbidden channel. Expected ${expected}`);
  }

  return subscribeMyUiChannel(onMessage);
}
