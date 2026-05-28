import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Список проектов (ACTIVE, доступные актору)" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  findAll(@Query("actorUserId") actorUserId?: string) {
    return this.projectsService.findAll(actorUserId);
  }

  @Post()
  @ApiOperation({ summary: "Создать проект (только OWNER)" })
  @ApiQuery({ name: "actorUserId", required: true })
  create(@Query("actorUserId") actorUserId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto, actorUserId);
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Сводка по проекту (задачи, бюджеты)" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  getSummary(@Param("id") id: string, @Query("actorUserId") actorUserId?: string) {
    return this.projectsService.getSummary(id, actorUserId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Проект по id (ACTIVE)" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (MVP)" })
  findOne(@Param("id") id: string, @Query("actorUserId") actorUserId?: string) {
    return this.projectsService.findOne(id, actorUserId);
  }
}
