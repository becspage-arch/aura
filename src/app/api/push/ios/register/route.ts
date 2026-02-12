// src/app/api/push/ios/register/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

type Body = {
  deviceToken: string;
  environment?: "sandbox" | "production";
  deviceName?: string | null;
};

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const deviceToken = (body.deviceToken || "").trim();
  if (!deviceToken) {
    return NextResponse.json({ ok: false, error: "MISSING_DEVICE_TOKEN" }, { status: 400 });
  }

  const environment =
    body.environment === "sandbox" || body.environment === "production"
      ? body.environment
      : "production";

  const deviceName = (body.deviceName || "").trim() || null;

  await prisma.apnsPushDevice.upsert({
    where: { deviceToken },
    update: { userId, environment, deviceName },
    create: { userId, deviceToken, environment, deviceName },
  });

  return NextResponse.json({ ok: true });
}
