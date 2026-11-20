import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ToolsModule } from "../tools/tools.module";
import { RoutinesController } from "./routines.controller";
import { RoutinesService } from "./routines.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [DatabaseModule, ToolsModule, NotificationsModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
