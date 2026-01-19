const { PrismaClient } = require("@prisma/client");

(async () => {
  const p = new PrismaClient();
  const uid = "user_387asGLZmlfszECvR8osGQTu2lD";
  const rows = await p.strategySettings.findMany({
    where: { clerkUserId: uid },
    orderBy: { updatedAt: "desc" },
  });
  console.log(JSON.stringify(rows, null, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
