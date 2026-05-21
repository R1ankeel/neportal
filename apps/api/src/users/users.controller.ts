import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateUserTelegramDto } from "./dto/update-user-telegram.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Список пользователей организации (по умолчанию ACTIVE)" })
  @ApiQuery({
    name: "includeArchived",
    required: false,
    description: "true — включить ARCHIVED",
  })
  findAll(@Query("includeArchived") includeArchived?: string) {
    return this.usersService.findAll(includeArchived === "true");
  }

  @Get("by-telegram/:telegramId")
  @ApiOperation({ summary: "Пользователь по Telegram id (ACTIVE, в org)" })
  @ApiParam({ name: "telegramId", example: "123456789" })
  findByTelegram(@Param("telegramId") telegramId: string) {
    return this.usersService.findByTelegramId(telegramId);
  }

  @Get("by-telegram-username/:username")
  @ApiOperation({
    summary: "Пользователь по Telegram username (ACTIVE, без @, case-insensitive)",
  })
  @ApiParam({ name: "username", example: "vasya_pupkin" })
  findByTelegramUsername(@Param("username") username: string) {
    return this.usersService.findByTelegramUsername(username);
  }

  @Post()
  @ApiOperation({ summary: "Создать сотрудника" })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Пользователь по id" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить сотрудника (ACTIVE)" })
  @ApiParam({ name: "id" })
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(":id/telegram")
  @ApiOperation({ summary: "Привязать Telegram id к пользователю" })
  @ApiParam({ name: "id" })
  updateTelegram(
    @Param("id") id: string,
    @Body() dto: UpdateUserTelegramDto,
  ) {
    return this.usersService.updateTelegram(id, dto.telegramId);
  }

  @Delete(":id/telegram")
  @ApiOperation({
    summary: "Unlink Telegram account from user (clears telegramId and telegramUsername)",
  })
  @ApiParam({ name: "id" })
  unlinkTelegram(@Param("id") id: string) {
    return this.usersService.unlinkTelegram(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Архивировать сотрудника (soft delete)" })
  @ApiParam({ name: "id" })
  archive(@Param("id") id: string) {
    return this.usersService.archive(id);
  }
}
