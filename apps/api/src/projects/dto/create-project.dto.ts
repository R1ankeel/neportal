import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EntityStatus } from "@neportal/database";
import { IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectDto {
  @ApiProperty({ example: "Новый проект" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: "Id пользователя-автора (должен быть в этой организации)" })
  @IsString()
  @IsNotEmpty()
  createdById!: string;

  @ApiPropertyOptional({ enum: EntityStatus })
  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}
