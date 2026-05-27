import { Module } from "@nestjs/common";
import { NotificationBindingsController } from "./notification-bindings.controller";
import { NotificationBindingsService } from "./notification-bindings.service";

@Module({
  controllers: [NotificationBindingsController],
  providers: [NotificationBindingsService],
  exports: [NotificationBindingsService],
})
export class NotificationBindingsModule {}
