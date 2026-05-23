import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BudgetExpenseStatus, ExpenseSource } from "@neportal/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateBudgetExpenseDto {
  @ApiProperty({ description: "Пользователь, от имени которого расход" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({
    description: "Кто выполняет операцию (для проверки доступа). По умолчанию — userId.",
  })
  @IsOptional()
  @IsString()
  actorUserId?: string;

  @ApiProperty({ example: 1500.5, description: "Положительная сумма расхода" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: "RUB" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Дата расхода (по умолчанию — текущая)",
    example: "2026-05-19T12:00:00.000Z",
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expenseDate?: Date;

  @ApiProperty({ enum: ExpenseSource })
  @IsEnum(ExpenseSource)
  source!: ExpenseSource;

  @ApiPropertyOptional({
    description: "Чек передан при создании (Web upload / inline)",
  })
  @IsOptional()
  @IsBoolean()
  hasReceipt?: boolean;

  @ApiPropertyOptional({ enum: BudgetExpenseStatus })
  @IsOptional()
  @IsEnum(BudgetExpenseStatus)
  status?: BudgetExpenseStatus;
}
