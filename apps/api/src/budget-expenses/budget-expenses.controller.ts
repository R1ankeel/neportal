import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { BudgetExpensesService } from "./budget-expenses.service";
import { CreateBudgetExpenseAttachmentDto } from "./dto/create-budget-expense-attachment.dto";

@ApiTags("budget-expenses")
@Controller("budget-expenses")
export class BudgetExpensesController {
  constructor(private readonly budgetExpensesService: BudgetExpensesService) {}

  @Get("pending")
  @ApiOperation({ summary: "Неподтверждённые расходы пользователя (ожидают чек)" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  @ApiQuery({ name: "userId", required: true })
  @ApiQuery({ name: "limit", required: false, description: "default 10, max 20" })
  listPending(
    @Query("actorUserId") actorUserId: string,
    @Query("userId") userId: string,
    @Query("limit") limit?: string,
  ) {
    if (!actorUserId?.trim()) {
      throw new BadRequestException("actorUserId is required");
    }
    if (!userId?.trim()) {
      throw new BadRequestException("userId is required");
    }
    const parsedLimit = limit != null && limit !== "" ? Number(limit) : 10;
    const effectiveLimit = Number.isFinite(parsedLimit) ? parsedLimit : 10;
    return this.budgetExpensesService.listPending(
      actorUserId.trim(),
      userId.trim(),
      effectiveLimit,
    );
  }

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
