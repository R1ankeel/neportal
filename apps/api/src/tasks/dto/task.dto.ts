import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskStatus } from "@neportal/database";
import {
  IsBoolean,
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

  @ApiProperty({
    description: "Проект той же организации",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  projectId!: string;

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

export class UpdateTaskDto {
  @ApiPropertyOptional({ description: "Новое название задачи" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({
    description: "Новое описание; null или пустая строка — очистить",
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value != null)
  @IsString()
  description?: string | null;
}

export class UpdateTaskAssigneeDto {
  @ApiProperty({ description: "Новый исполнитель (пользователь текущей организации)" })
  @IsString()
  @IsNotEmpty()
  assigneeUserId!: string;
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

  @ApiPropertyOptional({
    description:
      "Отправить исполнителю Telegram при фактическом изменении дедлайна (Web). Bot не передаёт.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyAssignee?: boolean;
}
