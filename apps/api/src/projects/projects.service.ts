import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { TaskStatus } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateProjectDto } from "./dto/create-project.dto";

export type ProjectSummaryDto = {
  tasksTotal: number;
  tasksNew: number;
  tasksInProgress: number;
  tasksDone: number;
  budgetsTotal: number;
  budgetsRemainingTotal: number;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  findAll() {
    return this.prisma.project.findMany({
      where: { organizationId: this.orgId() },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: this.orgId() },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${id}" not found`);
    }
    return project;
  }

  async getSummary(projectId: string): Promise<ProjectSummaryDto> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: this.orgId() },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
    }

    const [taskGroups, budgets] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["status"],
        where: { organizationId: this.orgId(), projectId },
        _count: { id: true },
      }),
      this.prisma.budget.findMany({
        where: { organizationId: this.orgId(), projectId },
        select: { initialAmount: true, spentAmount: true },
      }),
    ]);

    const countFor = (status: TaskStatus) =>
      taskGroups.find((g) => g.status === status)?._count.id ?? 0;

    const tasksTotal = taskGroups.reduce((sum, g) => sum + g._count.id, 0);

    let budgetsRemainingTotal = 0;
    for (const b of budgets) {
      budgetsRemainingTotal += Number(b.initialAmount) - Number(b.spentAmount);
    }

    return {
      tasksTotal,
      tasksNew: countFor(TaskStatus.NEW),
      tasksInProgress: countFor(TaskStatus.IN_PROGRESS),
      tasksDone: countFor(TaskStatus.DONE),
      budgetsTotal: budgets.length,
      budgetsRemainingTotal,
    };
  }

  async create(dto: CreateProjectDto) {
    const creator = await this.prisma.user.findFirst({
      where: { id: dto.createdById, organizationId: this.orgId() },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.createdById}" not found in this organization`);
    }

    return this.prisma.project.create({
      data: {
        organizationId: this.orgId(),
        name: dto.name,
        description: dto.description,
        createdById: dto.createdById,
        status: dto.status ?? undefined,
      },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
