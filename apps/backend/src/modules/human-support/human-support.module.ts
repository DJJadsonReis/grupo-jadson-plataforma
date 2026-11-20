import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { HumanSupportController } from "./human-support.controller";
import { HumanSupportService } from "./human-support.service";

@Module({ imports:[DatabaseModule,AuditModule,NotificationsModule], controllers:[HumanSupportController], providers:[HumanSupportService], exports:[HumanSupportService] })
export class HumanSupportModule {}
