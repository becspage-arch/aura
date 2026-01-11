import { prisma } from "../src/lib/db";

async function main() {
  const user = await prisma.userProfile.create({
    data: { email: "test@example.com", displayName: "Test User" },
  });

  const readBack = await prisma.userProfile.findUnique({
    where: { id: user.id },
  });

  console.log({ user, readBack });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
