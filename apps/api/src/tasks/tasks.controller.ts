import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreateTaskDto, UpdateTaskDeadlineDto, UpdateTaskStatusDto } from "./dto/task.dto";
import { TasksService } from "./tasks.service";

@ApiTags("tasks")
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: "Список задач" })
  @ApiQuery({ name: "projectId", required: false, description: "Фильтр по проекту" })
  findAll(@Query("projectId") projectId?: string) {
    return this.tasksService.findAll(projectId);
  }

  @Post()
  @ApiOperation({ summary: "Создать задачу" })
  create(@Body() dto: CreateTaskDto) {
    return this.tasksService.create(dto);
  }

  @Patch(":id/deadline")
  @ApiOperation({ summary: "Установить или сбросить дедлайн задачи" })
  @ApiParam({ name: "id" })
  updateDeadline(@Param("id") id: string, @Body() dto: UpdateTaskDeadlineDto) {
    return this.tasksService.updateDeadline(id, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Обновить статус задачи" })
  @ApiParam({ name: "id" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, dto);
  }
}
