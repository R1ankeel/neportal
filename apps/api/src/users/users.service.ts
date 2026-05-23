import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EntityStatus, PrismaService, UserRole } from "@neportal/database";
import { generateSystemAliases, systemAliasesToString } from "@neportal/shared";
import { OrganizationContextService } from "../organization/organization-context.service";
import { TelegramNotifyService } from "../telegram/telegram-notify.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { normalizeTelegramUsername } from "./telegram-username.util";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly telegramNotify: TelegramNotifyService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  findAll(includeArchived = false) {
    return this.prisma.user.findMany({
      where: {
        organizationId: this.orgId(),
        ...(includeArchived ? {} : { status: EntityStatus.ACTIVE }),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: this.orgId() },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return user;
  }

  async findByTelegramId(telegramId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        telegramId,
        organizationId: this.orgId(),
        status: EntityStatus.ACTIVE,
      },
    });
    if (!user) {
      throw new NotFoundException(
        `User with telegramId "${telegramId}" not found`,
      );
    }
    return user;
  }

  async findByTelegramUsername(username: string) {
    const normalized = normalizeTelegramUsername(username);
    if (!normalized) {
      throw new NotFoundException(
        `User with telegramUsername "${username}" not found`,
      );
    }
    const user = await this.prisma.user.findFirst({
      where: {
        telegramUsername: normalized,
        organizationId: this.orgId(),
        status: EntityStatus.ACTIVE,
      },
    });
    if (!user) {
      throw new NotFoundException(
        `User with telegramUsername "${normalized}" not found`,
      );
    }
    return user;
  }

  private usernameTakenMessage(fullName: string): string {
    return `Этот username уже указан у сотрудника ${fullName}`;
  }

  private async assertTelegramUsernameAvailable(
    telegramUsername: string,
    excludeUserId?: string,
  ) {
    const taken = await this.prisma.user.findFirst({
      where: {
        organizationId: this.orgId(),
        telegramUsername,
        status: EntityStatus.ACTIVE,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
    });
    if (taken) {
      throw new ConflictException(this.usernameTakenMessage(taken.fullName));
    }
  }

  async create(dto: CreateUserDto) {
    const data: {
      organizationId: string;
      fullName: string;
      systemAliases: string;
      role: CreateUserDto["role"];
      status: EntityStatus;
      email?: string;
      phone?: string;
      telegramUsername?: string;
    } = {
      organizationId: this.orgId(),
      fullName: dto.fullName.trim(),
      systemAliases: systemAliasesToString(generateSystemAliases(dto.fullName.trim())),
      role: dto.role,
      status: EntityStatus.ACTIVE,
      email: dto.email,
      phone: dto.phone,
    };

    if (dto.telegramUsername !== undefined) {
      const telegramUsername = normalizeTelegramUsername(dto.telegramUsername);
      if (telegramUsername) {
        await this.assertTelegramUsernameAvailable(telegramUsername);
        data.telegramUsername = telegramUsername;
      }
    }

    return this.prisma.user.create({ data });
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);
    if (existing.status !== EntityStatus.ACTIVE) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    const data: {
      fullName?: string;
      systemAliases?: string;
      role?: UpdateUserDto["role"];
      email?: string | null;
      phone?: string | null;
      status?: UpdateUserDto["status"];
      telegramUsername?: string | null;
    } = {};

    if (dto.fullName !== undefined) {
      const trimmed = dto.fullName.trim();
      data.fullName = trimmed;
      if (trimmed !== existing.fullName) {
        data.systemAliases = systemAliasesToString(generateSystemAliases(trimmed));
      }
    }
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.telegramUsername !== undefined) {
      if (dto.telegramUsername === null) {
        data.telegramUsername = null;
      } else {
        const telegramUsername = normalizeTelegramUsername(dto.telegramUsername);
        if (telegramUsername) {
          await this.assertTelegramUsernameAvailable(telegramUsername, id);
        }
        data.telegramUsername = telegramUsername;
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateTelegram(id: string, telegramId: string) {
    const user = await this.findOne(id);
    if (user.status !== EntityStatus.ACTIVE) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    const taken = await this.prisma.user.findFirst({
      where: { telegramId, NOT: { id } },
    });
    if (taken) {
      throw new ConflictException(
        `telegramId already linked to user "${taken.fullName}"`,
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { telegramId },
    });
  }

  private async resolveNotifyProjectName(): Promise<string> {
    const orgId = this.orgId();
    const preferred = await this.prisma.project.findFirst({
      where: {
        organizationId: orgId,
        name: "Реклама VK",
        status: EntityStatus.ACTIVE,
      },
    });
    if (preferred) return preferred.name;

    const first = await this.prisma.project.findFirst({
      where: { organizationId: orgId, status: EntityStatus.ACTIVE },
      orderBy: { createdAt: "asc" },
    });
    return first?.name ?? "Neportal";
  }

  /** Полный сброс Telegram: id и username. */
  async unlinkTelegram(id: string) {
    const user = await this.findOne(id);
    if (user.status !== EntityStatus.ACTIVE) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    const oldTelegramId = user.telegramId;
    const projectName = await this.resolveNotifyProjectName();

    const updated = await this.prisma.user.update({
      where: { id },
      data: { telegramId: null, telegramUsername: null },
    });

    if (oldTelegramId) {
      await this.telegramNotify.sendMessage(
        oldTelegramId,
        `Вас открепили от проекта «${projectName}».`,
      );
    }

    return updated;
  }

  async archive(id: string) {
    const user = await this.findOne(id);
    if (user.status !== EntityStatus.ACTIVE) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    if (user.role === UserRole.OWNER) {
      const ownerCount = await this.prisma.user.count({
        where: {
          organizationId: this.orgId(),
          role: UserRole.OWNER,
          status: EntityStatus.ACTIVE,
        },
      });
      if (ownerCount <= 1) {
        throw new ConflictException(
          "Нельзя удалить последнего владельца организации",
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        status: EntityStatus.ARCHIVED,
        telegramId: null,
        telegramUsername: null,
      },
    });
  }
}
