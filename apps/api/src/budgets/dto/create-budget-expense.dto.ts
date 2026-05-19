import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ExpenseSource, ExpenseStatus } from "@neportal/database";
import { Type } from "class-transformer";
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateBudgetExpenseDto {
  @ApiProperty({ description: "Пользователь, от имени которого расход" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 1500.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ example: "RUB" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "Дата расхода", example: "2026-05-19T12:00:00.000Z" })
  @Type(() => Date)
  @IsDate()
  expenseDate!: Date;

  @ApiProperty({ enum: ExpenseSource })
  @IsEnum(ExpenseSource)
  source!: ExpenseSource;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;
}
