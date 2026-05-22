import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskCommentSource } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTaskCommentDto {
  @ApiProperty({ description: "Автор комментария (пользователь org)" })
  @IsString()
  @IsNotEmpty()
  authorId!: string;

  @ApiProperty({ example: "Уточнил детали у клиента" })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({ enum: TaskCommentSource, default: TaskCommentSource.WEB })
  @IsOptional()
  @IsEnum(TaskCommentSource)
  source?: TaskCommentSource;
}
