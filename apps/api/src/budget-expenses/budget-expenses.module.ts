import { Module } from "@nestjs/common";
import { BudgetExpenseAttachmentsController } from "./budget-expense-attachments.controller";
import { BudgetExpensesController } from "./budget-expenses.controller";
import { BudgetExpensesService } from "./budget-expenses.service";

@Module({
  controllers: [BudgetExpensesController, BudgetExpenseAttachmentsController],
  providers: [BudgetExpensesService],
})
export class BudgetExpensesModule {}
