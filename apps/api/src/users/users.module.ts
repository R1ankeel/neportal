import { Module } from "@nestjs/common";
import { TelegramModule } from "../telegram/telegram.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [TelegramModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
