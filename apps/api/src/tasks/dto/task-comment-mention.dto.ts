import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskCommentSource } from "@neportal/database";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTaskCommentMentionDto {
  @ApiProperty({ description: "Автор комментария (пользователь org)" })
  @IsString()
  @IsNotEmpty()
  authorId!: string;

  @ApiProperty({ description: "Приглашённый сотрудник (пользователь org)" })
  @IsString()
  @IsNotEmpty()
  mentionedUserId!: string;

  @ApiProperty({ example: "Нужны ваши комментарии по складу" })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({ enum: TaskCommentSource, default: TaskCommentSource.WEB })
  @IsOptional()
  @IsEnum(TaskCommentSource)
  source?: TaskCommentSource;

  @ApiPropertyOptional({
    description: "Отправить Telegram-уведомление упомянутому сотруднику (Web)",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyMentioned?: boolean;

  @ApiPropertyOptional({
    description: "Отправить исполнителю уведомление о новом комментарии (Web)",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyAssignee?: boolean;
}
