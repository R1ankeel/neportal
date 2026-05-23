import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { BudgetExpenseStatus, BudgetStatus, PrismaService, UserRole } from "@neportal/database";
import { BudgetsService } from "../budgets/budgets.service";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateBudgetExpenseAttachmentDto } from "./dto/create-budget-expense-attachment.dto";
import { ReceiptStorageService } from "./receipt-storage.service";

export type AttachmentFileData = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

const WEB_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const WEB_RECEIPT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const expenseWithAttachmentsInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  attachments: {
    orderBy: { createdAt: "desc" as const },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
};

@Injectable()
export class BudgetExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly budgetsService: BudgetsService,
    private readonly receiptStorage: ReceiptStorageService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  private isManagerRole(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.MANAGER;
  }

  async listPending(userId: string, limit = 10) {
    const org = this.orgId();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found in this organization`);
    }

    const take = Math.min(Math.max(1, limit), 20);

    const expenses = await this.prisma.budgetExpense.findMany({
      where: {
        organizationId: org,
        userId,
        status: BudgetExpenseStatus.PENDING_RECEIPT,
        budget: { status: BudgetStatus.ACTIVE },
      },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        attachments: {
          orderBy: { createdAt: "desc" },
          include: { uploadedBy: { select: { id: true, fullName: true } } },
        },
        budget: {
          select: {
            id: true,
            title: true,
            status: true,
            requiresReceipt: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    return expenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount),
      description: e.description,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      budget: {
        id: e.budget.id,
        name: e.budget.title,
        status: e.budget.status,
        requiresReceipt: e.budget.requiresReceipt,
        project: e.budget.project
          ? { id: e.budget.project.id, name: e.budget.project.name }
          : null,
      },
      attachments: e.attachments.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        originalFilename: a.originalFilename,
        telegramFileId: a.telegramFileId,
        createdAt: a.createdAt.toISOString(),
        uploadedBy: a.uploadedBy,
      })),
    }));
  }

  async listAttachments(expenseId: string) {
    await this.ensureExpenseInOrg(expenseId);

    return this.prisma.budgetExpenseAttachment.findMany({
      where: { expenseId },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async fetchAttachmentFile(attachmentId: string): Promise<AttachmentFileData> {
    const attachment = await this.getAttachmentInOrg(attachmentId);

    if (attachment.storageKey) {
      const buffer = await this.receiptStorage.read(attachment.storageKey);
      return {
        buffer,
        contentType: this.resolveContentType(attachment.mimeType, null),
        filename: this.resolveFilename(attachment, ""),
      };
    }

    if (!attachment.telegramFileId) {
      throw new BadRequestException("This attachment has no file reference");
    }

    const filePath = await this.getTelegramFilePath(attachment.telegramFileId);
    const { buffer, contentType: telegramContentType } = await this.downloadTelegramFile(filePath);

    return {
      buffer,
      contentType: this.resolveContentType(attachment.mimeType, telegramContentType),
      filename: this.resolveFilename(attachment, filePath),
    };
  }

  /** @deprecated Используйте fetchAttachmentFile */
  async fetchTelegramFile(attachmentId: string): Promise<AttachmentFileData> {
    return this.fetchAttachmentFile(attachmentId);
  }

  /** @deprecated Используйте preview/download — прокси без redirect на Telegram URL. */
  async resolveAttachmentOpenUrl(attachmentId: string): Promise<string> {
    const attachment = await this.getAttachmentInOrg(attachmentId);
    if (attachment.storageKey) {
      return `/budget-expense-attachments/${attachmentId}/preview`;
    }
    const filePath = await this.getTelegramFilePath(attachment.telegramFileId!);
    const token = this.getTelegramBotToken();
    return `https://api.telegram.org/file/bot${token}/${filePath}`;
  }

  async createAttachment(expenseId: string, dto: CreateBudgetExpenseAttachmentDto) {
    const org = this.orgId();
    const expense = await this.ensureExpenseInOrg(expenseId);

    if (expense.budget.status === BudgetStatus.ARCHIVED) {
      throw new ForbiddenException("Cannot attach receipts to expenses in an archived budget");
    }

    const uploader = await this.prisma.user.findFirst({
      where: { id: dto.uploadedById, organizationId: org },
    });
    if (!uploader) {
      throw new NotFoundException(`User with id "${dto.uploadedById}" not found in this organization`);
    }

    const isAuthor = expense.userId === dto.uploadedById;
    if (!isAuthor && !this.isManagerRole(uploader.role)) {
      throw new ForbiddenException(
        "Only the expense author or OWNER/MANAGER can attach a receipt to this expense",
      );
    }

    const attachment = await this.prisma.budgetExpenseAttachment.create({
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

    await this.budgetsService.approveExpenseReceipt(expenseId);

    return attachment;
  }

  async uploadWebReceipt(
    expenseId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    uploadedById: string,
  ) {
    const org = this.orgId();
    const expense = await this.ensureExpenseInOrg(expenseId);

    if (expense.budget.status !== BudgetStatus.ACTIVE) {
      throw new BadRequestException("Cannot upload receipts to an archived budget");
    }

    await this.budgetsService.assertBudgetAccess(expense.budgetId, uploadedById);

    const uploader = await this.prisma.user.findFirst({
      where: { id: uploadedById, organizationId: org },
    });
    if (!uploader) {
      throw new NotFoundException(`User with id "${uploadedById}" not found in this organization`);
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException("File is required");
    }
    if (file.size > WEB_RECEIPT_MAX_BYTES) {
      throw new BadRequestException("File is too large (max 10 MB)");
    }

    const mimeType = (file.mimetype || "application/octet-stream").split(";")[0]?.trim().toLowerCase();
    if (!WEB_RECEIPT_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException("Allowed file types: JPEG, PNG, WebP, PDF");
    }

    const storageKey = await this.receiptStorage.save(org, file.buffer, file.originalname || "receipt");

    await this.prisma.budgetExpenseAttachment.create({
      data: {
        expenseId,
        storageKey,
        telegramFileId: null,
        originalFilename: file.originalname || "receipt",
        mimeType,
        uploadedById,
      },
    });

    await this.budgetsService.approveExpenseReceipt(expenseId);

    const updated = await this.prisma.budgetExpense.findFirstOrThrow({
      where: { id: expenseId, organizationId: org },
      include: expenseWithAttachmentsInclude,
    });

    return this.toUploadReceiptResponse(updated);
  }

  private toUploadReceiptResponse(expense: {
    id: string;
    status: string;
    amount: unknown;
    currency: string;
    attachments: Array<{
      id: string;
      mimeType: string | null;
      originalFilename: string | null;
      telegramFileId: string | null;
      createdAt: Date;
      uploadedBy: { id: string; fullName: string };
    }>;
  }) {
    return {
      id: expense.id,
      status: expense.status,
      amount: Number(expense.amount),
      currency: expense.currency,
      attachments: expense.attachments.map((a) => ({
        id: a.id,
        mimeType: a.mimeType,
        originalFilename: a.originalFilename,
        telegramFileId: a.telegramFileId,
        createdAt: a.createdAt.toISOString(),
        uploadedBy: a.uploadedBy,
      })),
    };
  }

  private async getAttachmentInOrg(attachmentId: string) {
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

    return attachment;
  }

  private async getTelegramFilePath(telegramFileId: string): Promise<string> {
    const token = this.getTelegramBotToken();
    const apiUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(telegramFileId)}`;
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

    return payload.result.file_path;
  }

  private async downloadTelegramFile(filePath: string): Promise<{ buffer: Buffer; contentType: string | null }> {
    const token = this.getTelegramBotToken();
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    let response: Response;
    try {
      response = await fetch(fileUrl);
    } catch {
      throw new BadGatewayException("Failed to download file from Telegram");
    }

    if (!response.ok) {
      throw new BadGatewayException("Telegram file download failed");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType: response.headers.get("content-type") };
  }

  private resolveContentType(mimeType: string | null, telegramContentType: string | null): string {
    if (mimeType) return mimeType;
    if (telegramContentType) return telegramContentType.split(";")[0]?.trim() || "application/octet-stream";
    return "application/octet-stream";
  }

  private resolveFilename(
    attachment: { id: string; originalFilename: string | null; mimeType: string | null },
    telegramFilePath: string,
  ): string {
    if (attachment.originalFilename) return attachment.originalFilename;
    if (attachment.mimeType?.startsWith("image/")) return "receipt.jpg";
    if (attachment.mimeType) return "file";
    const fromPath = telegramFilePath.split("/").pop();
    if (fromPath) return fromPath;
    return `attachment-${attachment.id}`;
  }

  formatContentDisposition(filename: string, inline: boolean): string {
    const safe = filename.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${inline ? "inline" : "attachment"}; filename="${safe}"`;
  }

  private async ensureExpenseInOrg(expenseId: string) {
    const expense = await this.prisma.budgetExpense.findFirst({
      where: { id: expenseId, organizationId: this.orgId() },
      include: {
        budget: { select: { id: true, status: true, organizationId: true } },
      },
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
