require("dotenv").config({ path: "worker/.env" });
const { Client } = require("pg");

(async () => {
  const symbol = process.env.PROJECTX_SYMBOL || "CON.F.US.MGC.G26";
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;

  if (!url) {
    console.error("Missing DATABASE_URL/DIRECT_URL (even after loading worker/.env).");
    process.exit(1);
  }

  const c = new Client({ connectionString: url });
  await c.connect();

  console.log("Watching Candle15s maxTime for:", symbol);

  const tick = async () => {
    const r = await c.query(
      'select count(*)::int as n, max(time)::bigint as max_time from "Candle15s" where symbol=$1',
      [symbol]
    );
    const now = Math.floor(Date.now() / 1000);
    const maxTime = Number(r.rows[0].max_time || 0);
    const age = maxTime ? (now - maxTime) : null;

    console.log(
      new Date().toISOString(),
      "totalRows=", r.rows[0].n,
      "maxTime=", String(maxTime),
      "ageSec=", String(age)
    );
  };

  await tick();
  const iv = setInterval(tick, 5000);

  setTimeout(async () => {
    clearInterval(iv);
    await c.end();
    console.log("done");
  }, 35000);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
