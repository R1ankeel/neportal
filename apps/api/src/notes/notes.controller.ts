import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { NotesService } from "./notes.service";

@ApiTags("notes")
@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: "Список заметок" })
  @ApiQuery({ name: "projectId", required: false })
  findAll(@Query("projectId") projectId?: string) {
    return this.notesService.findAll(projectId);
  }
}
