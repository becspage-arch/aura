import { db } from "./db";

type LockValue = {
  until: number;
  ownerId?: string;
};

function asLockValue(v: unknown): LockValue | null {
  if (!v || typeof v !== "object") return null;
  const until = (v as any).until;
  const ownerId = (v as any).ownerId;
  if (typeof until !== "number") return null;
  return { until, ownerId: typeof ownerId === "string" ? ownerId : undefined };
}

/**
 * Acquire or steal a lock if it is clearly stale.
 * - Primary check: value.until (ms epoch)
 * - Safety check: updatedAt (if not updated recently, treat as stale)
 */
export async function acquireLock(key: string, ttlMs: number, ownerId?: string) {
  const now = Date.now();
  const until = now + ttlMs;

  const existing = await db.systemState.findUnique({ where: { key } });

  if (existing) {
    const cur = asLockValue(existing.value);
    const updatedAtMs = existing.updatedAt?.getTime?.() ?? 0;

    const stillValidByUntil = !!cur?.until && cur.until > now;

    // If it was updated recently, we trust "until".
    // If it hasn't been updated for > ttlMs, we treat it as dead.
    const recentlyUpdated = updatedAtMs > now - ttlMs;

    if (stillValidByUntil && recentlyUpdated) {
      return false;
    }
  }

  await db.systemState.upsert({
    where: { key },
    create: { key, value: { until, ownerId } },
    update: { value: { until, ownerId } },
  });

  return true;
}

export async function refreshLock(key: string, ttlMs: number, ownerId?: string) {
  const now = Date.now();
  const until = now + ttlMs;

  // Only refresh if we still appear to own it (ownerId match), if ownerId provided.
  if (ownerId) {
    const existing = await db.systemState.findUnique({ where: { key } });
    const cur = existing ? asLockValue(existing.value) : null;
    if (cur?.ownerId && cur.ownerId !== ownerId) return false;
  }

  await db.systemState.upsert({
    where: { key },
    create: { key, value: { until, ownerId } },
    update: { value: { until, ownerId } },
  });

  return true;
}

export async function releaseLock(key: string, ownerId?: string) {
  if (ownerId) {
    const existing = await db.systemState.findUnique({ where: { key } });
    const cur = existing ? asLockValue(existing.value) : null;
    if (cur?.ownerId && cur.ownerId !== ownerId) return false;
  }

  // Release by expiring it immediately (keep row for audit/debug)
  await db.systemState.upsert({
    where: { key },
    create: { key, value: { until: 0, ownerId } },
    update: { value: { until: 0, ownerId } },
  });

  return true;
}
