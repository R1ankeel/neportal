import { PrismaClient } from "@neportal/database";
import { generateSystemAliases, systemAliasesToString } from "@neportal/shared";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");

  const users = await prisma.user.findMany({
    where: force
      ? {}
      : {
          OR: [{ systemAliases: null }, { systemAliases: "" }],
        },
    select: { id: true, fullName: true, systemAliases: true },
  });

  let updated = 0;
  for (const user of users) {
    if (!force && user.systemAliases?.trim()) continue;

    const aliases = generateSystemAliases(user.fullName);
    await prisma.user.update({
      where: { id: user.id },
      data: { systemAliases: systemAliasesToString(aliases) },
    });
    updated += 1;
  }

  console.log(`updated ${updated} users`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
