import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EntityStatus, PrismaService, UserRole } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";

const ACTIVE_PROJECT_STATUS = EntityStatus.ACTIVE;

@Injectable()
export class ProjectAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId(): string {
    return this.organization.getOrganizationId();
  }

  requireActorId(actorUserId?: string): string {
    const trimmed = actorUserId?.trim();
    if (!trimmed) {
      throw new BadRequestException("actorUserId is required");
    }
    return trimmed;
  }

  async getActorOrThrow(actorUserId: string) {
    const id = this.requireActorId(actorUserId);
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: this.orgId() },
      select: { id: true, role: true, organizationId: true },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found in this organization`);
    }
    return user;
  }

  private isOwner(role: UserRole): boolean {
    return role === UserRole.OWNER;
  }

  private isManager(role: UserRole): boolean {
    return role === UserRole.MANAGER;
  }

  /** Active projects in org visible to actor (OWNER: all ACTIVE; others: membership). */
  async listActiveProjectsForActor(actorUserId: string) {
    const actor = await this.getActorOrThrow(actorUserId);
    const org = this.orgId();

    if (this.isOwner(actor.role)) {
      return this.prisma.project.findMany({
        where: { organizationId: org, status: ACTIVE_PROJECT_STATUS },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });
    }

    const memberships = await this.prisma.projectMember.findMany({
      where: { userId: actor.id },
      select: { projectId: true },
    });
    const projectIds = [...new Set(memberships.map((m) => m.projectId))];
    if (projectIds.length === 0) {
      return [];
    }

    return this.prisma.project.findMany({
      where: {
        organizationId: org,
        status: ACTIVE_PROJECT_STATUS,
        id: { in: projectIds },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
  }

  async getAccessibleActiveProjectIds(actorUserId: string): Promise<string[]> {
    const rows = await this.listActiveProjectsForActor(actorUserId);
    return rows.map((p) => p.id);
  }

  async assertActorCanAccessActiveProject(actorUserId: string, projectId: string) {
    const actor = await this.getActorOrThrow(actorUserId);
    const org = this.orgId();
    const pid = projectId?.trim();
    if (!pid) {
      throw new BadRequestException("projectId is required");
    }

    if (this.isOwner(actor.role)) {
      const project = await this.prisma.project.findFirst({
        where: { id: pid, organizationId: org, status: ACTIVE_PROJECT_STATUS },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${pid}" not found`);
      }
      return project;
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId: pid, userId: actor.id },
      include: {
        project: {
          select: { id: true, organizationId: true, status: true },
        },
      },
    });
    if (!membership?.project || membership.project.status !== ACTIVE_PROJECT_STATUS) {
      throw new NotFoundException(`Project with id "${pid}" not found`);
    }
    return membership.project;
  }

  async assertActorCanAccessTask(actorUserId: string, taskId: string) {
    const tid = taskId?.trim();
    if (!tid) {
      throw new BadRequestException("taskId is required");
    }
    const task = await this.prisma.task.findFirst({
      where: { id: tid, organizationId: this.orgId() },
      select: { id: true, projectId: true },
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${tid}" not found`);
    }
    await this.assertActorCanAccessActiveProject(actorUserId, task.projectId);
    return task;
  }

  async assertActorCanAccessBudget(actorUserId: string, budgetId: string) {
    const bid = budgetId?.trim();
    if (!bid) {
      throw new BadRequestException("budgetId is required");
    }
    const budget = await this.prisma.budget.findFirst({
      where: { id: bid, organizationId: this.orgId() },
      select: { id: true, projectId: true },
    });
    if (!budget) {
      throw new NotFoundException(`Budget with id "${bid}" not found`);
    }
    await this.assertActorCanAccessActiveProject(actorUserId, budget.projectId);
    return budget;
  }

  /**
   * OWNER: any user pending in org ACTIVE projects.
   * MANAGER: pending for users who are members of projects where actor is also a member.
   */
  async assertActorCanViewPendingForUser(
    actorUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const actor = await this.getActorOrThrow(actorUserId);
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: this.orgId() },
    });
    if (!target) {
      throw new NotFoundException(`User with id "${targetUserId}" not found in this organization`);
    }

    if (targetUserId === actor.id) {
      return;
    }

    if (this.isOwner(actor.role)) {
      return;
    }

    if (this.isManager(actor.role)) {
      const actorProjectIds = await this.getAccessibleActiveProjectIds(actorUserId);
      if (actorProjectIds.length === 0) {
        throw new NotFoundException("Access denied");
      }
      const shared = await this.prisma.projectMember.findFirst({
        where: {
          userId: targetUserId,
          projectId: { in: actorProjectIds },
          project: { organizationId: this.orgId(), status: ACTIVE_PROJECT_STATUS },
        },
      });
      if (!shared) {
        throw new NotFoundException("Access denied");
      }
      return;
    }

    throw new NotFoundException("Access denied");
  }

  /** Project ids for filtering pending expenses (ACTIVE only). */
  async assertActorIsOwner(actorUserId: string) {
    const actor = await this.getActorOrThrow(actorUserId);
    if (!this.isOwner(actor.role)) {
      throw new ForbiddenException("Only OWNER can perform this action");
    }
    return actor;
  }

  /**
   * OWNER: any ACTIVE project in org.
   * MANAGER: only if ProjectMember on ACTIVE project.
   */
  async assertActorCanManageProjectMembers(actorUserId: string, projectId: string) {
    const actor = await this.getActorOrThrow(actorUserId);
    const project = await this.assertActorCanAccessActiveProject(actorUserId, projectId);

    if (this.isOwner(actor.role)) {
      return { actor, project };
    }

    if (this.isManager(actor.role)) {
      const membership = await this.prisma.projectMember.findFirst({
        where: { projectId: project.id, userId: actor.id },
      });
      if (membership) {
        return { actor, project };
      }
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: actor.id },
    });
    if (membership) {
      throw new ForbiddenException("You cannot manage project members");
    }

    throw new NotFoundException(`Project with id "${projectId}" not found`);
  }

  async getPendingExpenseProjectIds(actorUserId: string, targetUserId: string): Promise<string[]> {
    const actor = await this.getActorOrThrow(actorUserId);
    await this.assertActorCanViewPendingForUser(actorUserId, targetUserId);

    if (this.isOwner(actor.role) && targetUserId !== actor.id) {
      const rows = await this.prisma.project.findMany({
        where: { organizationId: this.orgId(), status: ACTIVE_PROJECT_STATUS },
        select: { id: true },
      });
      return rows.map((p) => p.id);
    }

    return this.getAccessibleActiveProjectIds(actorUserId);
  }
}
