// src/lib/notifications/inApp.ts

import Ably from "ably";

let rest: Ably.Rest | null = null;

function getAblyRest() {
  if (rest) return rest;

  const key = process.env.ABLY_API_KEY;
  if (!key) {
    throw new Error("Missing ABLY_API_KEY env var (required for server-side publish).");
  }

  rest = new Ably.Rest({ key });
  return rest;
}

export function userNotificationsChannelName(userId: string) {
  return `user:${userId}:notifications`;
}

export type InAppNotificationPayload = {
  type: "trade_closed" | "trade_opened" | "session_summary" | string;
  title: string;
  body: string;
  ts: string; // ISO
  deepLink?: string; // e.g. /app/trades/:id
};

export async function publishInAppNotification(userId: string, payload: InAppNotificationPayload) {
  const client = getAblyRest();
  const channel = client.channels.get(userNotificationsChannelName(userId));

  await channel.publish("notification", payload);
}
