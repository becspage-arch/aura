import Ably from "ably";
import { auth } from "@clerk/nextjs/server";
import { userChannelName } from "@/lib/ably/server";

export async function GET() {
  const { userId } = auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const key = process.env.ABLY_API_KEY;
  if (!key) return new Response("ABLY_API_KEY missing", { status: 500 });

  const ably = new Ably.Rest({ key });

  // Capability: user can ONLY subscribe to their own channel.
  const capability = {
    [userChannelName(userId)]: ["subscribe"],
  };

  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
    ttl: 60 * 60 * 1000, // 1 hour
  });

  return Response.json(tokenRequest);
}
