import {
  PrismaClient,
  EntityStatus,
  UserRole,
  ProjectRole,
  TaskStatus,
  BudgetStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.organization.deleteMany({ where: { slug: "neportal-demo" } });

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
      telegramId: "seed-demo-ivan",
    },
  });

  const vasya = await prisma.user.create({
    data: {
      organizationId: org.id,
      fullName: "Вася Пупкин",
      role: UserRole.EMPLOYEE,
      status: EntityStatus.ACTIVE,
      telegramId: "seed-demo-vasya",
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
