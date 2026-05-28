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
  @ApiQuery({ name: "projectId", required: false, description: "Только участники проекта + affectedTasks" })
  @ApiQuery({ name: "userId", required: false })
  @ApiQuery({ name: "type", required: false, enum: AbsenceType })
  @ApiQuery({ name: "status", required: false, enum: AbsenceStatus })
  @ApiQuery({
    name: "includeCancelled",
    required: false,
    description: "Если true — включить отменённые (CANCELLED) в список",
  })
  @ApiQuery({ name: "actorUserId", required: false, description: "Обязателен при projectId" })
  findAll(
    @Query("projectId") projectId?: string,
    @Query("actorUserId") actorUserId?: string,
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
  @ApiOperation({ summary: "Задачи, затронутые отсутствием" })
  @ApiParam({ name: "id" })
  @ApiQuery({
    name: "projectId",
    required: false,
    description: "Ограничить задачами проекта",
  })
  @ApiQuery({ name: "actorUserId", required: false, description: "Обязателен при projectId" })
  findAffectedTasks(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
    @Query("actorUserId") actorUserId?: string,
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
  @ApiQuery({
    name: "projectId",
    required: false,
    description: "Если указан — вернуть affectedTasks для этого проекта",
  })
  @ApiQuery({ name: "actorUserId", required: false, description: "Обязателен при projectId" })
  findOne(
    @Param("id") id: string,
    @Query("projectId") projectId?: string,
    @Query("actorUserId") actorUserId?: string,
  ) {
    return this.absencesService.findOne(id, projectId, actorUserId);
  }

  @Post()
  @ApiOperation({ summary: "Создать отсутствие (по умолчанию status APPROVED)" })
  create(@Body() dto: CreateAbsenceDto) {
    return this.absencesService.create(dto);
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
