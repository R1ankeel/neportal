import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "@neportal/shared";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const prisma = new PrismaClient();

type ExistsRow = { exists: boolean };
type CountRow = { count: bigint };

async function noteProjectIdColumnExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<ExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Note'
        AND column_name = 'projectId'
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function main() {
  const columnExists = await noteProjectIdColumnExists();

  if (!columnExists) {
    console.log("Note.projectId column absent (post-10B ok)");
    return;
  }

  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS count FROM "Note" WHERE "projectId" IS NOT NULL
  `;
  const count = Number(rows[0]?.count ?? 0);
  console.log(`Note.projectId IS NOT NULL: ${count}`);

  if (count > 0) {
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
