import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { NotificationBindingType } from "@neportal/database";

export class CreateNotificationBindingDto {
  @IsString()
  telegramChatId!: string;

  @IsInt()
  @Min(1)
  telegramMessageId!: number;

  @IsString()
  taskId!: string;

  @IsOptional()
  @IsString()
  sourceCommentId?: string | null;

  @IsOptional()
  @IsString()
  sourceCommentAuthorId?: string | null;

  @IsEnum(NotificationBindingType)
  notificationType!: NotificationBindingType;

  @IsOptional()
  @IsString()
  expiresAt?: string | null;
}
