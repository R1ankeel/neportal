import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateBudgetExpenseDto } from "./dto/create-budget-expense.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  findAll() {
    return this.prisma.budget.findMany({
      where: { organizationId: this.orgId() },
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, organizationId: this.orgId() },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });
    if (!budget) {
      throw new NotFoundException(`Budget with id "${id}" not found`);
    }
    return budget;
  }

  async create(dto: CreateBudgetDto) {
    const org = this.orgId();

    const creator = await this.prisma.user.findFirst({
      where: { id: dto.createdById, organizationId: org },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.createdById}" not found in this organization`);
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, organizationId: org },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${dto.projectId}" not found`);
      }
    }

    return this.prisma.budget.create({
      data: {
        organizationId: org,
        title: dto.title,
        description: dto.description,
        projectId: dto.projectId,
        initialAmount: dto.initialAmount,
        currency: dto.currency ?? "RUB",
        createdById: dto.createdById,
        status: dto.status ?? undefined,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }

  async listExpenses(budgetId: string) {
    await this.ensureBudgetInOrg(budgetId);

    return this.prisma.budgetExpense.findMany({
      where: { budgetId, organizationId: this.orgId() },
      orderBy: { expenseDate: "desc" },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async createExpense(budgetId: string, dto: CreateBudgetExpenseDto) {
    const org = this.orgId();
    await this.ensureBudgetInOrg(budgetId);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    return this.prisma.budgetExpense.create({
      data: {
        organizationId: org,
        budgetId,
        userId: dto.userId,
        amount: dto.amount,
        currency: dto.currency ?? "RUB",
        description: dto.description,
        expenseDate: dto.expenseDate,
        source: dto.source,
        status: dto.status ?? undefined,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  private async ensureBudgetInOrg(budgetId: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id: budgetId, organizationId: this.orgId() },
    });
    if (!budget) {
      throw new NotFoundException(`Budget with id "${budgetId}" not found`);
    }
    return budget;
  }
}
