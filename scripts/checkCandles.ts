import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const symbol = "MGC";
  const tf = "15s";

  const min = await prisma.candle.findFirst({
    where: { symbol, tf },
    orderBy: { time: "asc" },
    select: { time: true },
  });

  const max = await prisma.candle.findFirst({
    where: { symbol, tf },
    orderBy: { time: "desc" },
    select: { time: true },
  });

  const count = await prisma.candle.count({ where: { symbol, tf } });

  console.log({ count, minTime: min?.time ?? null, maxTime: max?.time ?? null });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  