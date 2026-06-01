import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log("Starting cleanup of mock/dummy numbers...");

  // Delete numbers that match the mock pattern (+1555...) used in TelnyxIntegrationService
  const result = await prisma.phoneNumber.deleteMany({
    where: {
      e164: {
        startsWith: "+1555",
      },
    },
  });

  console.log(`Deleted ${result.count} mock number(s) from the database.`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
