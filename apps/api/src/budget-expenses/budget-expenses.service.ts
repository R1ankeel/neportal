import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateBudgetExpenseAttachmentDto } from "./dto/create-budget-expense-attachment.dto";

@Injectable()
export class BudgetExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async listAttachments(expenseId: string) {
    await this.ensureExpenseInOrg(expenseId);

    return this.prisma.budgetExpenseAttachment.findMany({
      where: { expenseId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async resolveAttachmentOpenUrl(attachmentId: string): Promise<string> {
    const org = this.orgId();
    const attachment = await this.prisma.budgetExpenseAttachment.findFirst({
      where: { id: attachmentId },
      include: {
        expense: {
          include: { budget: { select: { organizationId: true } } },
        },
      },
    });

    if (!attachment || attachment.expense.budget.organizationId !== org) {
      throw new NotFoundException(`Attachment with id "${attachmentId}" not found`);
    }

    if (!attachment.telegramFileId) {
      throw new BadRequestException("This attachment has no Telegram file reference");
    }

    const token = this.getTelegramBotToken();
    const apiUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(attachment.telegramFileId)}`;
    let response: Response;
    try {
      response = await fetch(apiUrl);
    } catch {
      throw new BadGatewayException("Failed to reach Telegram API");
    }

    if (!response.ok) {
      throw new BadGatewayException("Telegram API request failed");
    }

    const payload = (await response.json()) as {
      ok: boolean;
      result?: { file_path?: string };
      description?: string;
    };

    if (!payload.ok || !payload.result?.file_path) {
      throw new BadGatewayException(payload.description ?? "Telegram did not return a file path");
    }

    return `https://api.telegram.org/file/bot${token}/${payload.result.file_path}`;
  }

  async createAttachment(expenseId: string, dto: CreateBudgetExpenseAttachmentDto) {
    const org = this.orgId();
    await this.ensureExpenseInOrg(expenseId);

    const uploader = await this.prisma.user.findFirst({
      where: { id: dto.uploadedById, organizationId: org },
    });
    if (!uploader) {
      throw new NotFoundException(`User with id "${dto.uploadedById}" not found in this organization`);
    }

    return this.prisma.budgetExpenseAttachment.create({
      data: {
        expenseId,
        storageKey: null,
        telegramFileId: dto.telegramFileId,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        uploadedById: dto.uploadedById,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  private async ensureExpenseInOrg(expenseId: string) {
    const expense = await this.prisma.budgetExpense.findFirst({
      where: { id: expenseId, organizationId: this.orgId() },
    });
    if (!expense) {
      throw new NotFoundException(`Expense with id "${expenseId}" not found`);
    }
    return expense;
  }

  private getTelegramBotToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token || token === "change_me") {
      throw new InternalServerErrorException("TELEGRAM_BOT_TOKEN is not configured on the server");
    }
    return token;
  }
}
