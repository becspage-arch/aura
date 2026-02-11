export async function emitNotifyEvent(event: any) {
  const origin = (process.env.AURA_APP_ORIGIN || "").trim();
  const token = (process.env.NOTIFY_INGEST_TOKEN || "").trim();

  if (!origin) throw new Error("AURA_APP_ORIGIN missing (worker)");
  if (!token) throw new Error("NOTIFY_INGEST_TOKEN missing (worker)");

  const url = `${origin}/api/internal/notifications/ingest`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-aura-token": token,
    },
    body: JSON.stringify(event),
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`notify ingest failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}
