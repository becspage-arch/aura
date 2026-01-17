require("dotenv").config({ path: ".env" });

const { PrismaClient } = require("@prisma/client");

async function run() {
  const db = new PrismaClient();

  const clerkUserId = process.env.AURA_CLERK_USER_ID;

  const user = await db.userProfile.findUnique({
    where: { clerkUserId },
    include: { userState: true },
  });

  console.log({
    clerkUserId,
    userId: user ? user.id : null,
    state: user ? user.userState : null,
  });

  await db.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
