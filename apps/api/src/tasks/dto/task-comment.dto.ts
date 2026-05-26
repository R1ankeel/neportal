import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskCommentSource } from "@neportal/database";
import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

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

  @ApiPropertyOptional({
    description: "Отправить исполнителю уведомление о новом комментарии (Web)",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyAssignee?: boolean;
}

export class UpdateTaskCommentDto {
  @ApiProperty({ description: "Кто редактирует комментарий (пользователь org)" })
  @IsString()
  @IsNotEmpty()
  editorId!: string;

  @ApiProperty({ example: "Обновил текст комментария" })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({
    description: "Список упомянутых пользователей для уведомления при редактировании (Web)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionedUserIds?: string[];

  @ApiPropertyOptional({
    description: "Отправить исполнителю уведомление об изменении комментария (Web)",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  notifyAssignee?: boolean;

  @ApiPropertyOptional({
    description: "Отправить упомянутым пользователям уведомление при редактировании (Web)",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  notifyMentioned?: boolean;
}
