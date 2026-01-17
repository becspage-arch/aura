require("dotenv").config({ path: ".env" });

const { Pool } = require("pg");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function main() {
  const url = (process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();
  if (!url) {
    console.error("Missing DATABASE_URL (or DIRECT_URL) in worker/.env");
    process.exit(1);
  }

  const clerk = (process.env.AURA_CLERK_USER_ID || "").trim();
  if (!clerk) {
    console.error("Missing AURA_CLERK_USER_ID in worker/.env");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const db = new PrismaClient({ adapter });

  const user = await db.userProfile.findUnique({
    where: { clerkUserId: clerk },
    include: { userState: true },
  });

  console.log(
    JSON.stringify(
      {
        clerkUserId: clerk,
        userId: user?.id ?? null,
        state: user?.userState ?? null,
      },
      null,
      2
    )
  );

  await db.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
