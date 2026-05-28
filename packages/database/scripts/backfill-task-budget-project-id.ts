import { PrismaClient, EntityStatus } from "@prisma/client";
import { loadRootEnv } from "@neportal/shared";
import { fileURLToPath } from "node:url";
import path from "node:path";

loadRootEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const prisma = new PrismaClient();

const VK_PROJECT_NAME = "Реклама VK";

type OrgRow = { id: string; slug: string; name: string };
type ProjectRow = { id: string; name: string; status: EntityStatus };

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function formatOrg(org: OrgRow): string {
  return `${org.name} (slug=${org.slug}, id=${org.id})`;
}

async function resolveDefaultProjectId(org: OrgRow): Promise<string> {
  const activeProjects: ProjectRow[] = await prisma.project.findMany({
    where: { organizationId: org.id, status: EntityStatus.ACTIVE },
    select: { id: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  // Demo/test special-case: strict VK project selection.
  const activeVk = activeProjects.filter((p) => p.name === VK_PROJECT_NAME);
  const isDemoSlug = org.slug === "neportal-demo";
  const canUseVkBecauseUnique =
    (isDemoSlug && activeVk.length === 1) || (!isDemoSlug && activeVk.length === 1);

  if (isDemoSlug) {
    if (activeVk.length === 1) return activeVk[0]!.id;
    if (activeVk.length === 0) {
      throw new Error(
        `Backfill отказан: для demo org требуется активный проект "${VK_PROJECT_NAME}". org=${formatOrg(org)}`,
      );
    }
    throw new Error(
      `Backfill отказан: найдено несколько активных проектов "${VK_PROJECT_NAME}" (${activeVk.length}). org=${formatOrg(org)}`,
    );
  }

  // Non-demo rule (strict): only if exactly one active project.
  if (activeProjects.length === 1) {
    return activeProjects[0]!.id;
  }

  // Extra allowance: non-demo org with exactly one active VK project.
  if (canUseVkBecauseUnique) {
    return activeVk[0]!.id;
  }

  if (activeProjects.length === 0) {
    throw new Error(
      `Backfill отказан: в организации нет активных проектов. org=${formatOrg(org)}`,
    );
  }

  // activeProjects.length > 1, and VK is absent/ambiguous.
  const vkNote =
    activeVk.length === 0
      ? `не найден активный "${VK_PROJECT_NAME}"`
      : `активный "${VK_PROJECT_NAME}" неоднозначен (${activeVk.length})`;
  throw new Error(
    `Backfill отказан: в организации несколько активных проектов (${activeProjects.length}); ${vkNote}. Укажите explicit mapping/projectId. org=${formatOrg(org)}`,
  );
}

async function countNulls(orgId: string): Promise<{ tasks: number; budgets: number }> {
  const [tasks, budgets] = await Promise.all([
    prisma.task.count({ where: { organizationId: orgId, projectId: null } }),
    prisma.budget.count({ where: { organizationId: orgId, projectId: null } }),
  ]);
  return { tasks, budgets };
}

async function main() {
  const apply = hasFlag("--apply");
  const dryRun = !apply;

  const orgs: OrgRow[] = await prisma.organization.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const orgsWithNulls: Array<{ org: OrgRow; before: { tasks: number; budgets: number } }> = [];
  for (const org of orgs) {
    const before = await countNulls(org.id);
    if (before.tasks > 0 || before.budgets > 0) {
      orgsWithNulls.push({ org, before });
    }
  }

  if (orgsWithNulls.length === 0) {
    console.log("OK: no Task/Budget rows with projectId = null");
    return;
  }

  console.log(`Found organizations with null projectId: ${orgsWithNulls.length}`);
  for (const { org, before } of orgsWithNulls) {
    console.log(`- org=${formatOrg(org)} nulls: task=${before.tasks} budget=${before.budgets}`);
  }

  // Fail fast before any write: ensure every org has an unambiguous target project.
  const targetByOrgId = new Map<string, string>();
  for (const { org } of orgsWithNulls) {
    const targetProjectId = await resolveDefaultProjectId(org);
    targetByOrgId.set(org.id, targetProjectId);
  }

  console.log(dryRun ? "Mode: DRY-RUN (use --apply to write)" : "Mode: APPLY");

  for (const { org, before } of orgsWithNulls) {
    const projectId = targetByOrgId.get(org.id)!;
    console.log(`\norg=${formatOrg(org)} targetProjectId=${projectId}`);
    console.log(`before: task=${before.tasks} budget=${before.budgets}`);

    if (dryRun) {
      console.log("dry-run: no changes applied");
      continue;
    }

    const [taskRes, budgetRes] = await prisma.$transaction([
      prisma.task.updateMany({
        where: { organizationId: org.id, projectId: null },
        data: { projectId },
      }),
      prisma.budget.updateMany({
        where: { organizationId: org.id, projectId: null },
        data: { projectId },
      }),
    ]);

    const after = await countNulls(org.id);
    console.log(`updated: task=${taskRes.count} budget=${budgetRes.count}`);
    console.log(`after: task=${after.tasks} budget=${after.budgets}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });

