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
import { ProjectAccessService } from "../projects/project-access.service";
import { NotificationBindingsService } from "../notification-bindings/notification-bindings.service";
import { CreateTaskCommentDto, UpdateTaskCommentDto } from "./dto/task-comment.dto";
import { CreateTaskCommentMentionDto } from "./dto/task-comment-mention.dto";
import { CreateTaskNotificationDto } from "./dto/task-notification.dto";
import {
  AcceptTaskTransferDto,
  CreateTaskTransferDto,
  RejectTaskTransferDto,
} from "./dto/task-transfer.dto";
import {
  CreateTaskDto,
  UpdateTaskAssigneeDto,
  UpdateTaskDeadlineDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from "./dto/task.dto";
import {
  buildTaskFieldsUpdatedNotifyMessage,
  normalizeTaskDescription,
  taskDescriptionsEqual,
} from "./task-fields-notify.util";
import { TelegramNotifyService } from "../telegram/telegram-notify.service";
import {
  buildTaskAssigneeAssignedMessage,
  buildTaskAssigneeUnassignedMessage,
} from "./task-assignee-notify.util";
import {
  buildTaskDeadlineChangedMessage,
  calendarDateKey,
} from "./task-deadline-notify.util";
import {
  buildTaskCommentCreatedMessage,
  buildTaskCommentUpdatedMessage,
} from "./task-comment-notify.util";
import { buildTaskMentionRequestedMessage } from "./task-mention-notify.util";

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly telegramNotify: TelegramNotifyService,
    private readonly notificationBindings: NotificationBindingsService,
    private readonly projectAccess: ProjectAccessService,
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

  async findOne(id: string, actorUserId?: string) {
    const actorId = this.projectAccess.requireActorId(actorUserId);
    const taskRow = await this.prisma.task.findFirst({
      where: { id, organizationId: this.orgId() },
      select: { id: true, projectId: true },
    });
    if (!taskRow) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }
    await this.projectAccess.assertActorCanAccessProjectReadOnlyForWeb(actorId, taskRow.projectId);
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
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId,
      actorUserId: dto.authorId,
    });
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

    const result = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          organizationId: org,
          taskId,
          authorId: dto.authorId,
          text,
          source: dto.source ?? TaskCommentSource.WEB,
        },
        include: this.commentInclude,
      });

      const task = await tx.task.findFirstOrThrow({
        where: { id: taskId, organizationId: org },
        select: {
          id: true,
          title: true,
          assignee: { select: this.taskUserNotifySelect },
        },
      });

      return { comment, task };
    });

    if (dto.notifyAssignee) {
      await this.notifyTaskCommentCreated({
        taskId,
        taskTitle: result.task.title,
        commentText: result.comment.text,
        commentId: result.comment.id,
        authorId: dto.authorId,
        assignee: result.task.assignee,
        mentionedUsers: [],
        notifyAssignee: true,
        notifyMentioned: false,
      });
    }

    return result.comment;
  }

  async updateComment(taskId: string, commentId: string, dto: UpdateTaskCommentDto) {
    const org = this.orgId();
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId,
      actorUserId: dto.editorId,
    });
    await this.assertTaskInOrg(taskId);

    const editor = await this.prisma.user.findFirst({
      where: { id: dto.editorId, organizationId: org },
    });
    if (!editor) {
      throw new NotFoundException(`User with id "${dto.editorId}" not found in this organization`);
    }

    const existing = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId, organizationId: org },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            assignee: { select: this.taskUserNotifySelect },
          },
        },
        mentions: {
          include: {
            mentionedUser: { select: this.taskUserNotifySelect },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Comment with id "${commentId}" not found`);
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("text must not be empty");
    }

    if (text === existing.text.trim()) {
      return this.prisma.taskComment.findFirstOrThrow({
        where: { id: commentId, taskId, organizationId: org },
        include: this.commentInclude,
      });
    }

    const updated = await this.prisma.taskComment.update({
      where: { id: commentId },
      data: { text },
      include: this.commentInclude,
    });

    const explicitMentionedIds = (dto.mentionedUserIds ?? [])
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    let mentionedUsers: Array<{ id: string; telegramId: string | null }> = [];
    if (explicitMentionedIds.length > 0) {
      const uniqIds = Array.from(new Set(explicitMentionedIds));
      const users = await this.prisma.user.findMany({
        where: { id: { in: uniqIds }, organizationId: org },
        select: this.taskUserNotifySelect,
      });
      if (users.length !== uniqIds.length) {
        const found = new Set(users.map((u) => u.id));
        const missing = uniqIds.find((id) => !found.has(id));
        throw new NotFoundException(`User with id "${missing ?? "unknown"}" not found in this organization`);
      }
      mentionedUsers = users;
    } else {
      mentionedUsers = existing.mentions.map((m) => m.mentionedUser);
    }

    await this.notifyTaskCommentUpdated({
      taskId: existing.task.id,
      taskTitle: existing.task.title,
      oldText: existing.text,
      newText: text,
      assignee: existing.task.assignee,
      editorId: editor.id,
      mentionedUsers,
      notifyAssignee: dto.notifyAssignee !== false,
      notifyMentioned: dto.notifyMentioned !== false,
    });

    return updated;
  }

  private async notifyTaskCommentCreated(params: {
    taskId: string;
    taskTitle: string;
    commentText: string;
    commentId?: string;
    assignee: { id: string; telegramId: string | null } | null;
    authorId: string;
    mentionedUsers: Array<{ id: string; telegramId: string | null }>;
    notifyAssignee: boolean;
    notifyMentioned: boolean;
  }): Promise<void> {
    const {
      taskId,
      taskTitle,
      commentText,
      commentId,
      assignee,
      authorId,
      mentionedUsers,
      notifyAssignee,
      notifyMentioned,
    } = params;

    const mentionedMap = new Map<string, string>();
    for (const user of mentionedUsers) {
      if (!notifyMentioned) break;
      if (!user.telegramId || user.id === authorId) continue;
      if (!mentionedMap.has(user.id)) {
        mentionedMap.set(user.id, user.telegramId);
      }
    }

    for (const [, telegramId] of mentionedMap) {
      const mentionText = buildTaskMentionRequestedMessage(taskTitle, commentText);
      try {
        const sent = await this.telegramNotify.sendMessage(telegramId, mentionText);
        if (sent && commentId) {
          this.notificationBindings.create({
            telegramChatId: String(sent.chat.id),
            telegramMessageId: sent.message_id,
            taskId,
            sourceCommentId: commentId,
            sourceCommentAuthorId: authorId,
            notificationType: "TASK_MENTION",
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to notify mentioned user for task ${taskId}: ${msg}`);
      }
    }

    if (
      notifyAssignee &&
      assignee?.telegramId &&
      assignee.id !== authorId &&
      !mentionedMap.has(assignee.id)
    ) {
      const assigneeText = buildTaskCommentCreatedMessage(taskTitle, commentText);
      try {
        const sent = await this.telegramNotify.sendMessage(assignee.telegramId, assigneeText);
        if (sent && commentId) {
          this.notificationBindings.create({
            telegramChatId: String(sent.chat.id),
            telegramMessageId: sent.message_id,
            taskId,
            sourceCommentId: commentId,
            sourceCommentAuthorId: authorId,
            notificationType: "TASK_COMMENT",
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to notify assignee about new comment for task ${taskId}: ${msg}`);
      }
    }
  }

  private async notifyTaskCommentUpdated(params: {
    taskId: string;
    taskTitle: string;
    oldText: string;
    newText: string;
    assignee: { id: string; telegramId: string | null } | null;
    editorId: string;
    mentionedUsers: Array<{ id: string; telegramId: string | null }>;
    notifyAssignee: boolean;
    notifyMentioned: boolean;
  }): Promise<void> {
    const {
      taskId,
      taskTitle,
      oldText,
      newText,
      assignee,
      editorId,
      mentionedUsers,
      notifyAssignee,
      notifyMentioned,
    } = params;

    const mentionedMap = new Map<string, string>();
    for (const user of mentionedUsers) {
      if (!notifyMentioned) break;
      if (!user.telegramId || user.id === editorId) continue;
      if (!mentionedMap.has(user.id)) {
        mentionedMap.set(user.id, user.telegramId);
      }
    }

    for (const [userId, telegramId] of mentionedMap) {
      const mentionText = buildTaskMentionRequestedMessage(taskTitle, newText);
      try {
        await this.telegramNotify.sendMessage(telegramId, mentionText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to notify mentioned user ${userId} for task ${taskId}: ${msg}`);
      }
    }

    if (
      notifyAssignee &&
      assignee?.telegramId &&
      assignee.id !== editorId &&
      !mentionedMap.has(assignee.id)
    ) {
      const assigneeText = buildTaskCommentUpdatedMessage(taskTitle, oldText, newText);
      try {
        await this.telegramNotify.sendMessage(assignee.telegramId, assigneeText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to notify assignee about comment update for task ${taskId}: ${msg}`);
      }
    }
  }

  async createCommentMention(taskId: string, dto: CreateTaskCommentMentionDto) {
    const org = this.orgId();
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId,
      actorUserId: dto.authorId,
    });
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

    const result = await this.prisma.$transaction(async (tx) => {
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

    if (dto.notifyMentioned || dto.notifyAssignee) {
      await this.notifyTaskCommentCreated({
        taskId,
        taskTitle: result.task.title,
        commentText: result.comment.text,
        commentId: result.comment.id,
        authorId: result.author.id,
        assignee: result.task.assignee,
        mentionedUsers: [result.mentionedUser],
        notifyAssignee: dto.notifyAssignee === true,
        notifyMentioned: dto.notifyMentioned === true,
      });
    }

    return result;
  }

  async findAll(actorUserId?: string, projectId?: string) {
    const actorId = this.projectAccess.requireActorId(actorUserId);
    if (projectId) {
      await this.projectAccess.assertActorCanAccessProjectReadOnlyForWeb(actorId, projectId);
    }

    const accessibleIds = projectId
      ? [projectId]
      : await this.projectAccess.getAccessibleActiveProjectIds(actorId);
    if (accessibleIds.length === 0) {
      return [];
    }

    return this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        projectId: { in: accessibleIds },
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

  async findCompletedTasks(userId: string, limit = 5) {
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
        status: TaskStatus.DONE,
      },
      orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      take: cappedLimit,
      include: this.myTaskInclude,
    });
  }

  async create(dto: CreateTaskDto) {
    const org = this.orgId();

    const projectId = dto.projectId?.trim();
    if (!projectId) {
      throw new BadRequestException(
        "projectId is required: задачи создаются только внутри проекта",
      );
    }

    await this.projectAccess.assertProjectIsActiveForWrite({
      projectId,
      actorUserId: dto.creatorId,
    });

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

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: org },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
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
        projectId,
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
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId: id,
      actorUserId: dto.actorUserId,
    });
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

  async update(id: string, dto: UpdateTaskDto) {
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId: id,
      actorUserId: dto.actorUserId,
    });
    const hasTitle = dto.title !== undefined;
    const hasDescription = dto.description !== undefined;
    if (!hasTitle && !hasDescription) {
      throw new BadRequestException("At least one of title or description must be provided");
    }

    const org = this.orgId();
    const existing = await this.prisma.task.findFirst({
      where: { id, organizationId: org },
      include: {
        assignee: { select: this.taskUserNotifySelect },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }

    const data: { title?: string; description?: string | null } = {};
    let titleChanged = false;
    let descriptionChanged = false;

    if (hasTitle) {
      const title = dto.title!.trim();
      if (!title) {
        throw new BadRequestException("Title must not be empty");
      }
      if (title !== existing.title) {
        data.title = title;
        titleChanged = true;
      }
    }

    if (hasDescription) {
      const description = normalizeTaskDescription(dto.description);
      if (!taskDescriptionsEqual(description, existing.description)) {
        data.description = description;
        descriptionChanged = true;
      }
    }

    if (!titleChanged && !descriptionChanged) {
      return this.prisma.task.findFirstOrThrow({
        where: { id, organizationId: org },
        include: this.taskWithProjectInclude,
      });
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: this.taskWithProjectInclude,
    });

    await this.notifyAssigneeTaskFieldsUpdated({
      taskId: id,
      assignee: updated.assignee,
      taskTitle: updated.title,
      titleChanged,
      descriptionChanged,
      oldTitle: existing.title,
      newTitle: updated.title,
    });

    return updated;
  }

  private async notifyAssigneeTaskFieldsUpdated(params: {
    taskId: string;
    assignee: { id: string; telegramId: string | null } | null;
    taskTitle: string;
    titleChanged: boolean;
    descriptionChanged: boolean;
    oldTitle: string;
    newTitle: string;
  }): Promise<void> {
    const { taskId, assignee, taskTitle, titleChanged, descriptionChanged, oldTitle, newTitle } =
      params;
    if (!assignee?.telegramId) return;

    const text = buildTaskFieldsUpdatedNotifyMessage({
      taskTitle,
      titleChanged,
      descriptionChanged,
      oldTitle,
      newTitle,
    });
    if (!text) return;

    try {
      await this.telegramNotify.sendMessage(assignee.telegramId, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Failed to notify assignee about task fields update for task ${taskId}: ${msg}`,
      );
    }
  }

  async updateAssignee(id: string, dto: UpdateTaskAssigneeDto) {
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId: id,
      actorUserId: dto.actorUserId,
    });
    const org = this.orgId();
    const existing = await this.prisma.task.findFirst({
      where: { id, organizationId: org },
      include: {
        assignee: { select: this.taskUserNotifySelect },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task with id "${id}" not found`);
    }

    if (existing.assigneeId === dto.assigneeUserId) {
      return this.prisma.task.findFirstOrThrow({
        where: { id, organizationId: org },
        include: this.taskWithProjectInclude,
      });
    }

    const assignee = await this.prisma.user.findFirst({
      where: { id: dto.assigneeUserId, organizationId: org },
    });
    if (!assignee) {
      throw new NotFoundException(
        `User with id "${dto.assigneeUserId}" not found in this organization`,
      );
    }

    const oldAssignee = existing.assignee;

    const updated = await this.prisma.task.update({
      where: { id },
      data: { assigneeId: dto.assigneeUserId },
      include: this.taskWithProjectInclude,
    });

    await this.notifyAssigneeChanged({
      taskId: id,
      title: existing.title,
      deadlineAt: existing.deadlineAt,
      newAssignee: updated.assignee,
      oldAssignee,
    });

    return updated;
  }

  private async notifyAssigneeChanged(params: {
    taskId: string;
    title: string;
    deadlineAt: Date | null;
    newAssignee: { id: string; telegramId: string | null } | null;
    oldAssignee: { id: string; telegramId: string | null } | null;
  }): Promise<void> {
    const { taskId, title, deadlineAt, newAssignee, oldAssignee } = params;

    if (
      newAssignee?.telegramId &&
      newAssignee.id !== oldAssignee?.id
    ) {
      const text = buildTaskAssigneeAssignedMessage(title, deadlineAt);
      try {
        const sent = await this.telegramNotify.sendMessage(newAssignee.telegramId, text);
        if (sent) {
          this.notificationBindings.create({
            telegramChatId: String(sent.chat.id),
            telegramMessageId: sent.message_id,
            taskId,
            notificationType: "NEW_TASK",
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to notify new assignee for task ${taskId}: ${msg}`,
        );
      }
    }

    if (
      oldAssignee?.telegramId &&
      oldAssignee.id !== newAssignee?.id
    ) {
      const text = buildTaskAssigneeUnassignedMessage(title);
      try {
        await this.telegramNotify.sendMessage(oldAssignee.telegramId, text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to notify previous assignee for task ${taskId}: ${msg}`,
        );
      }
    }
  }

  async updateDeadline(id: string, dto: UpdateTaskDeadlineDto) {
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId: id,
      actorUserId: dto.actorUserId,
    });
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
    await this.projectAccess.assertProjectIsActiveForWriteByTaskId({
      taskId,
      actorUserId: dto.requestedById,
    });
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
