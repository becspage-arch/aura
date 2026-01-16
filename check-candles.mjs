import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error("No DATABASE_URL or DIRECT_URL found in env.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

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
    await pool.end();
  });
