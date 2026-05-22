import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskStatus } from "@neportal/database";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";

export class CreateTaskDto {
  @ApiProperty({ example: "Сделать отчёт" })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Проект той же организации; если не передан — задача без проекта (глобальная)",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  projectId?: string;

  @ApiProperty({ description: "Кто создал задачу" })
  @IsString()
  @IsNotEmpty()
  creatorId!: string;

  @ApiPropertyOptional({ description: "Исполнитель" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  assigneeId?: string;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    description: "ISO date или datetime; для date-only — конец дня UTC",
    example: "2026-05-22",
  })
  @IsOptional()
  @IsDateString()
  deadlineAt?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;

  @ApiPropertyOptional({ description: "Результат выполнения (при status DONE)" })
  @IsOptional()
  @IsString()
  completionResult?: string;

  @ApiPropertyOptional({ description: "Причина отмены (при status CANCELLED)" })
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class UpdateTaskDeadlineDto {
  @ApiPropertyOptional({
    description: "ISO date или datetime; для date-only — конец дня UTC. null — сбросить дедлайн",
    example: "2026-05-22",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsDateString()
  deadlineAt?: string | null;
}
