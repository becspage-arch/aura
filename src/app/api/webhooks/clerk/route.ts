import { headers } from "next/headers";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });

  // IMPORTANT: use raw body text for signature verification
  const payload = await req.text();
  const headerList = await headers();

  const svix_id = headerList.get("svix-id");
  const svix_timestamp = headerList.get("svix-timestamp");
  const svix_signature = headerList.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing Svix headers", { status: 400 });
  }

  let evt: WebhookEvent;

  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle events
  if (evt.type === "user.created" || evt.type === "user.updated") {
    const data: any = evt.data;

    const clerkUserId = data.id as string;
    const email =
      data.email_addresses?.[0]?.email_address ??
      data.primary_email_address_id ??
      null;

    const firstName = data.first_name ?? null;
    const lastName = data.last_name ?? null;
    const displayName =
      firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : null;

    await db.userProfile.upsert({
      where: { clerkUserId },
      update: {
        email: email ?? undefined,
        displayName: displayName ?? undefined,
      },
      create: {
        clerkUserId,
        email: email ?? undefined,
        displayName: displayName ?? undefined,
      },
    });
  }

  if (evt.type === "user.deleted") {
    const data: any = evt.data;
    const clerkUserId = data.id as string;
    if (clerkUserId) {
      await db.userProfile.deleteMany({ where: { clerkUserId } });
    }
  }

  // Must return 2xx so Clerk marks it successful (prevents retries)
  return Response.json({ ok: true });
}
