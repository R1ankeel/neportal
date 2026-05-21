import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class UpdateUserTelegramDto {
  @ApiProperty({
    description: "Telegram user id (from ctx.from.id)",
    example: "123456789",
  })
  @IsString()
  @IsNotEmpty()
  telegramId!: string;
}
