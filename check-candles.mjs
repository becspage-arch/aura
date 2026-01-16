import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Prisma Client reads DATABASE_URL from schema env("DATABASE_URL").
// If you only have DIRECT_URL set in .env, map it across for this script.
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL (or DIRECT_URL) found in env.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.candle15s.count();
  console.log("Candle15s count =", n);

  const r = await prisma.candle15s.findFirst({
    orderBy: { time: "desc" },
  });
  console.log("Latest row =", r);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
