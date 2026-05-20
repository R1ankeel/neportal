import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateBudgetExpenseAttachmentDto {
  @ApiProperty({ description: "Telegram file_id" })
  @IsString()
  @IsNotEmpty()
  telegramFileId!: string;

  @ApiPropertyOptional({ example: "receipt.jpg" })
  @IsOptional()
  @IsString()
  originalFilename?: string;

  @ApiPropertyOptional({ example: "image/jpeg" })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiProperty({ description: "Пользователь, загрузивший вложение" })
  @IsString()
  @IsNotEmpty()
  uploadedById!: string;
}
