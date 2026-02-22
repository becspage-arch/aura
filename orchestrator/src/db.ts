import pkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

const { PrismaClient } = pkg;

const adapter = new PrismaPg({ connectionString: env.DIRECT_URL });

export const db = new PrismaClient({ adapter });

export async function checkDb() {
  await db.$queryRaw`SELECT 1`;
}
