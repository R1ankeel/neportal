import { Module } from "@nestjs/common";
import { ProjectMembersController } from "./project-members.controller";
import { ProjectMembersService } from "./project-members.service";
import { ProjectsController } from "./projects.controller";
import { ProjectAccessService } from "./project-access.service";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController, ProjectMembersController],
  providers: [ProjectsService, ProjectMembersService, ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
