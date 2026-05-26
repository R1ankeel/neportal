import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { CreateNoteDto, UpdateNoteDto } from "./dto/note.dto";
import { NotesService } from "./notes.service";

@ApiTags("notes")
@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: "Список заметок" })
  @ApiQuery({ name: "projectId", required: false, description: "Фильтр по проекту" })
  findAll(@Query("projectId") projectId?: string) {
    return this.notesService.findAll(projectId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Заметка по id" })
  @ApiParam({ name: "id" })
  findOne(@Param("id") id: string) {
    return this.notesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Создать заметку" })
  create(@Body() dto: CreateNoteDto) {
    return this.notesService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Обновить текст заметки (Web)" })
  @ApiParam({ name: "id" })
  update(@Param("id") id: string, @Body() dto: UpdateNoteDto) {
    return this.notesService.update(id, dto);
  }
}
