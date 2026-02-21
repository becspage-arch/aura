// src/app/api/ably/token/route.ts
import Ably from "ably";
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const key = process.env.ABLY_API_KEY;
  if (!key) return new Response("ABLY_API_KEY missing", { status: 500 });

  const ably = new Ably.Rest({ key });

  const ui = `aura:ui:${userId}`;
  const broker = `aura:broker:${userId}`;
  const exec = `aura:exec:${userId}`;

  // ✅ Legacy notifications channel (existing UI still uses this)
  const legacyNotifications = `user:${userId}:notifications`;

  const capability = {
    [ui]: ["subscribe"],
    [broker]: ["subscribe"],
    [exec]: ["publish"],
    [legacyNotifications]: ["subscribe"],
  };

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return Response.json(tokenRequest);
}
