import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateBudgetDto {
  @ApiProperty({ description: "Проект той же организации" })
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @ApiProperty({ example: "Реклама" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Ключевые слова для распознавания расходов в боте (через запятую)",
    example: "реклама, вк, vk, таргет",
  })
  @IsOptional()
  @IsString()
  matchingKeywords?: string;

  @ApiProperty({ example: 50_000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ example: "RUB" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresReceipt?: boolean;

  @ApiPropertyOptional({ type: [String], description: "Пользователи с доступом к бюджету" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  accessUserIds?: string[];

  @ApiPropertyOptional({
    description: "Deprecated: если передан, должен совпадать с actorUserId query",
  })
  @IsOptional()
  @IsString()
  createdById?: string;
}
