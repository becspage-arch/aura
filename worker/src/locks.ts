import { db } from "./db";

export async function acquireLock(key: string, ttlMs: number) {
  const now = Date.now();
  const until = now + ttlMs;

  const existing = await db.systemState.findUnique({ where: { key } });

  if (existing?.value && typeof existing.value === "object") {
    const exp = (existing.value as any).until as number | undefined;
    if (exp && exp > now) return false;
  }

  await db.systemState.upsert({
    where: { key },
    create: { key, value: { until } },
    update: { value: { until } },
  });

  return true;
}
