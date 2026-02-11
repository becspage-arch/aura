// src/app/api/notifications/test-email/route.ts
import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { sendEmail } from "@/lib/notifications/email";

export async function POST() {
  try {
    const user = await currentUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const to =
      user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress;

    if (!to) {
      return NextResponse.json({ ok: false, error: "No email found on your Clerk user" }, { status: 400 });
    }

    const subject = "Aura – Test Email ✅";
    const html = `
      <div style="font-family: ui-sans-serif, system-ui; line-height: 1.4">
        <h2 style="margin: 0 0 12px 0;">Test email from Aura</h2>
        <div>If you received this, email sending is wired correctly.</div>
        <div style="margin-top: 12px; color: #666; font-size: 12px;">
          Sent to: ${to}
        </div>
      </div>
    `;

    const sent = await sendEmail({ to, subject, html });

    return NextResponse.json({ ok: true, to, provider: sent.provider });
  } catch (err: any) {
    console.error("TEST_EMAIL_FAILED", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
