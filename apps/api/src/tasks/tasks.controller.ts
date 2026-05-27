import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreateTaskCommentDto, UpdateTaskCommentDto } from "./dto/task-comment.dto";
import { CreateTaskCommentMentionDto } from "./dto/task-comment-mention.dto";
import { CreateTaskTransferDto } from "./dto/task-transfer.dto";
import { CreateTaskNotificationDto } from "./dto/task-notification.dto";
import { CompletedTasksQueryDto } from "./dto/completed-tasks-query.dto";
import { MyTasksQueryDto } from "./dto/my-tasks-query.dto";
import {
  CreateTaskDto,
  UpdateTaskAssigneeDto,
  UpdateTaskDeadlineDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from "./dto/task.dto";
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

  @Get("my")
  @ApiOperation({ summary: "Активные задачи исполнителя по дедлайну (бот)" })
  findMy(@Query() query: MyTasksQueryDto) {
    return this.tasksService.findMyTasks(query.userId, query.limit ?? 5);
  }

  @Get("completed")
  @ApiOperation({ summary: "Выполненные задачи исполнителя по дате завершения (бот)" })
  findCompleted(@Query() query: CompletedTasksQueryDto) {
    return this.tasksService.findCompletedTasks(query.userId, query.limit ?? 5);
  }

  @Get("notifications/deadline-tomorrow")
  @ApiOperation({ summary: "Задачи с дедлайном завтра для уведомления исполнителю (бот)" })
  findDeadlineTomorrowNotifications() {
    return this.tasksService.findDeadlineTomorrowNotifications();
  }

  @Get("notifications/overdue")
  @ApiOperation({ summary: "Просроченные задачи для уведомлений (бот)" })
  findOverdueNotifications() {
    return this.tasksService.findOverdueNotifications();
  }

  @Post(":id/notifications")
  @ApiOperation({ summary: "Записать отправленное уведомление по задаче (идемпотентно)" })
  @ApiParam({ name: "id" })
  recordNotification(@Param("id") id: string, @Body() dto: CreateTaskNotificationDto) {
    return this.tasksService.recordNotification(id, dto);
  }

  @Patch(":id/deadline")
  @ApiOperation({ summary: "Установить или сбросить дедлайн задачи" })
  @ApiParam({ name: "id" })
  updateDeadline(@Param("id") id: string, @Body() dto: UpdateTaskDeadlineDto) {
    return this.tasksService.updateDeadline(id, dto);
  }

  @Patch(":id/assignee")
  @ApiOperation({ summary: "Назначить исполнителя задачи (Web)" })
  @ApiParam({ name: "id" })
  updateAssignee(@Param("id") id: string, @Body() dto: UpdateTaskAssigneeDto) {
    return this.tasksService.updateAssignee(id, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Обновить статус задачи" })
  @ApiParam({ name: "id" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasksService.updateStatus(id, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить название и/или описание задачи (Web)" })
  @ApiParam({ name: "id" })
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Задача по id с комментариями" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.tasksService.findOne(id);
  }

  @Get(":id/comments")
  @ApiOperation({ summary: "Комментарии задачи" })
  @ApiParam({ name: "id" })
  findComments(@Param("id") id: string) {
    return this.tasksService.findComments(id);
  }

  @Post(":id/comments")
  @ApiOperation({ summary: "Добавить комментарий к задаче" })
  @ApiParam({ name: "id" })
  createComment(@Param("id") id: string, @Body() dto: CreateTaskCommentDto) {
    return this.tasksService.createComment(id, dto);
  }

  @Patch(":id/comments/:commentId")
  @ApiOperation({ summary: "Обновить текст комментария задачи (Web)" })
  @ApiParam({ name: "id" })
  @ApiParam({ name: "commentId" })
  updateComment(
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body() dto: UpdateTaskCommentDto,
  ) {
    return this.tasksService.updateComment(id, commentId, dto);
  }

  @Post(":id/comments/mention")
  @ApiOperation({ summary: "Комментарий с призывом сотрудника в задачу" })
  @ApiParam({ name: "id" })
  createCommentMention(@Param("id") id: string, @Body() dto: CreateTaskCommentMentionDto) {
    return this.tasksService.createCommentMention(id, dto);
  }

  @Get(":id/transfers")
  @ApiOperation({ summary: "История передач задачи" })
  @ApiParam({ name: "id" })
  findTransfers(@Param("id") id: string) {
    return this.tasksService.findTransfers(id);
  }

  @Post(":id/transfers")
  @ApiOperation({ summary: "Передать задачу другому исполнителю" })
  @ApiParam({ name: "id" })
  createTransfer(@Param("id") id: string, @Body() dto: CreateTaskTransferDto) {
    return this.tasksService.createTransfer(id, dto);
  }
}
