import { Module } from "@nestjs/common";
import { NotificationBindingsModule } from "../notification-bindings/notification-bindings.module";
import { TelegramModule } from "../telegram/telegram.module";
import { TaskTransfersController } from "./task-transfers.controller";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [TelegramModule, NotificationBindingsModule],
  controllers: [TasksController, TaskTransfersController],
  providers: [TasksService],
})
export class TasksModule {}
