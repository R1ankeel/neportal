import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "@neportal/shared";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const prisma = new PrismaClient();

async function main() {
  const [tasks, budgets] = await Promise.all([
    prisma.task.count({ where: { projectId: null } }),
    prisma.budget.count({ where: { projectId: null } }),
  ]);

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

