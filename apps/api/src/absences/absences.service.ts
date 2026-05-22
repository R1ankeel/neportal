import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AbsenceStatus,
  AbsenceType,
  PrismaService,
  TaskStatus,
} from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateAbsenceDto, UpdateAbsenceStatusDto } from "./dto/absence.dto";
import { RecordAbsenceNotificationDto } from "./dto/absence-notification.dto";

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
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; fullName: string; role: string };
  affectedTasks: AbsenceAffectedTask[];
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

  private async assertProjectInOrg(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: this.orgId() },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
    }
    return project;
  }

  private async getAffectedTasks(
    userId: string,
    startDate: Date,
    endDate: Date,
    projectId?: string,
  ): Promise<AbsenceAffectedTask[]> {
    return this.prisma.task.findMany({
      where: {
        organizationId: this.orgId(),
        ...(projectId != null ? { projectId } : {}),
        assigneeId: userId,
        deadlineAt: {
          not: null,
          gte: this.startOfDay(startDate),
          lte: this.endOfDay(endDate),
        },
        status: { in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS] },
      },
      orderBy: { deadlineAt: "asc" },
      select: affectedTaskSelect,
    });
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
      createdAt: Date;
      updatedAt: Date;
      user: { id: string; fullName: string; role: string };
    },
    projectId?: string,
    affectedTasksOverride?: AbsenceAffectedTask[],
  ): Promise<AbsenceListItem> {
    const affectedTasks =
      affectedTasksOverride ??
      (projectId != null
        ? await this.getAffectedTasks(absence.user.id, absence.startDate, absence.endDate, projectId)
        : await this.getAffectedTasks(absence.user.id, absence.startDate, absence.endDate));

    return {
      id: absence.id,
      type: absence.type,
      status: absence.status,
      startDate: absence.startDate,
      endDate: absence.endDate,
      documentNumber: absence.documentNumber,
      comment: absence.comment,
      createdAt: absence.createdAt,
      updatedAt: absence.updatedAt,
      user: absence.user,
      affectedTasks,
    };
  }

  private userSelect = { id: true, fullName: true, role: true } as const;

  async findAll(filters: {
    projectId?: string;
    userId?: string;
    type?: AbsenceType;
    status?: AbsenceStatus;
  }) {
    const org = this.orgId();
    let memberUserIds: string[] | undefined;

    if (filters.projectId) {
      await this.assertProjectInOrg(filters.projectId);
      const members = await this.prisma.projectMember.findMany({
        where: { projectId: filters.projectId },
        select: { userId: true },
      });
      memberUserIds = members.map((m) => m.userId);
      if (memberUserIds.length === 0) {
        return [];
      }
    }

    const absences = await this.prisma.absence.findMany({
      where: {
        organizationId: org,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(memberUserIds ? { userId: { in: memberUserIds } } : {}),
      },
      orderBy: { startDate: "desc" },
      take: 100,
      include: { user: { select: this.userSelect } },
    });

    return Promise.all(
      absences.map((a) => this.mapListItem(a, filters.projectId)),
    );
  }

  async findOne(id: string, projectId?: string) {
    const absence = await this.prisma.absence.findFirst({
      where: { id, organizationId: this.orgId() },
      include: { user: { select: this.userSelect } },
    });
    if (!absence) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    if (projectId) {
      await this.assertProjectInOrg(projectId);
    }

    return this.mapListItem(absence, projectId);
  }

  async findAffectedTasks(id: string, projectId?: string) {
    const absence = await this.prisma.absence.findFirst({
      where: { id, organizationId: this.orgId() },
      include: { user: { select: { id: true } } },
    });
    if (!absence) {
      throw new NotFoundException(`Absence with id "${id}" not found`);
    }

    if (projectId) {
      await this.assertProjectInOrg(projectId);
    }

    return this.getAffectedTasks(
      absence.user.id,
      absence.startDate,
      absence.endDate,
      projectId,
    );
  }

  async create(dto: CreateAbsenceDto) {
    const org = this.orgId();

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
      include: { user: { select: this.userSelect } },
    });

    const affectedTasks = await this.getAffectedTasks(
      absence.user.id,
      absence.startDate,
      absence.endDate,
      dto.projectId,
    );

    return this.mapListItem(absence, dto.projectId, affectedTasks);
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
      include: { user: { select: this.userSelect } },
    });

    return this.mapListItem(absence);
  }
}
