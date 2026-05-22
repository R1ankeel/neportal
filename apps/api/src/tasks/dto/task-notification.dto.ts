import { ApiProperty } from "@nestjs/swagger";
import { TaskNotificationType } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class CreateTaskNotificationDto {
  @ApiProperty({ description: "Получатель уведомления (сотрудник организации)" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: TaskNotificationType })
  @IsEnum(TaskNotificationType)
  type!: TaskNotificationType;
}
