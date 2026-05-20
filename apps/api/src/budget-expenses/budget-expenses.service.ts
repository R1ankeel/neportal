import { Injectable, NotFoundException } from "@nestjs/common";
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
}
