import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AbsenceStatus, AbsenceType } from "@neportal/database";
import {
  CancelAbsenceDto,
  CreateAbsenceDto,
  UpdateAbsenceStatusDto,
} from "./dto/absence.dto";
import { RecordAbsenceNotificationDto } from "./dto/absence-notification.dto";
import { AbsencesService } from "./absences.service";

@ApiTags("absences")
@Controller("absences")
export class AbsencesController {
  constructor(private readonly absencesService: AbsencesService) {}

  @Get()
  @ApiOperation({ summary: "Список отсутствий" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь" })
  @ApiQuery({
    name: "projectId",
    required: false,
    description: "Read-only проекция: отсутствия участников проекта",
  })
  @ApiQuery({ name: "userId", required: false })
  @ApiQuery({ name: "type", required: false, enum: AbsenceType })
  @ApiQuery({ name: "status", required: false, enum: AbsenceStatus })
  @ApiQuery({
    name: "includeCancelled",
    required: false,
    description: "Если true — включить отменённые (CANCELLED) в список",
  })
  findAll(
    @Query("actorUserId") actorUserId: string,
    @Query("projectId") projectId?: string,
    @Query("userId") userId?: string,
    @Query("type") type?: AbsenceType,
    @Query("status") status?: AbsenceStatus,
    @Query("includeCancelled") includeCancelled?: string,
  ) {
    return this.absencesService.findAll({
      projectId,
      actorUserId,
      userId,
      type,
      status,
      includeCancelled: includeCancelled === "true",
    });
  }

  @Get(":id/affected-tasks")
  @ApiOperation({ summary: "Задачи, затронутые отсутствием (до 20, membership-scoped)" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true })
  @ApiQuery({
    name: "projectId",
    required: false,
    description: "Ограничить задачами проекта (read projection)",
  })
  findAffectedTasks(
    @Param("id") id: string,
    @Query("actorUserId") actorUserId: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.absencesService.findAffectedTasks(id, projectId, actorUserId);
  }

  @Post(":id/notifications")
  @ApiOperation({ summary: "Записать отправленное уведомление (идемпотентно)" })
  @ApiParam({ name: "id" })
  recordNotification(
    @Param("id") id: string,
    @Body() dto: RecordAbsenceNotificationDto,
  ) {
    return this.absencesService.recordNotification(id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Отсутствие по id" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true })
  @ApiQuery({
    name: "projectId",
    required: false,
    description: "Read projection: affectedTasks только этого проекта",
  })
  findOne(
    @Param("id") id: string,
    @Query("actorUserId") actorUserId: string,
    @Query("projectId") projectId?: string,
  ) {
    return this.absencesService.findOne(id, projectId, actorUserId);
  }

  @Post()
  @ApiOperation({ summary: "Создать отсутствие (глобально на пользователя)" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Кто оформляет отсутствие" })
  create(@Query("actorUserId") actorUserId: string, @Body() dto: CreateAbsenceDto) {
    return this.absencesService.create(dto, actorUserId);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Обновить статус отсутствия" })
  @ApiParam({ name: "id" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateAbsenceStatusDto) {
    return this.absencesService.updateStatus(id, dto);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Отменить отсутствие (soft delete, status CANCELLED)" })
  @ApiParam({ name: "id" })
  cancel(@Param("id") id: string, @Body() dto: CancelAbsenceDto) {
    return this.absencesService.cancel(id, dto);
  }
}
