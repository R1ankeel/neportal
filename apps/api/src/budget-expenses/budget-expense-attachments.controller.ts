import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { BudgetExpensesService } from "./budget-expenses.service";

@ApiTags("budget-expense-attachments")
@Controller("budget-expense-attachments")
export class BudgetExpenseAttachmentsController {
  constructor(private readonly budgetExpensesService: BudgetExpensesService) {}

  @Get(":id/open")
  @ApiOperation({
    summary: "Открыть вложение расхода",
    description:
      "Проверяет доступ по организации, запрашивает file_path у Telegram Bot API и делает redirect на файл. Токен бота не возвращается в JSON.",
  })
  @ApiParam({ name: "id", description: "Budget expense attachment id" })
  @ApiResponse({ status: 302, description: "Redirect на URL файла в Telegram" })
  @ApiResponse({ status: 400, description: "У вложения нет telegramFileId" })
  @ApiResponse({ status: 404, description: "Вложение не найдено" })
  @ApiResponse({ status: 502, description: "Ошибка Telegram API" })
  async open(@Param("id") id: string) {
    const url = await this.budgetExpensesService.resolveAttachmentOpenUrl(id);
    return { url, statusCode: 302 };
  }
}
