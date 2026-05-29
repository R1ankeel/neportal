import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AbsenceStatus,
  AbsenceType,
  EntityStatus,
  PrismaService,
  TaskStatus,
  UserRole,
} from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { ProjectAccessService } from "../projects/project-access.service";
import { CancelAbsenceDto, CreateAbsenceDto, UpdateAbsenceStatusDto } from "./dto/absence.dto";
import { RecordAbsenceNotificationDto } from "./dto/absence-notification.dto";

export const AFFECTED_TASKS_CAP = 20;

export type AbsenceAffectedTask = {
  id: string;
  title: string;
  status: TaskStatus;
  deadlineAt: Date | null;
  project: { id: string; name: string } | null;
  creator: { id: string; fullName: string; telegramId: string | null };
  assignee: { id: string; fullName: string; telegramId: string | null } | null;
};

export type AbsenceListItem = {
  id: string;
  type: AbsenceType;
  status: AbsenceStatus;
  startDate: Date;
  endDate: Date;
  documentNumber: string | null;
  comment: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; fullName: string; role: string };
  cancelledBy: { id: string; fullName: string; role: string } | null;
  affectedTasks: AbsenceAffectedTask[];
  affectedTasksTotal: number;
  affectedTasksTruncated: boolean;
  membershipProjectCount: number;
};

type AffectedTasksResult = {
  tasks: AbsenceAffectedTask[];
  total: number;
  truncated: boolean;
  membershipProjectCount: number;
};

const affectedTaskSelect = {
  id: true,
  title: true,
  status: true,
  deadlineAt: true,
  project: { select: { id: true, name: true } },
  creator: { select: { id: true, fullName: true, telegramId: true } },
  assignee: { select: { id: true, fullName: true, telegramId: true } },
} as const;

