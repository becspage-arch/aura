// src/app/api/ably/token/route.ts
import Ably from "ably";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response("Unauthorized", { status: 401 });

  const key = (process.env.ABLY_API_KEY || "").trim();
  if (!key) return new Response("ABLY_API_KEY missing", { status: 500 });

  // Map Clerk -> internal user
  const userProfile = await prisma.userProfile.findFirst({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!userProfile) return new Response("User profile not found", { status: 404 });

  // Resolve selected broker account for publish scoping
  const uts = await prisma.userTradingState.findUnique({
    where: { userId: userProfile.id },
    select: { selectedBrokerAccountId: true },
  });

  const selectedId = uts?.selectedBrokerAccountId ?? null;

  const selected =
    selectedId
      ? await prisma.brokerAccount.findFirst({
          where: { id: selectedId, userId: userProfile.id },
          select: { id: true, brokerName: true },
        })
      : null;

  const ably = new Ably.Rest({ key });

  const ui = `aura:ui:${clerkUserId}`;
  const brokerAll = `aura:broker:${clerkUserId}:*:*`;

  const capability: Record<string, string[]> = {
    [ui]: ["subscribe"],
    [brokerAll]: ["subscribe"],
  };

  // Only allow publishing to the currently selected broker account
  if (selected?.id && selected?.brokerName) {
    const execSelected = `aura:exec:${clerkUserId}:${selected.brokerName}:${selected.id}`;
    capability[execSelected] = ["publish"];
  }

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: clerkUserId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return Response.json(tokenRequest);
}
