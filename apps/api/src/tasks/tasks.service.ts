import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import {
  TaskCommentSource,
  TaskNotificationType,
  TaskStatus,
  TaskTransferStatus,
  UserRole,
} from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateTaskCommentDto } from "./dto/task-comment.dto";
import { CreateTaskCommentMentionDto } from "./dto/task-comment-mention.dto";
import { CreateTaskNotificationDto } from "./dto/task-notification.dto";
import {
  AcceptTaskTransferDto,
  CreateTaskTransferDto,
  RejectTaskTransferDto,
} from "./dto/task-transfer.dto";
import { CreateTaskDto, UpdateTaskDeadlineDto, UpdateTaskStatusDto } from "./dto/task.dto";
import { TelegramNotifyService } from "../telegram/telegram-notify.service";
import {
  buildTaskDeadlineChangedMessage,
  calendarDateKey,
} from "./task-deadline-notify.util";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly telegramNotify: TelegramNotifyService,
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

  private readonly taskUserDetailSelect = {
    id: true,
    fullName: true,
    role: true,
    telegramId: true,
  } as const;

  private readonly commentAuthorSelect = {
    id: true,
    fullName: true,
    role: true,
  } as const;

  private readonly mentionUserSelect = {
    id: true,
    fullName: true,
    role: true,
  } as const;

  private readonly transferUserSelect = {
    id: true,
    fullName: true,
    role: true,
  } as const;

  private readonly transferInclude = {
    fromUser: { select: this.transferUserSelect },
    toUser: { select: this.transferUserSelect },
    requestedBy: { select: this.transferUserSelect },
  } as const;

  private readonly commentInclude = {
    author: { select: this.commentAuthorSelect },
    mentions: {
      orderBy: { createdAt: "asc" as const },
      include: {
        mentionedUser: { select: this.mentionUserSelect },
      },
    },
  } as const;

  private readonly taskListUserSelect = {
    id: true,
    fullName: true,
  } as const;

  private readonly taskWithProjectInclude = {
    project: { select: { id: true, name: true } },
    creator: { select: this.taskUserDetailSelect },
    assignee: { select: this.taskUserDetailSelect },
  } as const;

  private readonly myTaskInclude = {
    project: { select: { id: true, name: true } },
    creator: { select: this.taskListUserSelect },
    assignee: { select: this.taskListUserSelect },
  } as const;

  private readonly taskDetailInclude = {
    ...this.taskWithProjectInclude,
    comments: {
      orderBy: { createdAt: "asc" as const },
      include: this.commentInclude,
    },
    transfers: {
      orderBy: { createdAt: "desc" as const },
      include: this.transferInclude,
    },
  } as const;

  private readonly activeTaskStatuses = {
    notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] as TaskStatus[],
  };

  private readonly transferableStatuses: TaskStatus[] = [TaskStatus.NEW, TaskStatus.IN_PROGRESS];

  private isManagerRole(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.MANAGER;
  }

  private trimOptionalComment(comment?: string): string | undefined {
    const trimmed = comment?.trim();
    return trimmed ? trimmed : undefined;
  }

  private async assertTaskInOrg(taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: this.orgId() },
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${taskId}" not found`);
    }
    return task;
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: this.orgId() },
      include: this.taskDetailInclude,
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    return task;
  }

  async findComments(taskId: string) {
    await this.assertTaskInOrg(taskId);

    return this.prisma.taskComment.findMany({
      where: { taskId, organizationId: this.orgId() },
      orderBy: { createdAt: "asc" },
      include: this.commentInclude,
    });
  }

  async createComment(taskId: string, dto: CreateTaskCommentDto) {
    const org = this.orgId();
    await this.assertTaskInOrg(taskId);

    const author = await this.prisma.user.findFirst({
      where: { id: dto.authorId, organizationId: org },
    });
    if (!author) {
      throw new NotFoundException(`User with id "${dto.authorId}" not found in this organization`);
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("text must not be empty");
    }

    return this.prisma.taskComment.create({
      data: {
        organizationId: org,
        taskId,
        authorId: dto.authorId,
        text,
        source: dto.source ?? TaskCommentSource.WEB,
      },
      include: this.commentInclude,
    });
  }

  async createCommentMention(taskId: string, dto: CreateTaskCommentMentionDto) {
    const org = this.orgId();
    await this.assertTaskInOrg(taskId);

    const author = await this.prisma.user.findFirst({
      where: { id: dto.authorId, organizationId: org },
    });
    if (!author) {
      throw new NotFoundException(`User with id "${dto.authorId}" not found in this organization`);
    }

    const mentionedUser = await this.prisma.user.findFirst({
      where: { id: dto.mentionedUserId, organizationId: org },
    });
    if (!mentionedUser) {
      throw new NotFoundException(
        `User with id "${dto.mentionedUserId}" not found in this organization`,
      );
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("text must not be empty");
    }

    const source = dto.source ?? TaskCommentSource.WEB;

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          organizationId: org,
          taskId,
          authorId: dto.authorId,
          text,
          source,
        },
        include: this.commentInclude,
      });

      const mention = await tx.taskCommentMention.create({
        data: {
          organizationId: org,
          commentId: comment.id,
          taskId,
          mentionedUserId: dto.mentionedUserId,
          requestedById: dto.authorId,
        },
        include: {
          mentionedUser: { select: this.mentionUserSelect },
        },
      });

      const task = await tx.task.findFirstOrThrow({
        where: { id: taskId, organizationId: org },
        include: {
          project: { select: { id: true, name: true } },
          creator: { select: this.taskUserDetailSelect },
          assignee: { select: this.taskUserDetailSelect },
        },
      });

      return {
        comment,
        mention,
        task,
        mentionedUser: {
          id: mentionedUser.id,
          fullName: mentionedUser.fullName,
          role: mentionedUser.role,
          telegramId: mentionedUser.telegramId,
        },
        author: {
          id: author.id,
          fullName: author.fullName,
          role: author.role,
          telegramId: author.telegramId,
        },
      };
    });
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

  async findMyTasks(userId: string, limit = 5) {
    const org = this.orgId();
    const cappedLimit = Math.min(Math.max(limit, 1), 20);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found in this organization`);
    }

    return this.prisma.task.findMany({
      where: {
        organizationId: org,
        assigneeId: userId,
        status: { in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS] },
      },
      orderBy: [{ deadlineAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: cappedLimit,
      include: this.myTaskInclude,
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
      startedAt?: Date | null;
      completedAt?: Date | null;
      cancelledAt?: Date | null;
      completionResult?: string | null;
      cancellationReason?: string | null;
    } = { status: dto.status };

    if (dto.status === TaskStatus.IN_PROGRESS) {
      data.startedAt = existing.startedAt ?? now;
      data.completedAt = null;
      data.cancelledAt = null;
      data.completionResult = null;
      data.cancellationReason = null;
    } else if (dto.status === TaskStatus.DONE) {
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
    } else if (dto.status === TaskStatus.NEW) {
      data.startedAt = null;
      data.completedAt = null;
      data.cancelledAt = null;
      data.completionResult = null;
      data.cancellationReason = null;
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
      include: {
        assignee: { select: { id: true, telegramId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }

    const oldDateKey = calendarDateKey(existing.deadlineAt);

    let deadlineAt: Date | null = null;
    if (dto.deadlineAt != null) {
      deadlineAt = this.endOfDay(this.parseDateInput(dto.deadlineAt));
    }

    const newDateKey = calendarDateKey(deadlineAt);

    const updated = await this.prisma.task.update({
      where: { id },
      data: { deadlineAt },
      include: {
        creator: { select: { id: true, fullName: true } },
        assignee: { select: { id: true, fullName: true, telegramId: true } },
        project: { select: { id: true, name: true } },
      },
    });

    if (dto.notifyAssignee && oldDateKey !== newDateKey) {
      await this.notifyAssigneeDeadlineChanged({
        taskId: id,
        title: existing.title,
        oldDateKey,
        newDateKey,
        assignee: updated.assignee,
      });
    }

    return updated;
  }

  private async notifyAssigneeDeadlineChanged(params: {
    taskId: string;
    title: string;
    oldDateKey: string | null;
    newDateKey: string | null;
    assignee: { id: string; telegramId: string | null } | null;
  }): Promise<void> {
    const { assignee, oldDateKey, newDateKey, title, taskId } = params;
    if (!assignee?.telegramId) return;

    const text = buildTaskDeadlineChangedMessage(title, oldDateKey, newDateKey);
    if (!text) return;

    try {
      await this.telegramNotify.sendMessage(assignee.telegramId, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to notify assignee about deadline change for task ${taskId}: ${msg}`,
      );
    }
  }

  async findTransfers(taskId: string) {
    await this.assertTaskInOrg(taskId);

    return this.prisma.taskTransfer.findMany({
      where: { taskId, organizationId: this.orgId() },
      orderBy: { createdAt: "desc" },
      include: this.transferInclude,
    });
  }

  async createTransfer(taskId: string, dto: CreateTaskTransferDto) {
    const org = this.orgId();
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: org },
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${taskId}" not found`);
    }

    if (!this.transferableStatuses.includes(task.status)) {
      throw new BadRequestException(
        "Task transfer is only allowed for NEW or IN_PROGRESS tasks",
      );
    }

    const requestedBy = await this.prisma.user.findFirst({
      where: { id: dto.requestedById, organizationId: org },
    });
    if (!requestedBy) {
      throw new NotFoundException(
        `User with id "${dto.requestedById}" not found in this organization`,
      );
    }

    const toUser = await this.prisma.user.findFirst({
      where: { id: dto.toUserId, organizationId: org },
    });
    if (!toUser) {
      throw new NotFoundException(`User with id "${dto.toUserId}" not found in this organization`);
    }

    if (task.assigneeId != null && task.assigneeId === dto.toUserId) {
      throw new BadRequestException("Target user is already the task assignee");
    }

    const fromUserId = task.assigneeId ?? dto.requestedById;
    const comment = this.trimOptionalComment(dto.comment);
    const now = new Date();
    const immediate = this.isManagerRole(requestedBy.role);

    if (dto.absenceId) {
      const absence = await this.prisma.absence.findFirst({
        where: { id: dto.absenceId, organizationId: org },
      });
      if (!absence) {
        throw new NotFoundException(`Absence with id "${dto.absenceId}" not found`);
      }
    }

    if (immediate) {
      const result = await this.prisma.$transaction(async (tx) => {
        const transfer = await tx.taskTransfer.create({
          data: {
            organizationId: org,
            taskId,
            fromUserId,
            toUserId: dto.toUserId,
            requestedById: dto.requestedById,
            absenceId: dto.absenceId,
            comment,
            status: TaskTransferStatus.ACCEPTED,
            decidedAt: now,
          },
          include: this.transferInclude,
        });

        const updatedTask = await tx.task.update({
          where: { id: taskId },
          data: { assigneeId: dto.toUserId },
          include: this.taskWithProjectInclude,
        });

        return { transfer, task: updatedTask };
      });

      return result;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.taskTransfer.create({
        data: {
          organizationId: org,
          taskId,
          fromUserId,
          toUserId: dto.toUserId,
          requestedById: dto.requestedById,
          absenceId: dto.absenceId,
          comment,
          status: TaskTransferStatus.PENDING,
        },
        include: this.transferInclude,
      });

      const unchangedTask = await tx.task.findFirstOrThrow({
        where: { id: taskId, organizationId: org },
        include: this.taskWithProjectInclude,
      });

      return { transfer, task: unchangedTask };
    });

    return result;
  }

  async acceptTransfer(transferId: string, dto: AcceptTaskTransferDto) {
    const org = this.orgId();

    const transfer = await this.prisma.taskTransfer.findFirst({
      where: { id: transferId, organizationId: org },
      include: { task: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Task transfer with id "${transferId}" not found`);
    }

    if (transfer.status !== TaskTransferStatus.PENDING) {
      throw new BadRequestException("Transfer is not pending");
    }

    if (dto.userId !== transfer.toUserId) {
      throw new BadRequestException("Only the target user can accept this transfer");
    }

    if (!this.transferableStatuses.includes(transfer.task.status)) {
      throw new BadRequestException(
        "Task transfer is only allowed for NEW or IN_PROGRESS tasks",
      );
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedTransfer = await tx.taskTransfer.update({
        where: { id: transferId },
        data: {
          status: TaskTransferStatus.ACCEPTED,
          decidedAt: now,
        },
        include: this.transferInclude,
      });

      const updatedTask = await tx.task.update({
        where: { id: transfer.taskId },
        data: { assigneeId: transfer.toUserId },
        include: this.taskWithProjectInclude,
      });

      return { transfer: updatedTransfer, task: updatedTask };
    });
  }

  async rejectTransfer(transferId: string, dto: RejectTaskTransferDto) {
    const org = this.orgId();

    const transfer = await this.prisma.taskTransfer.findFirst({
      where: { id: transferId, organizationId: org },
      include: { task: true },
    });
    if (!transfer) {
      throw new NotFoundException(`Task transfer with id "${transferId}" not found`);
    }

    if (transfer.status !== TaskTransferStatus.PENDING) {
      throw new BadRequestException("Transfer is not pending");
    }

    if (dto.userId !== transfer.toUserId) {
      throw new BadRequestException("Only the target user can reject this transfer");
    }

    const rejectionReason = dto.rejectionReason.trim();
    if (!rejectionReason) {
      throw new BadRequestException("rejectionReason must not be empty");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updatedTransfer = await tx.taskTransfer.update({
        where: { id: transferId },
        data: {
          status: TaskTransferStatus.REJECTED,
          rejectionReason,
          decidedAt: now,
        },
        include: this.transferInclude,
      });

      const unchangedTask = await tx.task.findFirstOrThrow({
        where: { id: transfer.taskId, organizationId: org },
        include: this.taskWithProjectInclude,
      });

      return { transfer: updatedTransfer, task: unchangedTask };
    });
  }
}
