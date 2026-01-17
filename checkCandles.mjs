import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const symbol = process.env.PROJECTX_SYMBOL || "CON.F.US.MGC.G26";

const run = async () => {
  const rows = await prisma.candle15s.findMany({
    where: { symbol },
    orderBy: { time: "desc" },
    take: 10,
  });

  console.log("symbol:", symbol);
  console.log("rows:", rows.length);
  console.log(
    rows.map(r => ({
      time: r.time,
      o: r.open,
      h: r.high,
      l: r.low,
      c: r.close,
    }))
  );

  await prisma.$disconnect();
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
