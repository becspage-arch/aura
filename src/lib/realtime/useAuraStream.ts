"use client";

import { useEffect } from "react";
import { subscribeUserChannel } from "@/lib/ably/client";
import type { AuraRealtimeEvent } from "@/lib/realtime/events";

/**
 * Ably-based realtime stream hook.
 * Subscribes to the user's Ably channel and forwards AuraRealtimeEvent messages.
 */
export function useAuraStream(
  channelName: string | null | undefined,
  onMessage: (evt: AuraRealtimeEvent) => void
) {
  useEffect(() => {
    if (!channelName) return;

    const unsubscribe = subscribeUserChannel(channelName, ({ event }) => {
      onMessage(event as AuraRealtimeEvent);
    });

    return () => {
      unsubscribe?.();
    };
  }, [channelName, onMessage]);
}
