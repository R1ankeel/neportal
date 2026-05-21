import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@neportal/database";
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @ApiProperty({ example: "Вася Пупкин" })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({
    description: "Telegram @username без @, сохраняется в нижнем регистре",
    example: "vasya_pupkin",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  telegramUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}
