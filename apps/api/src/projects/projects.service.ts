import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { AbsenceStatus, EntityStatus, ProjectRole, TaskStatus } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { ProjectAccessService } from "./project-access.service";
import { CreateProjectDto } from "./dto/create-project.dto";

export type ProjectSummaryDto = {
  tasksTotal: number;
  tasksNew: number;
  tasksInProgress: number;
  tasksDone: number;
  budgetsTotal: number;
  budgetsRemainingTotal: number;
  absencesTotal: number;
  absencesActiveNow: number;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async findAll(actorUserId?: string) {
    const accessible = await this.projectAccess.listActiveProjectsForActor(
      this.projectAccess.requireActorId(actorUserId),
    );
    const ids = accessible.map((p) => p.id);
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.project.findMany({
      where: { organizationId: this.orgId(), id: { in: ids } },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findOne(id: string, actorUserId?: string) {
    await this.projectAccess.assertActorCanAccessActiveProject(
      this.projectAccess.requireActorId(actorUserId),
      id,
    );
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: this.orgId(), status: "ACTIVE" },
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

  async getSummary(projectId: string, actorUserId?: string): Promise<ProjectSummaryDto> {
    await this.projectAccess.assertActorCanAccessActiveProject(
      this.projectAccess.requireActorId(actorUserId),
      projectId,
    );
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: this.orgId(), status: "ACTIVE" },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setUTCHours(23, 59, 59, 999);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    const memberUserIds = members.map((m) => m.userId);

    const [taskGroups, budgets, absencesTotal, absencesActiveNow] = await Promise.all([
      this.prisma.task.groupBy({
        by: ["status"],
        where: { organizationId: this.orgId(), projectId },
        _count: { id: true },
      }),
      this.prisma.budget.findMany({
        where: { organizationId: this.orgId(), projectId },
        select: { initialAmount: true, spentAmount: true },
      }),
      memberUserIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.absence.count({
            where: {
              organizationId: this.orgId(),
              userId: { in: memberUserIds },
              status: { not: AbsenceStatus.CANCELLED },
            },
          }),
      memberUserIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.absence.count({
            where: {
              organizationId: this.orgId(),
              userId: { in: memberUserIds },
              status: AbsenceStatus.APPROVED,
              startDate: { lte: todayEnd },
              endDate: { gte: todayStart },
            },
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
      absencesTotal,
      absencesActiveNow,
    };
  }

  async create(dto: CreateProjectDto, actorUserId?: string) {
    const actor = await this.projectAccess.assertActorIsOwner(
      this.projectAccess.requireActorId(actorUserId),
    );

    const legacyCreatedById = dto.createdById?.trim();
    if (legacyCreatedById && legacyCreatedById !== actor.id) {
      throw new BadRequestException("createdById must match actorUserId");
    }

    const org = this.orgId();

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: org,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          createdById: actor.id,
          status: EntityStatus.ACTIVE,
        },
        include: { createdBy: { select: { id: true, fullName: true, email: true } } },
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: actor.id,
          role: ProjectRole.MANAGER,
        },
      });

      return project;
    });
  }
}
