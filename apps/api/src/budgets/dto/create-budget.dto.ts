import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BudgetStatus } from "@neportal/database";
import { Type } from "class-transformer";
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";

export class CreateBudgetDto {
  @ApiProperty({ example: "Реклама" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Проект той же организации" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  projectId?: string;

  @ApiProperty({ example: 50_000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialAmount!: number;

  @ApiPropertyOptional({ example: "RUB" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: "Кто создал бюджет" })
  @IsString()
  @IsNotEmpty()
  createdById!: string;

  @ApiPropertyOptional({ enum: BudgetStatus })
  @IsOptional()
  @IsEnum(BudgetStatus)
  status?: BudgetStatus;
}