@Injectable()
export class AbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
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

  private startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  }

  private endOfDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
    );
  }

  private async assertActor(actorUserId: string | undefined): Promise<{
    id: string;
    fullName: string;
    role: UserRole;
  }> {
    const trimmed = actorUserId?.trim();
    if (!trimmed) {
      throw new BadRequestException("actorUserId is required");
    }

    const actor = await this.prisma.user.findFirst({
      where: { id: trimmed, organizationId: this.orgId() },
      select: { id: true, fullName: true, role: true },
    });
    if (!actor) {
      throw new NotFoundException(`User with id "${trimmed}" not found in this organization`);
    }
    return actor;
  }

  private actorSeesAllAbsences(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.MANAGER;
  }

  private assertActorCanViewAbsenceUser(
    actor: { id: string; role: UserRole },
    absenceUserId: string,
  ): void {
    if (this.actorSeesAllAbsences(actor.role)) return;
    if (actor.id !== absenceUserId) {
      throw new NotFoundException("Absence not found");
    }
  }

  private assertActorCanCreateForUser(
    actor: { id: string; role: UserRole },
    targetUserId: string,
  ): void {
    if (this.actorSeesAllAbsences(actor.role)) return;
    if (actor.id !== targetUserId) {
      throw new ForbiddenException("Вы можете оформить отсутствие только для себя");
    }
  }

  private async assertProjectAccessForActor(actorUserId: string | undefined, projectId: string) {
    if (!actorUserId?.trim()) {
      throw new BadRequestException("actorUserId is required when projectId is set");
    }
    await this.projectAccess.assertActorCanAccessProjectReadOnlyForWeb(actorUserId.trim(), projectId);
  }

  private async getMemberProjectIds(userId: string): Promise<string[]> {
    const members = await this.prisma.projectMember.findMany({
      where: {
        userId,
        project: {
          organizationId: this.orgId(),
          status: EntityStatus.ACTIVE,
        },
      },
      select: { projectId: true },
    });
    return members.map((m) => m.projectId);
  }

  private sortAffectedTasks(tasks: AbsenceAffectedTask[]): AbsenceAffectedTask[] {
    return [...tasks].sort((a, b) => {
      const deadlineA = a.deadlineAt?.getTime() ?? 0;
      const deadlineB = b.deadlineAt?.getTime() ?? 0;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;

      const projectA = a.project?.name ?? "";
      const projectB = b.project?.name ?? "";
      const byProject = projectA.localeCompare(projectB, "ru", { sensitivity: "base" });
      if (byProject !== 0) return byProject;

      return a.title.localeCompare(b.title, "ru", { sensitivity: "base" });
    });
  }

  private async getAffectedTasks(
    userId: string,
    startDate: Date,
    endDate: Date,
    projectId?: string,
  ): Promise<AffectedTasksResult> {
    const memberProjectIds = await this.getMemberProjectIds(userId);
    const membershipProjectCount = memberProjectIds.length;

    if (membershipProjectCount === 0) {
      return { tasks: [], total: 0, truncated: false, membershipProjectCount: 0 };
    }

    let projectFilter: string | { in: string[] };
    if (projectId != null) {
      if (!memberProjectIds.includes(projectId)) {
        return { tasks: [], total: 0, truncated: false, membershipProjectCount };
      }
      projectFilter = projectId;
    } else {
      projectFilter = { in: memberProjectIds };
    }

    const rows = await this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        projectId: projectFilter,
        assigneeId: userId,
        deadlineAt: {
          not: null,
          gte: this.startOfDay(startDate),
          lte: this.endOfDay(endDate),
        },
        status: { in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS] },
      },
      select: affectedTaskSelect,
    });

    const sorted = this.sortAffectedTasks(rows);
    const total = sorted.length;
    const truncated = total > AFFECTED_TASKS_CAP;
    const tasks = sorted.slice(0, AFFECTED_TASKS_CAP);

    return { tasks, total, truncated, membershipProjectCount };
  }

  private async mapListItem(
    absence: {
      id: string;
      type: AbsenceType;
      status: AbsenceStatus;
      startDate: Date;
      endDate: Date;
      documentNumber: string | null;
      comment: string | null;
      cancelledAt: Date | null;
      cancelledById: string | null;
      cancellationReason: string | null;
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; fullName: string; role: string };
      cancelledBy: { id: string; fullName: string; role: string } | null;
    },
    projectId?: string,
    affectedOverride?: AffectedTasksResult,
  ): Promise<AbsenceListItem> {
    const affected =
      affectedOverride ??
      (await this.getAffectedTasks(absence.user.id, absence.startDate, absence.endDate, projectId));

    return {
      id: absence.id,
      type: absence.type,
      status: absence.status,
      startDate: absence.startDate,
      endDate: absence.endDate,
      documentNumber: absence.documentNumber,
      comment: absence.comment,
      cancelledAt: absence.cancelledAt,
      cancelledById: absence.cancelledById,
      cancellationReason: absence.cancellationReason,
      createdAt: absence.createdAt,
      updatedAt: absence.updatedAt,
      user: absence.user,
      cancelledBy: absence.cancelledBy,
      affectedTasks: affected.tasks,
      affectedTasksTotal: affected.total,
      affectedTasksTruncated: affected.truncated,
      membershipProjectCount: affected.membershipProjectCount,
    };
  }

  private userSelect = { id: true, fullName: true, role: true } as const;

  private canCancelAbsence(
    cancelledBy: { id: string; role: UserRole },
    absenceUserId: string,
  ): boolean {
    if (cancelledBy.role === UserRole.OWNER || cancelledBy.role === UserRole.MANAGER) {
      return true;
    }
    return cancelledBy.id === absenceUserId;
  }

  async findAll(filters: {
    actorUserId?: string;
    projectId?: string;
    userId?: string;
    type?: AbsenceType;
    status?: AbsenceStatus;
    includeCancelled?: boolean;
  }) {
    const actor = await this.assertActor(filters.actorUserId);
    const org = this.orgId();
    let memberUserIds: string[] | undefined;

    if (filters.projectId) {
      await this.assertProjectAccessForActor(actor.id, filters.projectId);

      const members = await this.prisma.projectMember.findMany({
        where: { projectId: filters.projectId },
        select: { userId: true },
      });

      memberUserIds = members.map((m) => m.userId);

      if (memberUserIds.length === 0) {
        return [];
      }
    }

    if (!this.actorSeesAllAbsences(actor.role)) {
      if (filters.userId && filters.userId !== actor.id) {
        throw new ForbiddenException("Вы можете просматривать только свои отсутствия");
      }
    }

    const absences = await this.prisma.absence.findMany({
      where: {
        organizationId: org,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(!this.actorSeesAllAbsences(actor.role) ? { userId: actor.id } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(!filters.includeCancelled && !filters.status
          ? { status: { not: AbsenceStatus.CANCELLED } }
          : {}),
        ...(memberUserIds ? { userId: { in: memberUserIds } } : {}),
      },
      orderBy: { startDate: "desc" },
      take: 100,
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });

    return Promise.all(
      absences.map((a) => this.mapListItem(a, filters.projectId)),
    );
  }

  async findOne(id: string, projectId?: string, actorUserId?: string) {
    const actor = await this.assertActor(actorUserId);

    const absence = await this.prisma.absence.findFirst({
      where: { id, organizationId: this.orgId() },
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });
    if (!absence) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    this.assertActorCanViewAbsenceUser(actor, absence.userId);

    if (projectId) {
      await this.assertProjectAccessForActor(actor.id, projectId);
    }

    return this.mapListItem(absence, projectId);
  }

  async findAffectedTasks(id: string, projectId?: string, actorUserId?: string) {
    const item = await this.findOne(id, projectId, actorUserId);
    return item.affectedTasks;
  }

  async create(dto: CreateAbsenceDto, actorUserId?: string) {
    const actor = await this.assertActor(actorUserId);
    const org = this.orgId();

    this.assertActorCanCreateForUser(actor, dto.userId);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    const startRaw = this.parseDateInput(dto.startDate);
    const endRaw = this.parseDateInput(dto.endDate);
    const startDate = this.startOfDay(startRaw);
    const endDate = this.endOfDay(endRaw);

    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException("endDate cannot be earlier than startDate");
    }

    const absence = await this.prisma.absence.create({
      data: {
        organizationId: org,
        userId: dto.userId,
        type: dto.type,
        status: dto.status ?? AbsenceStatus.APPROVED,
        startDate,
        endDate,
        documentNumber: dto.documentNumber,
        comment: dto.comment,
      },
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });

    const affected = await this.getAffectedTasks(
      absence.user.id,
      absence.startDate,
      absence.endDate,
    );

    return this.mapListItem(absence, undefined, affected);
  }

  async cancel(id: string, dto: CancelAbsenceDto) {
    const org = this.orgId();
    const existing = await this.prisma.absence.findFirst({
      where: { id, organizationId: org },
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    if (existing.status === AbsenceStatus.CANCELLED) {
      throw new ConflictException("Отсутствие уже удалено");
    }

    const cancelledBy = await this.prisma.user.findFirst({
      where: { id: dto.cancelledById, organizationId: org },
    });
    if (!cancelledBy) {
      throw new NotFoundException(
        `User with id "${dto.cancelledById}" not found in this organization`,
      );
    }

    if (!this.canCancelAbsence(cancelledBy, existing.userId)) {
      throw new ForbiddenException("Вы не можете удалить это отсутствие");
    }

    const reason = dto.cancellationReason?.trim() || null;

    const absence = await this.prisma.absence.update({
      where: { id },
      data: {
        status: AbsenceStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: cancelledBy.id,
        cancellationReason: reason,
      },
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });

    return this.mapListItem(absence);
  }

  async recordNotification(id: string, dto: RecordAbsenceNotificationDto) {
    const absence = await this.prisma.absence.findFirst({
      where: { id, organizationId: this.orgId() },
    });
    if (!absence) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    const task = await this.prisma.task.findFirst({
      where: { id: dto.taskId, organizationId: this.orgId() },
    });
    if (!task) {
      throw new NotFoundException(`Task with id "${dto.taskId}" not found`);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: this.orgId() },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    const existing = await this.prisma.absenceNotificationLog.findUnique({
      where: {
        absenceId_taskId_userId_type: {
          absenceId: id,
          taskId: dto.taskId,
          userId: dto.userId,
          type: dto.type,
        },
      },
    });

    if (existing) {
      return { ok: true as const, log: existing };
    }

    const log = await this.prisma.absenceNotificationLog.create({
      data: {
        organizationId: this.orgId(),
        absenceId: id,
        taskId: dto.taskId,
        userId: dto.userId,
        type: dto.type,
      },
    });

    return { ok: true as const, log };
  }

  async updateStatus(id: string, dto: UpdateAbsenceStatusDto) {
    const existing = await this.prisma.absence.findFirst({
      where: { id, organizationId: this.orgId() },
      include: { user: { select: this.userSelect } },
    });
    if (!existing) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    const absence = await this.prisma.absence.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: { select: this.userSelect },
        cancelledBy: { select: this.userSelect },
      },
    });

    return this.mapListItem(absence);
  }
}
