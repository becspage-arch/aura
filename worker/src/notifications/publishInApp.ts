// worker/src/notifications/publishInApp.ts
import Ably from "ably";

export type InAppNotificationPayload = {
  type: "trade_opened" | "trade_closed" | "session_summary" | string;
  title: string;
  body: string;
  ts: string; // ISO
  deepLink?: string;
};

let rest: Ably.Rest | null = null;

function getAblyRest() {
  if (rest) return rest;

  const key = (process.env.ABLY_API_KEY || "").trim();
  if (!key) throw new Error("ABLY_API_KEY missing (worker) - cannot publish notifications");

  rest = new Ably.Rest({ key });
  return rest;
}

function userNotificationsChannelName(clerkUserId: string) {
  return `user:${clerkUserId}:notifications`;
}

export async function publishInAppNotification(
  clerkUserId: string,
  payload: InAppNotificationPayload
) {
  const client = getAblyRest();
  const channel = client.channels.get(userNotificationsChannelName(clerkUserId));
  await channel.publish("notification", payload);
}
