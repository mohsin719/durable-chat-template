import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const DEFAULT_PLATFORM_RULES = [
  {
    platform: "Facebook",
    base_cooldown_hours: 24,
    high_risk_cooldown_hours: 72,
    max_failures_before_block: 3,
    risk_level: "HIGH",
  },
  {
    platform: "Amazon",
    base_cooldown_hours: 12,
    high_risk_cooldown_hours: 48,
    max_failures_before_block: 4,
    risk_level: "MEDIUM",
  },
  {
    platform: "Walmart",
    base_cooldown_hours: 12,
    high_risk_cooldown_hours: 48,
    max_failures_before_block: 4,
    risk_level: "MEDIUM",
  },
  {
    platform: "Others",
    base_cooldown_hours: 8,
    high_risk_cooldown_hours: 24,
    max_failures_before_block: 5,
    risk_level: "LOW",
  },
] as const;

async function main(): Promise<void> {
  const prismaAny = prisma as any;
  const passwordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD ?? "Mohsin@18",
    BCRYPT_ROUNDS,
  );
  const email = process.env.SEED_ADMIN_EMAIL ?? "mohsin18cv111@gmail.com";
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      role: UserRole.ADMIN,
      email,
      passwordHash,
    },
    create: {
      publicId: "USR-90001",
      username: "admin",
      email,
      passwordHash,
      role: UserRole.ADMIN,
      wallet: {
        create: {
          balance: 10000,
        },
      },
    },
  });

  for (const rule of DEFAULT_PLATFORM_RULES) {
    await prismaAny.platform_rules.upsert({
      where: { platform: rule.platform },
      update: {
        base_cooldown_hours: rule.base_cooldown_hours,
        high_risk_cooldown_hours: rule.high_risk_cooldown_hours,
        max_failures_before_block: rule.max_failures_before_block,
        risk_level: rule.risk_level as any,
      },
      create: {
        platform: rule.platform,
        base_cooldown_hours: rule.base_cooldown_hours,
        high_risk_cooldown_hours: rule.high_risk_cooldown_hours,
        max_failures_before_block: rule.max_failures_before_block,
        risk_level: rule.risk_level as any,
      },
    });
  }
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
