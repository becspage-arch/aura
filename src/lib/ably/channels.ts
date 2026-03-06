// src/lib/ably/channels.ts
export function userChannelName(clerkUserId: string) {
  return `aura:ui:${clerkUserId}`;
}