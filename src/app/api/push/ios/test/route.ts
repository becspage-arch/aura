// src/app/api/push/ios/test/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendApnsPush } from "@/lib/push/apns";

type Body = {
  title?: string;
  message?: string;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // ok
  }

  const title = (body.title || "Aura").trim();
  const message = (body.message || "Test iPhone push from Aura ✅").trim();

  const devices = await prisma.apnsPushDevice.findMany({
    where: { userId },
    select: { deviceToken: true, environment: true },
  });

  if (devices.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_IOS_DEVICES" }, { status: 400 });
  }

  const results: any[] = [];
  for (const d of devices) {
    try {
      await sendApnsPush({
        env: d.environment === "sandbox" ? "sandbox" : "production",
        deviceToken: d.deviceToken,
        title,
        body: message,
        data: { kind: "test" },
      });
      results.push({ deviceToken: d.deviceToken.slice(0, 10) + "...", ok: true });
    } catch (e: any) {
      results.push({
        deviceToken: d.deviceToken.slice(0, 10) + "...",
        ok: false,
        error: e?.message ?? "UNKNOWN",
      });
    }
  }

  return NextResponse.json({ ok: true, sent: results.length, results });
}
