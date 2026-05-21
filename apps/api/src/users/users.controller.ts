import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UpdateUserTelegramDto } from "./dto/update-user-telegram.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Список пользователей организации (MVP)" })
  findAll() {
    return this.usersService.findAll();
  }

  @Get("by-telegram/:telegramId")
  @ApiOperation({ summary: "Пользователь по Telegram id (в текущей организации)" })
  @ApiParam({ name: "telegramId", example: "123456789" })
  findByTelegram(@Param("telegramId") telegramId: string) {
    return this.usersService.findByTelegramId(telegramId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Пользователь по id" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(":id/telegram")
  @ApiOperation({ summary: "Привязать Telegram id к пользователю (MVP/dev)" })
  @ApiParam({ name: "id" })
  updateTelegram(
    @Param("id") id: string,
    @Body() dto: UpdateUserTelegramDto,
  ) {
    return this.usersService.updateTelegram(id, dto.telegramId);
  }
}
