import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CreateBudgetExpenseDto } from "./dto/create-budget-expense.dto";
import { CreateBudgetDto } from "./dto/create-budget.dto";
import { BudgetsService } from "./budgets.service";

@ApiTags("budgets")
@Controller("budgets")
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  @ApiOperation({ summary: "Список бюджетов" })
  findAll() {
    return this.budgetsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: "Создать бюджет" })
  create(@Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(dto);
  }

  @Get(":id/expenses")
  @ApiOperation({ summary: "Расходы по бюджету" })
  @ApiParam({ name: "id", description: "Budget id" })
  listExpenses(@Param("id") id: string) {
    return this.budgetsService.listExpenses(id);
  }

  @Post(":id/expenses")
  @ApiOperation({ summary: "Добавить расход" })
  @ApiParam({ name: "id", description: "Budget id" })
  createExpense(@Param("id") id: string, @Body() dto: CreateBudgetExpenseDto) {
    return this.budgetsService.createExpense(id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Бюджет по id" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.budgetsService.findOne(id);
  }
}
