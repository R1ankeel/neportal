import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { BudgetStatus } from "@neportal/database";
import { ArchiveBudgetDto } from "./dto/archive-budget.dto";
import { CreateBudgetExpenseDto } from "./dto/create-budget-expense.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { UpdateBudgetDto } from "./dto/update-budget.dto";
import { BudgetsService } from "./budgets.service";

@ApiTags("budgets")
@Controller("budgets")
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @ApiOperation({ summary: "Список бюджетов" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  @ApiQuery({ name: "projectId", required: false })
  @ApiQuery({ name: "status", required: false, enum: BudgetStatus })
  @ApiQuery({ name: "includeArchived", required: false, type: Boolean })
  @ApiQuery({ name: "userId", required: false, description: "Фильтр доступа для не-менеджеров" })
  findAll(
    @Query("actorUserId") actorUserId?: string,
    @Query("projectId") projectId?: string,
    @Query("status") status?: BudgetStatus,
    @Query("includeArchived") includeArchived?: string,
    @Query("userId") userId?: string,
  ) {
    return this.budgetsService.findAll({
      actorUserId,
      projectId,
      status,
      includeArchived: includeArchived === "true" || includeArchived === "1",
      userId,
    });
  }

  @Post()
  @ApiOperation({ summary: "Создать бюджет" })
  create(@Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить бюджет (не для ARCHIVED)" })
  @ApiParam({ name: "id" })
  update(@Param("id") id: string, @Body() dto: UpdateBudgetDto) {
    return this.budgetsService.update(id, dto);
  }

  @Post(":id/archive")
  @ApiOperation({ summary: "Архивировать бюджет" })
  @ApiParam({ name: "id" })
  archive(@Param("id") id: string, @Body() dto: ArchiveBudgetDto) {
    return this.budgetsService.archive(id, dto);
  }

  @Get(":id/expenses")
  @ApiOperation({ summary: "Расходы по бюджету" })
  @ApiParam({ name: "id", description: "Budget id" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  listExpenses(@Param("id") id: string, @Query("actorUserId") actorUserId?: string) {
    return this.budgetsService.listExpenses(id, actorUserId);
  }

  @Post(":id/expenses")
  @ApiOperation({ summary: "Добавить расход" })
  @ApiParam({ name: "id", description: "Budget id" })
  createExpense(@Param("id") id: string, @Body() dto: CreateBudgetExpenseDto) {
    return this.budgetsService.createExpense(id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Бюджет по id с расходами и totals" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  findOne(@Param("id") id: string, @Query("actorUserId") actorUserId?: string) {
    return this.budgetsService.findOne(id, actorUserId);
  }
}
