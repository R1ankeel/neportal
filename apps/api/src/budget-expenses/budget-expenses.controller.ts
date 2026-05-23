import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { BudgetExpensesService } from "./budget-expenses.service";
import { CreateBudgetExpenseAttachmentDto } from "./dto/create-budget-expense-attachment.dto";

@ApiTags("budget-expenses")
@Controller("budget-expenses")
export class BudgetExpensesController {
  constructor(private readonly budgetExpensesService: BudgetExpensesService) {}

  @Post(":expenseId/receipt")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file", "uploadedById"],
      properties: {
        file: { type: "string", format: "binary" },
        uploadedById: { type: "string" },
      },
    },
  })
  @ApiOperation({ summary: "Загрузить чек к расходу (Web)" })
  @ApiParam({ name: "expenseId", description: "Budget expense id" })
  uploadReceipt(
    @Param("expenseId") expenseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("uploadedById") uploadedById: string,
  ) {
    if (!uploadedById?.trim()) {
      throw new BadRequestException("uploadedById is required");
    }
    if (!file) {
      throw new BadRequestException("file is required");
    }
    return this.budgetExpensesService.uploadWebReceipt(
      expenseId,
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      },
      uploadedById.trim(),
    );
  }

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
