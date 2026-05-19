import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { TaskStatus } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateTaskDto, UpdateTaskStatusDto } from "./dto/task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async findAll(projectId?: string) {
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId: this.orgId() },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${projectId}" not found`);
      }
    }

    return this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      include: {
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async create(dto: CreateTaskDto) {
    const org = this.orgId();

    const creator = await this.prisma.user.findFirst({
      where: { id: dto.creatorId, organizationId: org },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.creatorId}" not found in this organization`);
    }

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assigneeId, organizationId: org },
      });
      if (!assignee) {
        throw new NotFoundException(`Assignee with id "${dto.assigneeId}" not found in this organization`);
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId: org },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${dto.projectId}" not found`);
      }
    }

    return this.prisma.task.create({
      data: {
        organizationId: org,
        title: dto.title,
        description: dto.description,
        projectId: dto.projectId,
        creatorId: dto.creatorId,
        assigneeId: dto.assigneeId,
        status: dto.status ?? TaskStatus.NEW,
      },
      include: {
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto) {
    const existing = await this.prisma.task.findFirst({
      where: { id, organizationId: this.orgId() },
    });
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }

    const now = new Date();
    const data: {
      status: TaskStatus;
      completedAt?: Date | null;
      cancelledAt?: Date | null;
    } = { status: dto.status };

    if (dto.status === TaskStatus.DONE) {
      data.completedAt = now;
      data.cancelledAt = null;
    } else if (dto.status === TaskStatus.CANCELLED) {
      data.cancelledAt = now;
      data.completedAt = null;
    } else {
      data.completedAt = null;
      data.cancelledAt = null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }
}
