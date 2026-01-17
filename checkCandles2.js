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

  const r1 = await c.query('select count(*)::int as n, max(time)::bigint as max_time from "Candle15s" where symbol=$1', [symbol]);
  const r2 = await c.query('select time, open, high, low, close from "Candle15s" where symbol=$1 order by time desc limit 5', [symbol]);

  console.log("symbol:", symbol);
  console.log("totalRows:", r1.rows[0].n, "maxTime:", String(r1.rows[0].max_time));
  console.table(r2.rows);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
