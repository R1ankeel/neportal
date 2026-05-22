import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { TaskNotificationType, TaskStatus } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateTaskNotificationDto } from "./dto/task-notification.dto";
import { CreateTaskDto, UpdateTaskDeadlineDto, UpdateTaskStatusDto } from "./dto/task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  private parseDateInput(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: "${value}"`);
    }
    return d;
  }

  private endOfDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );
  }

  /** Локальное время сервера: границы календарного «завтра». */
  private tomorrowLocalRange(): { start: Date; end: Date } {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0, 0);
    const end = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);
    return { start, end };
  }

  private readonly taskUserNotifySelect = {
    id: true,
    fullName: true,
    telegramId: true,
  } as const;

  private readonly activeTaskStatuses = {
    notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] as TaskStatus[],
  };

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

    let deadlineAt: Date | undefined;
    if (dto.deadlineAt != null) {
      deadlineAt = this.endOfDay(this.parseDateInput(dto.deadlineAt));
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
        ...(deadlineAt != null ? { deadlineAt } : {}),
      },
      include: {
        creator: { select: this.taskUserNotifySelect },
        assignee: { select: this.taskUserNotifySelect },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findDeadlineTomorrowNotifications() {
    const { start, end } = this.tomorrowLocalRange();

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        status: this.activeTaskStatuses,
        deadlineAt: { gte: start, lte: end },
        assigneeId: { not: null },
        assignee: { telegramId: { not: null } },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: this.taskUserNotifySelect },
        creator: { select: this.taskUserNotifySelect },
        notificationLogs: {
          where: { type: TaskNotificationType.TASK_DEADLINE_TOMORROW },
          select: { userId: true },
        },
      },
    });

    return tasks
      .filter(
        (t) =>
          t.assigneeId != null &&
          !t.notificationLogs.some((l) => l.userId === t.assigneeId),
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        deadlineAt: t.deadlineAt,
        project: t.project ? { id: t.project.id, name: t.project.name } : null,
        assignee: t.assignee,
        creator: t.creator,
      }));
  }

  async findOverdueNotifications() {
    const now = new Date();

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        status: this.activeTaskStatuses,
        deadlineAt: { lt: now },
        assigneeId: { not: null },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: this.taskUserNotifySelect },
        creator: { select: this.taskUserNotifySelect },
        notificationLogs: {
          where: {
            type: {
              in: [
                TaskNotificationType.TASK_OVERDUE_ASSIGNEE,
                TaskNotificationType.TASK_OVERDUE_CREATOR,
              ],
            },
          },
          select: { userId: true, type: true },
        },
      },
    });

    return tasks.map((t) => {
      const hasAssigneeLog = t.notificationLogs.some(
        (l) =>
          l.type === TaskNotificationType.TASK_OVERDUE_ASSIGNEE &&
          l.userId === t.assigneeId,
      );
      const hasCreatorLog = t.notificationLogs.some(
        (l) =>
          l.type === TaskNotificationType.TASK_OVERDUE_CREATOR &&
          l.userId === t.creatorId,
      );

      const notifyAssignee =
        t.assigneeId != null &&
        t.assignee?.telegramId != null &&
        !hasAssigneeLog;
      const notifyCreator =
        t.creator.telegramId != null && !hasCreatorLog;

      return {
        id: t.id,
        title: t.title,
        deadlineAt: t.deadlineAt,
        project: t.project ? { id: t.project.id, name: t.project.name } : null,
        assignee: t.assignee,
        creator: t.creator,
        notifyAssignee,
        notifyCreator,
      };
    }).filter((t) => t.notifyAssignee || t.notifyCreator);
  }

  async recordNotification(taskId: string, dto: CreateTaskNotificationDto) {
    const org = this.orgId();

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: org },
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${taskId}" not found`);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    return this.prisma.taskNotificationLog.upsert({
      where: {
        taskId_userId_type: {
          taskId,
          userId: dto.userId,
          type: dto.type,
        },
      },
      create: {
        organizationId: org,
        taskId,
        userId: dto.userId,
        type: dto.type,
      },
      update: {},
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
      completionResult?: string | null;
      cancellationReason?: string | null;
    } = { status: dto.status };

    if (dto.status === TaskStatus.DONE) {
      data.completedAt = now;
      data.cancelledAt = null;
      data.cancellationReason = null;
      if (dto.completionResult != null && dto.completionResult.trim() !== "") {
        data.completionResult = dto.completionResult.trim();
      }
    } else if (dto.status === TaskStatus.CANCELLED) {
      data.cancelledAt = now;
      data.completedAt = null;
      data.completionResult = null;
      if (dto.cancellationReason != null && dto.cancellationReason.trim() !== "") {
        data.cancellationReason = dto.cancellationReason.trim();
      }
    } else {
      data.completedAt = null;
      data.cancelledAt = null;
      data.completionResult = null;
      data.cancellationReason = null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
      include: {
        creator: { select: this.taskUserNotifySelect },
        assignee: { select: this.taskUserNotifySelect },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async updateDeadline(id: string, dto: UpdateTaskDeadlineDto) {
    const existing = await this.prisma.task.findFirst({
      where: { id, organizationId: this.orgId() },
    });
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }

    let deadlineAt: Date | null = null;
    if (dto.deadlineAt != null) {
      deadlineAt = this.endOfDay(this.parseDateInput(dto.deadlineAt));
    }

    return this.prisma.task.update({
      where: { id },
      data: { deadlineAt },
      include: {
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }
}
