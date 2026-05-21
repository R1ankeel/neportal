import {
  PrismaClient,
  EntityStatus,
  UserRole,
  ProjectRole,
  TaskStatus,
  BudgetStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_CONTRACT_TASK_TITLE = "Подписать договор с подрядчиком";

/** Демо-задача для affectedTasks при больничном Ивана (без дублей по title в проекте). */
async function ensureDemoContractTask(
  organizationId: string,
  projectId: string,
  ivanId: string,
) {
  const deadlineAt = new Date(Date.UTC(2026, 4, 22, 23, 59, 59, 999));

  const existing = await prisma.task.findFirst({
    where: {
      organizationId,
      projectId,
      title: DEMO_CONTRACT_TASK_TITLE,
    },
  });

  const data = {
    description: "Дедлайн в период демо-больничного",
    creatorId: ivanId,
    assigneeId: ivanId,
    status: TaskStatus.NEW,
    deadlineAt,
  };

  if (existing) {
    await prisma.task.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.task.create({
    data: {
      organizationId,
      projectId,
      title: DEMO_CONTRACT_TASK_TITLE,
      ...data,
    },
  });
}

/** Удаляет демо-организацию; вложения чеков снимаем до cascade, иначе FK uploadedById. */
async function deleteDemoOrganization() {
  const existing = await prisma.organization.findUnique({
    where: { slug: "neportal-demo" },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.budgetExpenseAttachment.deleteMany({
    where: {
      OR: [
        { expense: { organizationId: existing.id } },
        { uploadedBy: { organizationId: existing.id } },
      ],
    },
  });

  await prisma.organization.delete({ where: { id: existing.id } });
}

async function main() {
  await deleteDemoOrganization();

  const org = await prisma.organization.create({
    data: {
      name: "Neportal Demo",
      slug: "neportal-demo",
      status: EntityStatus.ACTIVE,
    },
  });

  const ivan = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName: "Иван Иванов",
      role: UserRole.OWNER,
      status: EntityStatus.ACTIVE,
      telegramUsername: "demo_ivan",
      telegramId: "seed-demo-ivan",
    },
  });

  const vasya = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName: "Вася Пупкин",
      role: UserRole.EMPLOYEE,
      status: EntityStatus.ACTIVE,
      telegramUsername: "demo_vasya",
    },
  });

  const petr = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName: "Петр Петров",
      role: UserRole.EMPLOYEE,
      status: EntityStatus.ACTIVE,
      telegramId: "seed-demo-petr",
    },
  });

  const maria = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName: "Мария Соколова",
      role: UserRole.ACCOUNTANT,
      status: EntityStatus.ACTIVE,
      telegramId: "seed-demo-maria",
    },
  });

  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      name: "Реклама VK",
      description: "Демо-проект для Neportal",
      status: EntityStatus.ACTIVE,
      createdById: ivan.id,
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: ivan.id, role: ProjectRole.MANAGER },
      { projectId: project.id, userId: vasya.id, role: ProjectRole.MEMBER },
      { projectId: project.id, userId: petr.id, role: ProjectRole.MEMBER },
      { projectId: project.id, userId: maria.id, role: ProjectRole.VIEWER },
    ],
  });

  await prisma.budget.create({
    data: {
      organizationId: org.id,
      projectId: project.id,
      title: "Реклама VK",
      description: "Бюджет на рекламную кампанию",
      initialAmount: 50_000,
      spentAmount: 0,
      currency: "RUB",
      status: BudgetStatus.ACTIVE,
      createdById: ivan.id,
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org.id,
      projectId: project.id,
      title: "Подготовить отчет",
      description: "Собрать метрики по кампании",
      creatorId: ivan.id,
      assigneeId: vasya.id,
      status: TaskStatus.NEW,
    },
  });

  await ensureDemoContractTask(org.id, project.id, ivan.id);

  console.log("Seed completed: Neportal Demo organization and demo data created.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
