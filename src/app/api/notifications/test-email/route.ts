// src/app/api/notifications/test-email/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/notifications/email";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/notifications/test-email",
    methods: ["GET", "POST"],
  });
}

export async function POST() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const clerkUserId = user.id;

    const to =
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress;

    if (!to) {
      return NextResponse.json({ ok: false, error: "No email found on your Clerk user" }, { status: 400 });
    }

    // 1) Ensure we have a UserProfile row, and store the email (sync)
    await prisma.userProfile.upsert({
      where: { clerkUserId },
      create: {
        clerkUserId,
        email: to,
      },
      update: {
        email: to,
      },
    });

    // 2) Send the test email
    const subject = "Aura – Test Email ✅";
    const html = `
      <h2>Test email from Aura</h2>
      <p>If you received this, email sending is wired correctly.</p>
      <p>Sent to: ${to}</p>
    `;

    const sent = await sendEmail({ to, subject, html });

    return NextResponse.json({ ok: true, to, provider: sent.provider, synced: true });
  } catch (err: any) {
    console.error("TEST_EMAIL_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
