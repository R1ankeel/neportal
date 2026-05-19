import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskStatus } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateTaskDto {
  @ApiProperty({ example: "Сделать отчёт" })
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
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
