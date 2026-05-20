import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NoteSource } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateNoteDto {
  @ApiPropertyOptional({
    description: "Проект той же организации",
    example: "clxxxxxxxxxxxxxxxxxxxxxxxx",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  projectId?: string;

  @ApiProperty({ description: "Автор заметки" })
  @IsString()
  @IsNotEmpty()
  creatorId!: string;

  @ApiProperty({ example: "Клиент попросил проверить статистику VK" })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional({ enum: NoteSource, default: NoteSource.WEB })
  @IsOptional()
  @IsEnum(NoteSource)
  source?: NoteSource;
}
