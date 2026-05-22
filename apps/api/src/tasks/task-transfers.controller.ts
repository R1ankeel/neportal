import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { AcceptTaskTransferDto, RejectTaskTransferDto } from "./dto/task-transfer.dto";
import { TasksService } from "./tasks.service";

@ApiTags("task-transfers")
@Controller("task-transfers")
export class TaskTransfersController {
  constructor(private readonly tasksService: TasksService) {}

  @Post(":id/accept")
  @ApiOperation({ summary: "Принять передачу задачи" })
  @ApiParam({ name: "id" })
  accept(@Param("id") id: string, @Body() dto: AcceptTaskTransferDto) {
    return this.tasksService.acceptTransfer(id, dto);
  }

  @Post(":id/reject")
  @ApiOperation({ summary: "Отклонить передачу задачи" })
  @ApiParam({ name: "id" })
  reject(@Param("id") id: string, @Body() dto: RejectTaskTransferDto) {
    return this.tasksService.rejectTransfer(id, dto);
  }
}
