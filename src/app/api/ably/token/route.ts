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

  const capability = {
    // UI can receive system + status updates
    [ui]: ["subscribe"],

    // UI can receive broker market feed events if needed
    [broker]: ["subscribe"],

    // UI can only publish manual execution requests for itself
    [exec]: ["publish"],
  };

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return Response.json(tokenRequest);
}
