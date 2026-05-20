import { Module } from "@nestjs/common";
import { BudgetExpensesController } from "./budget-expenses.controller";
import { BudgetExpensesService } from "./budget-expenses.service";

@Module({
  controllers: [BudgetExpensesController],
  providers: [BudgetExpensesService],
})
export class BudgetExpensesModule {}
