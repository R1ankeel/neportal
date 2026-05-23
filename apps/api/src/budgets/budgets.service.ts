import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BudgetExpenseStatus,
  BudgetStatus,
  PrismaService,
  UserRole,
} from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { computeBudgetTotals } from "./budget-totals";
import { ArchiveBudgetDto } from "./dto/archive-budget.dto";
import { CreateBudgetExpenseDto } from "./dto/create-budget-expense.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetDto } from "./dto/update-budget.dto";

const budgetInclude = {
  createdBy: { select: { id: true, fullName: true } },
  project: { select: { id: true, name: true } },
  archivedBy: { select: { id: true, fullName: true } },
  access: {
    include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
  },
} as const;

const expenseInclude = {
  user: { select: { id: true, fullName: true, email: true } },
  attachments: {
    select: {
      id: true,
      mimeType: true,
      originalFilename: true,
      telegramFileId: true,
      createdAt: true,
    },
  },
} as const;

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  private isManagerRole(role: UserRole): boolean {
    return role === UserRole.OWNER || role === UserRole.MANAGER;
  }

  async findAll(options: {
    projectId?: string;
    status?: BudgetStatus;
    includeArchived?: boolean;
    userId?: string;
  }) {
    const org = this.orgId();

    if (options.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: options.projectId, organizationId: org },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${options.projectId}" not found`);
      }
    }

    let statusFilter: BudgetStatus | { in: BudgetStatus[] } = BudgetStatus.ACTIVE;
    if (options.status) {
      statusFilter = options.status;
    } else if (options.includeArchived) {
      statusFilter = { in: [BudgetStatus.ACTIVE, BudgetStatus.ARCHIVED] };
    }

    const where: {
      organizationId: string;
      projectId?: string;
      status: BudgetStatus | { in: BudgetStatus[] };
      OR?: Array<{ access: { some: { userId: string } } }>;
    } = {
      organizationId: org,
      status: statusFilter,
      ...(options.projectId ? { projectId: options.projectId } : {}),
    };

    if (options.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: options.userId, organizationId: org },
      });
      if (!user) {
        throw new NotFoundException(`User with id "${options.userId}" not found`);
      }
      if (!this.isManagerRole(user.role)) {
        where.OR = [{ access: { some: { userId: options.userId } } }];
      }
    }

    const budgets = await this.prisma.budget.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        ...budgetInclude,
        expenses: { select: { amount: true, status: true } },
      },
    });

    return budgets.map((b) => {
      const { expenses, access, ...rest } = b;
      return {
        ...rest,
        accessUsers: access.map((a) => a.user),
        totals: computeBudgetTotals(rest.initialAmount, expenses),
      };
    });
  }

  async findOne(id: string) {
    const budget = await this.prisma.budget.findFirst({
      where: { id, organizationId: this.orgId() },
      include: {
        ...budgetInclude,
        expenses: {
          orderBy: { expenseDate: "desc" },
          include: expenseInclude,
        },
      },
    });
    if (!budget) {
      throw new NotFoundException(`Budget with id "${id}" not found`);
    }

    const { access, expenses, ...rest } = budget;
    return {
      ...rest,
      accessUsers: access.map((a) => a.user),
      expenses,
      totals: computeBudgetTotals(rest.initialAmount, expenses),
    };
  }

  async create(dto: CreateBudgetDto) {
    const org = this.orgId();

    const creator = await this.prisma.user.findFirst({
      where: { id: dto.createdById, organizationId: org },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.createdById}" not found in this organization`);
    }

    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, organizationId: org },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${dto.projectId}" not found`);
    }

    const accessUserIds = [...new Set(dto.accessUserIds ?? [])];
    if (accessUserIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: accessUserIds }, organizationId: org },
        select: { id: true },
      });
      if (users.length !== accessUserIds.length) {
        throw new BadRequestException("Some accessUserIds do not belong to this organization");
      }
    }

    const budget = await this.prisma.$transaction(async (tx) => {
      const created = await tx.budget.create({
        data: {
          organizationId: org,
          title: dto.name,
          description: dto.description,
          projectId: dto.projectId,
          initialAmount: dto.amount,
          currency: dto.currency ?? "RUB",
          createdById: dto.createdById,
          requiresReceipt: dto.requiresReceipt ?? false,
          status: BudgetStatus.ACTIVE,
        },
      });

      if (accessUserIds.length > 0) {
        await tx.budgetAccess.createMany({
          data: accessUserIds.map((userId) => ({
            organizationId: org,
            budgetId: created.id,
            userId,
            createdById: dto.createdById,
          })),
        });
      }

      return tx.budget.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          ...budgetInclude,
          expenses: { select: { amount: true, status: true } },
        },
      });
    });

    const { access, expenses, ...rest } = budget;
    return {
      ...rest,
      accessUsers: access.map((a) => a.user),
      totals: computeBudgetTotals(rest.initialAmount, expenses),
    };
  }

  async update(id: string, dto: UpdateBudgetDto) {
    const budget = await this.ensureBudgetInOrg(id);
    if (budget.status === BudgetStatus.ARCHIVED) {
      throw new BadRequestException("Archived budgets cannot be modified");
    }

    const updated = await this.prisma.budget.update({
      where: { id },
      data: {
        ...(dto.name != null ? { title: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount != null ? { initialAmount: dto.amount } : {}),
        ...(dto.requiresReceipt !== undefined ? { requiresReceipt: dto.requiresReceipt } : {}),
      },
      include: {
        ...budgetInclude,
        expenses: { select: { amount: true, status: true } },
      },
    });

    const { access, expenses, ...rest } = updated;
    return {
      ...rest,
      accessUsers: access.map((a) => a.user),
      totals: computeBudgetTotals(rest.initialAmount, expenses),
    };
  }

  async archive(id: string, dto: ArchiveBudgetDto) {
    const budget = await this.ensureBudgetInOrg(id);
    if (budget.status === BudgetStatus.ARCHIVED) {
      throw new BadRequestException("Budget is already archived");
    }

    const archivedBy = await this.prisma.user.findFirst({
      where: { id: dto.archivedById, organizationId: this.orgId() },
    });
    if (!archivedBy) {
      throw new NotFoundException(`User with id "${dto.archivedById}" not found`);
    }
    if (!this.isManagerRole(archivedBy.role)) {
      throw new ForbiddenException("Only OWNER or MANAGER can archive budgets");
    }

    const updated = await this.prisma.budget.update({
      where: { id },
      data: {
        status: BudgetStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedById: dto.archivedById,
        archiveReason: dto.archiveReason,
      },
      include: {
        ...budgetInclude,
        expenses: { select: { amount: true, status: true } },
      },
    });

    const { access, expenses, ...rest } = updated;
    return {
      ...rest,
      accessUsers: access.map((a) => a.user),
      totals: computeBudgetTotals(rest.initialAmount, expenses),
    };
  }

  async listExpenses(budgetId: string) {
    await this.ensureBudgetInOrg(budgetId);

    return this.prisma.budgetExpense.findMany({
      where: { budgetId, organizationId: this.orgId() },
      orderBy: { expenseDate: "desc" },
      include: expenseInclude,
    });
  }

  async createExpense(budgetId: string, dto: CreateBudgetExpenseDto) {
    const org = this.orgId();
    const budget = await this.ensureBudgetInOrg(budgetId);

    if (budget.status === BudgetStatus.ARCHIVED) {
      throw new BadRequestException(
        `Бюджет «${budget.title}» в архиве. Расходы по нему запрещены.`,
      );
    }

    const actorId = dto.actorUserId ?? dto.userId;
    await this.ensureUserCanAccessBudget(budgetId, actorId, budget.title);

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: org },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    const expenseDate = dto.expenseDate ?? new Date();
    const status =
      dto.status ??
      (budget.requiresReceipt && !dto.hasReceipt
        ? BudgetExpenseStatus.PENDING_RECEIPT
        : BudgetExpenseStatus.APPROVED);

    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.budgetExpense.create({
        data: {
          organizationId: org,
          budgetId,
          userId: dto.userId,
          amount: dto.amount,
          currency: dto.currency ?? "RUB",
          description: dto.description,
          expenseDate,
          source: dto.source,
          status,
        },
        include: { user: { select: { id: true, fullName: true } } },
      });

      if (status === BudgetExpenseStatus.APPROVED) {
        await tx.budget.update({
          where: { id: budgetId },
          data: { spentAmount: { increment: dto.amount } },
        });
      }

      const budgetRow = await tx.budget.findUniqueOrThrow({
        where: { id: budgetId },
        include: {
          project: { select: { id: true, name: true } },
          expenses: { select: { amount: true, status: true } },
        },
      });

      const totals = computeBudgetTotals(budgetRow.initialAmount, budgetRow.expenses);

      return {
        ...expense,
        budget: {
          ...budgetRow,
          totals,
        },
      };
    });
  }

  async approveExpenseReceipt(expenseId: string): Promise<void> {
    const expense = await this.prisma.budgetExpense.findFirst({
      where: { id: expenseId, organizationId: this.orgId() },
      include: { budget: true },
    });
    if (!expense) {
      throw new NotFoundException(`Expense with id "${expenseId}" not found`);
    }
    if (expense.status !== BudgetExpenseStatus.PENDING_RECEIPT) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.budgetExpense.update({
        where: { id: expenseId },
        data: { status: BudgetExpenseStatus.APPROVED },
      });
      await tx.budget.update({
        where: { id: expense.budgetId },
        data: { spentAmount: { increment: expense.amount } },
      });
    });
  }

  private async ensureUserCanAccessBudget(budgetId: string, userId: string, budgetTitle: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: this.orgId() },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
    if (this.isManagerRole(user.role)) {
      return;
    }

    const access = await this.prisma.budgetAccess.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    });
    if (!access) {
      throw new ForbiddenException(
        `У вас нет доступа к бюджету «${budgetTitle}». Обратитесь к руководителю.`,
      );
    }
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
