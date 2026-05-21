import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { normalizeTelegramUsername } from "./telegram-username.util";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { organizationId: this.orgId() },
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
    const user = await this.prisma.user.findFirst({
      where: {
        telegramUsername: normalized,
        organizationId: this.orgId(),
      },
    });
    if (!user) {
      throw new NotFoundException(
        `User with telegramUsername "${normalized}" not found`,
      );
    }
    return user;
  }

  private async assertTelegramUsernameAvailable(
    telegramUsername: string,
    excludeUserId?: string,
  ) {
    const taken = await this.prisma.user.findFirst({
      where: {
        organizationId: this.orgId(),
        telegramUsername,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
    });
    if (taken) {
      throw new ConflictException(
        `telegramUsername already used by user "${taken.fullName}"`,
      );
    }
  }

  async create(dto: CreateUserDto) {
    const data: {
      organizationId: string;
      fullName: string;
      role: CreateUserDto["role"];
      email?: string;
      phone?: string;
      telegramUsername?: string;
    } = {
      organizationId: this.orgId(),
      fullName: dto.fullName.trim(),
      role: dto.role,
      email: dto.email,
      phone: dto.phone,
    };

    if (dto.telegramUsername?.trim()) {
      const telegramUsername = normalizeTelegramUsername(dto.telegramUsername);
      await this.assertTelegramUsernameAvailable(telegramUsername);
      data.telegramUsername = telegramUsername;
    }

    return this.prisma.user.create({ data });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const data: {
      fullName?: string;
      role?: UpdateUserDto["role"];
      email?: string | null;
      phone?: string | null;
      status?: UpdateUserDto["status"];
      telegramUsername?: string | null;
    } = {};

    if (dto.fullName !== undefined) data.fullName = dto.fullName.trim();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.status !== undefined) data.status = dto.status;

    if (dto.telegramUsername !== undefined) {
      if (dto.telegramUsername === null || dto.telegramUsername === "") {
        data.telegramUsername = null;
      } else {
        const telegramUsername = normalizeTelegramUsername(
          dto.telegramUsername,
        );
        await this.assertTelegramUsernameAvailable(telegramUsername, id);
        data.telegramUsername = telegramUsername;
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateTelegram(id: string, telegramId: string) {
    await this.findOne(id);

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
}
