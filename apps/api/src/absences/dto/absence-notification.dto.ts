import { ApiProperty } from "@nestjs/swagger";
import { AbsenceNotificationType } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class RecordAbsenceNotificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  taskId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: AbsenceNotificationType })
  @IsEnum(AbsenceNotificationType)
  type!: AbsenceNotificationType;
}
