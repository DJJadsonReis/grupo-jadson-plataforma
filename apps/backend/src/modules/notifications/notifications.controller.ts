import { Controller, Get, Param, Post, Req } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get()
  list(@Req() request: { principal?: { id: string } }) { return this.notifications.listUnread(request.principal?.id ?? "sistema"); }
  @Post("read-all")
  async readAll(@Req() request: { principal?: { id: string } }) {
    return { read: await this.notifications.markAllRead(request.principal?.id ?? "sistema") };
  }
  @Post(":id/read")
  async read(@Param("id") id: string, @Req() request: { principal?: { id: string } }) {
    await this.notifications.markRead(request.principal?.id ?? "sistema", id);
    return { read: true };
  }
}
