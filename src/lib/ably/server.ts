import Ably from "ably";
import { AuraRealtimeEvent, AuraRealtimeEventType } from "@/lib/realtime/events";

function getAblyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) throw new Error("ABLY_API_KEY is missing");
  return new Ably.Rest({ key });
}

// UI stream channel for this user (matches /api/ably/token capability)
export function uiChannelName(clerkUserId: string) {
  return `aura:ui:${clerkUserId}`;
}

export async function publishToUser(
  clerkUserId: string,
  type: AuraRealtimeEventType,
  data: AuraRealtimeEvent["data"]
) {
  const ably = getAblyRest();
  const channel = ably.channels.get(uiChannelName(clerkUserId));

  const event = {
    type,
    ts: new Date().toISOString(),
    data,
  };

  await channel.publish(type, event);
}
