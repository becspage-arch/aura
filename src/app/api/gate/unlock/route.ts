import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.password ?? "");

  // normalize: remove spaces
  const submitted = raw.replace(/\s+/g, "");
  const expected = String(process.env.AURA_GATE_PASSWORD ?? "").replace(/\s+/g, "");

  if (!expected) {
    return NextResponse.json(
      { error: "Gate password not configured." },
      { status: 500 }
    );
  }

  if (submitted !== expected) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  // Simple gate cookie (enough for a basic coming-soon lock)
  res.cookies.set("aura_gate", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
