import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module";
import { AbsencesController } from "./absences.controller";
import { AbsencesService } from "./absences.service";

@Module({
  imports: [ProjectsModule],
  controllers: [AbsencesController],
  providers: [AbsencesService],
})
export class AbsencesModule {}
