import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// Create adapter from DIRECT_URL (non-pooler)
const adapter = new PrismaPg({ connectionString: env.DIRECT_URL });

// ✅ IMPORTANT: PrismaClient MUST receive an options object
export const db = new PrismaClient({ adapter });

export async function checkDb() {
  // If this passes, Prisma is working + DB is reachable
  await db.$queryRaw`SELECT 1`;
}
