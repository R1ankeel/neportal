import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Список проектов" })
  findAll() {
    return this.projectsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: "Создать проект" })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get(":id/summary")
  @ApiOperation({ summary: "Сводка по проекту (задачи, бюджеты)" })
  @ApiParam({ name: "id" })
  getSummary(@Param("id") id: string) {
    return this.projectsService.getSummary(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Проект по id" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
  }
}
