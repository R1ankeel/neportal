import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ArchiveBudgetDto {
  @ApiProperty({ description: "OWNER или MANAGER" })
  @IsString()
  @IsNotEmpty()
  archivedById!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  archiveReason?: string;
}
