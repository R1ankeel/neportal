import { Body, Controller, Get, NotFoundException, Post, Query } from "@nestjs/common";
import { NotificationBindingsService } from "./notification-bindings.service";
import { CreateNotificationBindingDto } from "./dto/create-notification-binding.dto";

@Controller("notification-bindings")
export class NotificationBindingsController {
  constructor(private readonly service: NotificationBindingsService) {}

  @Post()
  create(@Body() dto: CreateNotificationBindingDto) {
    return this.service.create(dto);
  }

  @Get("lookup")
  async lookup(
    @Query("chatId") chatId: string,
    @Query("messageId") messageId: string,
  ) {
    const msgId = parseInt(messageId, 10);
    if (!chatId || isNaN(msgId)) {
      throw new NotFoundException("Missing or invalid chatId / messageId");
    }
    const binding = await this.service.findByMessage(chatId, msgId);
    if (!binding) {
      throw new NotFoundException("Binding not found");
    }
    return binding;
  }
}
