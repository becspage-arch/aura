const USER = process.env.PROJECTX_USERNAME || "becspage@gmail.com";
const APIKEY = process.env.PROJECTX_API_KEY;
const CONTRACT_ID = "CON.F.US.MGC.G26";
const SYMBOL = "CON.F.US.MGC.G26";

if (!APIKEY) {
  console.error("Missing PROJECTX_API_KEY in env.");
  process.exit(1);
}

function getDbUrl() {
  return (process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();
}

async function main() {
  // 1) login
  const loginRes = await fetch("https://api.topstepx.com/api/Auth/loginKey", {
    method: "POST",
    headers: { accept: "text/plain", "Content-Type": "application/json" },
    body: JSON.stringify({ userName: USER, apiKey: APIKEY }),
  });
  const login = await loginRes.json();
  if (!login?.token) throw new Error("No token returned");
  const token = login.token;

  // 2) retrieveBars - last 24h
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const body = {
    contractId: CONTRACT_ID,
    live: false,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    unit: 1,        // Second
    unitNumber: 15, // 15s
    limit: 20000,
    includePartialBar: false,
  };

  const barsRes = await fetch("https://api.topstepx.com/api/History/retrieveBars", {
    method: "POST",
    headers: {
      accept: "text/plain",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const barsJson = await barsRes.json();
  const bars = Array.isArray(barsJson?.bars) ? barsJson.bars : [];
  console.log("barsCount=", bars.length, "success=", barsJson?.success, "errorCode=", barsJson?.errorCode);

  if (!bars.length) process.exit(0);

  // 3) Prisma (adapter-pg) - matches worker approach
  const dbUrl = getDbUrl();
  if (!dbUrl) {
    throw new Error("DATABASE_URL (or DIRECT_URL) is missing in this shell env. Set $env:DATABASE_URL then rerun.");
  }

  const { Pool } = require("pg");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("@prisma/client");

  const pool = new Pool({ connectionString: dbUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter, log: ["error"] });

  let upserts = 0;
  for (const b of bars) {
    const time = Math.floor(new Date(b.t).getTime() / 1000);
    await prisma.candle15s.upsert({
      where: { symbol_time: { symbol: SYMBOL, time } },
      create: {
        symbol: SYMBOL,
        time,
        open: Number(b.o),
        high: Number(b.h),
        low: Number(b.l),
        close: Number(b.c),
        volume: b.v == null ? null : Number(b.v),
      },
      update: {
        open: Number(b.o),
        high: Number(b.h),
        low: Number(b.l),
        close: Number(b.c),
        volume: b.v == null ? null : Number(b.v),
      },
    });

    upserts++;
    if (upserts % 500 === 0) console.log("upserts=", upserts);
  }

  await prisma.$disconnect();
  await pool.end();
  console.log("done upserts=", upserts);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
