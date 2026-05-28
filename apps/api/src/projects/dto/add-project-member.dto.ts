import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AddProjectMemberDto {
  @ApiProperty({ description: "User id in this organization" })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}
