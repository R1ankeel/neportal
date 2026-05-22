import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { AbsenceStatus, AbsenceType } from "@neportal/database";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAbsenceDto {
  @ApiProperty({ description: "Сотрудник той же организации" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: AbsenceType })
  @IsEnum(AbsenceType)
  type!: AbsenceType;

  @ApiProperty({ example: "2026-05-20", description: "Дата начала (ISO date или datetime)" })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: "2026-05-25", description: "Дата окончания (ISO date или datetime)" })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ example: "123456" })
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ enum: AbsenceStatus, default: AbsenceStatus.APPROVED })
  @IsOptional()
  @IsEnum(AbsenceStatus)
  status?: AbsenceStatus;

  @ApiPropertyOptional({
    description: "Если указан — affectedTasks только по этому проекту; иначе по всей организации",
  })
  @IsOptional()
  @IsString()
  projectId?: string;
}

export class UpdateAbsenceStatusDto {
  @ApiProperty({ enum: AbsenceStatus })
  @IsEnum(AbsenceStatus)
  status!: AbsenceStatus;
}
