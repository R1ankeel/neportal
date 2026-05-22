import { Module } from "@nestjs/common";
import { TaskTransfersController } from "./task-transfers.controller";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  controllers: [TasksController, TaskTransfersController],
  providers: [TasksService],
})
export class TasksModule {}
