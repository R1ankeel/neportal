import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { organizationId: this.organization.getOrganizationId() },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: this.organization.getOrganizationId() },
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
        organizationId: this.organization.getOrganizationId(),
      },
    });
    if (!user) {
      throw new NotFoundException(
        `User with telegramId "${telegramId}" not found`,
      );
    }
    return user;
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
