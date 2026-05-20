import { Controller, Get, Header, Param, StreamableFile } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { BudgetExpensesService } from "./budget-expenses.service";

@ApiTags("budget-expense-attachments")
@Controller("budget-expense-attachments")
export class BudgetExpenseAttachmentsController {
  constructor(private readonly budgetExpensesService: BudgetExpensesService) {}

  @Get(":id/preview")
  @ApiOperation({
    summary: "Предпросмотр вложения",
    description:
      "Скачивает файл из Telegram на backend и отдаёт клиенту с Content-Disposition: inline. TELEGRAM_BOT_TOKEN не передаётся на frontend.",
  })
  @ApiParam({ name: "id", description: "Budget expense attachment id" })
  @ApiProduces("application/octet-stream", "image/jpeg", "image/png", "application/pdf")
  @ApiResponse({ status: 200, description: "Файл для inline-просмотра" })
  @ApiResponse({ status: 400, description: "У вложения нет telegramFileId" })
  @ApiResponse({ status: 404, description: "Вложение не найдено" })
  @ApiResponse({ status: 502, description: "Ошибка Telegram API" })
  @Header("Cache-Control", "private, max-age=300")
  async preview(@Param("id") id: string): Promise<StreamableFile> {
    const file = await this.budgetExpensesService.fetchTelegramFile(id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: this.budgetExpensesService.formatContentDisposition(file.filename, true),
    });
  }

  @Get(":id/download")
  @ApiOperation({
    summary: "Скачать вложение",
    description:
      "Скачивает файл из Telegram на backend и отдаёт клиенту с Content-Disposition: attachment.",
  })
  @ApiParam({ name: "id", description: "Budget expense attachment id" })
  @ApiProduces("application/octet-stream", "image/jpeg", "image/png", "application/pdf")
  @ApiResponse({ status: 200, description: "Файл для скачивания" })
  @ApiResponse({ status: 400, description: "У вложения нет telegramFileId" })
  @ApiResponse({ status: 404, description: "Вложение не найдено" })
  @ApiResponse({ status: 502, description: "Ошибка Telegram API" })
  async download(@Param("id") id: string): Promise<StreamableFile> {
    const file = await this.budgetExpensesService.fetchTelegramFile(id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: this.budgetExpensesService.formatContentDisposition(file.filename, false),
    });
  }

  /** @deprecated Используйте GET /preview или /download. Redirect раскрывает Telegram URL с токеном в браузере. */
  @Get(":id/open")
  @ApiOperation({
    summary: "[Deprecated] Redirect на Telegram file URL",
    deprecated: true,
    description: "Устарело. Используйте /preview или /download.",
  })
  @ApiParam({ name: "id", description: "Budget expense attachment id" })
  @ApiResponse({ status: 302, description: "Redirect на URL файла в Telegram" })
  async open(@Param("id") id: string) {
    const url = await this.budgetExpensesService.resolveAttachmentOpenUrl(id);
    return { url, statusCode: 302 };
  }
}
