import { Module } from "@nestjs/common";
import { TelegramModule } from "../telegram/telegram.module";
import { TaskTransfersController } from "./task-transfers.controller";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [TelegramModule],
  controllers: [TasksController, TaskTransfersController],
  providers: [TasksService],
})
export class TasksModule {}
