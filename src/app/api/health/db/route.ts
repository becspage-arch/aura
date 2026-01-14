import { db } from "@/lib/db";

function safeDbHostFromUrl(url: string | undefined) {
  if (!url) return null;
  try {
    // Works for postgres URLs and won't expose creds
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;

    // Prefer DIRECT_URL if present, fallback to DATABASE_URL
    const host =
      safeDbHostFromUrl(process.env.DIRECT_URL) ??
      safeDbHostFromUrl(process.env.DATABASE_URL);

    return Response.json({ ok: true, dbHost: host });
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
