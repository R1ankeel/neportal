/**
 * Stage 10B one-time: export legacy Note.projectId rows, then nullify.
 * Run: pnpm note:projectId:nullify (from repo root)
 */
import { PrismaClient } from "@prisma/client";
import { loadRootEnv } from "@neportal/shared";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const prisma = new PrismaClient();

type LegacyNoteRow = {
  id: string;
  projectId: string;
  creatorId: string;
  organizationId: string;
  text: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

async function noteProjectIdColumnExists(): Promise<boolean> {
  const existsRows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Note'
        AND column_name = 'projectId'
    ) AS "exists"
  `;
  return Boolean(existsRows[0]?.exists);
}

async function main() {
  if (!(await noteProjectIdColumnExists())) {
    console.log("Note.projectId column already absent — nothing to export/nullify.");
    return;
  }

  const rows = await prisma.$queryRaw<LegacyNoteRow[]>`
    SELECT id, "projectId", "creatorId", "organizationId", text, source::text AS source,
           "createdAt", "updatedAt"
    FROM "Note"
    WHERE "projectId" IS NOT NULL
    ORDER BY "createdAt" ASC
  `;

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const reportsDir = path.join(repoRoot, "reports");
  const exportPath = path.join(reportsDir, "stage10b-legacy-notes-export.json");

  await mkdir(reportsDir, { recursive: true });
  await writeFile(
    exportPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: rows.length,
        notes: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`Exported ${rows.length} row(s) to ${exportPath}`);

  if (rows.length === 0) {
    console.log("Nothing to nullify.");
    return;
  }

  const updated = await prisma.$executeRaw`
    UPDATE "Note" SET "projectId" = NULL WHERE "projectId" IS NOT NULL
  `;
  console.log(`Nullified projectId on ${Number(updated)} row(s).`);
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
