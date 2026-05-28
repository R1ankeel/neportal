import { Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";
import { ProjectMembersService } from "./project-members.service";

@ApiTags("project-members")
@Controller("projects/:projectId/members")
export class ProjectMembersController {
  constructor(private readonly projectMembersService: ProjectMembersService) {}

  @Get()
  @ApiOperation({ summary: "Участники проекта" })
  @ApiParam({ name: "projectId" })
  @ApiQuery({ name: "actorUserId", required: true })
  list(@Param("projectId") projectId: string, @Query("actorUserId") actorUserId?: string) {
    return this.projectMembersService.list(projectId, actorUserId);
  }

  @Post()
  @ApiOperation({ summary: "Добавить участника проекта" })
  @ApiParam({ name: "projectId" })
  @ApiQuery({ name: "actorUserId", required: true })
  async add(
    @Param("projectId") projectId: string,
    @Query("actorUserId") actorUserId: string,
    @Body() dto: AddProjectMemberDto,
    @Res({ passthrough: true }) res: { status(code: number): void },
  ) {
    const member = await this.projectMembersService.add(projectId, actorUserId, dto);
    res.status(member.alreadyMember ? 200 : 201);
    return member;
  }

  @Delete(":userId")
  @ApiOperation({ summary: "Удалить участника проекта" })
  @ApiParam({ name: "projectId" })
  @ApiParam({ name: "userId" })
  @ApiQuery({ name: "actorUserId", required: true })
  remove(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Query("actorUserId") actorUserId: string,
  ) {
    return this.projectMembersService.remove(projectId, actorUserId, userId);
  }
}
