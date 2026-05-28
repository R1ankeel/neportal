import { Module } from "@nestjs/common";
import { ProjectsController } from "./projects.controller";
import { ProjectAccessService } from "./project-access.service";
import { ProjectsService } from "./projects.service";

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectAccessService],
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
