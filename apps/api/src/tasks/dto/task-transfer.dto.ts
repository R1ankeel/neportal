import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTaskTransferDto {
  @ApiProperty({ description: "Инициатор передачи (пользователь org)" })
  @IsString()
  @IsNotEmpty()
  requestedById!: string;

  @ApiProperty({ description: "Новый исполнитель" })
  @IsString()
  @IsNotEmpty()
  toUserId!: string;

  @ApiPropertyOptional({ example: "Он отвечает за склад" })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class AcceptTaskTransferDto {
  @ApiProperty({ description: "Пользователь, принимающий передачу (toUserId)" })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class RejectTaskTransferDto {
  @ApiProperty({ description: "Пользователь, отклоняющий передачу (toUserId)" })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: "Не мой участок" })
  @IsString()
  @IsNotEmpty()
  rejectionReason!: string;
}
