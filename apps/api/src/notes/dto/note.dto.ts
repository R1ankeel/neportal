import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NoteSource } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateNoteDto {
  @ApiProperty({ description: "Актор (текущий пользователь) — заметки личные" })
  @IsString()
  @IsNotEmpty()
  actorUserId!: string;

  /**
   * Legacy field (compat): some older clients may still send creatorId.
   * It must match actorUserId (otherwise 400) and does not override it.
   */
  @ApiPropertyOptional({ description: "Legacy: автор заметки (должен совпадать с actorUserId)" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  creatorId?: string;

  @ApiProperty({ example: "Клиент попросил проверить статистику VK" })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({ enum: NoteSource, default: NoteSource.WEB })
  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;
}

export class UpdateNoteDto {
  @ApiPropertyOptional({ description: "Актор (текущий пользователь) — заметки личные" })
  @IsString()
  @IsNotEmpty()
  actorUserId!: string;

  @ApiProperty({ example: "Обновлённый текст заметки" })
  @IsString()
  @IsNotEmpty()
  text!: string;
}
