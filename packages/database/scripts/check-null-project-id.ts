import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "@neportal/shared";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const prisma = new PrismaClient();

type CountRow = { count: bigint };

async function main() {
  const [taskRows, budgetRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Task" WHERE "projectId" IS NULL
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*)::bigint AS count FROM "Budget" WHERE "projectId" IS NULL
    `,
  ]);

  const tasks = Number(taskRows[0]?.count ?? 0);
  const budgets = Number(budgetRows[0]?.count ?? 0);

  console.log(`Task.projectId is null: ${tasks}`);
  console.log(`Budget.projectId is null: ${budgets}`);

  if (tasks > 0 || budgets > 0) {
    process.exitCode = 2;
  }
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
