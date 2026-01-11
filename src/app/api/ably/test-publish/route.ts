import { auth } from "@clerk/nextjs/server";
import { publishToUser } from "@/lib/ably/server";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  await publishToUser(userId, "order_filled", {
    accountId: "eval1",
    symbol: "MGC",
    side: "buy",
    qty: 1,
    fillPrice: 2034.2,
    orderId: "test_order_123",
  });

  return Response.json({ ok: true });
}
