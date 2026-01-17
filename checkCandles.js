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

  const q = 'select time, open, high, low, close from "Candle15s" where symbol=$1 order by time desc limit 10';
  const r = await c.query(q, [symbol]);

  console.log("symbol:", symbol, "rows:", r.rows.length);
  console.table(r.rows);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
