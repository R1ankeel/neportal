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
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (заметки личные)" })
  findAll(@Query("actorUserId") actorUserId?: string) {
    return this.notesService.findAll(actorUserId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Заметка по id" })
  @ApiParam({ name: "id" })
  @ApiQuery({ name: "actorUserId", required: true, description: "Текущий пользователь (заметки личные)" })
  findOne(@Param("id") id: string, @Query("actorUserId") actorUserId?: string) {
    return this.notesService.findOne(id, actorUserId);
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
