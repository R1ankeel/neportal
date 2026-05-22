import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TaskCommentSource } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

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
}
