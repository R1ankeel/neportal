import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { BudgetExpensesService } from "./budget-expenses.service";
import { CreateBudgetExpenseAttachmentDto } from "./dto/create-budget-expense-attachment.dto";

@ApiTags("budget-expenses")
@Controller("budget-expenses")
export class BudgetExpensesController {
  constructor(private readonly budgetExpensesService: BudgetExpensesService) {}

  @Get(":expenseId/attachments")
  @ApiOperation({ summary: "Вложения расхода" })
  @ApiParam({ name: "expenseId", description: "Budget expense id" })
  listAttachments(@Param("expenseId") expenseId: string) {
    return this.budgetExpensesService.listAttachments(expenseId);
  }

  @Post(":expenseId/attachments")
  @ApiOperation({ summary: "Прикрепить чек к расходу (Telegram metadata)" })
  @ApiParam({ name: "expenseId", description: "Budget expense id" })
  createAttachment(@Param("expenseId") expenseId: string, @Body() dto: CreateBudgetExpenseAttachmentDto) {
    return this.budgetExpensesService.createAttachment(expenseId, dto);
  }
}
