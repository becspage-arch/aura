import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { env } from "./env.js";

const { PrismaClient } = pkg as any;

const adapter = new PrismaPg({ connectionString: env.DIRECT_URL });

export const db = new PrismaClient({ adapter });

export async function checkDb() {
  await db.$queryRaw`SELECT 1`;
}
