import { Injectable } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateNotificationBindingDto } from "./dto/create-notification-binding.dto";

@Injectable()
export class NotificationBindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async create(dto: CreateNotificationBindingDto) {
    const organizationId = this.orgId();
    return this.prisma.notificationMessageBinding.upsert({
      where: {
        telegramChatId_telegramMessageId: {
          telegramChatId: dto.telegramChatId,
          telegramMessageId: dto.telegramMessageId,
        },
      },
      create: {
        telegramChatId: dto.telegramChatId,
        telegramMessageId: dto.telegramMessageId,
        organizationId,
        taskId: dto.taskId,
        sourceCommentId: dto.sourceCommentId ?? null,
        sourceCommentAuthorId: dto.sourceCommentAuthorId ?? null,
        notificationType: dto.notificationType,
      },
      update: {
        taskId: dto.taskId,
        sourceCommentId: dto.sourceCommentId ?? null,
        sourceCommentAuthorId: dto.sourceCommentAuthorId ?? null,
        notificationType: dto.notificationType,
      },
    });
  }

  async findByMessage(telegramChatId: string, telegramMessageId: number) {
    return this.prisma.notificationMessageBinding.findUnique({
      where: {
        telegramChatId_telegramMessageId: { telegramChatId, telegramMessageId },
      },
    });
  }
}
