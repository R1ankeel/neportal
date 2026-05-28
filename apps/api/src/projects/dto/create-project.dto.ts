import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectDto {
  @ApiProperty({ example: "Новый проект" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  /** @deprecated Ignored; use actorUserId. If sent and !== actorUserId → 400. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  createdById?: string;
}
