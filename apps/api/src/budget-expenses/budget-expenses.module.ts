import { Module } from "@nestjs/common";
import { BudgetsModule } from "../budgets/budgets.module";
import { BudgetExpenseAttachmentsController } from "./budget-expense-attachments.controller";
import { BudgetExpensesController } from "./budget-expenses.controller";
import { BudgetExpensesService } from "./budget-expenses.service";
import { ReceiptStorageService } from "./receipt-storage.service";

@Module({
  imports: [BudgetsModule],
  controllers: [BudgetExpensesController, BudgetExpenseAttachmentsController],
  providers: [BudgetExpensesService, ReceiptStorageService],
})
export class BudgetExpensesModule {}
