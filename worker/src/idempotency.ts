import { db } from "./db";

export async function hasSeen(key: string): Promise<boolean> {
  const row = await db.systemState.findUnique({ where: { key } });
  return !!row;
}

export async function markSeen(key: string, value: any) {
  await db.systemState.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
