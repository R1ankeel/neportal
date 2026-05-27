import { NotificationBindingType } from "@neportal/database";

export class CreateNotificationBindingDto {
  telegramChatId!: string;
  telegramMessageId!: number;
  taskId!: string;
  sourceCommentId?: string | null;
  sourceCommentAuthorId?: string | null;
  notificationType!: NotificationBindingType;
}
