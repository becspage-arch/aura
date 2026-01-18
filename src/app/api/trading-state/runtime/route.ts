// src/app/api/trading-state/runtime/route.ts
import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // TEMP: hardcoded for UI testing
  return Response.json({
    ok: true,
    isTrading: false, // change to false to test editable state
  });
}
