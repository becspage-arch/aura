import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}