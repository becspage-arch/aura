// src/lib/ably/client.ts
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

function getClientId(client: Ably.Realtime) {
  return String((client as any).auth?.clientId ?? "").trim();
}

/**
 * Preferred: deterministic per-user UI channel.
 * Subscribes once only.
 */
export function subscribeMyUiChannel(onMessage: (item: TimelineItem) => void) {
  const client = getAblyRealtime();

  let channel: Ably.RealtimeChannel | null = null;
  let handler: ((msg: Ably.Message) => void) | null = null;
  let disposed = false;
  let attached = false;

  const attach = () => {
    if (disposed || attached) return;

    const me = getClientId(client);
    if (!me) return;

    const channelName = `aura:ui:${me}`;
    channel = client.channels.get(channelName);

    handler = (msg: Ably.Message) => {
      const event = msg.data as AuraRealtimeEvent;
      onMessage({ name: msg.name ?? "event", event });
    };

    channel.subscribe(handler);
    attached = true;
  };

  attach();

  const onConnected = () => attach();
  client.connection.on("connected", onConnected);

  return () => {
    disposed = true;
    client.connection.off("connected", onConnected);

    if (channel && handler) {
      channel.unsubscribe(handler);
    }
  };
}

/**
 * Back-compat export used by existing code.
 * SECURITY: only allows subscribing to the caller's own aura:ui:<me>.
 */
export function subscribeUserChannel(
  channelName: string,
  onMessage: (item: TimelineItem) => void
) {
  const client = getAblyRealtime();

  const tryValidate = () => {
    const me = getClientId(client);
    if (!me) return true;
    const expected = `aura:ui:${me}`;
    if (channelName !== expected) {
      throw new Error(`Forbidden channel. Expected ${expected}`);
    }
    return true;
  };

  tryValidate();

  return subscribeMyUiChannel(onMessage);
}
