import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  const count = await prisma.candle15s.count();
  console.log("Candle15s count =", count);

  const latest = await prisma.candle15s.findFirst({
    orderBy: { time: "desc" },
  });

  console.log("Latest row =", latest);
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
